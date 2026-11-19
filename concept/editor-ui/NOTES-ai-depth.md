# AI depth: notes (branch feature/ai-depth)

## What was built
- `src/render/aiDepthWorker.ts`: Web Worker; `import("@huggingface/transformers")` happens inside it, only when a run starts.
  Model `onnx-community/depth-anything-v2-small`. WebGPU (fp16) if `navigator.gpu` exists, otherwise (or if WebGPU fails) WASM (q8).
  Reports backend, overall download bytes (from `progress_callback`) and stages. Output: the model's 8-bit depth (bright = near).
- `src/render/aiDepth.ts`: `generateAiDepth(image, options, onProgress, signal): Promise<ImageData>`. The model input is capped to
  1024 px on the long side; the result is scaled back to the diffuse size (nearest for pixelArt sets, bilinear otherwise), then
  Invert, Detail (unsharp mask, strength = detail * 2.5, then re-stretched to 0..255) and Keep alpha holes (diffuse alpha copied).
  Abort terminates the worker. Sets `localStorage["voidcrew-ai-depth-cached"]="1"` after a successful run.
- `src/editor/AiDepthControls.tsx` (+ `AiBadge`): under the Depth channel card: "AI" pill + "AI depth" button (tooltip), Cancel while
  running, progress line ("Downloading the AI model 42%"), "may take longer" note on WASM, helper line (download warning, or
  "Model cached: fast." when the flag is set), licence/privacy line, "Also make the normal map from this depth" (default ON, uses
  `generateNormal`), collapsible AI options (Invert, Detail 0..1, Keep alpha holes).
- Result: an UPLOADED depth PNG (and uploaded normal PNG) on the draft through `editor.applyAiMaps`. Draft flag `aiDepth` (new optional
  field) drives the status line "AI (Depth Anything V2 Small)" + badge; any other change of the depth channel clears it. The flag is not
  published (after Publish the label is gone; the PNG is a normal uploaded depth).
- `vite.config.ts`: `worker: { format: "es" }` (required: IIFE workers cannot code-split the dynamic import). The other workers still build.
- i18n en + hu in `assetManager.ts` (`assetManager.ai.*`).
- Depth convention: the existing generated depth is a luma height (bright = high, `invert: false`), and the model gives bright = near, so
  the default Invert is OFF. Not checked visually in the preview room (no browser run, per the instructions): if the relief looks
  inside-out, tick Invert.

## Model size (Hugging Face file listing, onnx folder)
- `model_fp16.onnx` 49,642,442 bytes (about 47 MB): used with WebGPU.
- `model_quantized.onnx` (q8) 27,258,801 bytes (about 26 MB): used with WASM.
- Helper text says "25 to 50 MB" (hu "25-50 MB"). Plus small config files. Cached by the browser (Cache Storage) after the first run.
- Flag caveat: the "cached" flag is one flag for both backends; if WebGPU worked first and WASM is needed later, a further ~26 MB downloads.

## Build output (npm run build, `npx tsc --noEmit` clean)
- `index-*.js` main entry 1,869.75 kB (gzip 543.75 kB); contains no `depth-anything`, `InferenceSession` or `transformers.js` strings.
- `transformers.web-*.js` 588.26 kB (separate chunk, loaded only by the worker)
- `aiDepthWorker-*.js` 1.27 kB; `depthNormalWorker-*.js` 5.08 kB; `lightBake.worker-*.js` 59.60 kB
- `ort-wasm-simd-threaded.asyncify-*.wasm` 26,861.78 kB (gzip 6.7 MB): the ONNX runtime's WASM file is emitted into `dist/assets` by Vite.
  It is fetched only when the WASM backend runs. It makes the deployed folder about 27 MB larger; if that is unwanted, point
  `env.backends.onnx.wasm.wasmPaths` at a CDN in the worker.
- I did not compare the main chunk size to main-branch before/after; the string checks above show the library is not inside it.

## Not verified (no browser, no model run, by instruction)
- The actual model run on WebGPU and on WASM, the progress numbers, the time for 512x512 and 1024x1024, the look of the relief in the
  Asset Manager preview room, Cancel mid-download, the fallback path when WebGPU init fails.
- Whether Transformers.js v4's default WASM/ORT file loading works from the Vite dev server and from a packaged build (the built wasm asset
  exists, so it should). On the dev server, if the ORT runtime fails to load, the error text appears via the editor's error line.
- `RawImage` input/`out.depth` shape was taken from the library's type definitions: an 8-bit, normalised (0..255 per image) depth image at the input size.
- `dtype: "q8"` maps to `model_quantized.onnx` per Transformers.js conventions.
- Expectation only (not measured): WebGPU first run = download of ~47 MB plus a few seconds; later runs about a second or two. WASM: ~26 MB
  download, roughly 10-60 s per image depending on the CPU.

## How to test
1. `npm run dev` in this worktree, open the editor, Asset Manager, make a new texture, upload a diffuse (512x512 first).
2. In the Depth card: note the AI pill, tooltip and helper line (download warning). Click "AI depth".
3. Watch "Downloading the AI model N%", then "Estimating the depth...". Cancel once to check that it stops and no changes are made.
4. Run again: result becomes Uploaded depth with the "AI (Depth Anything V2 Small)" label; the Normal channel is Uploaded too (checkbox
   default ON). Check the relief in the preview room at relief 1.0; try Invert, Detail, and a diffuse with transparent holes (Keep alpha holes).
5. Reload and run again: helper line should read "Model cached: fast." and no download should happen (DevTools Network: model files from cache).
6. To test the WASM fallback: Chrome with `--disable-features=WebGPU` (or a browser without WebGPU): the "may take longer" note should show.
7. Publish still works as before (the AI maps are ordinary uploaded PNGs).
