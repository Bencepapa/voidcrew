-- Allow sound asset uploads alongside the bucket's existing formats.
update storage.buckets
set allowed_mime_types = array(
  select distinct mime
  from unnest(allowed_mime_types || array['audio/mpeg', 'audio/ogg', 'audio/wav']) as formats(mime)
)
where id = 'void-textures' and allowed_mime_types is not null;
