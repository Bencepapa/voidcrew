// The Cache-Control a Storage upload gets. Pure, so it can be tested.
//
// A published revision lives in its own folder (<world>/<kind>/<uuid>/r<N>/<file>) and is
// written once (`x-upsert: false`; an existing object is a 409), so its bytes never change:
// browsers and the CDN may keep it for a year without revalidating. Anything outside a
// revision folder (or an upload that could overwrite) gets no long cache.

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const REVISION_FILE = /^\/storage\/v1\/object\/void-textures\/[^?#]*\/r[1-9]\d*\/[^/?#]+$/;

/** The Cache-Control to send with an upload to `path` (a /storage/v1/object/... path), or undefined for none. */
export function uploadCacheControl(path: string, upsert: boolean): string | undefined {
  return !upsert && REVISION_FILE.test(path) ? IMMUTABLE_CACHE_CONTROL : undefined;
}
