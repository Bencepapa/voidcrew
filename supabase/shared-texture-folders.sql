-- Shared texture folders. Run once in the project's SQL editor; running it again is harmless.
--
-- A published texture is a folder  void-textures/<world>/<uuid>/r<rev>/  holding PNG maps and a meta.json.
-- The existing policies (upload_texture: insert, list_textures: select, both for editors) already cover
-- those paths (Publish only adds files; nothing is updated). What is missing is the bucket's
-- allowed type list, which so far lets only PNG files in: meta.json is application/json.
update storage.buckets
set allowed_mime_types = array['image/png', 'application/json']
where id = 'void-textures';

-- Deleting a shared texture (the Assets window's "Delete texture..."): editors may delete objects in the bucket.
-- Without this policy the store answers a delete with success and removes nothing, and the window says what to run.
-- (Texture revisions are still only ever added by Publish; this is only for removing a whole texture.)
drop policy if exists delete_textures on storage.objects;
create policy delete_textures on storage.objects for delete to authenticated
using (bucket_id = 'void-textures' and exists(select 1 from public.void_editors));