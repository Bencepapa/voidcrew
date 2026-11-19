# AI depth (Depth Anything V2 Small) in the Assets window

Branch `feature/ai-depth` (worktree `C:\dev\js\voidcrew-aidepth`, own node_modules, `@huggingface/transformers` is installed).

## Decision (the user left it to us: "the most user-friendly solution")
- An **editor-only** button in the texture editor's Depth row: **"AI depth"** (hu: "AI mélység"), next to the existing modes
  (Uploaded / Auto filter / None). It runs the Depth Anything V2 Small model (Apache-2.0) IN THE BROWSER (Transformers.js,
  WebGPU first, WASM fallback), then stores the result as an **Uploaded depth** (frozen PNG): players and the game NEVER run the
  model; publishing needs nothing new. The old filter-based Auto depth/normal stays as it is.
- The normal map: after an AI depth, a checkbox "Also make the normal map from this depth" (default ON) fills the Normal channel
  (Uploaded) from the AI depth with the existing `generateNormal` (src/render/depthNormal.ts).
- The model comes from the Hugging Face CDN (default of Transformers.js: `onnx-community/depth-anything-v2-small`), cached by the
  browser; the first use downloads it with a visible progress ("Downloading the AI model 42%"), later uses are instant. Show a
  one-line note with the licence (Apache-2.0) and "runs on your computer, the image does not leave it".
- Lazy: `import("@huggingface/transformers")` only when the button is used (separate chunk; the game bundle must not grow).
- Run in a Web Worker (src/render/aiDepthWorker.ts + src/render/aiDepth.ts API `generateAiDepth(image: ImageData, options, onProgress, signal): Promise<ImageData>`),
  with a Cancel button (terminate the worker). If WebGPU is not available or fails, retry with WASM and say it may take longer.
- Post-processing (keep it small, all in the Depth row, collapsible "AI options"): Invert (a checkbox; the model gives relative
  inverse depth: bright = near; our depth convention is whatever the existing generated depth uses, check src/render/depthNormal.ts and the preview: the result must
  look right in the Asset Manager preview room at relief 1.0), Contrast/Detail slider (0..1, a simple levels / unsharp step on the
  result), "Keep alpha holes" (copy the diffuse alpha into the depth alpha, default ON; transparent pixels must stay transparent).
  The model output is resized back to the diffuse size (bilinear; for texture sets flagged pixelArt use nearest when upscaling).
- Where to work: the texture panel channel rows (`src/editor/TexturePanel.tsx`, `ChannelControls`), the Auto adapter
  `src/editor/autoMaps.ts`, the draft model (`textureDrafts.ts`). Keep the draft/Publish flow untouched: the AI result is simply an
  uploaded depth Blob (PNG) on the draft.
- i18n en + hu for all strings (existing area files).
- Nothing runs automatically; no model download without a click.

## Verify
`npx tsc --noEmit` clean; `npm run build` must succeed and the main chunk must not contain transformers.js (check the chunk list). Browser test on a
temporary port (6100, own vite config): create a new texture draft, upload a diffuse, click "AI depth", watch the progress, see the depth in the preview.
Report the model download size, the time (WebGPU / WASM) for a 512x512 and a 1024x1024 texture, and anything that failed.
