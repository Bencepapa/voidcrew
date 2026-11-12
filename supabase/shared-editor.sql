-- Run once in a dedicated trial project's SQL editor.
create table public.void_editors (user_id uuid primary key references auth.users on delete cascade);
alter table public.void_editors enable row level security;
revoke all on public.void_editors from anon, authenticated;
grant select on public.void_editors to authenticated;
create policy own_membership on public.void_editors for select to authenticated using (user_id = auth.uid());

create table public.void_maps (
  world text not null check (world in ('scifi','fantasy')),
  id text not null check (id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  revision integer not null check (revision > 0),
  title text not null,
  body jsonb not null,
  primary key (world,id,revision)
);
alter table public.void_maps enable row level security;
revoke all on public.void_maps from anon, authenticated;
grant select, insert on public.void_maps to authenticated;
create policy read_maps on public.void_maps for select to authenticated using (exists(select 1 from public.void_editors));
create policy append_maps on public.void_maps for insert to authenticated with check (exists(select 1 from public.void_editors));
create view public.void_map_heads with (security_invoker = true) as
  select distinct on (world,id) world,id,revision,title from public.void_maps order by world,id,revision desc;
grant select on public.void_map_heads to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('void-textures','void-textures',true,8388608,array['image/png']);
create policy upload_texture on storage.objects for insert to authenticated
with check (bucket_id = 'void-textures' and exists(select 1 from public.void_editors));
create policy list_textures on storage.objects for select to authenticated
using (bucket_id = 'void-textures' and exists(select 1 from public.void_editors));
