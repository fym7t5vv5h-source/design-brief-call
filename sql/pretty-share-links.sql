-- Pretty short share tokens + keep old long links working
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

  -- New short token, or refresh old long hex tokens
  if v_token is null or length(v_token) < 8 or length(v_token) > 16 then
    v_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  end if;

  update public.briefs
  set share_token = v_token,
      share_enabled = true,
      updated_at = now()
  where id = p_brief_id;

  return v_token;
end;
$$;

create or replace function public.get_shared_brief(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief public.briefs%rowtype;
  v_project jsonb;
  v_answers jsonb;
  v_notes jsonb;
  v_refs jsonb;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    raise exception 'Ссылка недействительна';
  end if;

  select * into v_brief
  from public.briefs
  where share_token = trim(p_token)
    and share_enabled = true;

  if not found then
    raise exception 'Ссылка отключена или не найдена';
  end if;

  select to_jsonb(p) || jsonb_build_object(
    'clients', (
      select jsonb_build_object('id', c.id, 'name', c.name)
      from public.clients c
      where c.id = p.client_id
    )
  )
  into v_project
  from public.projects p
  where p.id = v_brief.project_id;

  select coalesce(jsonb_object_agg(a.question_id, a.payload), '{}'::jsonb)
  into v_answers
  from public.answers a
  where a.brief_id = v_brief.id;

  select coalesce(jsonb_object_agg(n.section_id, to_jsonb(n.note)), '{}'::jsonb)
  into v_notes
  from public.section_notes n
  where n.brief_id = v_brief.id;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]'::jsonb)
  into v_refs
  from public.refs r
  where r.brief_id = v_brief.id;

  return jsonb_build_object(
    'brief', to_jsonb(v_brief) || jsonb_build_object('projects', v_project),
    'answers', coalesce(v_answers, '{}'::jsonb),
    'notes', coalesce(v_notes, '{}'::jsonb),
    'refs', coalesce(v_refs, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.enable_brief_share(uuid) to authenticated;
grant execute on function public.get_shared_brief(text) to anon, authenticated;
