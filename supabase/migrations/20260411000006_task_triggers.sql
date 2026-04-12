create function public.tasks_before_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' and old.status = 'open' then
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

create trigger tr_tasks_before_complete
  before update on public.tasks
  for each row
  execute function public.tasks_before_complete();

create function public.tasks_award_points_after_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' and old.status = 'open' and new.completed_by is not null and new.points > 0 then
    insert into public.point_balances (profile_id, balance)
    values (new.completed_by, new.points)
    on conflict (profile_id) do update
      set balance = public.point_balances.balance + excluded.balance;
  end if;
  return null;
end;
$$;

create trigger tr_tasks_award_points
  after update on public.tasks
  for each row
  execute function public.tasks_award_points_after_complete();
