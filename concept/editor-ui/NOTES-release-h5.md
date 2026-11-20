# Release packaging H5 notes (branch feature/release-content)

## Audit: what a release needs vs what `pull:shared` did

| Kind | Before H5 | Now |
|---|---|---|
| Textures (`<world>/<uuid>/r<rev>`) | pulled | pulled (unchanged); prop/door textures are ordinary textures, so covered |
| Map heads/bodies | pulled | pulled (unchanged) |
| Portraits, decals (png) | pulled to `public/shared-images` | pulled (unchanged). An NPC's `portrait` id is `<world>_portrait_<uuid>`, the same id the pull writes, so it resolves |
| Dialogue libraries | only hand-made `src/dialogues/*.twee`; no store, no publish | **new**: editor Publish, store layout `common/dialogue/<id>/r<rev>/meta.json`, pulled to `src/dialogues/<id>.twee` (picked up by the existing glob) and loaded live by guests |
| Shops | only hand-made `src/shops/*.json` | **new**: store layout `common/shop/<id>/r<rev>/meta.json`, pulled to `src/shops/<id>.json`, loaded live by guests, `publishShop()` exists (no UI: H4b) |
| NPC definitions + sheets | GAP: only loaded live from the store (guest read), not bundled | **new**: definition into `sharedBuiltins.json` (`definitions.actor`), colour map (`diffuse.png` or `diffuse.webp` per `definition.diffuseFile`) and `normal.png` into `public/shared-actors/<id>/`; registered at startup by `installBundledActors` (base = `BASE_URL + shared-actors/<id>/`); a newer store revision still replaces it |
| Props | GAP: live only | **new**: definition in `definitions.prop`; registered at startup; store merges over it |
| Door types | GAP: live only | **new**: definition in `definitions.door`; same |
| Pickups | not a shared kind: built-in only (code) | nothing to pull |

## What changed
- `src/game/sharedContent.ts` (pure, tested): common-folder paths, revision listing, `readCommonDefinition` (dialogue/shop meta validation), `actorFiles`, `bundledActorFolder`, `definitionIdOk`.
- `src/editor/sharedCommon.ts`: `loadSharedDialogues`, `loadSharedShops` (added to `autoShared`), `publishDialogue`, `publishShop`. Append-only, meta.json only, so **no SQL and no bucket change** (the bucket already allows `application/json`; the insert/select policies and guest list policy cover any path). The twee text lives inside the json (limit 512 KiB).
- Catalog layers: dialogues = bundled < shared < local drafts (`setSharedDialogues`); shops = bundled < shared (`setSharedShops`, `subscribeShops`); a shared shop makes its id known to the dialogue `@shop` check.
- Dialogues panel: **Publish** button next to Delete (needs sign-in; the local draft stays and keeps winning on that computer). i18n en+hu `dialogue.publish*`.
- `scripts/pull-shared.ts`: `pullCommon` (dialogue, shop), `pullDefinitions` (prop, door, actor per world). Keeps existing files and warns (like the other kinds), except that a dialogue/shop file this script wrote earlier is updated when a newer revision exists (tracked in `sharedBuiltins.json` `dialogues`/`shops`). Actor files are checked with sharp (format and size match the definition). Warns when a bundled prop/door uses a shared texture that is not bundled.
- `sharedProps`/`sharedDoorTypes`/`sharedActors`: `installBundled*`, called once from `main.tsx` via `src/editor/bundledDefinitions.ts`; the live loaders merge the store over the bundled ones.
- Test: `npx tsx src/game/sharedContent.test.ts`.

## Manual steps for you
1. No SQL to run for H5. (For NPC webp sheets the earlier `supabase/shared-webp-mime.sql` must already have been run, otherwise those NPCs were published as png.) Guest read needs `shared-public-read.sql` as before.
2. Publish the libraries you want in the release: Assets > Dialogues > select > Publish (signed in).
3. Release: `npm run pull:shared` (network, publishable key from env), review the diff (`src/dialogues`, `src/shops`, `public/shared-actors`, `src/game/sharedBuiltins.json`), then `npm run build`.
4. `void-fantasy.twee` and the two bundled shops are hand-made and kept: publishing a library with the id `void-fantasy` will only warn "Kept existing". Delete the file first if the store version should win.

## Not verified
- Nothing ran against Supabase or in a browser. `tsc`, `npm run build` and all `src/game/*.test.ts` pass. The pull script type-checks but was not executed (it needs the network).
- Startup install order: `installBundledDefinitions()` runs after `App`/map modules are evaluated; props/actors are only looked up later, like the existing live loads.

## Open questions / gaps
- Shop editing/publishing UI is still H4b; only `publishShop()` and the load/pull exist.
- Dialogues and shops are world-independent (`common/`); two worlds cannot have different libraries with one id.
- Existing bundled entries are never refreshed for textures/images/props/doors/actors (same policy as before): delete the catalog entry and files to re-pull. Dialogues/shops written by the script do refresh.
- A bundled NPC and the live store both exist at runtime: a store revision with a different base replaces the bundled one (flagged as revised, one rebuild).
- Actor definition is stored in the catalog as published (validated again at install); removing an NPC from the store does not remove it from a release.
