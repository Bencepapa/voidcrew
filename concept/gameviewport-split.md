# GameViewport split: plan and handover

`src/components/GameViewport.tsx` was a ~9,100-line React component holding the whole three.js scene lifecycle. The goal is to move
self-contained parts into small modules under `src/render/viewport/` without changing behaviour, so that agents and people can work
on one area without reading (or conflicting in) the giant file. Read `AGENTS.md` and the "GameViewport landmarks" table in
`CODEMAP.md` first; the table is the current map of the file and must be updated after every step.

## Status (2026-11-26)

`GameViewport.tsx`: 9,100 → 3,307 lines (step 6 started at 4,406).

| Step | What moved | Where |
|---|---|---|
| 1 | Module-level code: settings, constants, fog, camera, poses, sky, materials, markers, walls kit, scene cache | `settings.ts`, `constants.ts`, `fog.ts`, `camera.ts`, `poses.ts`, `sky.ts`, `materials.ts`, `markers.ts`, `walls.ts`, `sceneCache.ts`, ... |
| 2 | Post-processing, light bake runtime and inputs, sky surface | `postPipeline.ts`, `bakeRuntime.ts`, `bakeInputs.ts`, `skySurface.ts` |
| 3 | Smoke/fire, items and loot, editor/event/fence markers | `smokeFire.ts`, `itemsLoot.ts`, `editorMarkers.ts`, `eventMarkers.ts`, `fenceMarkers.ts` |
| 4 | Structural geometry: walls, floors/ceilings, backing, doors, props, relief, prop retexture | `baseGeometry.ts`, `structuralSurfaces.ts`, `structuralWalls.ts`, `structuralTiles.ts`, `structuralDoors.ts`, `structuralProps.ts`, `wallBacking.ts`, `reliefGeometry.ts`, `propRetexture.ts` |
| 5 | Actor rendering, interaction raycasts, combat aiming, light fixtures and pool | `actorRendering.ts`, `interactionRaycasts.ts`, `combatAiming.ts`, `raycastObjects.ts`, `aimHitPart.ts`, `lightFixtures.ts`, `lightPool.ts` |
| 6 | Resize, game and editor pointer input, top-down controls, editor picking and selection outlines | `viewportResize.ts`, `pointerInput.ts`, `topdownControls.ts`, `editPicking.ts`, `selectionBox.ts` |

## Remaining (suggested order)

1. **Per-frame loop** into `frameLoop.ts`. Move `renderFrame`, `animate` and the camera update. Keep the effect's cleanup order intact.
2. **Live map edits and visibility**: `setTopdown`, `applySight`, `applyStructure` into `liveEdits.ts` / `sightView.ts`.
3. **Scene setup in the main effect** (renderer, textures/materials wiring) into `sceneSetup.ts`, if it still pays off.
4. Props/refs/subscriptions at the top of the component: only if a clean hook (`useViewportRefs`) falls out naturally.

Stop when the component is mostly wiring (target: under ~1,500 lines); do not split for its own sake.

## How each step is done

- One step = one branch in its own worktree:
  `git worktree add ..\voidcrew-splitN -b feature/splitN main`, then
  `New-Item -ItemType Junction -Path ..\voidcrew-splitN\node_modules -Target C:\dev\js\voidcrew\node_modules`.
  Use only absolute paths inside the worktree.
- **Pure move, no behaviour change.** Follow the existing pattern: a `createX(deps)` factory that takes explicit dependencies
  (scene, camera, refs, other subsystems) and returns its functions plus a `dispose()`; `GameViewport.tsx` only imports, calls and
  disposes. Keep teardown symmetry (everything created is disposed in the same effect cleanup, in reverse order).
- Each new file under 600 lines. Pure logic (no React/three/DOM) goes in its own file with a neighbouring `name.test.ts` using
  `node:assert`.
- Only small edits to `GameViewport.tsx`; no i18n, release notes or user-visible changes (a refactor gets no release note).
- Update the CODEMAP "GameViewport landmarks" line ranges and the module list.
- Checks before handing back: `npx tsc --noEmit`, `npm run check` (all assertion scripts), `npm run smoke -- --only tesztsztori`
  (headless Edge; for bigger steps run `npm run smoke` for all maps).
- Do not commit, push or merge unless the maintainer says so; report the files created and the new line count.

## Mouse pickup regression (fixed 2026-11-26)

Hidden smoke markers intercepted both the press that starts a world-item drag and the release that picks up a loose item.
The affected raycasts were unchanged across split steps 4 and 5 (`52d3f59`, `441c4f5`).
Both paths now filter intersections through the same visibility check in `raycastObjects.ts`.
The regression test covers a hidden marker group and its raycastable child. The click and drag thresholds are unchanged.

## Pitfalls seen so far

- Merge conflicts in `GameViewport.tsx` with feature branches running at the same time: keep the moved code (HEAD side) and re-add
  what the feature added in the new module.
- An agent once wrote into the main checkout through relative paths: always use the worktree's absolute paths.
- On Windows `npm run check` may need a workaround for an account lookup error in the sandbox; remove any temporary workaround
  before finishing.
- Token measurement (concept/token-ledger.md): on a small, targeted task the split saved no tokens for a grep-driven agent; the gain
  is in parallel work without conflicts and in reading less for broader tasks.
