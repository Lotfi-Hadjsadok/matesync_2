create table public.point_balances (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  balance    int  not null default 0 check (balance >= 0)
);

create table public.rewards (
  id           uuid        primary key default gen_random_uuid(),
  couple_id    uuid        not null references public.couples(id) on delete cascade,
  title        text        not null,
  description  text,
  cost_points  int         not null check (cost_points > 0),
  position     int         not null default 0,
  created_by   uuid        references auth.users(id),
  created_at   timestamptz not null default now()
);

create table public.reward_redemptions (
  id           uuid        primary key default gen_random_uuid(),
  reward_id    uuid        not null references public.rewards(id) on delete cascade,
  profile_id   uuid        not null references public.profiles(id) on delete cascade,
  cost_points  int         not null,
  created_at   timestamptz not null default now()
);

create index rewards_couple_position_idx on public.rewards (couple_id, position);
