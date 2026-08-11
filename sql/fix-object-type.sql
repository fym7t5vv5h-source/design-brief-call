-- Один раз вставьте это в Supabase → SQL Editor → Run
-- Добавляет колонки для типа объекта (квартира / дом)

alter table public.projects add column if not exists object_type text default '';
alter table public.projects add column if not exists flag_children text default '';
alter table public.projects add column if not exists flag_guest text default '';
alter table public.projects add column if not exists flag_wardrobe text default '';
alter table public.projects add column if not exists flag_loggia text default '';
