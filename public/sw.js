/* Shared-store file cache (service worker). Plain JS, no imports.
 *
 * The shared store's published files live in immutable revision folders
 * (`.../void-textures/<world>/<kind>/<uuid>/r<N>/<file>`): once written they never change. This worker
 * answers GETs of exactly those files from Cache Storage, cache-first, so each one is downloaded once per
 * browser. EVERYTHING ELSE passes through untouched (no respondWith): the Storage list endpoints, the
 * REST API (void_map_heads...), auth, non-GET requests, Range requests, legacy flat files, and every
 * same-origin request (page, Vite HMR, bundled assets).
 *
 * Which origin is "the store": the page registers this file as `sw.js?base=<store origin>`; only that
 * origin counts. Without `?base=` any `*.supabase.co` host does.
 *
 * The decision rules are written once in src/editor/swPolicy.ts (the tests check that the path regex
 * below is the same one and run this file's real fetch handler). Keep the two in step.
 *
 * Never break loading: any failure falls back to the plain network request.
 */

const CACHE_PREFIX = "void-shared-";
const CACHE_NAME = "void-shared-v1";
// oldest-first trimming beyond this many files
const MAX_ENTRIES = 600;

// (same as IMMUTABLE_PATH in src/editor/swPolicy.ts)
const IMMUTABLE_PATH = /^\/storage\/v1\/object\/public\/void-textures\/(?:[^/]+\/)+r[1-9]\d*\/[^/]+$/;
const SUPABASE_HOST = /\.supabase\.co$/;

let storeOrigin = null;
try {
  const base = new URL(self.location.href).searchParams.get("base");
  if (base) storeOrigin = new URL(base).origin;
} catch (_) {
  storeOrigin = null;
}

function isImmutableSharedUrl(href) {
  let url;
  try {
    url = new URL(href);
  } catch (_) {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.search || url.hash) return false;
  if (storeOrigin ? url.origin !== storeOrigin : !SUPABASE_HOST.test(url.hostname)) return false;
  return IMMUTABLE_PATH.test(url.pathname);
}

function shouldServeFromCache(request) {
  return request.method === "GET" && !request.headers.get("range") && isImmutableSharedUrl(request.url);
}

// complete (200, not partial) and readable (not opaque)
function isCacheableResponse(response) {
  return response.status === 200 && response.type !== "opaque" && response.type !== "opaqueredirect" && response.type !== "error";
}

let trimming = false;
let trimAgain = false;
async function trim(cache) {
  if (trimming) {
    trimAgain = true;
    return;
  }
  trimming = true;
  try {
    do {
      trimAgain = false;
      const keys = await cache.keys(); // oldest first (insertion order)
      for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i]);
    } while (trimAgain);
  } catch (_) {
    /* trimming is housekeeping */
  } finally {
    trimming = false;
  }
}

async function store(cache, url, response) {
  try {
    await cache.put(url, response);
    await trim(cache);
  } catch (_) {
    /* quota, a stream that broke, Vary: * ... - the page already has its copy */
  }
}

async function respond(event) {
  const request = event.request;
  const url = request.url;
  let cache = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url, { ignoreVary: true });
    if (hit) return hit;
  } catch (_) {
    cache = null;
  }
  // <img> / TextureLoader may have sent a no-cors request, whose response would be opaque (and count for a
  // huge padded quota): ask again ourselves. Supabase public storage allows CORS.
  let response;
  try {
    response = await fetch(url, { mode: "cors", credentials: "omit" });
  } catch (_) {
    return fetch(request); // the plain request, not cached
  }
  if (cache && isCacheableResponse(response)) event.waitUntil(store(cache, url, response.clone()));
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        for (const name of await caches.keys()) {
          if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
        }
      } catch (_) {
        /* old caches stay; harmless */
      }
      try {
        await self.clients.claim();
      } catch (_) {
        /* the page is controlled from its next load instead */
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  let handled = false;
  try {
    handled = shouldServeFromCache(event.request);
  } catch (_) {
    handled = false;
  }
  if (!handled) return; // untouched: the browser does its own thing
  event.respondWith(respond(event).catch(() => fetch(event.request)));
});
