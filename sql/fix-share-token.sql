-- Fix: enable_brief_share without gen_random_bytes
-- Run once in Supabase SQL Editor → Run

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

  select share_token into v_token
  from public.briefs
  where id = p_brief_id;

  if not found then
    raise exception 'Бриф не найден';
  end if;

  if v_token is null or length(v_token) < 16 then
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  end if;

  update public.briefs
  set share_token = v_token,
      share_enabled = true,
      updated_at = now()
  where id = p_brief_id;

  return v_token;
end;
$$;

grant execute on function public.enable_brief_share(uuid) to authenticated;
