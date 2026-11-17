-- Shared texture folders (append-only). Run once in the project's SQL editor; running it again is harmless.
--
-- A published texture is a folder  void-textures/<world>/<uuid>/r<rev>/  holding PNG maps and a meta.json.
-- The existing policies (upload_texture: insert, list_textures: select, both for editors) already cover
-- those paths, and nothing can be updated or deleted. The only thing missing is the bucket's
-- allowed type list, which so far lets only PNG files in: meta.json is application/json.
update storage.buckets
set allowed_mime_types = array['image/png', 'application/json']
where id = 'void-textures';
