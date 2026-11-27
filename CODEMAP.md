# Voidcrew code map

Voidcrew is a React 19, TypeScript, three.js and Vite game with an in-game grid map editor. It has two worlds, sci-fi Void Crew and Void Fantasy. The same viewport serves the game and the editor.

## Run and launch

- `npm run dev` serves Vite on port **3000**. `npm run build` builds the static app in `dist`. `npm run preview` serves that build locally.
- `src/main.tsx` installs bundled definitions, initializes the shared-file service worker and mounts the React shell.

| Query parameter | Effect and source |
| --- | --- |
| `?world=fantasy` or `?world=scifi` | Requests the starting world. World selection and build defaults live in `src/game/worlds.ts`. |
| `?map=tesztsztori` | Starts on a bundled map by filename stem when present. A valid map ID takes precedence over the world's default in `src/game/map.ts`. |
| `?reflectionTest=1` | Adds a chrome test sphere at the starting position. The `reflectiontest-room1` map shows it by default. |
| `?play=on` or `?play=off` | Starts in Play or Wander mode. The in-page Play toggle takes precedence after use. See `src/game/playModeLogic.ts`. |
| `?shared=on` or `?shared=off` | Overrides automatic shared-store loading for this page load. `?shared=none` disables shared-store configuration. See `src/editor/autoSharedPolicy.ts` and `src/editor/sharedAuth.ts`. |
| `?story=on` or `?story=off` | Forces the bundled test campaign on or off ahead of its stored preference and the implicit `tesztsztori` map-prefix trigger. See `src/story/tesztsztori-switch.ts`. |

## Modules

| Path | Start here for |
| --- | --- |
| `src/App.tsx` | React shell tying game state, viewport, map loading, editor input and panels together. |
| `src/game/` | Movement, combat, actors, inventory, interactions and world rules. |
| `src/game/useGameState.ts` | Main game simulation hook and action wiring. |
| `src/game/useFreeMovement.ts` | Free-movement controls and updates. |
| `src/game/useOperables.ts` | Operable runtime wiring. |
| `src/game/useLocks.ts` | Lock runtime wiring. |
| `src/components/GameViewport.tsx` | Three.js scene lifecycle, rendering, picking and editor feedback. See the section index below. |
| `src/game/mapFormat.ts` | JSON-facing `MapFile` and `parseMap`, which converts it to runtime data. |
| `src/game/types.ts` | Runtime `GameMap` and game types. The parsed map carries derived cells, runtime specs and `structureKey`. |
| `src/maps/` | Bundled JSON content under `src/maps/fantasy/` and `src/maps/scifi/`, loaded by `src/game/map.ts`. |
| `src/editor/` | Tools, edits, selection UI, asset management, validation and map storage. |
| `src/editor/EditorBar.tsx` | Editor tool configuration and types shared by editor UI. |
| `src/editor/FloatToolbar.tsx` | Floating tool controls. |
| `src/editor/mapEdits.ts` | Tool types, map edits and resizing. |
| `src/editor/Inspector.tsx` | Selection dispatch to the per-kind panels in `src/editor/inspector/`. |
| `src/editor/mapStore.ts` | Local map storage and map IDs. |
| `src/components/Minimap.tsx` | Map drawing, markers and cached chart data. |
| `src/render/` | Rendering helpers for materials and textures, relief geometry, light baking, effects and editor previews. |
| `src/audio/` | Audio engine, synthesis, sound propagation and gameplay audio. |
| `src/game/story/` | Story parsing, validation, engine, runtime and game host integration. |
| `src/story/` | Twee campaign sources, examples and loading logic in `src/story/load.ts`. |
| `src/i18n/en/`, `src/i18n/hu/` | Paired message modules by feature. |
| `src/i18n/index.ts` | Dictionary registration, typed keys, `t` and the language hook. |
| `src/editor/sharedAuth.ts` | Shared-store configuration, authentication and Supabase requests. |
| `src/editor/sharedCommon.ts` | Shared dialogue and shop loading and publishing. |
| `src/editor/sharedMaps.ts`, `src/editor/sharedMapHeads.ts` | Shared map persistence and per-world map-head state. |
| `src/editor/sharedTextures.ts`, `src/editor/sharedImages.ts` | Shared textures and image assets. Related shared modules handle actors, props and door types. |
| `src/editor/sharedCache.ts` | Browser caching for shared-store data. |
| `src/editor/sharedServiceWorker.ts`, `public/sw.js` | Worker registration and caching of immutable Supabase revision files. |
| `public/` | Static textures, sprites and other assets served by Vite. |
| `scripts/` | Map validation, shared-store bundling, packaging and asset tools. |
| `concept/` | Plans, experiments and manual verification. Feature notes live in `concept/editor-ui/`. Confirm planned behavior against the source. |
| `EDITOR_UI_PLAN.md`, `docs/README.md` | Editor UI design and the index of Hungarian authoring guides. |

## GameViewport landmarks

Approximate line ranges. Search for the named functions as the file moves.

| Lines | Subsystem and anchors |
| --- | --- |
| 135–517 | `GameViewport` props, refs, subscriptions and selection of the settled scene map. |
| 518–1142 | Main scene effect, renderer, texture kits and surface setup. See `createWallKit`, `createBakeRuntime`, `createPostPipeline` and `createSkySurface`. |
| 1143–1324 | Structural geometry and door label materials, props, operables, particles, markers, items and trim. See `createStructuralSurfaces`, `createPropModels`, `createPropScene`, `createSmokeFire`, `createLootChalk`, `createItemsLoot` and `createTrim`. |
| 1325–1350 | Fixtures, light pool, visibility and live edit wiring. See `createLightFixtures`, `createLightPool`, `createSightView` and `createLiveEdits`. |
| 1351–1370 | Actor rendering, interaction raycasts and combat aiming. See `createActorRendering`, `createInteractionRaycasts` and `createCombatAiming`. |
| 1371–1398 | Resize, pointer input, top-down controls, picking and selection wiring. |
| 1399–1506 | Frame loop, debug capture and scene cleanup. See `createFrameLoop` and `createFrameDebug`. |
| 1508–1529 | Viewport DOM, editor controls and loading overlay. |

## `src/render/viewport/`

- `settings.ts` - Viewport settings, types and device defaults.
- `contracts.ts` - Component props, aiming and editing contracts, and render stats.
- `constants.ts` - Shared viewport constants for scene geometry, textures and interactions.
- `walls.ts` - Wall and floor kits, panel geometry and relief LOD.
- `baseGeometry.ts` - Shared flat and beveled wall and floor geometry.
- `structuralSurfaces.ts` - Cell surface slots, wall/floor/ceiling placement and ceiling materials.
- `wallBacking.ts` - Opaque backing mesh behind relief wall faces.
- `reliefGeometry.ts` - Height grid loading, relief geometry caching and distant variants.
- `structuralWalls.ts` - Wall geometry variants, placement scheduling and corner joins.
- `structuralTiles.ts` - Windows, ceilings and floors, including async relief builds.
- `structuralDoors.ts` - Door frames and leaves, plus the cutout relief builder used by props.
- `structuralProps.ts` - Cabin glass, pillar and chamfer builders.
- `propModels.ts` - Prop, fence and foliage model building, including billboard and round-part materials.
- `propScene.ts` - Model caching, prop placement, live updates, operable poses and editor wires.
- `propModelInputs.ts` and `propModelInputs.test.ts` - Pure prop texture-set selection and model cache keys.
- `lootChalk.ts` - Chalk materials and emptied-container lid poses.
- `trim.ts` - Ladder and bridge geometry, paint, hazard stripes and double-sided grate materials.
- `propRetexture.ts` - Pure property overrides for retextured props.
- `sceneCache.ts` - Bake cache, scene resource cleanup and rendered-spec comparison.
- `fog.ts` - Fog range and the guarded three.js shader-chunk patch.
- `lighting.ts` - Light pool, sight samples and fire flicker.
- `camera.ts` - Camera targeting, FOV, top-down controls and transitions.
- `materials.ts` - Direct-light occlusion and geometry debug materials.
- `actors.ts` - Actor and aiming render constants and the part-highlight shader.
- `actorRendering.ts` - Actor sprites, materials, animation, shadows and sheet alpha sampling.
- `interactionRaycasts.ts` - Pointer and Use interaction picking, including editor event markers.
- `pointerInput.ts` - Game clicks and pickup drags, editor clicks, paint strokes and object dragging.
- `topdownControls.ts` - Top-down input listeners, keyboard state, wheel zoom and tilt, middle-button pan.
- `editPicking.ts` - Editor raycasts, drag-plane intersections and cached hover targets.
- `selectionBox.ts` - Selection and hover outlines, cursor light and surface reporting.
- `frameLoop.ts` - Camera updates, per-frame rendering, stats and animation scheduling.
- `frameDebug.ts` - On-demand capture, render diagnostics and smoke benchmarking.
- `sightView.ts` - Top-down view, sight cells and object and surface culling.
- `liveEdits.ts` - In-place map updates, structural previews and bake scheduling.
- `viewportResize.ts` - Canvas sizing, camera projection and resize observer.
- `combatAiming.ts` - Aim overlay hit chances, party cover, shots and tracers.
- `aimHitPart.ts` and `aimHitPart.test.ts` - Body-part selection and assertions.
- `raycastObjects.ts` - Shared visibility, material and object ancestry checks for picking.
- `lightFixtures.ts` - Map light state, glowing fixtures and live ceiling panel updates.
- `lightPool.ts` - Point light slot assignment, reach masks, and transient and dynamic sources.
- `postPipeline.ts` - Composer, map colour look and geometry-view rendering, including face cutouts.
- `bakeRuntime.ts` - Light bake worker and fallback, initial bake and edit scheduling.
- `bakeInputs.ts` - Light bake densities, inputs and cache key.
- `bakeInputs.test.ts` - Assertions for bake inputs, keys and the quick-density decision.
- `skySurface.ts` - Lazy sky material, gradient and image loading, and shared-image subscription.
- `sky.ts` - Sky textures and sky material.
- `smokeFire.ts` - Emitter particles, weather, fire light data and emitter markers.
- `smokeShapeKey.ts` - Emitter spec comparison for rebuilds versus in-place updates.
- `smokeShapeKey.test.ts` - Assertions for emitter rebuild keys.
- `itemsLoot.ts` - Item templates, loose items and loot spill, drop and pickup animation.
- `editorMarkers.ts` - Sound signs and range rings, and exit and stair plates.
- `eventMarkers.ts` - Event sprites and prop lock markers.
- `fenceMarkers.ts` - Fence floor marks and their attachment during editing.
- `foliageMesh.ts` - Layered / X fence (foliage) pieces: the planes' relief panels merged into one model with merged distant versions.
- `loot.ts` - Item sprite and loot spill settings.
- `editor.ts` - Edit indicators and tool mappings.
- `poses.ts` - Jump and ladder poses, interpolation and easing.
- `markers.ts` - Event, exit and stair markers and the emptied-container chalk cross.
- `pixels.ts` - Clockwise RGBA image rotation.
- `LoadingScreen.tsx` - Loading and transit overlay.

## Where do I change it?

### Add a map element end to end

1. Add an optional serialized field to `MapFile` and the runtime field to `GameMap`. Put defaults, bounds and cleanup in a small reader called by `parseMap`. Keep existing JSON readable and check how rejected records affect editor selection indices. The sound example is in `src/game/sounds.ts` and [the sound emitter notes](concept/editor-ui/NOTES-sound-emitters.md).
2. Decide how it updates the scene. `parseMap` starts the `structureKey` from the file and excludes or projects fields that have other update paths. Include fields that require structural rebuilds. For live-only fields, exclude them and wire the consumer to the latest map. Check `GameViewport`'s settled scene selection and `applyStructure` for immediate previews versus full rebuilds.
3. Add the tool and immutable add/edit/delete operations, connecting the relevant controls in `src/editor/EditorBar.tsx` or `src/editor/FloatToolbar.tsx` and the handlers in `src/App.tsx`. Add the field panel and register its kind in `src/editor/Inspector.tsx`. Check undo/redo and coordinate shifts during resize in `src/editor/mapEdits.ts`.
4. Wire three.js rendering and disposal in the viewport, along with marker visibility, picking and selection feedback where applicable. Update `src/components/Minimap.tsx` markers and the chart cache key when marker data changes.
5. In `src/editor/areaClipboard.ts`, check collection, rotation/flip, paste and clip parsing. Decide which embedded references survive a copy. Update runtime and file placement checks in `src/editor/validate.ts` and use `scripts/validate-maps.ts` to check bundled content.
6. Add both translations, adjacent `node:assert` tests for the reader and pure edits, and coverage for parse compatibility, clipboard behavior and validation where relevant. Add a release item and an unchecked browser check for the user-visible feature.

### Add a Debug panel setting

Use `src/components/DebugPanel.tsx` and its typed `set` helper for viewport settings. Add the field to `ViewportSettings` and `DEFAULT_SETTINGS` in `src/render/viewport/settings.ts`. `src/App.tsx` owns viewport settings and supplies the panel in both layouts. Wire the consumer and test the default and the changed value. Check `src/game/renderLook.ts` for settings persisted with the map. For independent Debug controls, follow the subsystem pattern in `src/components/SoundSection.tsx`. Add labels to `src/i18n/en/debug.ts` and `src/i18n/hu/debug.ts` or the corresponding feature pair.

### Add an i18n string

Add the same key and interpolation names to both feature dictionaries. Call `t(key, values)` through `src/i18n/index.ts`. For a new dictionary pair, import and spread both modules in the corresponding language objects in that index. Use `useLang()` where a component needs its own language-change subscription.

### Add a release note and a manual check

Add one Hungarian `{ title, text }` item per user-facing feature to `items` in the top release in `src/releaseNotes.ts`. Use a short title and one sentence. A new release object changes the app's version. Bump the release or package version only when asked.

Add an unchecked Hungarian `- [ ]` item in the relevant section of `concept/verification-checklist.md` with reproducible steps and expected results. Check it off after performing the manual verification.

## Largest source files

Line counts at the time of writing.

| File | Lines | Editing risk |
| --- | ---: | --- |
| `src/components/GameViewport.tsx` | 1,529 | Scene lifetimes, live refs and per-frame performance. Preserve teardown symmetry and check rebuilds versus in-place edits. |
| `src/App.tsx` | 3,420 | Shared game/editor state and two UI layouts. Trace the action through its normal entry points. |
| `src/game/useGameState.ts` | 2,183 | Gameplay orchestration. Keep state transitions and side effects in their existing order. |
| `src/game/actors.ts` | 1,815 | Actor behavior and state. Exercise the affected actor paths. |
| `src/editor/AssetManager.tsx` | 1,245 | Asset editing, drafts and publishing. Check load, edit and save along the affected path. |
| `src/render/reliefMesh.ts` | 1,206 | Geometry generation. Check both normal and edge-case geometry. |

Keep edits in these files small and local. Put new logic in small modules and wire it in at the nearest existing boundary. See [AGENTS.md](AGENTS.md) for the working rules and verification commands.
