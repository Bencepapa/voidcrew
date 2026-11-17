# Notes: + New texture in the Assets window (branch feature/assets-new-texture)

Steps 4-6 of `asset-manager-textures-plan.md`, textures only. The user's bug: normal/depth maps of a new shared texture were only a
localStorage preview (base64), Supabase only got the diffuse, the game saw flat maps, "Browser storage is full", no ceilings.

## What is done

- **A. `+ New texture`** (library header; en "New texture", hu "Új textúra"): an empty local draft, selected, editable name. The
  Properties panel has a *Texture* section: name, Wall / Floor / Ceiling (at least one, all three by default), Pixel art, world
  (new drafts only), *Transparency from* (Alpha channel / Colour key with colour picker, hex field, Magenta and White buttons / None),
  and a row per channel (Diffuse*, Normal, Depth, Roughness/gloss, Metalness, Emissive) with thumbnail, choose-file or drag and drop,
  Remove and a mode: Uploaded / Auto / None. Auto exists for normal and depth only (those are what the generator makes); the other
  channels are Uploaded / None. `AUTO` badge on the row title, the thumbnail (dashed border), the library row, the maps list and the
  status line. Alpha is detected when a diffuse is chosen (alpha found: the Alpha channel source is selected; none found: None). The
  colour key (default `#ff00ff`) turns key pixels into holes, None flattens the alpha. Every change shows in the test-room preview
  at once (the draft is laid over `TEXTURE_SETS`, so the palettes and the map editor can paint with it too).
- `src/editor/autoMaps.ts`: the adapter, `generateAutoMaps(image)` returns flat maps (normal 128,128,255; depth 128 grey; alpha
  copied) with a marked `TODO(depthNormal)` line to switch to `generateMapsAsync` from `src/render/depthNormalAsync.ts` once it lands
  (then bump `autoRecipe`, the recipe written into meta.json `gen`). I did not touch `src/render/depthNormal*.ts`.
- **B. IndexedDB** (`idb.ts`): drafts are stored as Blobs (`textureDrafts.ts`). The old `asset-preview:<id>` localStorage keys are read
  once into an IndexedDB `previews` store and removed (`previewStore.ts`; unparseable ones are dropped). That store keeps the old
  feature for textures that can't be edited (built-in, old flat shared): a map imported there is a local preview only, not a draft.
  The "Browser storage is full" message now appears only for a real IndexedDB `QuotaExceededError`; other errors show their own text.
  A draft that can't be saved is rolled back in memory.
- **C. Shared storage**, append-only: `void-textures/<world>/<uuid>/r<rev>/` with `diffuse.png normal.png depth.png surface.png
  emissive.png` (uploaded maps only; gloss + metal are composed into `surface.png`, roughness in green, metal in blue, as the game
  reads it) and `meta.json` uploaded last. `sharedTextures.ts`: the loader lists `<world>/`, reads old flat files exactly as before,
  and for folders takes the highest `r<n>` that has a `meta.json`; builds `TEXTURE_SETS` entries with the real kind array, normal / depth /
  surface / emissive, pixelArt. Auto channels and colour-key / "none" transparency are made client-side from the diffuse (flat URLs first,
  then replaced when ready; Auto results cached in IndexedDB per rev and recipe). Publishing validates (PNG signature, decodable,
  <= 8 MB per file, a diffuse exists), picks the next folder number (an interrupted publish leaves an unlisted folder that is skipped,
  never reused), and re-reads the store afterwards. Built-in textures show a lock marker, no draft, no Publish. Old flat shared
  textures are read-only too (the panel says so); making them editable (convert to a folder texture) is not built.
- **D. Yellow bar** in the Assets window: "Unsaved changes to the shared library: N new, M changed" + Publish + Discard, a yellow dot
  and border on affected library rows. Publish without a login opens a sign-in popover (`SharedLoginForm` from `sharedAuth.ts`) and
  continues after success. Drafts are edited offline. Before publishing, the latest published rev is compared with the rev the draft
  started from; on a mismatch a confirm asks ("publish on top, replacing theirs?"), No skips that texture. Closing the Assets window
  (x or Escape) with drafts asks first, with the same N / M wording (the drafts stay on this computer either way). A refresh button
  next to `+ New texture` loads the shared library (asks to sign in first; it also loads on open when already signed in). Editing a
  published texture creates a draft of it (its uploaded maps are fetched into Blobs) which publishes as the next rev.
- **E.** The Shared levels dialog: the "Shared texture (PNG)" block is replaced by a link, "Upload textures in the Assets window", which
  closes the dialog and opens the Assets window. The refresh button stays. The old upload strings were removed from the i18n files.
- Small fixes on the way: AssetTree falls back to the texture's own name when it has no translated name, and re-renders when the
  texture table changes; `sharedAuth.ts` got `sharedUpload` (a storage POST that never overwrites).
- i18n en + hu for every new string (`assetManager.*`, `editorShell.shared.texturesInAssets`).

## SQL to run (Supabase SQL editor, once, harmless to repeat)

`supabase/shared-texture-folders.sql`:

```sql
update storage.buckets
set allowed_mime_types = array['image/png', 'application/json']
where id = 'void-textures';
```

That is the only change. The existing `upload_texture` (insert) and `list_textures` (select) policies already cover the new paths, and
nothing updates or deletes. Without it, publishing uploads the PNGs and then fails on `meta.json` with a message that points to this file
(the half-published folder is invisible and the next attempt uses the next rev number).

## Verified in the browser (no real Supabase)

A temporary Vite config (port 4300, own cache dir, base /voidcrew/; deleted) served an in-memory mock of the Supabase endpoints the
code uses (sign-in, `void_editors`, storage list / upload / public GET, 409 on an existing object, a switchable 415 for JSON).
Checked: `+ New texture`, a diffuse with alpha (detected, hole shown in the preview), the colour key (magenta became a hole), AUTO
badges, the maps uploaded as Blobs, a non-PNG rejected with a clear message, drafts surviving a reload (IndexedDB), the old
`asset-preview:*` keys migrated and removed, the yellow bar and dot, the sign-in popover then publish, the folder layout and that
`meta.json` goes last, the loader reading it back (kinds, name, colour key applied, auto list), an old flat file listed as read-only,
editing a published texture into a "changed" draft, the conflict question (No skips, Yes publishes the next number), the 415 path
(clear message, then a retry as the next rev), the closing warning, the Shared levels link.

## Not verified

- **The real Supabase publish**: real auth, real policies, the real mime-type check, the real list endpoint (folders come back with
  `id: null`; the loader relies only on the folder name pattern), CDN caching of public URLs. Everything above ran against my mock.
- A real IndexedDB quota failure (the error mapping is in place, not triggered).
- The real generator: Auto maps are flat until `depthNormalAsync` lands.
- Not tried: the English UI, a phone-sized screen, a texture over 8 MB, the Windows file-drop from outside the browser (the drop uses
  the same handler as the file picker, which was tested).

## Known limits / follow-ups

- Listing the store needs a signed-in editor (the existing `list_textures` policy), so only a signed-in editor session loads the shared
  textures (as before). Players without an account would need an anon select policy on the bucket, or a manifest.
- Archiving / deleting a shared texture and converting an old flat texture to a folder one are not built (append-only store).
- Roughness / metal / emissive have no Auto (no generator for them).
- The game viewport itself is not live-updated while you edit; the Assets preview room is. After a publish the registry is updated, and
  the game picks the new files up the next time it builds a wall kit.
