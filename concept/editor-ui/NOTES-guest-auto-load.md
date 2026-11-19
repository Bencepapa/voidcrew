# Guest automatic shared loading

## What it does

- A new switch, **Debug → Play & testing → Load the latest shared content automatically**
  (`voidcrew-auto-shared` in localStorage), is on by default. Turning it off stops the
  background loading; the **Shared maps** dialog still loads on demand.
- Once the first scene is ready, and after a short delay + an idle callback, the active
  world's shared textures and shared map heads are loaded in the background. A world change
  schedules the same for the new world. Nothing is awaited by the first frame, the map
  build or input.
- The last successful map-head list and texture metadata are cached in localStorage (only
  plain public storage URLs are accepted). They are applied immediately on the next visit,
  then refreshed by the network. The existing texture change event makes the game rebuild
  once, debounced; a network answer identical to the cache causes no further rebuild.
- Failures only `console.warn`. The load has a 10 s abort timeout and at most one retry
  after a minute, and the retry waits for the page to be visible. Everything is skipped
  when `sharedConfigured` is false.
- In dev, `console.info` reports the background load's duration and request count.
- The editor's **Map settings** list now shows the shared heads with a `shared` badge while
  automatic loading is on. Opening one fetches its body with the same helper the Shared
  maps dialog uses, so guests can open a shared revision without signing in. Saving and
  publishing still require an editor login.

## How to switch it off

Debug panel → **Play & testing** → uncheck **Load the latest shared content automatically**.
The choice is remembered in this browser (`localStorage["voidcrew-auto-shared"] = "0"`).
Clearing that key turns the default back on.

## What was not verified

- No real Supabase project was used. The browser smoke test on the temporary port 5500 only
  checked that the app starts without console errors and that the checkbox toggles and
  survives a reload (`1`/`0` in localStorage). The actual guest reads, caching and rebuild
  path need a project with `supabase/shared-public-read.sql` applied.
- `src/editor/sharedImages.ts` / `loadSharedImages` does **not exist on this branch** (the
  shared-image work lives on `feature/asset-manager-unified`). Automatic loading therefore
  covers shared textures and map heads only; when the image loader lands, add it to the
  `Promise.all` in `src/editor/autoShared.ts`.
- The request count in the dev log comes from the browser's resource timing entries, so it
  is an approximation (and can be lower when the timing buffer is full).
