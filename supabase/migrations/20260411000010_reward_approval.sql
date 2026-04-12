-- Reward approval flow:
-- 1. Rewards can have an optional max_redemptions limit.
-- 2. Redeeming creates a "pending" request (no points deducted yet).
-- 3. The partner approves → points deducted → status becomes "approved".
-- 4. The partner (or redeemer) rejects/cancels → status "rejected", no points change.

-- ──────────────────────────────────────────────────
-- 1. Add max_redemptions to rewards
-- ──────────────────────────────────────────────────
alter table public.rewards
  add column max_redemptions int check (max_redemptions is null or max_redemptions > 0);

-- ──────────────────────────────────────────────────
-- 2. Extend reward_redemptions with approval columns
-- ──────────────────────────────────────────────────
alter table public.reward_redemptions
  add column status      text        not null default 'approved'
    check (status in ('pending', 'approved', 'rejected')),
  add column approved_by uuid        references auth.users(id),
  add column approved_at timestamptz;

-- ──────────────────────────────────────────────────
-- 3. Replace redeem_reward: now creates a pending request
--    Points are NOT deducted until the partner approves.
-- ──────────────────────────────────────────────────
-- Must drop first because the return type changes (void → uuid)
drop function if exists public.redeem_reward(uuid);

create function public.redeem_reward(p_reward_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost            int;
  v_couple          uuid;
  v_my_couple       uuid;
  v_created_by      uuid;
  v_max_redemptions int;
  v_approved_count  int;
  v_redemption_id   uuid;
begin
  select r.cost_points, r.couple_id, r.created_by, r.max_redemptions
  into   v_cost, v_couple, v_created_by, v_max_redemptions
  from   public.rewards r
  where  r.id = p_reward_id;

  if v_cost is null then
    raise exception 'reward_not_found' using errcode = 'P0001';
  end if;

  if v_created_by is not null and v_created_by = auth.uid() then
    raise exception 'cannot_redeem_own_reward' using errcode = 'P0001';
  end if;

  select couple_id into v_my_couple from public.profiles where id = auth.uid();
  if v_my_couple is null or v_my_couple <> v_couple then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- Prevent duplicate pending requests for the same reward
  if exists (
    select 1 from public.reward_redemptions
    where  reward_id  = p_reward_id
      and  profile_id = auth.uid()
      and  status     = 'pending'
  ) then
    raise exception 'already_pending' using errcode = 'P0001';
  end if;

  -- Enforce per-profile redemption limit (count approved only)
  if v_max_redemptions is not null then
    select count(*) into v_approved_count
    from   public.reward_redemptions
    where  reward_id  = p_reward_id
      and  profile_id = auth.uid()
      and  status     = 'approved';

    if v_approved_count >= v_max_redemptions then
      raise exception 'max_redemptions_reached' using errcode = 'P0001';
    end if;
  end if;

  -- Ensure a balance row exists and verify the redeemer has enough points
  insert into public.point_balances (profile_id, balance)
  values (auth.uid(), 0)
  on conflict (profile_id) do nothing;

  if (select balance from public.point_balances where profile_id = auth.uid()) < v_cost then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;

  -- Create the pending redemption request
  insert into public.reward_redemptions (reward_id, profile_id, cost_points, status)
  values (p_reward_id, auth.uid(), v_cost, 'pending')
  returning id into v_redemption_id;

  return v_redemption_id;
end;
$$;

-- ──────────────────────────────────────────────────
-- 4. approve_redemption: partner approves → deduct points
-- ──────────────────────────────────────────────────
create function public.approve_redemption(p_redemption_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redeemer  uuid;
  v_cost      int;
  v_status    text;
  v_balance   int;
begin
  select profile_id, cost_points, status
  into   v_redeemer, v_cost, v_status
  from   public.reward_redemptions
  where  id = p_redemption_id;

  if v_redeemer is null then
    raise exception 'redemption_not_found' using errcode = 'P0001';
  end if;

  if v_status <> 'pending' then
    raise exception 'redemption_not_pending' using errcode = 'P0001';
  end if;

  -- Caller must be the partner (same couple, not the redeemer)
  if v_redeemer = auth.uid() then
    raise exception 'cannot_approve_own_redemption' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from   public.profiles p1
    join   public.profiles p2 on p2.couple_id = p1.couple_id
    where  p1.id = auth.uid() and p2.id = v_redeemer
  ) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- Verify redeemer still has enough points
  select balance into v_balance
  from   public.point_balances
  where  profile_id = v_redeemer;

  if coalesce(v_balance, 0) < v_cost then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;

  -- Deduct points from the redeemer
  update public.point_balances
  set    balance = balance - v_cost
  where  profile_id = v_redeemer;

  -- Mark as approved
  update public.reward_redemptions
  set    status      = 'approved',
         approved_by = auth.uid(),
         approved_at = now()
  where  id = p_redemption_id;
end;
$$;

-- ──────────────────────────────────────────────────
-- 5. reject_redemption: partner rejects OR redeemer cancels
--    No points are touched.
-- ──────────────────────────────────────────────────
create function public.reject_redemption(p_redemption_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redeemer uuid;
  v_status   text;
begin
  select profile_id, status
  into   v_redeemer, v_status
  from   public.reward_redemptions
  where  id = p_redemption_id;

  if v_redeemer is null then
    raise exception 'redemption_not_found' using errcode = 'P0001';
  end if;

  if v_status <> 'pending' then
    raise exception 'redemption_not_pending' using errcode = 'P0001';
  end if;

  -- Allow: the redeemer themselves (cancel) OR their partner (reject)
  if v_redeemer <> auth.uid() and not exists (
    select 1
    from   public.profiles p1
    join   public.profiles p2 on p2.couple_id = p1.couple_id
    where  p1.id = auth.uid() and p2.id = v_redeemer
  ) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  update public.reward_redemptions
  set    status = 'rejected'
  where  id = p_redemption_id;
end;
$$;

grant execute on function public.approve_redemption(uuid) to authenticated;
grant execute on function public.reject_redemption(uuid) to authenticated;
