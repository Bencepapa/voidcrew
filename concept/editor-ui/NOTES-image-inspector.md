# Image data + inspector (unified Asset Manager)

The first pass's separate Images screen is being folded into the Asset Manager.
This half covers the data model and the properties-panel inspector; the layout
(`AssetManager.tsx`, `AssetTree.tsx`, `App.tsx`) is left to the next agent.

## What is done

- **Purposes.** `src/render/sharedImages.ts` adds `ImagePurpose` (`loading` /
  `portrait` / `room`) and optional `SharedImage.purpose`. The stored `type`
  is still `portrait | decal`; `portrait` is still every still image, so IDs
  and storage paths do not change. A missing purpose means `portrait`.
  Published `meta.json` now carries `purpose` for stills, and
  `scripts/pull-shared.ts` imports only valid purposes into
  `sharedBuiltins.json`, preserving existing bundles and IDs.
- **Draft store.** `src/editor/sharedImages.ts` now keeps the drafts in memory
  behind `useSyncExternalStore` and routes `saveImageDraft` /
  `discardImageDraft` through it. Writes are serialized, the in-memory state
  is updated before the IndexedDB write (so fast typing cannot drop an edit),
  and a failed write only rolls back if that value is still the current one.
  Old records are normalized (missing `purpose`, `png`, fields). Blank drafts
  are persisted immediately by `createImageDraft`. Publishing a draft with no
  PNG (or no name) throws a clear i18n error.
- **Inspector.** `ImageAssetsPanel.tsx` exports `ImageAssetInspector` and
  `useImageDraftPreview`. The inspector reads the stored draft every render
  (no stale prop), shows PNG upload first, then name, still purpose or decal
  surface, transparency (alpha / colour key / opaque), and Save draft /
  Publish / Discard with the existing sign-in popover and status line. A
  published image passed through `image` renders read-only details. The old
  `ImageAssetsPanel` export remains as a thin draft list + inspector wrapper.
  The preview keeps the cutout/colour-key processing and revokes object URLs.
- **i18n.** New `src/i18n/en/imageAssets.ts` and `hu/imageAssets.ts` hold all
  24 existing `assetManager.image.*` keys plus the new inspector strings, with
  the same key names, registered in `src/i18n/index.ts`.
  `src/i18n/*/assetManager.ts` was deliberately **not** edited: duplicate keys
  across the two objects are not a TypeScript error, and the area files win.
  The other agent may remove the image keys from `assetManager.ts` when they
  own it.

## Final exported API

`src/render/sharedImages.ts`
- `type ImagePurpose = "loading" | "portrait" | "room"`
- `const IMAGE_PURPOSES`, `isImagePurpose(value)`
- `SharedImage.purpose?: ImagePurpose`

`src/editor/sharedImages.ts`
- `interface ImageDraft { id, uuid, world, type, name, png: Blob | null, surface, transparency, purpose? }`
- `useImageDrafts()`, `getImageDrafts()`, `subscribeImageDrafts()`
- `createImageDraft(world, type, purpose?)`
- `saveImageDraft`, `discardImageDraft`, `imageDrafts`, `imageAssetId`
- `checkImagePng`, `publishImage`, `loadSharedImages` (still exported)

`src/editor/ImageAssetsPanel.tsx`
- `ImageAssetInspector({ draft?, image?, onError })`
- `useImageDraftPreview(draft)`
- `ImageAssetsPanel({ onBack })` (old export kept for the current layout)

## Verification / not verified

- `npx tsc --noEmit` is clean, and a targeted `tsc` check of
  `scripts/pull-shared.ts` is clean.
- No browser run: the inspector is not mounted until the layout agent's
  change, so its placement inside the right-hand panel is unverified.
- Real Supabase publishing / the real IndexedDB quota path were not exercised
  in this half (the existing publish code path is kept).
