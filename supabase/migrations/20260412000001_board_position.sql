alter table public.boards add column if not exists position int not null default 0;

with ranked as (
  select id, row_number() over (partition by couple_id order by created_at desc) - 1 as pos
  from public.boards
)
update public.boards b
set position = ranked.pos
from ranked
where b.id = ranked.id;

create index if not exists boards_couple_position_idx on public.boards (couple_id, position);
