# One texture-channel UI for every Asset Manager category (branch feature/texture-unify)

Why: the Props editor had no way to upload a depth map or to run the AI depth on a published prop, while the Textures
category had both. The user wants the same options (own depth / normal, generate from the diffuse, AI depth) in every
category that has a texture, with ONE shared UI instead of per-category texture settings.

## Stage 1: survey

`Sample` (AssetManager.tsx) = material | actor | prop | item | still | door | dialogue | shop. Dialogues and shops are
text panels (no texture). The others, and the sub-kinds hidden inside them:

| Category (sub kind) | Where its channels are edited today | Channels stored | Draft store | Published as |
|---|---|---|---|---|
| Textures (material) | `TexturePanel.tsx`: `useTextureEditor` + `TextureFields` (settings) + `ChannelControls` (per card), cards drawn inline in `AssetManager.tsx` | diffuse, normal, depth, gloss, metal (packed `surface.png`), emissive; each `uploaded / auto / none`; `aiDepth` flag; pixelArt, smooth, transparency, tuning | IndexedDB `drafts` (`textureDrafts.ts`, `TextureDraft`) | `void-textures/<world>/<uuid>/r<N>/` `diffuse.png`, `normal.png`, `depth.png`, `surface.png`, `emissive.png`, `meta.json` (`sharedTextures.ts`); pulled into `public/textures/<id>/` by `scripts/pull-shared.ts` `pullTexture` |
| Props, 3D panel / billboard / cross, shared (draft or published) | `PropAssetFields.tsx` (shape, size, texture choice) + the **same** `useTextureEditor` / `TextureFields` / `ChannelControls` for the prop's OWN texture (`propTextureId(id)` = `<world>_shared_<uuid>`, kinds `["propFace"]`), cards drawn inline in `AssetManager.tsx` | the own texture is an ordinary shared texture, so: the same set as Textures | prop definition in localStorage (`sharedProps.ts`, `PropDraft`), the texture draft in IndexedDB `drafts` | definition: `<world>/prop/<uuid>/r<N>/meta.json` (`sharedDefinitions.ts`); the texture goes out with it through `publishTextureRevision` |
| Props, built-in (PROP_TYPES in code: views / box / cabin / panel...) | read-only maps cards + local preview import | whatever its texture folder has | none | public files |
| Decals, built-in | read-only maps cards | `public/decals/<name>/diffuse.png`, optional `normal.png` (index.json `normal`) | none | release files |
| Decals, shared | `ImageAssetsPanel.tsx` `ImageAssetInspector` (file, name, surface, transparency) | diffuse only | IndexedDB `imageDrafts` (`sharedImages.ts`, `ImageDraft`) | `<world>/decal/<uuid>/r<N>/diffuse.png` + `meta.json`; `pullImages` copies `public/shared-images/<id>.png` |
| Pickups (item), shared | `ImageAssetInspector`, own hand-made "Texture and maps" block (upload normal/depth, "Auto" = delete the override) + `AiDepthControls` with its own adapter | diffuse, normal, depth (auto when not uploaded, `resolvePickupMaps`), `pickupMaps.aiDepth` | `imageDrafts` | `<world>/item/<uuid>/r<N>/` `diffuse.png`, `normal.png`, `depth.png`, `meta.json` (always all three) |
| Pickups, built-in | read-only maps | `public/textures/item_<id>/` | none | release files |
| Stills (portrait / loading / room) | `ImageAssetInspector` | diffuse only (a flat picture) | `imageDrafts` | `<world>/portrait/<uuid>/r<N>/diffuse.png` |
| Door types | `DoorAssetFields.tsx`: name, leaf and frame are PICKED from the texture list, plus motion/hinge | none of its own: leaf and frame are ids of texture sets | localStorage `voidcrew:door-drafts` (`sharedDoorTypes.ts`) | definition only (`<world>/door/<uuid>/...`) |
| NPCs (actors), shared | `NpcAssetEditor.tsx` (a full-screen editor, plain file inputs) | sprite sheet diffuse (png/webp) + optional normal sheet | IndexedDB `actorDrafts` (`sharedActors.ts`) | `<world>/actor/<uuid>/r<N>/` `diffuse.png|webp`, `normal.png`, `meta.json` |
| NPCs, built-in | `ActorEditor.tsx` / read-only maps | `public/actors/<sheet>/` diffuse, normal, emissive | none | release files |

### What the channel operations are today (all in the Textures path)
- Upload (`chooseFile`, PNG only, drag and drop on the card), mode buttons Uploaded / Auto / None (`setMode`), Remove (`remove`).
- Auto = `autoMaps.ts` `generateAutoMaps` (depth + normal from the diffuse, brightness based), cached in IndexedDB; the registry (`textureLibrary.ts` `draftPaths`) shows it.
- AI depth = `AiDepthControls.tsx` (adapter type `AiDepthEditor`: `view`, `busy`, `diffuseBlob`, `applyAiMaps`, `onError`), "also make the normal map" uses `generateNormal` of `render/depthNormal.ts`.
- There is NO plain "make the normal map from my uploaded depth" button anywhere: `generateNormal` is only reachable through the AI run.

### What each renderer actually reads
- Props (panel/billboard/cross): `TEXTURE_SETS[texture]` (diffuse, normal, depth for the relief grid). The prop's own texture IS a shared texture, so depth/normal reach the game through the existing texture path and `sharedTexturesChanged`. No format change is needed for props.
- Decals: projected onto the surface geometry (`render/decals.ts`): diffuse + normal only; with no normal it makes one from the picture's brightness at load time. A depth map would be meaningless for a projected decal. A shared decal's normal is hard-wired off (`Promise.resolve({ normal: false })`).
- Pickups: `pickupTexture(id)` = diffuse + normal + depth (relief card in `GameViewport`).
- NPC sprites: sheet diffuse + normal (billboard shading); no relief, so no depth.
- Stills: shown flat in dialogues / loading screens.

### Findings (why the user saw no depth upload in Props)
The prop's own texture is fully editable (`TextureFields` + `ChannelControls` incl. AI depth) but only while a PROP DRAFT exists
(`ownedTexture` in AssetManager is derived from `propDraft`). A PUBLISHED prop shows the read-only maps panel (cards with eye
toggles, "Look" sliders, room lights) with no controls; the only way in is the "Prop editor" button, which silently creates a
draft (`reviseSharedProp`). So the user never saw the controls for the published prop "tree oak fall 01".
A prop that uses somebody else's texture (picked from the list) has no channel editor either, by design: the texture lives
in the Textures category.

## Design chosen
One component set, adapter based, the Textures path being the reference implementation:

- `src/editor/channelEditor.ts` (pure, no browser/React imports, tested): the adapter interface `ChannelEditor`
  { `view` (pixelArt, transparency, `slot(key) -> { mode, has }`), `busy`, `aiDepth`, `channels`, `modes(key)`,
  `chooseFile`, `setMode`, `remove`, `diffuseBlob`, `applyAiMaps`, `deriveNormal`, `onError` } and the small pure helpers
  (which modes a channel offers, which channels have an AI section, the prop-texture ownership rule).
- `src/editor/ChannelControls.tsx`: `ChannelControls` (moved out of `TexturePanel.tsx`, now taking a `ChannelEditor`)
  and `ChannelCards` (a card per channel: title, thumbnail, controls, the AI section under the depth card, or under the
  normal card when the category has no depth). `TexturePanel.tsx` keeps re-exporting `ChannelControls`.
- `useTextureEditor` returns a `ChannelEditor` (it already was one in everything but the name). Other categories write a
  thin adapter (a hook returning a `ChannelEditor`) over their own draft store.
- `AiDepthControls` stays as it is (one optional prop `normalOnly` is added when a category stores no depth).
- Settings that differ by nature (pixelArt/smooth/tuning of the textures, the transparency choice of the images, grid
  of an NPC sheet) are NOT merged: they are not channels.

(The stage-by-stage log and the hand-test list are appended below as the work proceeds.)
