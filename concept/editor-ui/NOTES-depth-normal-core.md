# Depth/normal core (port of normalMap's core.js)

Typed, dependency-free port in `src/render/depthNormal.ts`. No DOM, no three.js.
The editor can later make a DEPTH and a NORMAL map from a DIFFUSE image in the
browser, on the main thread or in a worker.

## API

- `DepthNormalParams`: `oilRadius` (4), `oilPasses` (1), `blur` (2, core's
  `smooth`), `levels { auto (true), black (0), white (1), gamma (1), invert
  (false) }` (core's `autoLevels/black/white/gamma/invertDepth`), `preBlur`
  (0, core's `normalBlur`), `strength` (3), `flipY` (false = OpenGL Y+).
- `defaultDepthNormalParams` — the core.js defaults for those stages.
- `generateDepth(rgba, w, h, params?)` — RGBA grayscale height; alpha copied
  from the diffuse, so transparent pixels stay transparent.
- `generateNormal(depthRgba, w, h, params?)` — RGBA normal; alpha copied.
  Height comes from the 8-bit depth's red channel.
- `generateMaps(rgba, w, h, params?)` — `{ depth, normal }` in one pass. The
  normal is taken from the un-quantised float height (as core.js `process`),
  so it can differ from `generateNormal(generateDepth(...))` by a level at very
  steep edges.
- `generateMapsWithProgress(...)` — same, with a `(fraction) => void` callback;
  used by the worker.
- Parameters are in pixels of the image passed in. For previews, multiply pixel
  radii (`oilRadius`, `blur`, `preBlur`) by `previewSize().scale`.

`src/render/depthNormalAsync.ts`:

- `generateMapsAsync(image: ImageData, params?, onProgress?)` — one lazy module
  worker (`new Worker(new URL("./depthNormalWorker.ts", import.meta.url), {
  type: "module" })`), input copied then transferred, output buffers
  transferred back, resolves to `{ depth: ImageData, normal: ImageData }`.
  Falls back to the main thread when `Worker` is missing or construction fails.
- `previewSize(w, h, max = 640)` — `{ width, height, scale }`, longest side
  capped at `max` (the normalMap UI's preview size).

Not ported (not in the requested pipeline): height-source selection, dark lift,
flatten, detail-frequency remix, edge bevel, wrap/tileable edges, flipX, opt-out
of alpha. Results are bit-identical to core.js with those stages neutralised.

## Verified

- `npx tsc --noEmit` clean.
- `npx tsx scripts/test-depth-normal.ts` passes: flat normal (128,128,255),
  ramp tilt, alpha preservation, flipY mirrors green, `previewSize`, and
  embedded core.js pixel values plus whole-image FNV fingerprints.
- During development, compared the full RGBA buffers against core.js on a
  64x64 synthetic gradient+square for 5 parameter sets (oil passes/radius,
  small and >6px blur, auto and manual levels, gamma, invert, flipY, preBlur
  0..4, strength 1..12): max difference 0 on every channel.

## Not verified

- Worker execution in a real browser (no dev server was started). The wiring is
  the standard Vite `new Worker(new URL(...), { type: "module" })` pattern.
- A worker that fails after the input was transferred (module load/runtime
  error) rejects the promise; the automatic fallback only covers missing
  Workers and constructor failure, because the copied input is already moved.
- No cancellation or concurrency limit: requests queue in the one worker.
