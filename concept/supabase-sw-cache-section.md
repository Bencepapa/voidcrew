<!-- This is the section "Service worker cache" for concept/supabase-egress-audit.md. That file is still untracked in the main
checkout, so the section lives here until it is appended (Get-Content this-file | Add-Content supabase-egress-audit.md) and this file removed. -->

## 11. Service worker cache (immutable store files download once per browser)

Added on `feature/shared-sw-cache`. Code: `public/sw.js` (worker), `src/editor/swPolicy.ts` (the decision, tested in `swPolicy.test.ts`), `src/editor/sharedServiceWorker.ts` (registration, status, clear), `src/components/SharedCacheDebugSection.tsx` (Debug panel row "Shared file cache").

**What it caches.** Only GETs of files inside a revision folder of the public bucket: `<project>/storage/v1/object/public/void-textures/<kind-path>/<id>/r<N>/<file>` (diffuse/normal/depth/surface/emissive images, NPC sheets, `meta.json` of a revision). Those folders are written once (`x-upsert: false`), so the files never change; the worker answers them cache-first from Cache Storage (`void-shared-v1`) and goes to the network only on a miss. Everything else is not touched (no `respondWith`): Storage list endpoints (`/storage/v1/object/list/`), the REST API (`/rest/v1/`: `void_map_heads`, `void_maps`), auth, non-GET, Range requests, requests with a query string (`?v=`), legacy flat files, same-origin requests (page, Vite HMR, bundled assets), other hosts.

**Why a CORS re-fetch.** `<img>` / `TextureLoader` may send cross-origin `no-cors` requests, whose responses are opaque (and count for a large padded quota in Cache Storage). The worker therefore re-issues the request itself with `fetch(url, { mode: "cors", credentials: "omit" })` (Supabase public storage sends permissive CORS headers) and stores that. Only complete, readable responses are stored (status 200, not opaque, not partial/206). If the CORS fetch fails, the plain request goes out and nothing is cached.

**Which store.** The page registers `sw.js?base=<store origin>` (from `VITE_SUPABASE_URL`); only that origin counts. Without `?base=` any `*.supabase.co` host does.

**When it runs.** Registered at app start (after the window `load` event) only when the store is configured at runtime, the page is a secure context (https or localhost) and `navigator.serviceWorker` exists. Off with `?sw=off` (this page load; also removes the registration) or the Debug panel switch / `localStorage["voidcrew-sw"] = "off"`. Packaged and release builds have no Supabase config: the registration code is dead-code-eliminated from the bundle, and `scripts/pack-world.ts` deletes `sw.js` from the packaged game and fails if it is still there.

**How to clear it.** Debug panel, "Shared file cache": "Clear shared cache" (deletes every `void-shared-*` cache; the worker stays and refills it). Or DevTools: Application > Cache Storage > `void-shared-v1` > delete; Application > Service Workers > Unregister. Bumping `CACHE_NAME` in `sw.js` (and `SW_CACHE_NAME` in `swPolicy.ts`; the test checks they agree) drops all old caches on the next activate.

**How to verify in DevTools.** Application > Service Workers: `sw.js` "activated and is running", scope `/voidcrew/`. Application > Cache Storage > `void-shared-v1`: one entry per store file (up to 600). Network tab, reload twice: the second time the store's `diffuse.png` / `normal.png` / `meta.json` rows show size "(ServiceWorker)" and no row leaves for them; list POSTs and `void_map_heads` still go to the network. In the Supabase dashboard the cached egress per day should drop to roughly one download of the store per browser.

**Limits.**
- The first-ever visit is not served from the cache (the worker is registered after load; it claims the page when it activates, so later requests of that visit already pass through it). The saving starts with the second load.
- 600 files, oldest first (insertion order, not LRU); no byte cap. The whole store is about 67 MB; Cache Storage quota is per origin and browser-dependent (usually hundreds of MB to GBs). The browser may evict the origin's storage under pressure: the worker just refills.
- Only revision files are cached; the lists and metadata queries (N+1 `list` POSTs, `void_map_heads`) are not, so each page load still pays those requests (steps 6 and 8 of section 7.7).
- Updating `sw.js` follows the normal service worker update check (on navigation, at most every 24 h via the HTTP cache); `skipWaiting` + `clients.claim` make a new version take over at once. A cache-first bug would be sticky: `?sw=off` or the Debug panel switch is the escape hatch.
- Incognito/private windows start with an empty cache every time; some browsers do not allow workers there at all.
