create function public.redeem_reward(p_reward_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost int;
  v_couple uuid;
  v_my_couple uuid;
  v_balance int;
begin
  select r.cost_points, r.couple_id into v_cost, v_couple
  from public.rewards r
  where r.id = p_reward_id;

  if v_cost is null then
    raise exception 'reward_not_found' using errcode = 'P0001';
  end if;

  select couple_id into v_my_couple from public.profiles where id = auth.uid();
  if v_my_couple is null or v_my_couple <> v_couple then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  insert into public.point_balances (profile_id, balance)
  values (auth.uid(), 0)
  on conflict (profile_id) do nothing;

  select balance into v_balance from public.point_balances where profile_id = auth.uid();
  if v_balance is null or v_balance < v_cost then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;

  update public.point_balances
  set balance = balance - v_cost
  where profile_id = auth.uid();

  insert into public.reward_redemptions (reward_id, profile_id, cost_points)
  values (p_reward_id, auth.uid(), v_cost);
end;
$$;

grant execute on function public.redeem_reward(uuid) to authenticated;
