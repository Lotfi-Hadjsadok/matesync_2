alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.boards enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "couples_select_members"
  on public.couples for select
  using (auth.uid() = created_by or auth.uid() = partner_id);

create policy "couples_insert_creator"
  on public.couples for insert
  with check (
    auth.uid() = created_by
    and partner_id is null
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and couple_id is not null
    )
  );

create policy "couples_update_members"
  on public.couples for update
  using (auth.uid() = created_by or auth.uid() = partner_id);

create policy "boards_select"
  on public.boards for select
  using (couple_id = (select couple_id from public.profiles where id = auth.uid()));

create policy "boards_insert"
  on public.boards for insert
  with check (couple_id = (select couple_id from public.profiles where id = auth.uid()));

create policy "boards_update"
  on public.boards for update
  using (couple_id = (select couple_id from public.profiles where id = auth.uid()));

create policy "boards_delete"
  on public.boards for delete
  using (couple_id = (select couple_id from public.profiles where id = auth.uid()));
