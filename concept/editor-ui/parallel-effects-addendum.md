# Addendum to parallel-effects-brief.md (second pass, same clone and branch)

You already built the effects on `feature/ambient-effects` (read your own commits and `parallel-effects-brief.md` again first). The owner reviewed the design and asks for two changes. Do them, commit, report.

## 1. Rain and snow must be WORLD-space, not stuck to the camera
Today's idea "a particle volume following the camera" must not mean that every particle moves with the player: when the party walks, the rain/snow must stay where it is in the world, so the player FEELS moving through it (parallax, streaks passing by).
- Particle positions live in world space and fall on their own (gravity/wind), independent of the camera.
- Only the *spawning/recycling region* follows the camera: a box around the camera; a particle that leaves the box (falls below the floor of its cell, or drifts outside the box horizontally) is recycled to the top / far edge of the box at a position that keeps a uniform density (wrap around the box with modulo of the WORLD position, do not teleport relative to the camera in a way that drags the field along). Verify: standing still, the field falls; walking forward, drops/flakes pass by faster than they fall.
- A repeating pattern is fine and cheap: e.g. a fixed set of N particle seeds tiled in world space with a period (modulo), as long as the repetition is not obvious (use a couple of incommensurate periods or 2 layers at different scales/speeds for depth).
- Keep the open-sky rule: a particle is drawn only where the cell above it (at its current world position) has open sky (or everywhere when `indoors: true`); rain/snow must visibly stop at roofs and walls, and appear again when walking out into the open.
- Rain streak length should follow the *relative velocity* a little (camera moving makes streaks lean), optional if cheap.

## 2. Ground fog as a first-class, great-looking effect ("rolling clouds at floor level")
For graveyards, swamps, moors. The "ground fog" style of mist must be promoted to its own effect `"groundfog"` (so effects: smoke, fire, mist, groundfog, motes, petals, fireflies; keep `mist` as the standing-smoke variant):
- covers an AREA, not a point: `spread` (radius in cells, default 3, up to ~12) so one emitter blankets a cemetery or a bog; soft edges (the density fades toward the rim).
- billowing, slowly rolling clouds hugging the floor (height 0..~0.6 cell, configurable `height`), several overlapping layers/sprites sliding in different directions and speeds with a gentle vertical bob, using a soft noise texture (generate it procedurally in code or as `public/particles/fog1.png`); tinted by `color` (default cool grey-white), alpha around 0.25-0.45 per layer, no hard polygon edges where it meets walls/props/floor (soft particles or fade by depth if cheap, else fade near walls by cell checks).
- affected by the baked light like the smoke is (bright in lamplight, dim in the dark).
- cheap: no per-puff physics, a few dozen large camera-facing or floor-aligned sprites per emitter at most; count follows `particleQuality`; only emitters whose area is near the camera are updated/drawn.
- editor: it appears in the effect dropdown with Hungarian name "Talajköd" and parameters `spread` (Terület), `height` (Magasság), colour, density (Sűrűség); put the strings in your effects i18n area.
- test content: one groundfog emitter in the fantasy map near the start (small edit), screenshots in `concept/editor-ui/checks/effects/`.

Finish as before: `npx tsc --noEmit` clean, commits on the branch, final report (what changed in this pass, performance numbers for rain/snow and groundfog on the Low preset, anything unsure). Do not push or merge.
