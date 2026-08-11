-- Always issue a short 10-char client link token
-- Supabase → SQL Editor → paste → Run

create or replace function public.enable_brief_share(p_brief_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Нужен вход дизайнера';
  end if;

  if not exists (select 1 from public.briefs where id = p_brief_id) then
    raise exception 'Бриф не найден';
  end if;

  v_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  update public.briefs
  set share_token = v_token,
      share_enabled = true,
      updated_at = now()
  where id = p_brief_id;

  return v_token;
end;
$$;

grant execute on function public.enable_brief_share(uuid) to authenticated;
