// What the shared-file service worker (public/sw.js) caches, and when it is registered. Pure, so it can
// be tested; public/sw.js cannot import this file, so it repeats the path regex literally and
// swPolicy.test.ts reads sw.js as text and checks the two are the same.
//
// The shared store's published files live in revision folders
// (`<world>/<kind>/<uuid>/r<N>/<file>`, see sharedUploadPolicy.ts) that are written once and never
// change, so a browser may keep such a file forever. Nothing else is cacheable this way: the
// list endpoints, the REST API (void_map_heads...), auth and the legacy flat files all change.

/** The path of an immutable store file: a file directly inside an `r<N>` folder of the public bucket. */
export const IMMUTABLE_PATH = /^\/storage\/v1\/object\/public\/void-textures\/(?:[^/]+\/)+r[1-9]\d*\/[^/]+$/;
/** Its source text, as written in public/sw.js. */
export const IMMUTABLE_PATH_SOURCE = IMMUTABLE_PATH.source;

/** Where the worker's Cache Storage entries live: sw.js deletes older `void-shared-*` caches on activate. */
export const SW_CACHE_PREFIX = "void-shared-";
export const SW_CACHE_NAME = "void-shared-v1";

const SUPABASE_HOST = /\.supabase\.co$/;

/**
 * Whether `url` is an immutable file of the shared store: GET-able public object path with a revision
 * folder, no query or hash. `storeOrigin` is the store's origin (the configured project URL); when it is
 * not known the host must be a `*.supabase.co` one.
 */
export function isImmutableSharedUrl(url: string, storeOrigin?: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.search || parsed.hash) return false;
  if (storeOrigin) {
    let origin: string;
    try {
      origin = new URL(storeOrigin).origin;
    } catch {
      return false;
    }
    if (parsed.origin !== origin) return false;
  } else if (!SUPABASE_HOST.test(parsed.hostname)) {
    return false;
  }
  return IMMUTABLE_PATH.test(parsed.pathname);
}

/** Whether the worker answers this request itself: an immutable store URL fetched with GET and no Range header. */
export function shouldServeFromCache(
  request: { method: string; url: string; range?: string | null },
  storeOrigin?: string,
): boolean {
  return request.method === "GET" && !request.range && isImmutableSharedUrl(request.url, storeOrigin);
}

/** Whether a network response may be stored: complete (200, not partial), readable (not opaque). */
export function isCacheableResponse(response: { status: number; type: string }): boolean {
  return response.status === 200 && response.type !== "opaque" && response.type !== "opaqueredirect" && response.type !== "error";
}

export type SwChoice = "on" | "off" | null;
const choice = (raw: string | null | undefined): SwChoice => (raw === "off" ? "off" : raw === "on" ? "on" : null);

/** `?sw=off` / `?sw=on` of the page URL. */
export const swParamChoice = (search: string): SwChoice => choice(new URLSearchParams(search).get("sw"));
/** The stored switch (localStorage `voidcrew-sw`). */
export const swStoredChoice = (raw: string | null): SwChoice => choice(raw);

export interface SwEnv {
  /** the shared store is configured at runtime (a packaged build has no Supabase config) */
  configured: boolean;
  /** https or localhost */
  secure: boolean;
  /** navigator.serviceWorker exists */
  supported: boolean;
  param: SwChoice;
  stored: SwChoice;
}

/** Whether the worker should be registered: only with a configured store, in a secure context, unless switched off. */
export function resolveServiceWorker(env: SwEnv): boolean {
  if (!env.configured || !env.secure || !env.supported) return false;
  if (env.param === "off" || env.stored === "off") return false;
  return true;
}

/** The URL the worker is registered at: its own file under the base, told the store's origin. */
export function swScriptUrl(baseUrl: string, storeOrigin: string): string {
  return `${baseUrl}sw.js?base=${encodeURIComponent(storeOrigin)}`;
}
