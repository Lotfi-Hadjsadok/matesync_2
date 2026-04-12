create table public.couples (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  invite_code text        not null unique,
  created_by  uuid        not null references auth.users(id),
  partner_id  uuid        references auth.users(id),
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  couple_id    uuid        references public.couples(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.boards (
  id         uuid        primary key default gen_random_uuid(),
  couple_id  uuid        not null references public.couples(id) on delete cascade,
  title      text        not null,
  color      text        not null default '#e11d48',
  created_by uuid        references auth.users(id),
  created_at timestamptz not null default now()
);
