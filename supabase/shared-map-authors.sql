-- Run once on an existing trial project, after shared-editor.sql.
begin;
alter table public.void_maps add column if not exists saved_by text;
alter table public.void_maps add column if not exists saved_at timestamptz;
create or replace function public.stamp_void_map() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.saved_by := nullif(split_part(auth.jwt()->>'email', '@', 1), '');
  new.saved_at := statement_timestamp();
  return new;
end $$;
create or replace trigger stamp_void_map before insert on public.void_maps
for each row execute function public.stamp_void_map();
create or replace view public.void_map_heads with (security_invoker = true) as
  select distinct on (world,id) world,id,revision,title,saved_by,saved_at
  from public.void_maps order by world,id,revision desc;
commit;
