# Supabase egress audit (step 1 of the "bundled base + dev override" plan)

Audit date: 2026-11-24. Read-only audit of the `main` checkout: no source file was edited, no network or Supabase call was made, no secret is printed (only env var names: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
Everything below is derived from code; where the code cannot prove something it is marked **[verify]** and Section 9 says how to prove it in the Supabase dashboard.

## 0. Summary

1. **Every guest page load of the public Pages build talks to Supabase**, not only editors. The Pages workflow injects the URL/key (`.github/workflows/deploy.yml:29-30`), `sharedConfigured` is therefore true, and the background loader (`src/editor/autoShared.ts`) is **on by default** (`autoSharedPrefs.ts:6-14`), so ~1.2 s after the first scene it lists and fetches *all* shared content of the active world (textures, stills/decals/pickups, props, doors, NPCs, shops, dialogues, map heads).
2. **No bundled content exists today.** `src/game/sharedBuiltins.json` is empty (`textures/maps/images/definitions` all `{}`), no `public/shared-actors`, `public/shared-images` or `public/textures/*_shared_*` exist. The only committed map that uses shared ids (`src/maps/fantasy/tesztvaroska-foter.json`) references 13 distinct shared textures, so the Pages game depends on Supabase for them at runtime. `pull:shared` exists and is wired, but has never produced committed output on `main`.
3. **Cache-busting multiplies downloads.** `GameViewport.tsx:1951-1953` appends `?v=<n>` to every non-blob texture URL, **including `https://<project>/storage/v1/object/public/...` URLs**; `n` is bumped on every scene-relevant shared change (textures, doors, actors, props, pickups, tuning, prop-editor edits, `1670-1701`). Each bump = new URL = browser-cache miss for every texture of the scene (and probably a CDN miss for each new key **[verify]**).
4. **`upgradeShared()` downloads the full diffuse PNG of every shared texture** that has Auto maps or non-alpha transparency (the default for new textures) on every page load, whether or not the current map uses it (`textureLibrary.ts:321, 332-350`). Only the *derived* normal/depth are cached in IndexedDB; the raw download is not.
5. **No upload sets a Cache-Control header** (`sharedAuth.ts:260-267`) and there is no service worker / Cache API. Whatever Storage defaults to applies **[verify header]**. Revisions are immutable (`r<N>` folders, `x-upsert: false`), so they could safely be `immutable`.
6. The editor shows **full-size images as 48 px thumbnails** (`AssetTree.tsx:125`, `AssetManager.tsx:1097`, NPC sheet diffuse as list image at `AssetManager.tsx:314`), so an editor who scrolls the palette downloads every shared diffuse and NPC sheet at full size.
7. No polling, no realtime, no WebSocket anywhere. The only timers are the auth-token refresh (editors, ~hourly) and one 60 s retry after a failed background load.

The proposed layered model is sound and mostly fits existing code (the codebase already has "bundled < store" layering for props/doors/NPCs and a `sharedBuiltins.json` catalog). Main adjustments: one consistent override rule, an **append-only index table** as the single small metadata query (replacing ~N+1 list/meta calls), tombstones as index rows, and an **atomic commit via PK** to fix today's non-atomic conflict handling. See Section 7.

## 1. Inventory: every Supabase touch point

No `@supabase/supabase-js`; all calls are plain `fetch` to PostgREST / Storage / Auth with the publishable key (`sharedAuth.ts:4-5, 175, 199`).

### 1.1 Backend objects

| Object | Where defined | Notes |
|---|---|---|
| Storage bucket `void-textures` (public, 8 MiB per file, mime png/json/webp) | `supabase/shared-editor.sql` + `shared-texture-folders.sql`, `shared-webp-mime.sql` | public bucket: object GET URLs `/storage/v1/object/public/void-textures/...` are served through the CDN, need no auth |
| Table `public.void_maps(world,id,revision,title,body jsonb,saved_by,saved_at)` PK `(world,id,revision)` | `shared-editor.sql`, `shared-map-authors.sql` | append-only (grant select, insert only) |
| View `public.void_map_heads` (distinct on world,id latest revision; `security_invoker`) | same | list of latest map versions, no body |
| Table `public.void_editors(user_id)` | `shared-editor.sql` | editor allow-list; RLS: own row only |
| RLS/policies | `shared-editor.sql`, `shared-public-read.sql`, `shared-texture-folders.sql` | maps: select = editors + anon (public-read SQL), insert = editors. storage.objects: insert editors; select (list) editors + anon `guest_list_textures`; **delete editors** (`delete_textures`) |
| Auth (email+password, `auth/v1/token`) | `sharedAuth.ts` | editors only; guests are anonymous with the publishable key |

Because the publishable key and URL are compiled into the public bundle and anon has list + select, **anyone** can enumerate and download the whole bucket (no auth, no rate limit). Third-party scraping would count against the quota too. **[verify in logs: unknown IPs / user agents / referers]**

### 1.2 Client code paths (read)

"When": S = at page start/scene ready (guest and editor), E = editor action, M = per map/world change.

| file:line | What | When / how often |
|---|---|---|
| `autoShared.ts:82-129` `execute()` | `Promise.all` of 8 loaders for the **active world** after first scene + 1.2 s idle; 10 s timeout, one retry after 60 s on failure; again on **every world change** (`App.tsx:441`) | S/M, once per page load (+ per world switch). Default ON for everyone (`autoSharedPrefs.ts`) |
| `sharedTextures.ts:110-125` `loadSharedTextures` | `POST /storage/v1/object/list/void-textures` for `<world>/`, then 1 list per texture folder `<world>/<uuid>`, then `GET <world>/<uuid>/r<N>/meta.json` per texture (`readLatest`, `:68-79`; tries lower revs only if meta missing) | S/M and E. **N+1 lists + N meta GETs**. Page size 100 (`:26`) |
| `sharedImages.ts:212-223` `loadSharedImages` | 3 lists (`<world>/portrait|decal|item`), then 1 list + 1 `meta.json` GET per asset | S/M, E (`App.tsx:454-456` also when a map needs a not-yet-loaded image id; `editMode` always) |
| `sharedDefinitions.ts:10-27` `loadDefinitions` (props `sharedProps.ts:181`, doors `sharedDoorTypes.ts:128`, NPCs `sharedActors.ts:233`) | per kind: 1 list + (1 list + 1 meta GET) per asset | S/M, E, and `App.tsx:457-474` triggers `loadSharedProps/Doors/Actors` **and `loadSharedTextures`** again when a map references an id that is not registered yet (duplicates the 1.2 s background load that follows) |
| `sharedCommon.ts:16-29` (`loadSharedShops`, `loadSharedDialogues`) | `common/shop`, `common/dialogue`: 1 list + (1 list + 1 meta GET) per id (twee text up to 512 KiB lives *inside* meta.json) | S |
| `sharedMapHeads.ts:57-64` | `GET /rest/v1/void_map_heads?world=eq.<w>&order=title,id` | S/M, E (Shared maps dialog open/save/refresh) |
| `sharedMaps.ts:43-62` `loadSharedMap` | `GET /rest/v1/void_maps?select=body&...&revision=eq.N` (one map body, ~10 KB) | E, on opening a shared map |
| `sharedAuth.ts:175` refresh, `:214, :300` membership check `GET /rest/v1/void_editors`, `:291` sign-in | signed-in editors; refresh timer `:125-136` (~1 h minus margin) | E, negligible |
| `textureLibrary.ts:332-350` `upgradeShared` | `fetch(<diffuse.png>)` of **every shared texture whose meta has Auto maps or transparency != alpha**, then derives normal/depth (IDB-cached by id+rev) | S/M. Runs from `setSharedTextures` (`:321`) for each new/changed texture, i.e. **once per texture per page load** |
| `textureLibrary.ts:266, 363` `ensureDraft` | fetches all uploaded maps of a texture into Blobs to make an editable draft | E, on editing a published texture |
| `sharedActors.ts:146-153`, `sharedImages.ts:129-138` | revise NPC / image: fetch files into Blobs | E |
| `GameViewport.tsx:4913, 5898-5899`, `render/decals.ts:235-238`, `render/sharedImages.ts:53-60` | actual rendering fetches of shared diffuse/normal/depth/surface/emissive (three.js `TextureLoader`), NPC sheets, decals, pickups; `preloadSharedImages` does `new Image().src` for the loading stills of the current map **and the maps its exits/stairs lead to** (`App.tsx:447-448`, `LoadingImagePreloader.tsx`) | S/M |
| `AssetTree.tsx:125`, `AssetManager.tsx:137,1097,1156` | `<img src=<full diffuse URL>>` thumbnails (lazy) of shared textures, props, pickups, door leaves, **NPC sheets** | E, whenever the palette/Assets window is shown |
| `AssetManager.tsx:457-477` `refreshShared` | on **every open of the Assets window**: both worlds x (textures, images, props, doors, NPCs) full reload | E |
| `SharedEditor.tsx:35-46, 62` `refresh` | heads + textures + images reload on **every open of the Shared maps dialog**, after each save, after sign-in/out, on the Refresh button | E |
| `sharedTextures.ts:196, 224`, `sharedImages.ts:280`, `sharedProps.ts:206` | full re-list after each publish / delete | E |

Cache: `sharedCache.ts` keeps only **map heads and texture metadata** in `localStorage` (stale-while-revalidate for the lists, `autoShared.ts:98-100`). It does **not** stop the network refresh (the full list+meta sequence still runs) and does not cover images/props/doors/NPCs/shops/dialogues.

### 1.3 Client code paths (write / modify / delete)

| file:line | What |
|---|---|
| `sharedAuth.ts:260-267` `sharedUpload` | `POST /storage/v1/object/void-textures/<path>` with `x-upsert: false` (never overwrite; 409 if exists). **No `cache-control` header.** |
| `sharedTextures.ts:168-184` `publishTextureRevision` | lists `<world>/<uuid>`, reads latest meta, asks `ask()` if latest rev != draft `baseRev`, then uploads `r<next>/{diffuse,normal,depth,emissive,surface}.png` and `meta.json` **last** |
| `sharedTextures.ts:205-225` `deleteSharedTexture` | lists all rev folders, `DELETE /storage/v1/object/void-textures` with all object paths (physical delete of every revision; needs `delete_textures` policy; textures only) |
| `sharedImages.ts:243-281` `publishImage` | stills/decals/pickups -> `<world>/<portrait|decal|item>/<uuid>/r<next>/diffuse.png (+normal.png, depth.png) + meta.json` |
| `sharedDefinitions.ts:29-42` `publishDefinition` | props/doors/NPCs -> `<world>/<prop|door|actor>/<uuid>/r<next>/(files)+meta.json` `{v,type,rev,definition}` |
| `sharedCommon.ts:31-38, 59-72` | dialogue/shop -> `common/<dialogue|shop>/<id>/r<next>/meta.json` |
| `SharedEditor.tsx:47-57` | map save: `POST /rest/v1/void_maps` with `revision = previous+1` (PK conflict -> HTTP 409 -> "newer version") |

No update, no rename, no delete for anything except textures. No realtime channel, no polling.

### 1.4 Scripts, build, deploy

| File | What | Supabase use |
|---|---|---|
| `scripts/pull-shared.ts` (`npm run pull:shared [outdir]`) | release importer; reads `VITE_SUPABASE_*` from env/`.env.local`; lists via the same Storage list API; downloads textures (`:72-136`), portraits+decals (`:138-180`), props/doors/NPCs (`:196-242`), dialogues+shops (`:246-265`), maps (`:275-295` via `void_map_heads` + `void_maps`) | read only; "keep existing, warn on newer rev" policy (`:96-99, 154-157, 203-206`); only dialogues/shops are refreshed to newer revs |
| `scripts/pack-world.ts` (`npm run pack`) | `vite build` with `VITE_WORLD`, `VOID_BASE=/`, zips a folder with launchers | **no Supabase code, but `vite build` still loads `.env.local`** (see 6.3) |
| `.github/workflows/deploy.yml` | `npm ci`, `npm run build` with `vars.VITE_SUPABASE_URL`, `vars.VITE_SUPABASE_PUBLISHABLE_KEY` baked into the bundle, upload to Pages | **build itself makes no Supabase request** (no prebuild fetch); runtime only |
| `vite.config.ts` | dev-only middlewares (`apply: "serve"`) that write `src/maps`, `src/props`, `src/render/textureTuning.json`, `src/game/actorSizes.json`, `src/actors/*.json`, `concept/gen/captures` | local file writes; relevant for the "dev editor writes repo files" half of the story |
| other scripts (`process-texture`, `make-*`, `import-decals`, ...) | generate `public/` assets locally | no Supabase; `gen-*` use Gemini |
| `.env.local` (git-ignored by `.env*`) | contains `GEMINI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.example` lists only Gemini vars |

## 2. What costs egress: ranking

Assumptions (state them, not guaranteed): the repo's own assets show what a published asset looks like. Local `public/textures`: 105 sets, median set 48 KB, avg 76 KB (a few flagged outliers: `fantasytree2/normal.png` 1.2 MB). Local `public/actors`: 18 NPC sheets, `diffuse` ~0.2-0.6 MB, **`normal.png` 1.5-2.7 MB each** (20.7 MB total). Skies 2 MB each. Hard upload cap is 8 MiB per file (`imageTools.ts:7`); stills may be up to 4096x4096 (`sharedImages.ts:183`), decals/pickups 512x512, NPC sheets 2048x2048. Real shared counts are unknown (**decision/measurement needed**); I use "30 textures, 10 NPCs, 15 other images/defs" as an illustrative world.

Per **guest cold page load** (empty browser cache, fantasy world, a map like `tesztvaroska-foter` that uses ~13 shared textures):

| Source | Requests | Bytes (rough) | Notes |
|---|---|---|---|
| Lists (POST, JSON) | ~1 + N_tex + 3 + N_img + 3x(1+N_def) + 2x(1+N_common) ~ **70-150** | 0.1-0.4 MB | uncached/API egress, small each, but each `list` returns entries with full object metadata |
| meta.json GETs | ~**60-120** | 0.1-0.5 MB | each is a public-object GET (cached egress), 0.5-5 KB; shops/dialogues larger |
| `upgradeShared` full diffuse of **all** Auto textures | N_tex (30) | **1-15 MB** (50-500 KB each, more for big uploaded PNGs) | independent of what the map uses. Biggest unnecessary item |
| Scene textures actually used (uploaded normal/depth/surface/emissive; diffuse again via three.js, unless blob from `upgradeShared`) | 13 sets x 1-4 files | 1-8 MB | needed content, but see rebuild below |
| **Rebuild after shared load** | all of the above scene textures again with `?v=1`, `?v=2`... | **x(1 + number of bumps)** | first visit: the scene is built before the store answers, shared ids appear, `onSharedTexturesChanged` (`GameViewport.tsx:1672-1681`) bumps `textureVersion` -> all texture URLs change |
| NPC sheets used by the map (diffuse + normal) | 2 per NPC | 0.5-3 MB each, `?v=` too (`:5898`) | normals are the heavy part |
| Stills preload (loading screen of this map and of linked maps) | 1-3 | 0.2-5 MB each (PNG up to 4096^2) | `new Image().src` -> cached egress, whether or not the player ever follows the link |
| Decals / pickups | few | < 100 KB each | minor |

**Rough guest cold load: ~4-25 MB; warm (browser cache valid) but with the lists: ~0.3-1 MB.** 5.5 GB / 10 MB ~ 550 cold loads. A few testers refreshing during development, or a link shared in a chat, is enough. An editor session is heavier: the Assets window reloads both worlds (x2 of the list/meta cost and the `upgradeShared` diffuses of both worlds), palettes load full-size thumbnails, and every save/publish triggers another full re-list.

Ranked offenders (qualitative; savings if fixed):

| # | Offender | Evidence | Fix | Saves |
|---|---|---|---|---|
| 1 | Guests hit Supabase at all (default-on auto-load, all content, every load) | `autoSharedPrefs.ts`, `deploy.yml`, `App.tsx:441` | bundle the finalized content (zero-code first step: run `pull:shared`, commit), make store access editor-only / opt-in | ~90%+ of guest egress |
| 2 | `?v=<n>` busting of remote URLs, repeated rebuilds | `GameViewport.tsx:1951-1953, 1670-1701, 5898, 4981` | never append `?v` to https/bundled URLs outside dev hot-reload (only for the local Vite `public/` files in dev); remote URLs already carry the rev in the path | removes the x(1+bumps) multiplier on every load and every edit |
| 3 | `upgradeShared` fetches every texture's diffuse | `textureLibrary.ts:321, 332-350` | only for textures the loaded map (or a visible palette) uses; cache the processed diffuse in IDB too (key id:rev); or move Auto-map baking to publish time (store the derived maps) | 1-15 MB per load |
| 4 | No/unknown Cache-Control, no immutable | `sharedAuth.ts:260-267` | upload with `cache-control: max-age=31536000, immutable` (the rev folder never changes); optional Cache API for blobs | browser revalidation / re-download within and across sessions |
| 5 | Full-size images as thumbnails in the editor | `AssetTree.tsx:125`, `AssetManager.tsx:314, 1097` | publish a small `thumb.webp` (or generate once client-side, keep in IDB) | editor egress, esp. NPC sheets (0.5-3 MB each) |
| 6 | N+1 list/meta traffic, repeated full reloads (open Assets, open Shared maps, after each publish, duplicate App.tsx loads, both worlds) | Section 1.2 | one index query (delta since last freeze) + localStorage cache + invalidate by cursor; refresh only on button | hundreds of requests per session, ~0.5 MB per full reload |
| 7 | Preloading stills of linked maps; PNG-only stills | `LoadingImagePreloader.tsx`, `loadingImagesAhead` | preload only the current map's when not bundled; lossless/lossy WebP at publish | 0.2-10 MB per load |
| 8 | Heavy NPC normal maps as PNG (1.5-2.7 MB) | `public/actors/*/normal.png` | lossless WebP (the diffuse path already does this, `losslessImage.ts`) | ~30-50% of NPC bytes (also shrinks bundle/zip) |
| 9 | Public list/read with an exposed key | `shared-public-read.sql` | guests do not need it once bundled; drop `guest_list_textures`/anon select on maps in the release project, or keep only the small index | protects against third-party scraping |

Not offenders (checked): no polling, no realtime, no `setInterval` against Supabase, deploy workflow does not download at build time, Pages build artefacts (61 MB, mostly a 25.6 MB onnx wasm chunk, see 5.2) are served by GitHub, not Supabase.

## 3. Asset identity and what `pull:shared` bundles today

### 3.1 IDs and paths

All shared store paths are under bucket `void-textures`:

| Kind | Store path | Game id |
|---|---|---|
| texture | `<world>/<uuid>/r<N>/{diffuse,normal,depth,surface,emissive}.png + meta.json`; old flat `<world>/<uuid>-name.png` (legacy, flat normal/depth, not editable) | `<world>_shared_<uuid>` |
| still (portrait/loading/room) | `<world>/portrait/<uuid>/r<N>/diffuse.png + meta.json` | `<world>_portrait_<uuid>` |
| decal | `<world>/decal/<uuid>/r<N>/diffuse.png [normal.png] + meta.json` | `<world>_decal_<uuid>` |
| pickup | `<world>/item/<uuid>/r<N>/{diffuse,normal,depth}.png + meta.json` | `<world>_item_<uuid>` |
| prop | `<world>/prop/<uuid>/r<N>/meta.json {definition}` (uses a texture id; the prop's own texture is an ordinary shared texture) | `<world>_prop_<uuid>` |
| door type | `<world>/door/<uuid>/r<N>/meta.json {definition}` (leaf/frame = texture ids) | `<world>_door_<uuid>` |
| NPC | `<world>/actor/<uuid>/r<N>/{diffuse.png|webp, normal.png}+meta.json {definition}` | `<world>_actor_<uuid>` |
| dialogue / shop | `common/<dialogue|shop>/<id>/r<N>/meta.json` (world independent, human id `^[a-z0-9][a-z0-9_-]{0,63}$`) | `<id>` |
| map | table `void_maps(world,id,revision,title,body)`, head view | map `id` (file name `src/maps/<world>/<id>.json`) |

Ids are uuid-based and stable across revisions; `rN` is a per-asset monotonic integer (max listed + 1). Ids therefore map **cleanly 1:1 to bundled files** and the existing bundle layout already mirrors them: `public/textures/<id>/`, `public/shared-images/<id>.png (+.normal.png)`, `public/shared-actors/<id>/`, `src/game/sharedBuiltins.json` for metadata, `src/maps/<world>/<id>.json`, `src/dialogues/<id>.twee`, `src/shops/<id>.json`.

### 3.2 What `pull:shared` bundles (and not)

| Kind | Bundled by `pull:shared`? | Where | Gap |
|---|---|---|---|
| Textures (all maps; Auto normal/depth **generated at pull time** with the same `depthNormal` core as the editor; transparency baked) | yes (`:72-136`) | `public/textures/<id>/`, catalog `textures[id]{rev,label,kinds,pixelArt,smooth,files,tuning}` | existing entries are never refreshed ("Kept existing ... shared revision"); no tombstones; legacy flat PNGs bundled with `rev 0` |
| Stills (portraits/loading/room) and decals (+ decal normal) | yes (`:138-180`) | `public/shared-images/<id>.png`, `images[id]` | same keep-existing policy |
| **Pickups (`item`)** | **no**: `pullImages` is called for `portrait` and `decal` only (`:272-273`); the `item` type is not pulled. The H5 note says "not a shared kind", but the editor does publish `item` images (`sharedImages.ts:243`) and `render/sharedImages.ts` expects `bundledImages` of type item | missing | **real gap**: a pickup published to the store never reaches a release |
| Props, door types | definitions yes (`:196-242`) into `catalog.definitions`; the textures they reference are pulled separately (warning if not bundled) | `sharedBuiltins.json` | loaded at start by `installBundled*`; store then overrides by id |
| NPCs | definition + diffuse(png/webp) + normal | `public/shared-actors/<id>/` | same |
| Dialogues, shops | yes (`pullCommon`), refreshed to newer revs when previously written by the script | `src/dialogues`, `src/shops` | removal in store is not propagated |
| Maps | yes via `void_map_heads`/`void_maps` | `src/maps/<world>/<id>.json`, `catalog.maps[world][id] = revision` | keep-existing too; a hand edited local file wins silently |
| Shop/dialogue drafts, IDB drafts | n/a | local only | |

State on `main`: catalog is empty, so **nothing from the store is currently bundled** (except hand-made/committed files such as `src/maps/fantasy/shared-92d323fd-...json`, `src/shops/*`, `src/dialogues/*`).

Conflicting precedence rules today (to unify, see 7.2): textures and images: **bundled wins** (`setSharedTextures` and `setSharedImages` filter out ids that are in the bundled catalog, `textureLibrary.ts:306`, `render/sharedImages.ts:78`); props/doors: **store wins** by id (`install(new Map([...bundled, ...store]))`); NPCs: store replaces bundled when its `base` differs (`sharedActors.ts:198`).

### 3.3 What a manifest looks like today / could look like

Today the only manifest is `sharedBuiltins.json` (rev, label, kinds, files, tuning per id; no hashes, sizes or timestamps).
Proposed: see 7.1.

## 4. Editor features and what changes under the layered model

"Today" = what the code does; "Layered" = proposed behaviour (override layer in dev/editor builds only).

| Kind | create | modify | delete | rename | replace files | Today (file) | Under the layered model |
|---|---|---|---|---|---|---|---|
| Texture | yes, draft in IDB, Publish | yes: draft from published (fetch maps), Publish = new `rN`; conflict prompt `ask()` if `baseRev` stale | yes, physical delete of all revisions (`sharedTextures.ts:205`), policy-dependent | name is in meta; new rev | per-map upload/auto | non-atomic: list then upload | new = override row `rev 1` (no bundled counterpart); modify = row `rev > bundledRev`; delete = **tombstone row**, files stay; rename/replace = new rev. Editor shows state badge and "revert to bundled" (= ignore override locally or tombstone the override rev) |
| Still / decal / pickup | yes | yes (`reviseSharedImage`, `canReviseImage`) | **no** | no | yes | `sharedImages.ts` | same as texture; **add delete (tombstone)**; add pickups to the freeze |
| Prop | yes (own texture draft + definition) | yes (`reviseSharedProp`) | **no** | name field | texture swap | `sharedProps.ts` | override row; tombstone; a prop references a texture id, so a tombstoned texture must be reported by the Problems panel (it already validates refs) |
| Door type | yes | yes | **no** | name | leaf/frame | `sharedDoorTypes.ts` | same |
| NPC | yes | yes (`reviseActor`) | **no** | name | sheet files | `sharedActors.ts` | same; files are heavy -> index must carry per-file size/hash so unchanged files are not re-downloaded |
| Dialogue / shop | local drafts, Publish | republish = new rev | **no** | id is the identity (rename = new id + old tombstoned) | json | `sharedCommon.ts` | override row with inline JSON (small; could live in the index row itself) |
| Map | local file writes in dev (`__voidcrew/map` -> `src/maps`), Shared maps dialog saves rev to `void_maps` | yes (rev+1; 409 -> conflict) | **no** | title only (new row) | n/a | `SharedEditor.tsx` | maps are small (10 files, 90 KB) and 409-safe already; keep `void_maps`, but the freeze must pull bodies; add tombstone (`deleted` flag/column) for abandoned maps. Guests never need map heads |
| Texture tuning, NPC sizes, prop box edits | dev server writes JSON in the repo (`vite.config.ts`) | | | | | partly in `meta.json` (`tuning`), partly in repo JSON (`textureTuning.json`, `actorSizes.json`) | two persistence paths for "look" data: decide that tuning of **bundled** assets is saved to the repo (dev server) and tuning of **overrides** goes into the override row, otherwise the freeze loses one of them |

## 5. Game data in Supabase that must be frozen, and other network needs

### 5.1 Must be frozen for release

All of: shared textures (all maps incl. surface/emissive; legacy flat PNGs), stills (loading/portrait/room), decals, **pickups (currently not pulled)**, props, door types, NPC definitions and sheets, shops, dialogues, map bodies. Plus: deletions (tombstones) and per-asset `tuning` / `pixelArt` / `smooth` / transparency data in `meta.json`. Not in Supabase and therefore not an issue: story/lock/terminal data (repo), items in `ITEM_TYPES` (code), skies and particles (public/).

### 5.2 Other network dependencies in the release path

| Dependency | Where | Release impact |
|---|---|---|
| **Google Fonts** (Cinzel, Outfit) | `index.html:11-13` | the only always-on third-party request of the game; breaks "zero network" and offline play. Self-host (woff2 in `public/fonts`, `@font-face`) |
| **Transformers.js model download** (`onnx-community/depth-anything-v2-small` from Hugging Face on first use, `aiDepthWorker.ts:8,24,39`) | editor-only AI-depth button | not loaded by the game (separate chunk), but the **25.6 MB `ort-wasm-simd-threaded.asyncify-*.wasm` chunk is emitted into `dist/`** (61 MB total) and into packaged zips. Exclude the editor-only chunk from the release build; `dist/assets/transformers.web-*.js` also contains CDN URL strings (jsdelivr/huggingface) [verify what the runtime actually requests] |
| `@google/genai` / Gemini | scripts only (`gen-*.ts`) | not in the bundle (verify by build scan) |
| Supabase code and env | `sharedAuth.ts` etc.; `dist/assets/index-*.js` currently contains the `/storage/v1/` strings and the project URL | remove for release (6.3, 7.5). The existing `dist-fantasy` (older build) has none |
| Analytics / CDN scripts / external images | none found in `src`, `index.html` | none |
| Dev endpoints `__voidcrew/*` | `fetch` to same origin in editor code | harmless in release, but unreachable (`apply: "serve"` only exists in dev) -> editor save buttons would fail; hide editor in release |

## 6. Risks and blockers

### 6.1 Build size and hosting limits

- GitHub Pages: ~1 GB published site, 100 MB per file, ~100 GB/month soft bandwidth, 10 builds/hour soft. Current `dist` = 61 MB / 433 files, largest file the 25.6 MB wasm. Bundling shared content adds roughly what `public/` already has: 18 NPC sheets are 20.7 MB, 105 texture sets 7.8 MB, skies 4 MB. Even 50 NPCs + 300 textures stays far below 1 GB. NPC normal maps and stills are the size drivers.
- Git repo size: every re-freeze with a changed binary adds a full copy to history. Keep the freeze script from rewriting unchanged files (hash compare), prefer lossless WebP, and consider that Git LFS does not play well with this Pages workflow (checkout needs `lfs: true`, LFS bandwidth quota).
- Deploy trigger: every push to `main` redeploys, so a freeze commit with many binaries is also a Pages deploy.

### 6.2 Packaging (`packaging/` + `scripts/pack-world.ts`)

`npm run pack -- --world fantasy|scifi` builds with `VITE_WORLD`, `VOID_BASE=/`, copies the build to `dist-<world>/<Title>/game`, adds `Start-Game.bat`/`server.ps1` (Windows PowerShell static server, port 8765), `start.sh` (python3 `http.server`) and a README, and zips (VoidFantasy.zip currently 37 MB, 75.8 MB unpacked). It is a "play from localhost" bundle, not a signed native app; no Steam/itch/Electron packaging exists in the repo.
Problems for the "no server" goal: (a) `vite build` loads `.env.local` in every mode, so a packaged build made on a machine that has the Supabase vars **embeds them and makes the live calls** despite the README text "nothing is sent anywhere" (fix: build with explicit empty `VITE_SUPABASE_*`, or the release flag below); (b) Google Fonts (5.2); (c) the 25 MB editor wasm ships in the zip; (d) the README says Tab opens the editor and the Download button works, i.e. the packaged game still contains the editor and shared UI.

### 6.3 Auth / RLS

- Writers: `void_editors` membership; the publishable key + RLS is the only protection; the key is public in the bundle. Anon can list the whole bucket and read all map bodies once `shared-public-read.sql` was run.
- Delete policy `delete_textures` lets any editor physically delete any object in the bucket (all revisions). Under the new model this should be **removed** (deletes become tombstone rows; "never deletes from Supabase" then also holds for the editor).
- `sharedConfigured` gating means an unset env already disables every loader (`if (!sharedConfigured) return`), so a Supabase-free build is feasible even with the current code; but sign-in UI, `sharedAuth.restoreSession()` (runs at import, `:337`) and ~20 importing modules remain, and an empty-string env must be passed explicitly because `.env.local` otherwise fills it.

### 6.4 Realtime and polling

None. Editors only see each other's changes on a manual refresh / next page load / opening a dialog. This is a feature for egress; do not add realtime.

### 6.5 Conflict handling today

| Kind | Behaviour |
|---|---|
| Maps | atomic: PK `(world,id,revision)` -> 409 -> "newer version"; "Save as separate copy" (`copy-<uuid>`) |
| Textures | read-compare-write: `revisionState` lists, compares latest published rev to the draft's `baseRev`, `ask()` (confirm dialog) if different; race window between check and upload; second writer of the same `rN` gets 409 on `diffuse.png` and sees a raw error; half-published folder (no `meta.json`) is skipped and its number is not reused |
| Stills/decals/pickups/props/doors/NPCs/dialogues/shops | **no stale-base check at all**: always publishes `max+1` -> silent last-writer-wins (newest rev shown to everyone), same-`rN` race ends in a 409 error |
| Delete (textures only) | physical, silent for others: their cached list (localStorage) still shows the texture until the network answer, then it disappears and maps referencing it show missing texture; only the deleting editor gets a warning if *their current map* uses it (`registerMap`) |
| Never deleted | everything else, so the store grows forever (all old `rN` folders remain, listed on every uuid folder list) |

### 6.6 Things that make the layered model harder

1. Inconsistent precedence (3.2) and `bundled wins` for textures/images means an edited bundled texture would be **hidden by its own bundled copy**; the override rule must be "highest rev wins" everywhere.
2. Props/doors reference textures by id, NPCs reference portraits; dangling references after a tombstone need a Problems-panel check (and a freeze-time check).
3. Auto maps are generated in the browser (worker) at view time and at pull-time in Node with the same `depthNormal` core (`autoRecipe.version = 1`): bundling bakes them. If the generator version changes, bundled baked maps do not follow; keep `autoRecipe.version` in the manifest.
4. Two editors working offline from different freeze bases: the manifest needs a `baseVersion`; the override query must be "rows with rev > bundled rev for that id", not "rows since timestamp" (a stale checkout otherwise misses rows).
5. Tuning/size data lives partly in repo JSON written by the dev server (4, last row).
6. Per-edit `textureVersion` rebuild (`GameViewport.tsx:1670-1701`) is also the editor's live-reload mechanism; removing `?v` on remote URLs must keep live-reload correct (rev in the path already makes the URL change when a new revision is installed).
7. Existing published data has no hashes and no `Cache-Control`; hashes can be computed at freeze/index-backfill time from the downloaded bytes.

## 7. Proposed design adjustment

### 7.1 Manifest (base layer, in the repo, build input)

`src/game/assets.manifest.json` (replaces/extends `sharedBuiltins.json`; keep the existing fields so current loaders keep working during migration):

```jsonc
{
  "v": 2,
  "baseVersion": 14,                    // bumped by every freeze; also the "cursor" for the override query
  "frozenAt": "2026-12-01T10:00:00Z",
  "autoRecipe": 1,
  "assets": {
    "fantasy_shared_<uuid>": {
      "kind": "texture", "world": "fantasy", "rev": 7,
      "name": "Mossy wall", "updated_at": "...",
      "files": { "diffuse.png": { "size": 48213, "sha256": "ab12..." }, "normal.png": { ... } },
      "meta": { "kinds": ["wall"], "pixelArt": true, "smooth": false, "tuning": {} }    // existing catalog fields
    },
    "common:dialogue:void-fantasy": { "kind": "dialogue", "rev": 3, "inline": "..." }
  },
  "tombstones": ["fantasy_prop_<uuid>"],   // frozen deletions, so a stale override cannot resurrect them
  "maps": { "fantasy": { "<mapId>": 12 } }
}
```

Bundled file path derives from the id and kind (same layout as today), so the manifest holds no URLs. Each file carries `size` and `sha256` (16 hex chars of the sha256 are enough in names). Order: id -> latest bundled `rev` is the comparison key (see 7.2); the hash is for integrity, "did the file really change" in the freeze, and optional content-addressed names.

### 7.2 Override layer (Supabase, dev/editor only)

Keep the Storage layout (`<world>/<kind>/<uuid>/r<N>/...`, immutable) and add **one append-only index table**, the single source for "what changed since the freeze":

```sql
void_asset_index(
  id text,            -- game id, e.g. fantasy_shared_<uuid>
  rev integer,        -- same N as the storage folder
  kind text, world text, name text,
  deleted boolean default false,       -- tombstone
  files jsonb,        -- { "diffuse.png": {size, sha256}, ... } (+ small meta; tiny definitions/dialogues inline)
  saved_by text, saved_at timestamptz default now(),   -- trigger-stamped like void_maps
  primary key (id, rev)
);
-- view void_asset_heads = distinct on (id) latest rev (like void_map_heads)
```

- **Atomic commit**: upload the files of `r<N>` first (immutable, `cache-control: public, max-age=31536000, immutable`, `x-upsert: false`), then insert the index row `(id, N)`. The PK collision gives the same 409 conflict semantics maps already have, for every asset kind; a half-published folder is invisible because no row exists. Stale-base check: the insert policy/trigger may require `rev = (select max(rev)+1)` or the client sends its `baseRev` and a conflict opens the existing dialog. This replaces today's list-then-upload race and the "no check" kinds.
- **Soft delete**: an index row with `deleted = true` at `rev = max+1`. Files are never removed; no `delete` policy on `storage.objects` any more. "Undelete" = a new row with `deleted = false`. Deleting a **bundled-only** asset also works (override row, since the id exists in the manifest).
- **Resolution per id** (editor/dev build): `head = override head`; if no head -> bundled; else if `head.rev <= manifest.rev` -> bundled (already frozen); else if `head.deleted` -> hidden; else -> remote files at `.../r<head.rev>/` (cached). Bundled tombstones (manifest `tombstones`) hide the id unless a later `rev` undeletes it.
- **Startup query**: one request, `GET /rest/v1/void_asset_heads?saved_at=gt.<freezeCutoff>&select=...` (or `rev` filter per id), cached in localStorage with the cursor of the last seen `saved_at`, so a warm editor asks for "since cursor" and normally gets an empty array. Replaces ~70-150 list/meta requests with 1. Keep `void_map_heads` as is (or fold maps into the same index later).
- **Backfill**: a one-off script reads the existing bucket (the same listing logic as `pull-shared.ts`), computes sizes/hashes and inserts index rows for the latest existing revisions (including legacy flat PNGs as `rev 0`), so existing content is not lost. Needs a decision: this is the only moment a script writes to Supabase.
- **Who sees overrides**: signed-in editors, and any build with the dev flag, by default. Guests and the plain Pages build: bundled only (opt-in switch like today's Debug option, default off). See decisions.

### 7.3 Editor UI states

Per asset, a badge in the palette/Assets tree computed from (manifest, index head, drafts): **bundled** (no override), **modified** (override rev > bundled rev; actions: "revert to bundled" = tombstone-free: publish a new rev copying the bundled files, or simply "forget override" locally), **new** (no bundled counterpart; will be created by the next freeze), **deleted** (tombstone; shown struck through with "restore"), **draft** (existing IDB drafts), **stale-base** (override head moved while editing -> existing conflict dialog). The existing `textureStatus` already has builtin/legacy/shared/new/changed and can be extended rather than replaced.

### 7.4 Freeze/bake script (replaces `pull:shared`)

Re-runnable, read-only against Supabase:
1. Fetch the index heads (one request) and `void_map_heads`.
2. For each head with `rev > manifest.rev` (or a missing id): download only the files whose `sha256` differs from the manifest (reuse unchanged files), verify the hash, generate Auto maps (existing code), write into the existing `public/...` layout, update the manifest entry. Tombstoned ids: remove the files, add the id to `tombstones`, keep a `removed` note for `git` review.
3. Bump `baseVersion`; print a diff summary (added/changed/removed, bytes); `--dry-run` default, `--apply` to write.
4. Checks (fail the freeze): dangling references (prop->texture, door->texture, NPC->portrait, map->ids), invalid PNG/WebP dimensions (existing checks), duplicate ids across worlds, missing `pickup` (include `item` kind, currently missed).
5. Never deletes from Supabase.

### 7.5 Release build

- Compile-time flag `VITE_RELEASE=1` (or `mode=release`) as a Vite `define` constant. Make the remote layer a separate module (`remoteStore.ts`) that the release build aliases to a stub (`resolve.alias`), so `sharedAuth.ts`, all `shared*.ts` loaders, `autoShared.ts`, the sign-in UI and the `/rest|/storage|/auth` strings tree-shake out. Setting `sharedConfigured = false` alone is not enough for a hard guarantee; the alias is.
- Release also: no editor chunks (Tab/editor, AI depth, the 25.6 MB wasm), self-hosted fonts, explicit `VITE_SUPABASE_*=""` so `.env.local` cannot leak in.
- **Post-build gate** (`scripts/check-release.ts`, run by `npm run build:release` and in CI): scan `dist/` text assets for `supabase`, `/storage/v1`, `/rest/v1`, `/auth/v1`, `huggingface`, `googleapis`, `gstatic`, `jsdelivr`, `unpkg`, and generally any `https?://` outside an allow-list (W3C namespace URIs in libraries); scan `index.html`/CSS for `url(http`; fail the build if found. Also assert every manifest file exists and matches its hash.

### 7.6 Cache strategy

- Remote revisions: path already contains `r<N>`, so the URL is content-immutable; upload with `cache-control: public, max-age=31536000, immutable`. No hash needed in the URL; hash is for integrity/freeze.
- Remove the `?v=` appended to https and bundled URLs in non-dev builds (`GameViewport.tsx:1953` should only bust local dev-served `public/` files, and only when `import.meta.hot`).
- Persist what is fetched: HTTP cache is enough once headers are right; add an IDB (or Cache API) store keyed `id:rev:file` for processed blobs (the `auto` store exists for normal/depth only) so reloads and `upgradeShared` need no network; evict by rev.
- Bundled assets on Pages: GitHub Pages sends a fixed short max-age and cannot be configured; content-hashed file names (`diffuse.<sha8>.png` via the manifest) would help repeat visitors, optional and unrelated to Supabase egress.
- Thumbnails: publish `thumb.webp` (64-128 px) with each revision or derive once and cache in IDB; palettes use it, never the full file.
- Drop `loadingImagesAhead` neighbour preloading for remote stills (or limit to the current map).

### 7.7 Incremental plan, ordered by egress saved per effort

| Step | Change | Effort | Saves | Needs decision? |
|---|---|---|---|---|
| 0 | Measure first (Section 9): confirm which paths and which hosts dominate | minutes (dashboard) | tells whether this ranking is right | no |
| 1 | Run `npm run pull:shared`, review, commit the bundle (textures, stills, decals, props, doors, NPCs, shops, dialogues, maps); add `item` pull to the script | small (script + review) | with 2+3, nearly all guest egress | **D1** (what to include), **D4** |
| 2 | Default the auto-loader to off for non-signed-in users / Pages build (`autoSharedPrefs.ts`, `autoShared.ts:31`); `App.tsx:454-474` effects only run when signed in | tiny | all guest list/meta/asset traffic | **D2** |
| 3 | Never add `?v=` to https/bundled URLs outside dev (`GameViewport.tsx:1953`) | tiny | removes the rebuild multiplier | no |
| 4 | `upgradeShared` only for used textures; cache processed diffuse in IDB | small | 1-15 MB per load | no |
| 5 | Upload with immutable `cache-control`; check the current header (Section 9) | tiny | repeat visits | no |
| 6 | Remove duplicate/redundant reloads: Assets window open, Shared maps dialog open, per-publish full reload, `App.tsx` duplicates; only reload on explicit Refresh or after own publish (patch the local list) | small | editor session volume | no |
| 7 | Thumbnails (small derived images) for palettes | medium | editor egress (NPC sheets) | no |
| 8 | Index table + heads view, delta query, localStorage cursor; backfill script; stop N+1 listings | medium | requests/session (hundreds -> 1), meta bytes | **D3**, **D5** |
| 9 | Publish pipeline v2 (upload immutable, then index row, atomic conflicts); tombstones; remove `delete_textures` policy; editor delete for all kinds; state badges | medium-large | correctness, no more physical deletes | D5, D6 |
| 10 | Freeze v2 (hash diff, tombstones, validation, dry-run) | medium | keeps the base fresh cheaply | |
| 11 | Release build flag + alias stub + `check-release` gate; self-host fonts; drop editor + 25 MB wasm; packaging uses it | medium | guarantees zero runtime dependency | **D7** |
| 12 | WebP for stills and NPC normals | small-medium | -30-50% on the biggest files, also repo/zip size | no |

Steps 1-5 are enough to get far below 5.5 GB/month for guest traffic and are mostly one-liners; steps 8-11 deliver the target architecture.

### 7.8 Decisions needed from you

| ID | Question | Why it matters / recommendation |
|---|---|---|
| D1 | Which store content is "final" and goes into the first freeze (all, or only content used by `src/maps`)? Pickups too? | recommend all, plus add pickups |
| D2 | May the public Pages build (guests) become **bundled-only**, with live overrides only for signed-in editors (and an opt-in switch for others)? | biggest single saving; testers without an account would not see colleagues' unreleased content |
| D3 | Add a new table `void_asset_index` (SQL on the production project) and a one-time backfill that **writes** to Supabase? | needed for atomic conflicts, tombstones, cheap startup; alternative is a static `index.json` object in Storage (simpler, but not atomic and re-downloaded per visit) |
| D4 | Do you accept committing binary assets in git (repo growth), or prefer a separate release asset zip (e.g. GitHub Releases/Actions artifact) pulled in the Pages build? | LFS conflicts with the Pages workflow; Releases/Artifacts do not |
| D5 | Delete semantics: tombstone hides everywhere (even in the release after the next freeze); can a tombstone be undone by anyone? Who may delete (any editor)? | recommend: any editor, soft delete, undo by new row, bundled deletion removed at next freeze |
| D6 | Conflict rule for non-texture assets (props/doors/NPCs/etc.): reject stale base like maps and textures, or last-writer-wins? | recommend reject + "save as copy" like maps |
| D7 | Should the shipped game keep the in-game editor (Tab)? Release platform(s) (itch/Steam/Electron/zip+local server)? | decides whether the editor, AI-depth wasm and `__voidcrew/*` endpoints are stripped and what "packaged" means |
| D8 | Real size/count of the shared store (see Section 9: Storage report) and acceptable per-visit budget | decides how aggressive steps 4/7 must be |
| D9 | Drop anonymous list/select on the bucket and on `void_maps` once guests are bundled-only? | closes scraping; recommended after step 2 |
| D10 | For modified bundled assets, is tuning/size data saved into the repo (dev server) or the override row? | avoids losing data at freeze (6.6 #5) |

## 8. Notes on correctness of the current model worth fixing independently

- `setSharedTextures` re-adds deleted textures from the localStorage cache until the network answers (`sharedTextures.ts:100-107`).
- `readLatest` tries older revisions if the newest meta is missing: a half-published newest folder falls back to the previous one, good, but a texture whose all revs fail is silently dropped.
- `listSharedObjects` sorts by name ascending (lexicographic: `r10` before `r2`), pages of 100; correct only because the code re-sorts numerically after fetching all pages; with many old revisions per uuid the listing grows. Revisions never get cleaned.
- Same data is listed repeatedly: `loadSharedTextures` is called by autoShared, App.tsx effects, AssetManager open, SharedEditor open/save, publish, delete.

## 9. How to verify the egress source in the Supabase dashboard

Code cannot prove which of the above dominates. Check, in this order (menu names as of the current dashboard; they move occasionally):

1. **Organization -> Usage** (billing/usage page for the org). Look at *Egress* and *Cached Egress* separately, per project and per day for the last 30 days: Is the warning about "Cached Egress" or "Egress" (uncached)? Cached egress = CDN hits on public storage objects (our texture/NPC/still downloads); uncached = API (PostgREST, Storage list POSTs, Auth). Find the days with spikes and compare with deploys/test sessions. If there are spikes on days when only guests could have loaded, guests are confirmed as the source.
2. **Project -> Reports -> Storage / API** (or Observability): requests per path/status and "Egress" or bytes by path if offered. Compare request counts: `object/list`, `object/public/...meta.json`, `object/public/...diffuse.png|normal.png`, `rest/v1/void_map_heads`.
3. **Logs -> Edge/API gateway logs and Storage logs** (Logs Explorer). Useful fields: `request.path`, `request.method`, `response.status_code`, `response.headers.cf_cache_status` (HIT/MISS/REVALIDATED/EXPIRED), `response.headers.content_length`, `request.headers.user_agent`, `request.headers.cf_connecting_ip`/country, `request.headers.referer`/`origin` (is it your Pages origin or something else?). Aggregate bytes by path prefix and by referer (SQL in Logs Explorer, e.g. `group by` on `request.path` with `sum(content_length)`; check the table names the explorer offers, they differ by plan).
   - Look for the **same path with different `?v=` query strings** (confirms the busting problem) and for repeated GETs of the same object from the same IP within a minute (browser cache not used).
   - Look at `cache-control` on a public object response (also in browser devtools Network -> Response headers for one `diffuse.png`): `max-age=3600`, `no-cache`, or none, and whether `etag`/`304` appear on reloads. This decides how much steps 4/5 (immutable headers) are worth.
   - Check hit ratio (`cf_cache_status`): many `MISS` for new `?v=` URLs shows the CDN key includes the query string.
4. **Storage -> bucket `void-textures`**: object count and total size, largest files (sort by size) to replace the estimates in Section 2 (size of NPC normals/stills; number of rN folders per uuid = how much garbage accumulates).
5. **Distribution check**: percentage of traffic from your own origin (`referer` = the Pages site) versus other referers/IPs (scrapers, previews, link unfurlers) and from the editors' own IPs. Also whether one IP/country dominates.
6. After the quick wins (steps 1-5) look again at the daily cached egress for a week; the new baseline should be close to zero for guest-only days.

## 10. Files referenced

`C:\dev\js\voidcrew\src\editor\sharedAuth.ts`, `sharedTextures.ts`, `sharedImages.ts`, `sharedDefinitions.ts`, `sharedProps.ts`, `sharedDoorTypes.ts`, `sharedActors.ts`, `sharedCommon.ts`, `sharedMapHeads.ts`, `sharedMaps.ts`, `sharedCache.ts`, `autoShared.ts`, `autoSharedPrefs.ts`, `SharedEditor.tsx`, `AssetManager.tsx`, `AssetTree.tsx`, `textureLibrary.ts`, `idb.ts`, `bundledDefinitions.ts`; `src\game\sharedBuiltins.ts/.json`, `sharedContent.ts`; `src\render\sharedImages.ts`, `aiDepthWorker.ts`; `src\components\GameViewport.tsx`, `LoadingImagePreloader.tsx`; `src\App.tsx`; `C:\dev\js\voidcrew\scripts\pull-shared.ts`, `pack-world.ts`; `C:\dev\js\voidcrew\supabase\*.sql`, `README.md`; `C:\dev\js\voidcrew\.github\workflows\deploy.yml`; `C:\dev\js\voidcrew\packaging\*`; `C:\dev\js\voidcrew\index.html`, `vite.config.ts`.


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

