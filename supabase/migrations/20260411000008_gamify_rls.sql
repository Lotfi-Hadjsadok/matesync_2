alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.point_balances enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_redemptions enable row level security;

create policy "tasks_select"
  on public.tasks for select
  using (
    exists (
      select 1 from public.boards b
      where b.id = tasks.board_id
        and b.couple_id = (select couple_id from public.profiles where id = auth.uid())
    )
  );

create policy "tasks_insert"
  on public.tasks for insert
  with check (
    exists (
      select 1 from public.boards b
      where b.id = tasks.board_id
        and b.couple_id = (select couple_id from public.profiles where id = auth.uid())
    )
  );

create policy "tasks_update"
  on public.tasks for update
  using (
    exists (
      select 1 from public.boards b
      where b.id = tasks.board_id
        and b.couple_id = (select couple_id from public.profiles where id = auth.uid())
    )
  );

create policy "tasks_delete"
  on public.tasks for delete
  using (
    exists (
      select 1 from public.boards b
      where b.id = tasks.board_id
        and b.couple_id = (select couple_id from public.profiles where id = auth.uid())
    )
  );

create policy "subtasks_select"
  on public.subtasks for select
  using (
    exists (
      select 1 from public.tasks t
      join public.boards b on b.id = t.board_id
      where t.id = subtasks.task_id
        and b.couple_id = (select couple_id from public.profiles where id = auth.uid())
    )
  );

create policy "subtasks_insert"
  on public.subtasks for insert
  with check (
    exists (
      select 1 from public.tasks t
      join public.boards b on b.id = t.board_id
      where t.id = subtasks.task_id
        and b.couple_id = (select couple_id from public.profiles where id = auth.uid())
    )
  );

create policy "subtasks_update"
  on public.subtasks for update
  using (
    exists (
      select 1 from public.tasks t
      join public.boards b on b.id = t.board_id
      where t.id = subtasks.task_id
        and b.couple_id = (select couple_id from public.profiles where id = auth.uid())
    )
  );

create policy "subtasks_delete"
  on public.subtasks for delete
  using (
    exists (
      select 1 from public.tasks t
      join public.boards b on b.id = t.board_id
      where t.id = subtasks.task_id
        and b.couple_id = (select couple_id from public.profiles where id = auth.uid())
    )
  );

create policy "point_balances_select_couple"
  on public.point_balances for select
  using (
    profile_id in (
      select p.id from public.profiles p
      where p.couple_id = (select couple_id from public.profiles where id = auth.uid())
        and (select couple_id from public.profiles where id = auth.uid()) is not null
    )
  );

create policy "rewards_select"
  on public.rewards for select
  using (couple_id = (select couple_id from public.profiles where id = auth.uid()));

create policy "rewards_insert"
  on public.rewards for insert
  with check (couple_id = (select couple_id from public.profiles where id = auth.uid()));

create policy "rewards_update"
  on public.rewards for update
  using (couple_id = (select couple_id from public.profiles where id = auth.uid()));

create policy "rewards_delete"
  on public.rewards for delete
  using (couple_id = (select couple_id from public.profiles where id = auth.uid()));

create policy "reward_redemptions_select"
  on public.reward_redemptions for select
  using (
    exists (
      select 1 from public.rewards r
      where r.id = reward_redemptions.reward_id
        and r.couple_id = (select couple_id from public.profiles where id = auth.uid())
    )
  );
