-- Lets the void-textures bucket take lossless WebP colour maps (NPC sprite sheets)
-- next to PNG and the meta.json files. Idempotent: safe to run again.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/webp', 'application/json']
where id = 'void-textures';