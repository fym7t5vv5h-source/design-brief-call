-- Ensure share columns + guest open RPC (short tokens OK)
-- Supabase SQL Editor → Run once

alter table public.briefs
  add column if not exists share_token text;

alter table public.briefs
  add column if not exists share_enabled boolean not null default false;

create unique index if not exists briefs_share_token_uidx
  on public.briefs (share_token)
  where share_token is not null;

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
  v_tok text := trim(both from coalesce(p_token, ''));
begin
  if length(v_tok) < 8 then
    raise exception 'Ссылка недействительна';
  end if;

  select * into v_brief
  from public.briefs
  where share_token = v_tok
    and share_enabled is true;

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

grant execute on function public.get_shared_brief(text) to anon, authenticated;

-- Optional: see active links
-- select type, share_enabled, share_token from public.briefs where share_token is not null;
