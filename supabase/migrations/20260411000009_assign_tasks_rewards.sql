-- Tasks: single assignee (creator assigns to partner; only assignee completes / checks subtasks).
-- Rewards: only someone other than the creator may redeem (gift for the partner).

alter table public.tasks add column if not exists assigned_to uuid references auth.users(id);

update public.tasks t
set assigned_to = coalesce(
  (
    select p.id
    from public.boards b
    join public.profiles p on p.couple_id = b.couple_id
    where b.id = t.board_id
      and t.created_by is not null
      and p.id <> t.created_by
    limit 1
  ),
  (
    select p.id
    from public.boards b
    join public.profiles p on p.couple_id = b.couple_id
    where b.id = t.board_id
    order by p.id
    limit 1
  ),
  t.created_by
);

alter table public.tasks alter column assigned_to set not null;

create index if not exists tasks_assigned_to_idx on public.tasks (assigned_to);

create or replace function public.tasks_validate_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.boards b
    join public.profiles p on p.couple_id = b.couple_id
    where b.id = new.board_id
      and p.id = new.assigned_to
  ) then
    raise exception 'assignee_not_in_couple' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger tr_tasks_validate_assignee
  before insert or update of board_id, assigned_to on public.tasks
  for each row
  execute function public.tasks_validate_assignee();

create or replace function public.tasks_set_assignee_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is null and new.created_by is not null then
    select p.id into new.assigned_to
    from public.boards b
    join public.profiles p on p.couple_id = b.couple_id
    where b.id = new.board_id
      and p.id <> new.created_by
    limit 1;
  end if;
  if new.assigned_to is null then
    new.assigned_to := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger tr_tasks_set_assignee
  before insert on public.tasks
  for each row
  execute function public.tasks_set_assignee_default();

create or replace function public.tasks_before_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' and old.status = 'open' then
    if auth.uid() is distinct from new.assigned_to then
      raise exception 'not_assignee' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.subtasks s
      where s.task_id = new.id and s.done = false
      limit 1
    ) then
      raise exception 'subtasks_incomplete' using errcode = 'P0001';
    end if;
    if new.completed_by is null then
      new.completed_by := auth.uid();
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;

create or replace function public.redeem_reward(p_reward_id uuid)
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
  v_created_by uuid;
begin
  select r.cost_points, r.couple_id, r.created_by into v_cost, v_couple, v_created_by
  from public.rewards r
  where r.id = p_reward_id;

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

drop policy if exists "subtasks_insert" on public.subtasks;
create policy "subtasks_insert"
  on public.subtasks for insert
  with check (
    exists (
      select 1 from public.tasks t
      join public.boards b on b.id = t.board_id
      where t.id = subtasks.task_id
        and b.couple_id = (select couple_id from public.profiles where id = auth.uid())
        and (t.assigned_to = auth.uid() or t.created_by = auth.uid())
    )
  );

drop policy if exists "subtasks_update" on public.subtasks;
create policy "subtasks_update_assignee"
  on public.subtasks for update
  using (
    exists (
      select 1 from public.tasks t
      join public.boards b on b.id = t.board_id
      where t.id = subtasks.task_id
        and b.couple_id = (select couple_id from public.profiles where id = auth.uid())
        and t.assigned_to = auth.uid()
    )
  );

drop policy if exists "subtasks_delete" on public.subtasks;
create policy "subtasks_delete"
  on public.subtasks for delete
  using (
    exists (
      select 1 from public.tasks t
      join public.boards b on b.id = t.board_id
      where t.id = subtasks.task_id
        and b.couple_id = (select couple_id from public.profiles where id = auth.uid())
        and (t.assigned_to = auth.uid() or t.created_by = auth.uid())
    )
  );

drop policy if exists "rewards_delete" on public.rewards;
create policy "rewards_delete"
  on public.rewards for delete
  using (
    couple_id = (select couple_id from public.profiles where id = auth.uid())
    and (created_by is null or created_by = auth.uid())
  );
