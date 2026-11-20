# Lossless WebP colour maps for NPC sprite sheets

Branch `feature/lossless-webp-npc` (handover item C).

## What was done
- `src/editor/losslessImage.ts`: `encodeSmallestLossless(image: ImageData | Blob)` encodes PNG and lossless WebP (`canvas.toBlob("image/webp", 1)`; only used if the returned blob type is `image/webp`), decodes both and keeps the WebP only if it is smaller AND `sameVisiblePixels` (equal alpha everywhere, equal RGB where alpha > 0). A Blob input (an existing PNG or WebP) is used as a candidate as it is, so re-publishing an unchanged revision does not re-encode it. Test: `npx tsx src/editor/losslessImage.test.ts`.
- Publish (`publishActor` in `sharedActors.ts`): the colour-key/alpha cut-out is applied first, then the encode; the 8 MB limit applies to the stored file. Uploads `diffuse.webp` or `diffuse.png` (+ `normal.png` as before).
- If the upload of the WebP fails with HTTP 400/415/422 (bucket does not allow `image/webp`) the sheet is published as PNG and the notice says: "WebP is not allowed by the store yet: published as PNG. Run supabase/shared-webp-mime.sql." (en + hu, key `assetManager.npcSheet.webpRefused`). Nothing is left half-uploaded because the diffuse is the first file and meta.json goes last.
- `supabase/shared-webp-mime.sql` (idempotent) + section in `supabase/README.md`. The user must run it.

## Metadata field
NPC `meta.json` -> `definition.diffuseFile`: `"diffuse.png"` or `"diffuse.webp"`. Missing = `diffuse.png`, so every old revision stays readable (loader, guest view/anon reads, editing a revision all go through `diffuseFileOf(definition)`). Invalid values make the definition unreadable (like other invalid fields).

## Release packaging
`scripts/pull-shared.ts` does not pull NPC actors at all today (only textures, portraits, decals, maps), so there was nothing to change; runtime loading uses the named file from `sheetFiles`. When actor pulling is added it must download `definition.diffuseFile` (default `diffuse.png`); the game's `actorSheetFiles` already accepts an arbitrary URL, so WebP does not need converting. Local built-in sheets under `public/actors/` remain PNG.

## Not verified
Nothing was run in a browser (as instructed): WebP encoder availability, bucket rejection status code (400/415/422 assumed), and real size savings are untested. `npx tsc --noEmit`, `npm run build` and the pure test pass.

## How to test
1. Run `supabase/shared-webp-mime.sql` in the Supabase SQL editor.
2. Publish an NPC sheet: in storage `void-textures/<world>/actor/<uuid>/r<n>/` there is `diffuse.webp` (if smaller) or `diffuse.png`, `normal.png`, `meta.json` with `definition.diffuseFile`.
3. Reload the editor: the NPC shows. Open as guest (signed out): the NPC shows. Revise and re-publish: new revision, unchanged sheet keeps its format.
4. Before running the SQL: publishing should succeed as PNG with the yellow notice.
5. An old revision (no `diffuseFile`) still loads.