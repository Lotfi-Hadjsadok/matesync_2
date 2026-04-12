create table public.tasks (
  id           uuid        primary key default gen_random_uuid(),
  board_id     uuid        not null references public.boards(id) on delete cascade,
  title        text        not null,
  description  text,
  points       int         not null default 10 check (points >= 0),
  position     int         not null default 0,
  status       text        not null default 'open' check (status in ('open', 'done')),
  completed_by uuid        references auth.users(id),
  completed_at timestamptz,
  created_by   uuid        references auth.users(id),
  created_at   timestamptz not null default now()
);

create table public.subtasks (
  id         uuid        primary key default gen_random_uuid(),
  task_id    uuid        not null references public.tasks(id) on delete cascade,
  title      text        not null,
  done       boolean     not null default false,
  position   int         not null default 0,
  created_at timestamptz not null default now()
);

create index tasks_board_position_idx on public.tasks (board_id, position);
create index subtasks_task_position_idx on public.subtasks (task_id, position);
