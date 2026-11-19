begin;

grant select on public.void_maps, public.void_map_heads to anon;

grant select on storage.objects to anon;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'void_maps' and policyname = 'guest_read_maps'
  ) then
    create policy guest_read_maps on public.void_maps
      for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'guest_list_textures'
  ) then
    create policy guest_list_textures on storage.objects
      for select to anon using (bucket_id = 'void-textures');
  end if;
end;
$$;

commit;
