# Texture compression / WebP plan (decide BEFORE `npm run pull:shared`)

Date: 2026-11-24. Read-only analysis of `main`; no source file touched, no network or Supabase call made. All measurements are on LOCAL files with the repo's own `sharp` 0.35.4 (libwebp 1.6.0, libpng 1.6.58); the scratch files were deleted afterwards.

## 0. Summary

1. **Lossless WebP is not the big win here.** Against the original PNGs it saves about 1/3 (diffuse -27%, normal -44%, depth -33%), but a plain *lossless PNG re-encode* (zlib 9 + adaptive filtering) saves about 1/2 (diffuse -48%, normal -65%, depth -33%) and WebP-lossless is smaller than the optimised PNG in only 9 of 29 files. The source PNGs are badly compressed (sharp default, canvas, AI-tool exports).
2. **Lossy WebP q90 is the real lever for diffuse**: -86% (2.4 MB -> ~0.3 MB), PSNR 36-45 dB, alpha channel kept exactly in every sample. For normal/depth lossy is technically 90% smaller but has outliers (normal angle error up to 22-92 degrees at isolated texels, depth gradient error up to 45 levels): keep those two lossless.
3. **Found while measuring, independent of format:** `scripts/pull-shared.ts` writes the *generated Auto normal/depth maps* with `sharp(...).png()` at default settings. For a 1254 px texture that is a **3.7-4.3 MB normal.png and ~1.0 MB depth.png per Auto texture** (measured), where the same pixels are **0.98-1.1 MB and 0.70-0.78 MB** as optimised PNG (-3.8x on normals). The bundle can therefore end up *bigger* than the 67 MB store. One-line fix, do it first.
4. **Recommended path:** (a) a bundle-time converter inside `pull-shared.ts` (no Supabase change, no editor change, no new meta format), lossy WebP q90 for photographic diffuse, optimised PNG (or lossless WebP where smaller) for everything else, plus a ~20-line change so the bundled loaders honour the real file name. Publishing WebP from the editor (b) can wait; re-encoding the store in place (c) is not worth doing. Projected bundle of the current store: about **18 MB instead of 67 MB (-73%)** with lossless normal/depth, or about **13 MB (-81%)** if lossy depth is also accepted.
5. The decision has to precede bundling because git history keeps every committed binary: committing 67 MB of PNG and converting later adds a second copy and can never be shrunk without a history rewrite.

## 1. Measurements

### 1.1 Method and honesty about the sample

- 31 local files, 16 of them 1024-1792 px (the size class of the store), across diffuse (opaque painterly, RGBA cut-outs, decals, NPC sheet, pixel-art sheets), normal, depth, emissive, glow, surface, sky, still.
- The shared store itself was **not** measured (no network). Proxies: `concept/gen/relief/*`, `concept/gen/bridge/*`, `concept/gen/medical/*` (1254x1254 AI albedos/depths, 1.0-2.5 MB: same class as "diffuse 1-2 MB, depth 0.4-1 MB"), `concept/gen/wall_Normal.png` / `wall2_Normal.png` (the 0.65-0.9 MB normals), NPC sheets in `public/actors`. Three genuine ChatGPT PNG exports (`concept/gen/New/...`, 1254x1254, 2.7 MB) were checked separately: PNG-opt 1.35-1.44 MB, lossless WebP 1.83 MB, lossy q90 0.35-0.36 MB, i.e. the same picture as the table. No ICC/EXIF/XMP chunks in any sample (verified).
- Encoders: PNG-opt = `sharp.png({compressionLevel:9, effort:10, adaptiveFiltering:true})` (lossless). Lossless WebP = `webp({lossless:true, effort:6})` (also `exact:true`: identical sizes, no hidden RGB under alpha 0 in the samples). Near-lossless 60 = `webp({lossless:true, nearLossless:true, quality:60})`. Lossy = `webp({quality:Q, alphaQuality:100, effort:6, smartSubsample:true})`. "PNG-8" = 256-colour palette PNG, which is **lossy** for images with more than 256 colours (shown only as a reference).
- Errors are per channel, on the decoded RGBA, over pixels with alpha > 0; normals also as the angle between decoded vectors; depths also as the error of the horizontal/vertical finite difference (what relief and normal-from-depth consume).
- **Not measurable here:** Chrome's `canvas.toBlob("image/webp", q)` encoder (a different libwebp configuration, probably a bit larger than `effort:6`), Firefox/Safari encoders, and the browser's PNG encoder (canvas) for publish-time optimisation. The in-browser numbers will be somewhat worse than the sharp numbers below.

### 1.2 Per-file table (sizes in KB; `orig` = file as found)

| kind | file | WxH | colours | orig | PNG-opt | PNG-8 (lossy) | WebP lossless | WebP near-LL 60 | WebP q95 | WebP q90 | WebP q80 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| diffuse | relief/wall4_diffuse | 1254x1254 | >70k | 2383 | 1124 | 1020 | 1842 | 1094 | 513 | 331 | 177 |
| diffuse | relief/floor2_diffuse | 1254x1254 | 62k | 2380 | 1296 | 1307 | 1821 | 1224 | 461 | 265 | 131 |
| diffuse | relief/door1_diffuse | 1254x1254 | >70k | 2288 | 1320 | 1208 | 1859 | 1249 | 428 | 250 | 117 |
| diffuse | bridge/bridge_wall4_albedo | 1254x1254 | >70k | 2442 | 978 | 940 | 2002 | 1282 | 565 | 422 | 273 |
| diffuse | medical/med_wall_1_albedo | 1254x1254 | 37k | 1169 | 1025 | 779 | 897 | 808 | 89 | 51 | 29 |
| diffuse | gen/wall_diffuse | 1024x1024 | 6.9k | 1098 | 684 | 585 | 418 | 402 | 145 | 102 | 55 |
| diffuse+alpha | relief/doorframe1_diffuse | 1254x1254 | >70k | 987 | 366 | 360 | 709 | 419 | 217 | 155 | 106 |
| diffuse+alpha | actors/ogre1/diffuse (NPC sheet) | 1280x1792 | 49 | 562 | 477 | 421 | 387 | 387 | 489 | 340 | 215 |
| decal | decals/bush_leafy_diffuse | 512x512 | >70k | 541 | 166 | 143 | 304 | 214 | 75 | 56 | 36 |
| decal | decals/puddle_large_diffuse | 724x724 | 39k | 633 | 256 | 228 | 316 | 266 | 60 | 40 | 25 |
| decal sheet | decals/vents_diffuse | 1254x1254 | >70k | 1538 | 818 | 752 | 1195 | 917 | 237 | 164 | 104 |
| diffuse (processed) | textures/fantasytree2/diffuse | 192x200 | 50 | 17 | 13 | 12 | 12 | 12 | 19 | 15 | 11 |
| pixel art sheet | fantasy/Pixel Ogre sprite sheet | 1060x1484 | >70k | 2285 | 991 | 955 | 1779 | 1294 | 474 | 361 | 243 |
| pixel art sheet | smoke/6x6 puffs sheet | 1536x1024 | 6k | 614 | 373 | 352 | 350 | 311 | 43 | 31 | 21 |
| normal | gen/wall_Normal | 1024x1024 | >70k | 899 | 513 | 284 | 538 | 451 | 140 | 88 | 47 |
| normal | gen/wall2_Normal | 1024x1024 | 40k | 639 | 332 | 203 | 453 | 314 | 104 | 72 | 42 |
| normal (RGBA) | textures/fantasytree2/normal | 1024x1024 | >70k | 1225 | 382 | 349 | 861 | 539 | 225 | 167 | 110 |
| normal | actors/ogre1/normal | 1280x1792 | >70k | 2742 | 778 | 690 | 1309 | 803 | 334 | 238 | 158 |
| normal | actors/goblin1/normal | 1280x1792 | >70k | 1636 | 470 | 414 | 819 | 498 | 213 | 159 | 105 |
| normal (small) | textures/wall4/normal | 256x256 | 17k | 73 | 24 | 21 | 41 | 25 | 14 | 11 | 8 |
| depth | relief/wall4_depth | 1254x1254 | 4.6k | 973 | 770 | 614 | 701 | 644 | 48 | 30 | 18 |
| depth | relief/floor2_depth | 1254x1254 | 4.2k | 1282 | 1039 | 896 | 948 | 786 | 81 | 52 | 31 |
| depth | gen/wall_Depth | 1024x1024 | 255 | 329 | 298 | 328 | 188 | 181 | 43 | 28 | 16 |
| depth | fantasy/Goblin depth | 1060x1484 | 13k | 1635 | 833 | 788 | 978 | 758 | 241 | 172 | 119 |
| depth | bridge/bridge_wall4_depth | 1254x1254 | 14k | 1664 | 1022 | 961 | 1126 | 827 | 217 | 154 | 102 |
| depth (small) | textures/fantasyearth1/depth | 256x256 | 228 | 72 | 57 | 53 | 42 | 31 | 26 | 21 | 14 |
| emissive | ceiling1/emissive | 256x256 | 2 | 1 | 0 | 0 | 0 | 0 | 1 | 1 | 1 |
| glow | bridgewall3/glow | 256x256 | 2.2k | 9 | 5 | 5 | 8 | 6 | 7 | 6 | 4 |
| surface | bridgewall3/surface | 256x256 | 10k | 81 | 36 | 35 | 54 | 36 | 28 | 22 | 16 |
| sky | skies/ejszaka | 1536x768 | >70k | 2114 | 777 | 682 | 1204 | 869 | 352 | 241 | 140 |
| still | concept/medical_concept | 1536x1024 | >70k | 2445 | 915 | 859 | 1866 | 1262 | 551 | 424 | 280 |

Only `ogre1/diffuse`, `fantasytree2/*` and `doorframe1_diffuse` use a real alpha channel (the decals in `concept/gen/decals` are RGB, magenta key); `wall_diffuse`, `wall_Normal`, `wall_Depth` have an unused opaque alpha channel.

### 1.3 Aggregates (size as % of the original, summed bytes per group)

| group (files) | PNG-opt | lossless WebP | best of the two, per file | WebP q95 | WebP q90 | WebP q80 |
|---|---|---|---|---|---|---|
| diffuse, painterly/pixel/decal, big (13, 18.9 MB) | 52% | 73% | 50% | 20% | **14%** | 8% |
| normal, >= 1024 px (5, 7.1 MB) | **35%** | 56% | 35% | 14% | 10% | 6.5% |
| depth, >= 1024 px (5, 5.9 MB) | 67% | 67% | 63% | 11% | 7% | 5% |
| sky + still (2) | 37% | 67% | | 20% | 15% | 9% |
| emissive / glow / surface (3, tiny) | 46% | 68% | | 39% | 32% | 23% |

Median per-file ratios give the same picture (diffuse PNG-opt 0.54 / lossless WebP 0.77 / q90 0.11; normal 0.32 / 0.60 / 0.11; depth 0.80 / 0.68 / 0.09).

Observations:
- Lossless WebP beats the original in 31/31 but beats an *optimised PNG* in 9/29 only; it wins on low-colour images (NPC sheet, smoke sheet, `wall_diffuse`, `wall_Depth`, small maps) and loses on photographic and smooth gradient images (normals, AI albedos). So "lossless WebP everywhere" is a mediocre choice; "best of PNG-opt and lossless WebP per file" is what `losslessImage.ts` already does for NPC sheets (its PNG candidate is the unoptimised canvas PNG, so it picks WebP more often than it would against PNG-opt).
- Lossy gains vanish on low-colour art: the 49-colour NPC sheet is 340 KB at q90 vs 387 KB lossless, and lossy mangles hard edges (max error 45 levels, PSNR 36). Pixel-art sheets with >70k colours (anti-aliased upscales) show max error ~103, mean 2.5.
- Near-lossless 60 (max error 2 levels, normal angle max 1.6-3 degrees) is about the size of PNG-opt on normals and only 10-25% smaller on depth: not worth its complexity. It also changed alpha by up to 2 on `doorframe1_diffuse`.

### 1.4 Error of the lossy variants (decoded vs original, visible pixels)

| kind | q95 mean / max / PSNR | q90 mean / max / PSNR | q80 mean / max / PSNR | alpha error |
|---|---|---|---|---|
| diffuse painterly | 0.7-2.3 / 9-89 / 37-47 dB | 0.9-2.6 / 14-89 / 36-45 dB | 1.3-3.4 / 25-78 / 34-42 dB | 0 |
| diffuse+alpha (doorframe, NPC) | 1.8-2.2 / 45-157 | 2.3-3.0 / 45-152 | 3.1-4.3 / 56-166 | 0 (alphaQuality 100) |
| normal (angle) | 0.8-2.0 deg mean, **22-93 deg max** | 1.0-2.2 deg mean, **21-92 deg max** | 1.1-2.6 deg mean, **26-83 deg max** | 0 |
| depth (grey level) | 0.5-1.0 mean, 6-11 max | 0.6-1.5 mean, 9-17 max | 0.9-2.7 mean, 14-32 max | 0 |
| depth finite-difference | 0.5-1.5 mean, 12-22 max | 0.5-2.2 mean, 17-45 max | 0.6-3.6 mean, 21-71 max | |
| surface (gloss/metal packed in G/B) | mean 8.7, max 178 | | | 0 |

Reading: diffuse is fine at q90 for photographic art. Normals: a mean of 1-2 degrees hides isolated texels that flip by up to 90 degrees (specular sparkle under a moving headlamp); they are unsafe. Depth: mean error under 1% of the height range, and the relief builder box-filters to a 256 grid (`reliefMesh.ts` `MAX_GRID`) which averages the noise away, so lossy depth is plausible for the *relief* use but not proven for displacement (non-relief wall profile) or for "normal from depth" in the editor; needs a visual test. The packed surface map (gloss in G, metal in B) must stay lossless (chroma subsampling destroys it, mean error 8.7).

### 1.5 Auto maps generated by `pull-shared` (measured with the repo's own `generateMaps`, 1254x1254)

| diffuse source | generated normal: current `png()` / PNG-opt / lossless WebP / q90 | generated depth: current `png()` / PNG-opt / lossless WebP / q90 |
|---|---|---|
| relief/wall4 | 3702 / 980 / 2237 / 574 KB | 980 / 702 / 331 / 76 KB |
| relief/floor2 | 4310 / 1124 / 2748 / 726 KB | 1050 / 736 / 380 / 90 KB |
| bridge_wall4 | 3925 / 1062 / 2435 / 663 KB | 1103 / 785 / 359 / 91 KB |

So per Auto texture the current script adds ~4.7 MB, an optimised PNG pair ~1.8 MB, and (normal PNG-opt + depth lossless WebP) ~1.4 MB. A generated depth map compresses extremely well as lossless WebP (-53% vs PNG-opt) because it is smooth and low entropy.

### 1.6 Projection for the 67 MB store

The kind breakdown of the store is **not known** (the audit only says ~67 MB total; the user's per-file figures are diffuse 1-2 MB, normal ~0.9 MB, depth ~0.4 MB). ESTIMATE: split the 67 MB as 54% diffuse (36.2 MB), 32% normal (21.4 MB), 14% depth (9.4 MB) (= 1.5 + 0.9 + 0.4 MB per full set) and apply the measured group ratios. NPC sheets, stills, decals and pickups are inside these numbers only to the extent they behave like the groups.

| strategy | diffuse | normal | depth | total | vs 67 MB |
|---|---|---|---|---|---|
| A. as is (PNG) | 36.2 | 21.4 | 9.4 | 67.0 | 0% |
| B. lossless PNG re-encode, all maps | 18.9 | 7.4 | 6.3 | **32.6** | -51% |
| C. lossless WebP everywhere | 26.5 | 11.9 | 6.3 | 44.7 | -33% |
| D. best-of(PNG-opt, lossless WebP) per file | 17.9 | 7.4 | 5.9 | 31.2 | -53% |
| E. lossy q90 diffuse; normal and depth lossless (PNG-opt / best-of) | 4.9 | 7.4 | 5.9 | **18.2** | -73% |
| F. as E, plus lossy q90 depth | 4.9 | 7.4 | 0.7 | 13.0 | -81% |
| G. q90 everything (not recommended for normal) | 4.9 | 2.2 | 0.7 | 7.8 | -88% |
| H. as E but q80 diffuse | 2.9 | 7.4 | 5.9 | 16.2 | -76% |

Everything above for the store applies to a *bundle of exactly the store's files*. Auto maps that `pull-shared` bakes are extra (section 1.5): with N Auto textures add N x 4.7 MB (today) or N x 1.4-1.8 MB (after the fix).

Resolution is the bigger lever and is independent of the format: the bundled textures that exist today are all <= 512 px (mostly 128-256 px, made by `process-texture`), while the store's uploads are 1024-1254 px. GPU memory is untouched by file format (the decoded RGBA is uploaded either way), but a 1254 px set of diffuse+normal+depth costs ~25-40 MB of VRAM with mipmaps versus ~2 MB at 256 px. A cap such as 512 px for non-pixel-art uploads at bundle time would cut bytes another 4-6x; this is a visual-quality decision for the user (D4).

## 2. Code audit: where `.png` is assumed

Legend: "store" = Supabase revision folder `<world>/<kind>/<uuid>/r<N>/`; "bundle" = what `pull:shared` writes under `public/`.

| Area | Where | Assumption | Change needed for `.webp` |
|---|---|---|---|
| Store texture read | `src/editor/textureLibrary.ts` `fileUrls()` (l.281-291) | `diffuse.png`, `normal.png`, `depth.png`, `surface.png`, `emissive.png` hard-coded; `meta.maps.*==="uploaded"` decides which exist | add `meta.files?: Partial<Record<MapKey,string>>` (validated against `^(diffuse|normal|depth|surface|emissive)\.(png|webp)$`), `fileUrls` uses `meta.files?.x ?? "x.png"`. `parseMeta` in `sharedTextures.ts` (l.50) must pass it through; `cacheUsable` already re-parses meta |
| `needing` map (Auto-map trigger) | `textureLibrary.ts` l.346-378 | keyed by `fileUrls(info).diffuse` URL | automatic once `fileUrls` is the single source |
| Store texture publish | `sharedTextures.ts` `publishFiles` (l.167-185), `publishTextureRevision` (l.206) | file names fixed; `isPng(blob)` signature check; all uploads `image/png`; 8 MiB cap (`MAX_PNG_BYTES`) | convert at publish (see 3.2); write `files` into `metaOf`; per-file content type |
| Draft from a published texture | `textureLibrary.ts` `ensureDraft` (l.421-449) | fetches the files into Blobs that are later re-validated with `isPng` in `publishFiles` | a WebP-sourced draft blob would fail `isPng` on the next publish: re-encode it to PNG in `ensureDraft` (decode -> `encode`), or let `publishFiles` accept WebP blobs. Same for `reviseSharedImage` (`sharedImages.ts` l.124-139) and `reviseActor` (already name-aware) |
| Editor upload UI | `TexturePanel.tsx` l.70-86 (`validatePng`, `file.slice(0,size,"image/png")`), `ChannelControls.tsx` l.62 and `AssetManager.tsx` l.1169 (`accept="image/png"`), `ImageAssetsPanel.tsx` l.178-215/318, `imageTools.ts` `validatePng`/`isPng` | PNG signature enforced, drafts are PNG blobs in IndexedDB | **keep as is.** Users keep uploading PNG; conversion happens at publish. This leaves drafts, AI depth, "normal from depth", surface composition and IDB drafts untouched |
| AI depth / normal tooling | `aiDepthWorker.ts`, `AiDepthControls.tsx`, `channelEditor.ts`, `autoMaps.ts` | consume `ImageData` from `decode()` (`createImageBitmap(..., {premultiplyAlpha:"none", colorSpaceConversion:"none"})`); results are PNG Blobs from canvas `encode` | no change: WebP decodes the same way. Results are PNG until publish |
| Stills / decals / pickups, store | `sharedImages.ts` l.196-201 (`url: base+"diffuse.png"`, `normalUrl`, `depthUrl`), l.288-300 uploads, `checkImagePng` (PNG signature, header read at offset 16) | fixed names; `checkImagePng` parses the PNG IHDR | add `files` to meta like textures; `checkImagePng` stays on the draft side (PNG) |
| `sharedDecalNormalUrl` | `imageDraftLogic.ts` l.19 | `base + "normal.png"` gated by `hasNormal` | take the file name from meta |
| NPCs (the precedent) | `sharedActors.ts` (`diffuseFile`, `diffuseFileOf`, `encodeSmallestLossless`, fallback on 400/415/422), `sharedContent.ts` `actorFiles`, `actorSheetFiles.ts`, `pull-shared.ts` l.224-241 | `definition.diffuseFile` is `diffuse.png|diffuse.webp`, normal always `normal.png` | already done for the diffuse; extend the whitelist to `normal.webp` only if normals get converted |
| Shared definitions | `sharedDefinitions.ts` `publishDefinition` | uploads each file with `blob.type` | fine |
| Loading in the game | `GameViewport.tsx` (`THREE.TextureLoader` -> `HTMLImageElement`, l.1986; NPC normals via `THREE.ImageLoader`, l.6047), `decals.ts` l.235-238, `reliefMesh.ts` `loadHeightGrid` (`Image` + canvas `getImageData`), `materialMaps.ts` `baseMaps` (surface via canvas) | URLs come from the registries; the browser decodes by content | no code change; WebP works for all of them. Heights are read as luminance from RGB, `solid` from alpha >= 128 |
| Hard-coded built-in paths | `textureSets.ts` (all `textures/<id>/*.png` for built-ins, l.50-415), `textureFolder()` l.439-448, `Inspector.tsx` l.58, `AssetManager.tsx` l.212/338/425-434, `AssetTree.tsx` l.51/99, `PropEditor.tsx` l.262, `ActorEditor.tsx` l.38, `GameViewport.tsx` l.1111-1112/2709/5965 | built-in (hand-processed, <= 512 px) assets | **leave as PNG**; not part of this plan |
| Bundled textures | `textureSets.ts` l.419-433: `diffuse: ${folder}diffuse.png` hard-coded, but `normal/depth/emissive/surface` come from `entry.files.includes("x.png")` | catalog `files: string[]` (`sharedBuiltins.json`, type `BundledTexture`) already lists real names | use `entry.files.find(f => /^diffuse\./.test(f))` and generalise the other four to "the listed file starting with `normal.`"... |
| Bundled images | `bundledImages.ts` `bundledImageFiles` (stem + `.png`, `.normal.png`, `.depth.png`), `BundledImageEntry` | extension fixed | add `ext?: "png"|"webp"` (or per-map) to the catalog entry; update `bundledImages.test.ts` |
| Bundled NPCs | `bundledActorFolder`, `actorFiles` | already `diffuse.png|webp` | none |
| Service worker | `public/sw.js` `IMMUTABLE_PATH` and `src/editor/swPolicy.ts` (+ `swPolicy.test.ts`) | path regex ends in `[^/]+`: **extension agnostic**; `isCacheableResponse` is status based | none. `sharedUploadPolicy.ts` (`Cache-Control: immutable`) is also extension agnostic |
| Thumbnails | `src/editor/thumbs.ts`, `derivedCache.ts` | already makes a 96 px WebP thumb client side from the full file, keyed by URL (`thumb1:<url>`) | none; a new file name = a new key. `THUMB_VERSION` untouched |
| Derived-data cache (IDB `auto`) | `derivedCache.ts` `upgradeCacheKey` (`up:<id>:r<rev>:...:g<recipe>`), `textureLibrary.ts` `derive` | key has id + rev + transparency + recipe version, not the file name or bytes | no change. Caveat: Auto maps are derived from whatever diffuse is downloaded; if diffuse becomes lossy, new revisions derive from the lossy pixels (visually harmless, not bit-identical). Bundled Auto maps are baked from the *original* PNG in `pull-shared`, keep it that way |
| Store listing | `sharedTextures.ts` l.116 (legacy flat `^[a-z0-9-]+\.png$`), `deleteSharedTexture` (legacy path `.png`) | legacy flat files only | none (legacy files are never converted) |
| Bucket policy | `supabase/shared-webp-mime.sql` (`allowed_mime_types = png, webp, json`), `README.md` section "Lossless WebP colour maps" | NPC precedent: the SQL has to be run once, editor falls back to PNG on 400/415/422 | if the user already ran it for NPCs nothing is needed; otherwise run it once. Same fallback logic should wrap texture publishing |
| Pull script | `scripts/pull-shared.ts`: `pullTexture` (fixed `diffuse.png`, `files["x.png"]`, `maps[channel]==="uploaded"`), `pullImages` (fixed `diffuse.png`, validates `format==="png"`), `png()` helper l.127 (default encoder) | fixed names; PNG-only validation | the converter lives here (section 4a); read `meta.files`; encode with explicit options |
| Release build | `scripts/pack-world.ts` | copies `public/` into the zip; removes `sw.js` | no change. `packaging/server.ps1` already maps `.webp` to `image/webp` (l.11). `start.sh` uses python `http.server` (mime from the Python version: **[verify]**, but browsers sniff images, so low risk). A smaller bundle also shrinks the zip (PNG/WebP do not zip further) |
| GitHub Pages / CI | `.github/workflows/deploy.yml` | `npm ci` + `vite build`; `public/` is copied as is | none; Pages serves `.webp` as `image/webp` |
| Git | `.gitattributes`: `*.png`, `*.webp` binary | no diffs, no LFS | none |
| Tests that mention the names | `derivedCache.test.ts`, `imageDraftLogic.test.ts`, `sharedUploadPolicy.test.ts`, `swPolicy.test.ts`, `bundledImages.test.ts`, `sharedContent.test.ts` (47 occurrences) | | update `imageDraftLogic`, `bundledImages` tests; add tests for the file-name resolver |

## 3. Design

### 3.1 Principle: never rely on the extension of a name, always on one resolver

- One pure helper per asset family (`textureFileName(meta, key)`, `imageFileName(meta, key)`, same idea as `diffuseFileOf`) that maps `meta.files?.[key] ?? "<key>.png"` and rejects anything outside a whitelist. Old revisions (no `files`) keep resolving to the PNG, so nothing already published needs migrating. Never keep the same basename with different bytes (a `diffuse.png` holding WebP would "work" because browsers sniff, but `isPng` checks in the editor, the `format==="png"` validation in `pull-shared` and the content-type validation of the bucket would all disagree; rejected).
- Revision folders are immutable (`x-upsert: false`, year-long `immutable` Cache-Control, SW cache `void-shared-v1`), so a format change always means a new `r<N+1>` or a different file name in a new revision, never an in-place overwrite.

### 3.2 Convert on the client at publish time (phase b)

- Source stays PNG in drafts/IDB. At publish: decode (`imageTools.decode`, no premultiply, no colour conversion) -> `canvas.toBlob("image/webp", q)` -> check `blob.type === "image/webp"` (Safari returns PNG; Firefox support is recent: fall back to the PNG when the type is not WebP, exactly like `losslessImage.ts` does) -> keep the WebP only if it is smaller and passes the guard below.
- Policy per map (see 3.3): diffuse lossy q0.90 when it is photographic (> 256 unique colours, not `pixelArt`, or the file is bigger than ~150 KB), else lossless WebP/PNG, whichever is smaller; normal, depth, surface, emissive, glow: lossless only (WebP lossless through `encodeSmallestLossless`, with its `sameVisiblePixels` guard, or the original PNG). Chrome's canvas encoder gives lossless WebP at quality 1.0; sizes will be a bit worse than sharp's effort 6 (unmeasured).
- Alpha guard for lossy: require identical alpha everywhere (alpha was exact in all lossy samples with `alphaQuality 100`, but a browser encoder may differ) and a PSNR floor (e.g. 36 dB) computed on the visible pixels; otherwise publish lossless.
- Premultiplied-alpha pitfall: a canvas stores premultiplied RGBA, so `putImageData` of a pixel with small alpha loses RGB precision before encoding (the existing PNG `encode()` has the same limit; `sameVisiblePixels` would catch it for lossless; for lossy the PSNR guard covers it). RGB under alpha 0 is not preserved by any path and does not matter for `alphaTest: 0.5` decals/NPCs, but fringe colour of semi-transparent texels bleeds into neighbours when lossy; keep cut-out diffuse (alpha with partial values) lossless unless the guard passes on a premultiplied comparison.
- Colour space: browser decode with `colorSpaceConversion:"none"`; sharp strips ICC and converts to sRGB, which only matters for files with an embedded profile (none in the sample). For data maps (normal/depth) never colour-convert; in the bundle script copy them untouched or re-encode with `keepIccProfile` unset and skip files that carry an ICC profile.
- 8 MiB `MAX_PNG_BYTES`: keep as the limit on the stored file (WebP is smaller, so it only gets easier), but the *input* check stays PNG.
- three.js: `TextureLoader` and `ImageLoader` use `HTMLImageElement`, so any browser WebP decoder works; `THREE.ImageBitmapLoader` is not used. GPU upload is the decoded RGBA, so VRAM is the same as for PNG. `texImage2D` from an `<img>` is un-premultiplied the same way for PNG and WebP (three sets `premultiplyAlpha = false`).
- Browser support: WebP decode is in Chrome/Edge/Firefox for years and Safari 14+ (macOS 11, iOS 14). Lossless and alpha WebP are covered by the same versions. Safari cannot *encode* WebP in canvas, which only affects the editor (fallback to PNG); Safari/old-browser *players* only need the decoder. Pre-2020 Safari/iOS < 14 would show missing textures. Given `createImageBitmap`, WebGL2 and the existing NPC-WebP precedent the project already depends on, I consider this acceptable, but it is a (small) hard compatibility cut: user decision D6.

### 3.3 What must stay lossless, and why

| map | policy | reason |
|---|---|---|
| normal | lossless (PNG-opt, or lossless WebP when smaller) | lit per pixel; the lossy samples have texels whose decoded vector is rotated by 20-90 degrees (visible as sparkle under the headlamp), and chroma subsampling shifts X/Y (R/G) unevenly. Normal maps are also 35% of the PNG size after a plain re-encode, so lossless already gets most of the gain |
| depth | lossless by default; lossy q90 only after a visual test | feeds relief geometry (`loadHeightGrid`, box-filtered to <= 256 cells, luminance only), displacement for non-relief walls, "normal from depth" in the editor, collision/step heights through the relief; measured gradient error up to 45 levels at q90 |
| surface (gloss in G, metal in B) | lossless | packed channels, lossy mean error 8.7 |
| emissive / glow | lossless | tiny (<= 10 KB), exact values drive light emission; thresholds (`luma > 150`) matter |
| diffuse with few colours / `pixelArt: true` / NPC sheet | lossless only | lossy ringing on hard edges (max 45-112 levels, PSNR 28-36 dB), no size gain below ~256 colours; `pixelArt` also means `NearestFilter` magnification, which shows every wrong texel |
| diffuse, photographic (AI albedo, sky, still) | lossy q90 (q80 for stills/skies if the user accepts) | -86%; visually transparent at 1254 px for the sampled walls. Pixel-art flagged textures that are really 1254 px AI images (the default `pixelArt: true` in `parseMeta`) need a per-asset look |

Transparency edge fringes: with lossy diffuse the alpha is exact, the RGB of edge texels drifts (mean 2-3 levels, max 150 on `doorframe1`); sprites/decals use `alphaTest: 0.5` and Nearest filtering, so a drifted edge texel is visible as a coloured pixel line. Cut-out textures (doorframes, windows) should be lossless or q95 with a visual check. No fix is needed for RGB under alpha 0 (not preserved by canvas or by libwebp default; identical to how `encode()` PNGs behave today).

### 3.4 Repo and hosting impact of a bundle

- Today: `.git` pack 205 MB; tracked `public/` 32.9 MB (32.7 MB PNG); Pages artefact (`dist`) 61 MB of which a 25.6 MB wasm. GitHub guidance: repo < 1 GB recommended, single file < 100 MB (blocked above), Pages site <= 1 GB, ~100 GB/month soft bandwidth.
- Bundling the current store: +67 MB as it is (strategy A), +33 MB as optimised PNG (B), +18 MB (E), +13 MB (F); PNG and WebP do not delta/compress in git, so working tree growth = pack growth. Every re-pull of a changed asset adds another full copy to history forever; the "keep existing, never refresh" rule of `pull-shared` limits that, but a later format migration would re-add everything (the reason to decide now).
- Add the baked Auto maps (section 1.5) per Auto texture: +4.7 MB today, +1.4-1.8 MB after the fix. If many store textures are Auto, this dominates; the alternative is not baking them (guests then derive them in the browser, already supported by `upgradeShared`, at a CPU cost and one extra diffuse download per texture) - decision D3.
- None of these sizes approaches a GitHub limit; the pain is clone size/history and Pages deploy time, not hard limits. Git LFS is unnecessary and interacts badly with the Pages workflow (checkout needs `lfs: true`, bandwidth quota).
- Per-visit bytes for guests (what matters after bundling, from GitHub Pages and not Supabase): a typical map with 13 textures goes from ~13 x 2.8 MB (PNG as is) to ~13 x 1.0-1.4 MB (strategy E).

## 4. Recommended plan, in order

### 4a. Bundle-time converter in `pull-shared.ts` (do this BEFORE `pull:shared`)

Why first: zero changes to Supabase, the editor or the meta format; one place decides the policy; nothing already published is touched; the loader change is confined to the bundled branches that nobody has used yet (`sharedBuiltins.json` is empty).

1. Fix the encoder of the generated Auto maps (15 minutes): `png()` helper in `pull-shared.ts` l.127 -> `sharp(...).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })`. Measured effect: normals 3.7-4.3 MB -> 0.98-1.1 MB. Also run PNG-opt on every PNG that is written unchanged (uploaded normal/depth/surface/emissive: -35% normal, -33% depth).
2. Converter (~0.5-1 day with tests): a pure `chooseBundleEncoding(kind, pixels/metadata)` in `src/game/` (testable, shared with a later editor implementation) that returns `{ext, options}`: diffuse photographic -> `webp({quality:90, alphaQuality:100, effort:6, smartSubsample:true})` if the alpha is exact and the PSNR on visible pixels >= 36 dB (decode and compare in the script, as `losslessImage.ts` does), else the smaller of PNG-opt and lossless WebP; normal/depth/surface/emissive -> smaller of PNG-opt and `webp({lossless:true,effort:6})`; `pixelArt` or <= 256 colours -> lossless only; generated Auto depth -> lossless WebP (-53% vs PNG-opt); sky/stills -> q90. Maps are baked from the ORIGINAL PNG pixels. Write the real names into the catalog `files` array (`textures`) and `ext` (`images`).
3. Loader change (~20 lines, plus tests): `textureSets.ts` l.419-433 use the listed `diffuse.*`/`normal.*` names; `bundledImages.ts` `bundledImageFiles` take the extension from the entry. Store-side loaders stay untouched in this phase.
4. Optional but cheap: `--max-size <px>` (default off) for non-pixel-art textures (decision D4), and `--report` printing the bytes before/after per asset.
5. Run `npm run pull:shared -- --list`, then the real pull, look at the report (`git status` size), visually check 5-6 textures (diffuse close-up, a doorframe/window cut-out, one relief wall, one normal-lit wall under the headlamp) in the editor, then commit.

### 4b. Publishing WebP from the editor (after bundling; 1-2 days)

Only worth it for editor egress, repo-free store size and the Supabase 1 GB storage/egress headroom. Needed: `meta.files`, the resolver in `fileUrls` / `imageFromMeta` / `sharedDecalNormalUrl`, publish-time conversion (3.2), re-encode WebP blobs to PNG in `ensureDraft`/`reviseSharedImage`, content types, fallback on 400/415/422 (as `publishActor`), `pull-shared` reading `meta.files`, tests, a note in `supabase/README.md`, a release-notes line (one entry per feature). Needs `shared-webp-mime.sql` once, if not yet run for the NPCs (**[verify]** in the dashboard: Storage -> bucket -> allowed MIME types). Because bundled textures win over the store (`setSharedTextures` filters ids in the bundled catalog), none of this is needed for the guest-facing result.

### 4c. Re-encoding the existing 67 MB store in place (not recommended; describe only)

Would require a script with an editor token that downloads each latest revision, converts, and uploads as a *new* `r<N+1>` folder with `files` in meta (the only option consistent with `x-upsert:false`/immutable caching; overwriting needs an UPDATE policy and invalidates every browser's `immutable` copy and the SW cache), plus a delete policy run to reclaim the old revisions (`delete_textures` exists for textures only). Effort 1-2 days, touches production data, and after bundling it saves only editor egress. Skip unless the Supabase storage quota (not egress) becomes a problem; the old revisions stay in any case.

### 4d. What can wait

Resolution cap, lossy depth, per-asset pixel-art classification UI, near-lossless, thumb.webp at publish (client thumbs already exist), AVIF, converting built-in `public/textures` (already <= 512 px, 33 MB total, -50% is available with the same PNG-opt but it is a history re-add).

### Effort summary

| item | effort |
|---|---|
| 4a.1 PNG-opt fix | 15 min |
| 4a.2-3 converter + bundled loader + tests | 0.5-1 day |
| 4a.5 pull + visual QA + commit | 0.5 day |
| 4b editor publish path | 1-2 days |
| 4c in-place store migration | 1-2 days (not recommended) |

## 5. Decisions needed from the user

- **D1 (blocks 4a): diffuse quality policy.** Lossy WebP q90 for photographic diffuse (-86%) vs lossless only (PNG-opt/WebP best-of, -48%)? Recommendation: q90 with the PSNR/alpha guard, lossless for pixel art/few colours/cut-outs.
- **D2: normal and depth.** Recommendation: normals lossless always; depth lossless now, lossy q90 only after a visual test of a relief wall and a displaced wall (saves another 5 MB of the 18).
- **D3: bake Auto normal/depth into the bundle?** Baking costs ~1.4-1.8 MB per Auto texture after the fix (4.7 MB today) but makes guests CPU-free; not baking keeps the bundle near the diffuse-only 5-18 MB at the price of one diffuse download and the in-browser derivation per used texture (existing, IDB-cached behaviour).
- **D4: resolution.** Cap non-pixel-art uploads at 512 px (or 1024) when bundling? Biggest remaining lever for bytes and VRAM, but changes the look; needs the user's eyes on two or three textures.
- **D5: is the store's real composition known?** The counts per kind in section 1.6 are assumptions; `pull-shared --list` plus the Supabase Storage report (audit section 9, step 4) give the real split in minutes and would turn the projection into a measurement.
- **D6: browser floor.** Accept WebP-only diffuse in the bundle (Safari 14 / iOS 14 and newer)? If not, bundle PNG-opt only (-51%).
- **D7: has `shared-webp-mime.sql` been run on the production bucket?** Only matters for 4b.
- **D8: bake pickups (`item`) and decals in the same pass?** Yes recommended (decals are the 40-60 KB at q90 class; pickups are small).

## 6. Implementation status (branch `feature/bundle-webp`)

### 6.1 Decisions as taken
- **D1: everything lossless** (pixel art). No lossy WebP, no near-lossless, no palette quantisation: the lossy rows of section 1 are history. Strategy "D" (best of PNG-opt and lossless WebP per file) is what was built, with a clearly-smaller rule: the WebP is used only when it is at least 10% smaller than the best PNG.
- **D3: every generated map is baked.** Each bundled texture ends with diffuse + normal + depth files (Auto maps generated by the script); the client never derives anything for a bundled texture. A map that is `none` stays absent and the game uses the flat map for it, as before. Geometry is not baked (6.4).
- **D4: no resolution cap now**, one hook: `MAX_TEXTURE_SIZE` (Infinity) in `scripts/imageEncode.ts`; every encode goes through `limitSize` first.
- **D6: WebP in the bundle is accepted** (Steam, mobile, Switch; the web build is an optional demo).

### 6.2 What was built
- `scripts/imageEncode.ts`: the chooser. PNG candidates: zlib 9 with and without adaptive filtering, the smallest channel layout (grey / grey+alpha / RGB / RGBA), and a palette PNG only when the image has at most 256 distinct RGBA values; WebP candidate `lossless, effort 6, exact`. Every candidate is decoded and compared with the source over all RGBA bytes (alpha and the colour under alpha 0 included) and dropped if it differs; a source PNG that is 16-bit, has an ICC profile or is animated is kept byte for byte.
- `scripts/bundleTexture.ts`: transparency (`none` / `colorKey`) and Auto-map baking plus encoding of one texture, pure, tested on synthetic images.
- `scripts/pull-shared.ts`: uses both for textures, stills, decals, pickups and NPC sheets (NPC colour map png or webp via `definition.diffuseFile`, NPC normal map always PNG); per-asset lines and a final table (files, WebP count, bytes per kind, bytes as optimised PNG, saved); `--list` says the planned files per asset (no sizes: nothing is downloaded).
- Catalog: `files: { diffuse: "diffuse.webp", normal: "normal.png", ... }` per texture and per image entry, read by `src/game/bundleFiles.ts` (a pure resolver; an old array of names or no entry = PNG), used by `textureSets.ts` and `bundledImages.ts`. The file name always carries the real extension.
- Unchanged on purpose: the store's `fileUrls` (store revisions stay PNG; bundled textures never get a store info, so `upgradeShared` / `wantSharedUrl` never see them), thumbnails (`thumb1:<url>`), the derived cache (`up:<id>:r<rev>:...`), the service worker and upload policies (all extension agnostic, verified), the editor's PNG-only upload UI.

### 6.3 Correction to section 1: the "PNG-opt" column was palette-quantised
In sharp, `png({ effort, quality, colours, dither })` silently sets `palette: true` unless `palette: false` is passed. The "PNG-opt = `png({compressionLevel:9, effort:10, adaptiveFiltering:true})`" encoder of section 1.1 therefore produced a quantised (lossy above 256 colours) palette PNG, which is why its sizes track the "PNG-8 (lossy)" column. A really lossless PNG is bigger than that column, so lossless WebP wins more often than the 9/29 files counted in 1.3 (a smooth 1254 px synthetic photo: 2.2 MB lossless PNG vs 1.46 MB lossless WebP). `imageEncode.ts` passes `palette` explicitly everywhere and only uses a palette PNG when it is verified exact. Read the real table of the first `pull:shared` run before judging the 18 MB / 13 MB projections: they assumed lossy diffuse and no longer apply.

### 6.4 Where baked geometry would plug in (not done)
The game builds relief geometry from a texture's depth map at load time (`src/render/reliefMesh.ts`, `loadHeightGrid` on the depth URL). To pre-bake it: (1) run the pure part of that builder in `bakeTexture` (`scripts/bundleTexture.ts`) on the already-baked depth, next to the normal/depth encoding; (2) write the result as one more file (e.g. `relief.bin`) and list it in the catalog `files` under a new key (`BUNDLE_MAP_KEYS` / `bundleFileOk` in `src/game/bundleFiles.ts` check a name per key: a non-image key needs its own extension rule); (3) have `bundledTexturePaths` return it as a new `TextureSetPaths` field and let the relief builder skip `loadHeightGrid` when it is there. Nothing of this exists yet; the TODO is in the header of `scripts/pull-shared.ts`.

### 6.5 Tests (all offline, synthetic images)
`scripts/imageEncode.test.ts` (chooser: flat, noise, gradient, few-colour pixel art, transparency with colour under alpha 0, 1x1 and odd sizes, grey, normal-like, ICC and 16-bit sources kept, inexact encoders dropped, size hook), `scripts/bundleTexture.test.ts` (Auto maps equal `generateMaps` pixel for pixel, colour key, `none`, uploaded and absent maps), `src/game/bundleFiles.test.ts` and `src/game/bundledImages.test.ts` (names and catalog forms). Not testable offline: the real store content (sizes, how many Auto textures), `pull-shared.ts` end to end (needs Supabase), the browser decoding the WebP files, the game rendering them.

### 6.6 Risks
WebP decode needs Chrome/Edge/Firefox (any current), Safari 14 / iOS 14 and newer; the Switch browser engine is unverified. Content-type: GitHub Pages and `packaging/server.ps1` serve `.webp` as `image/webp`; `start.sh` (python `http.server`) depends on the Python version, and `<img>` decoding sniffs the bytes anyway. A WebP is at most 16383 px per side (not a limit here: a larger image simply stays PNG). A source PNG with an ICC profile or 16 bits is not recompressed (kept as is).
