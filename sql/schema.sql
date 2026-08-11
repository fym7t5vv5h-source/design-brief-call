-- Brief hub schema
-- Run in Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  pinterest_board_url text default '',
  object_type text default '',
  flag_children text default '',
  flag_guest text default '',
  flag_wardrobe text default '',
  flag_loggia text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects add column if not exists object_type text default '';
alter table public.projects add column if not exists flag_children text default '';
alter table public.projects add column if not exists flag_guest text default '';
alter table public.projects add column if not exists flag_wardrobe text default '';
alter table public.projects add column if not exists flag_loggia text default '';

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  type text not null check (type in ('planning', 'design')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, type)
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  question_id text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (brief_id, question_id)
);

create table if not exists public.section_notes (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  section_id text not null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (brief_id, section_id)
);

create table if not exists public.refs (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  section_id text,
  kind text not null check (kind in ('upload', 'pin')),
  url text not null,
  thumb_url text default '',
  title text default '',
  created_at timestamptz not null default now()
);

create index if not exists projects_client_id_idx on public.projects(client_id);
create index if not exists briefs_project_id_idx on public.briefs(project_id);
create index if not exists answers_brief_id_idx on public.answers(brief_id);
create index if not exists section_notes_brief_id_idx on public.section_notes(brief_id);
create index if not exists refs_brief_id_idx on public.refs(brief_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists briefs_updated_at on public.briefs;
create trigger briefs_updated_at
  before update on public.briefs
  for each row execute function public.set_updated_at();

drop trigger if exists answers_updated_at on public.answers;
create trigger answers_updated_at
  before update on public.answers
  for each row execute function public.set_updated_at();

drop trigger if exists section_notes_updated_at on public.section_notes;
create trigger section_notes_updated_at
  before update on public.section_notes
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.briefs enable row level security;
alter table public.answers enable row level security;
alter table public.section_notes enable row level security;
alter table public.refs enable row level security;

drop policy if exists "Authenticated full access clients" on public.clients;
drop policy if exists "Authenticated full access projects" on public.projects;
drop policy if exists "Authenticated full access briefs" on public.briefs;
drop policy if exists "Authenticated full access answers" on public.answers;
drop policy if exists "Authenticated full access section_notes" on public.section_notes;
drop policy if exists "Authenticated full access refs" on public.refs;

create policy "Authenticated full access clients"
  on public.clients for all to authenticated
  using (true) with check (true);

create policy "Authenticated full access projects"
  on public.projects for all to authenticated
  using (true) with check (true);

create policy "Authenticated full access briefs"
  on public.briefs for all to authenticated
  using (true) with check (true);

create policy "Authenticated full access answers"
  on public.answers for all to authenticated
  using (true) with check (true);

create policy "Authenticated full access section_notes"
  on public.section_notes for all to authenticated
  using (true) with check (true);

create policy "Authenticated full access refs"
  on public.refs for all to authenticated
  using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('brief-images', 'brief-images', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated read brief images" on storage.objects;
drop policy if exists "Authenticated upload brief images" on storage.objects;
drop policy if exists "Authenticated update brief images" on storage.objects;
drop policy if exists "Authenticated delete brief images" on storage.objects;
drop policy if exists "Public read brief images" on storage.objects;

create policy "Authenticated read brief images"
  on storage.objects for select to authenticated
  using (bucket_id = 'brief-images');

create policy "Authenticated upload brief images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'brief-images');

create policy "Authenticated update brief images"
  on storage.objects for update to authenticated
  using (bucket_id = 'brief-images');

create policy "Authenticated delete brief images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'brief-images');

create policy "Public read brief images"
  on storage.objects for select to anon
  using (bucket_id = 'brief-images');
