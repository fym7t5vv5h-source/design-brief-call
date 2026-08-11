-- Client fill links (no login). Run in Supabase SQL Editor after schema.sql

alter table public.briefs
  add column if not exists share_token text;

alter table public.briefs
  add column if not exists share_enabled boolean not null default false;

create unique index if not exists briefs_share_token_uidx
  on public.briefs (share_token)
  where share_token is not null;

-- Designer: create / rotate share link for a brief
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

create or replace function public.disable_brief_share(p_brief_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Нужен вход дизайнера';
  end if;

  update public.briefs
  set share_enabled = false,
      updated_at = now()
  where id = p_brief_id;
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

create or replace function public.upsert_shared_answer(
  p_token text,
  p_question_id text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief_id uuid;
begin
  select id into v_brief_id
  from public.briefs
  where share_token = trim(p_token)
    and share_enabled = true;

  if v_brief_id is null then
    raise exception 'Ссылка отключена или не найдена';
  end if;

  insert into public.answers (brief_id, question_id, payload, updated_at)
  values (v_brief_id, p_question_id, coalesce(p_payload, '{}'::jsonb), now())
  on conflict (brief_id, question_id)
  do update set payload = excluded.payload, updated_at = now();

  update public.briefs set updated_at = now() where id = v_brief_id;
end;
$$;

create or replace function public.upsert_shared_note(
  p_token text,
  p_section_id text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief_id uuid;
begin
  select id into v_brief_id
  from public.briefs
  where share_token = trim(p_token)
    and share_enabled = true;

  if v_brief_id is null then
    raise exception 'Ссылка отключена или не найдена';
  end if;

  insert into public.section_notes (brief_id, section_id, note, updated_at)
  values (v_brief_id, p_section_id, coalesce(p_note, ''), now())
  on conflict (brief_id, section_id)
  do update set note = excluded.note, updated_at = now();
end;
$$;

create or replace function public.update_shared_project(
  p_token text,
  p_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_board text;
  v_flag text;
begin
  select project_id into v_project_id
  from public.briefs
  where share_token = trim(p_token)
    and share_enabled = true;

  if v_project_id is null then
    raise exception 'Ссылка отключена или не найдена';
  end if;

  if p_patch ? 'pinterest_board_url' then
    v_board := coalesce(p_patch->>'pinterest_board_url', '');
    update public.projects
    set pinterest_board_url = v_board,
        updated_at = now()
    where id = v_project_id;
  end if;

  foreach v_flag in array array['flag_loggia', 'flag_children', 'flag_guest', 'flag_wardrobe', 'object_type']
  loop
    if p_patch ? v_flag then
      execute format(
        'update public.projects set %I = $1, updated_at = now() where id = $2',
        v_flag
      )
      using coalesce(p_patch->>v_flag, ''), v_project_id;
    end if;
  end loop;
end;
$$;

create or replace function public.add_shared_ref(
  p_token text,
  p_section_id text,
  p_kind text,
  p_url text,
  p_thumb_url text default '',
  p_title text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief_id uuid;
  v_row public.refs%rowtype;
begin
  select id into v_brief_id
  from public.briefs
  where share_token = trim(p_token)
    and share_enabled = true;

  if v_brief_id is null then
    raise exception 'Ссылка отключена или не найдена';
  end if;

  if p_kind is null or p_kind not in ('upload', 'pin') then
    raise exception 'Неверный тип референса';
  end if;

  insert into public.refs (brief_id, section_id, kind, url, thumb_url, title)
  values (
    v_brief_id,
    nullif(p_section_id, ''),
    p_kind,
    p_url,
    coalesce(p_thumb_url, ''),
    coalesce(p_title, '')
  )
  returning * into v_row;

  update public.briefs set updated_at = now() where id = v_brief_id;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.delete_shared_ref(p_token text, p_ref_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief_id uuid;
begin
  select id into v_brief_id
  from public.briefs
  where share_token = trim(p_token)
    and share_enabled = true;

  if v_brief_id is null then
    raise exception 'Ссылка отключена или не найдена';
  end if;

  delete from public.refs
  where id = p_ref_id
    and brief_id = v_brief_id;
end;
$$;

revoke all on function public.enable_brief_share(uuid) from public;
revoke all on function public.disable_brief_share(uuid) from public;
revoke all on function public.get_shared_brief(text) from public;
revoke all on function public.upsert_shared_answer(text, text, jsonb) from public;
revoke all on function public.upsert_shared_note(text, text, text) from public;
revoke all on function public.update_shared_project(text, jsonb) from public;
revoke all on function public.add_shared_ref(text, text, text, text, text, text) from public;
revoke all on function public.delete_shared_ref(text, uuid) from public;

grant execute on function public.enable_brief_share(uuid) to authenticated;
grant execute on function public.disable_brief_share(uuid) to authenticated;

grant execute on function public.get_shared_brief(text) to anon, authenticated;
grant execute on function public.upsert_shared_answer(text, text, jsonb) to anon, authenticated;
grant execute on function public.upsert_shared_note(text, text, text) to anon, authenticated;
grant execute on function public.update_shared_project(text, jsonb) to anon, authenticated;
grant execute on function public.add_shared_ref(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.delete_shared_ref(text, uuid) to anon, authenticated;

-- Photos from the client link (folder = brief id that has an active share)
drop policy if exists "Anon upload shared brief images" on storage.objects;
create policy "Anon upload shared brief images"
  on storage.objects for insert to anon
  with check (
    bucket_id = 'brief-images'
    and exists (
      select 1
      from public.briefs b
      where b.share_enabled = true
        and b.share_token is not null
        and b.id::text = (storage.foldername(name))[1]
    )
  );
