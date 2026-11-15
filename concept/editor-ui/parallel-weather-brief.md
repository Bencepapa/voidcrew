# Weather: dense rain/snow, wet look, snow cover (branch feature/weather, folder voidcrew-weather)

Work only in this folder. Check with `npx tsc --noEmit`. Commit on this branch (if the commit is blocked by the sandbox,
say so in the notes); do not push. All new UI text through `src/i18n` (en + hu). Existing code: `src/render/weather.ts`
(CPU-updated instanced quads, capacity capped at 360), `src/game/types.ts` (`Weather`), `src/editor/WeatherFields.tsx`,
the call sites in `src/components/GameViewport.tsx` (search `weather`), map format in `src/game/mapFormat.ts`.
Dev server: start your own with a separate cache dir (see `concept/editor-ui/NOTES-fixes.md`, the `.editor-fixes-cache`
trick), another port than 3000.

## 1. Dense rain and snow (cheap)
The user cannot get a dense rain/snowfall even at the highest Amount; too many CPU-moved particles would cost FPS.
Make the particle motion run on the GPU, with zero per-frame CPU work per particle:
- One InstancedMesh (or instanced BufferGeometry) with a large fixed count (several thousand; scaled by the particle
  quality setting and the intensity), each instance has only a static random seed attribute.
- The vertex shader derives the position from the seed + time: a fall along the wind in a camera-centred repeating volume
  (wrap with mod, like the current `wrap`), snow drifts with a small sine sway, rain is a stretched streak along the fall
  direction. Material: transparent, depthWrite false, fog aware as now.
- Walls/floors/ceilings: a small DataTexture "column mask" around the camera (e.g. 32x32 cells, rebuilt only when the camera
  changes cell or the map changes; RGBA float or half-float: floor height, ceiling height, open-to-sky flag, valid flag),
  sampled in the vertex shader; a particle below the floor or above the ceiling of its column (or in a closed column
  without `indoors`) collapses to zero size. No CPU collision per particle. Cheap rain splashes on the floor are optional.
- Intensity 0..2 should now range from a drizzle to a downpour / blizzard (the current top value is the new "medium").
Keep the `Weather` type compatible (existing maps keep working).

## 2. Wetness slider
Add `wetness?: number` (0..1, default 0.6 when rain is on, 0 for snow) to `Weather`, a slider in `WeatherFields`, and the
map format. While it rains, surfaces should look wet: lower roughness (down towards 0.15), a touch darker albedo, and a
stronger specular/metalness-like sheen, scaled by the slider. Do it by patching the standard materials the scene uses for
walls/floors/props (`onBeforeCompile` or per-material uniform shared by all, as the light grid does: see
`src/render/lightGrid.ts` `useLightGrid`), driven by one shared uniform. Best: only where there is no ceiling (use the
column mask from part 1 sampled by world xz in the fragment shader); if that is too heavy, ship the global version first
and say so in the notes.

## 3. Snow cover (idea level, keep it simple)
When the weather is snow, whiten the floors (and the top faces of low props if easy) in the open-to-sky columns with a
`snowCover?: number` (0..1) slider, via the same column mask: blend the albedo towards a snow colour with a noise
breakup; leave walls (vertical faces) mostly untouched. If a texture-based approach is clearly cheaper (a tileable snow
texture blended by cover and slope), use that instead; explain the choice in the notes.

## Done when
tsc clean; with rain at max intensity the rain is clearly dense and the frame time barely changes versus no weather
(measure with the profiler approach in earlier notes or the in-game FPS), the wetness slider visibly changes floors/walls
under open sky and not indoors, snow cover whitens open floors. Write what you did and what is not verified to
`concept/editor-ui/NOTES-weather.md`.
