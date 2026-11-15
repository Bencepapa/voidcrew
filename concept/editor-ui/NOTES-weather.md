# Weather - 2026-11-15

Implemented on feature/weather, only in voidcrew-weather:

- Replaced CPU particle movement/matrices/collision with one instanced geometry.
  Each instance has one static vec4 random seed. GPU time/wind motion wraps in a
  camera-centred 16 x 8 x 16 volume; snow sways, rain streaks follow projected fall.
  Transparent, fog-aware, depthWrite disabled. Normal quality has a fixed capacity
  of 12,000 (quality scales capacity); intensity selects a quadratic 0..12,000
  draw count (3,000 at intensity 1). No per-frame CPU work per particle.
- Shared nearest-filtered 32 x 32 RGBA float column texture stores world-space
  floor, ceiling, sky and validity. Rebuilt on camera cell or map identity change,
  not every frame. Vertex sampling collapses blocked particles; indoors bypasses
  only the sky test, retaining floor/ceiling clipping.
- Standard scene materials patched through useLightGrid, preserving existing
  hooks. Shared wetness uniform lowers roughness towards 0.15, darkens albedo
  slightly and adds modest metalness sheen. Fragment world-xz column sampling
  excludes covered rooms; outward normal probe lets exterior wall faces get wet.
- Snow cover uses the same mask and upward face slope, blending to pale snow with
  procedural world-space noise breakup. No extra snow texture or asset is needed.
  Upward standard-material prop faces also receive snow. Walls remain unchanged
  by snow. Defaults: rain wetness 0.6, snow wetness 0, snow cover 0.6.
- Added localized en/hu Wetness and Snow cover sliders and optional map fields;
  old maps load with defaults, values clamp on import. Weather remains optional.

Validation and limits:
- npx.cmd tsc --noEmit: passed (PowerShell npx.ps1 is blocked).
- git diff --check: passed.
- Own Vite server: http://localhost:3002/voidcrew/, .editor-weather-cache,
  configLoader runner avoids writing bundled config under shared node_modules.
- Browser host unavailable; native Chrome access returned "Computer Use was not
  approved to use Google Chrome". Appearance, live shader compilation, sliders,
  indoor exclusion and FPS/frame-time comparison therefore NOT verified. Dense
  draw counts and absence of particle CPU loops are source-verified only; no
  claim that the frame-time acceptance criterion has been measured or met.
- Mask is local to the camera: surfaces outside its 32-cell square receive no
  wetness/snow. It models map floor/ceiling columns, not prop/bridge occlusion or
  weather accumulation. No splashes. Procedural snow is intentionally simple.
- Commit blocked: Git cannot create C:/dev/js/VoidCrew/.git/worktrees/voidcrew-weather/index.lock (Permission denied), outside the writable worktree. No commit or push made. Dev server stopped; its local cache remains untracked (cleanup command rejected by policy).
