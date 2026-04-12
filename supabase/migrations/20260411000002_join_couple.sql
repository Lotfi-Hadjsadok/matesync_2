create function public.join_couple(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id  uuid;
  v_partner_id uuid;
begin
  if exists (
    select 1 from public.profiles where id = auth.uid() and couple_id is not null
  ) then
    raise exception 'already_in_couple';
  end if;

  select id, partner_id
  into v_couple_id, v_partner_id
  from public.couples
  where invite_code = upper(trim(p_invite_code));

  if v_couple_id is null then
    raise exception 'invalid_invite_code';
  end if;

  if v_partner_id is not null then
    raise exception 'couple_full';
  end if;

  update public.couples set partner_id = auth.uid() where id = v_couple_id;
  update public.profiles set couple_id = v_couple_id where id = auth.uid();

  return v_couple_id;
end;
$$;

grant execute on function public.join_couple(text) to authenticated;
