# Voidcrew code map

Voidcrew is a React 19, TypeScript, three.js and Vite game with an in-game grid map editor. It has two worlds, sci-fi Void Crew and Void Fantasy. The same viewport serves the game and the editor.

## Run and launch

- `npm run dev` serves Vite on port **3000**. `npm run build` builds the static app in `dist`. `npm run preview` serves that build locally.
- `src/main.tsx` installs bundled definitions, initializes the shared-file service worker and mounts the React shell.

| Query parameter | Effect and source |
| --- | --- |
| `?world=fantasy` or `?world=scifi` | Requests the starting world. World selection and build defaults live in `src/game/worlds.ts`. |
| `?map=tesztsztori` | Starts on a bundled map by filename stem when present. A valid map ID takes precedence over the world's default in `src/game/map.ts`. |
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
| 331–707 | `GameViewport` props, refs, subscriptions and selection of the settled scene map. |
| 708–1619 | Main scene effect, renderer, textures/materials and render passes. See `createWallKit`, `renderPost`, `renderGeometryView` and `applyMaterialViews`. |
| 1620–2866 | Structural geometry and model helpers. See `placeWalls`, `placeFloors`, `placeCeilings`, `buildBacking` and `wallGeometry`. |
| 2867–4265 | Fence markers, props and operables, smoke/fire, sound markers, items and trim. See `syncFenceMarkers`, `buildProps`, `applyProps`, `buildSmoke`, `buildSoundMarkers` and `buildItems`. |
| 4266–5054 | Light fixtures, top-down mode, visibility, edit previews and live scene updates. See `setTopdown`, `applySight`, `applyLights`, `applyStructure` and `updateLightPool`. |
| 5055–5847 | Actor and loot rendering, interaction raycasts and combat aiming. See `updateActors`, `updateLoot`, `findInteractionHit`, `updateAimFrame` and `shoot`. |
| 5848–7062 | Resize, pointer and drag handlers, top-down controls, picking, selection and markers. See `resize`, `onPress`, `onRelease`, `editTargetAt`, `updateSelectionBox` and `updateEventMarkers`. |
| 7063–7812 | Per-frame camera and rendering, animation loop and effect cleanup. See `renderFrame` and `animate`. |

## `src/render/viewport/`

- `settings.ts` - Viewport settings, types and device defaults.
- `contracts.ts` - Component props, aiming and editing contracts, and render stats.
- `constants.ts` - Shared viewport constants for scene geometry, textures and interactions.
- `walls.ts` - Wall and floor kits, panel geometry and relief LOD.
- `sceneCache.ts` - Bake cache, scene resource cleanup and rendered-spec comparison.
- `fog.ts` - Fog range and the guarded three.js shader-chunk patch.
- `lighting.ts` - Light pool, sight samples and fire flicker.
- `camera.ts` - Camera targeting, FOV, top-down controls and transitions.
- `materials.ts` - Direct-light occlusion and geometry debug materials.
- `actors.ts` - Actor and aiming render constants and the part-highlight shader.
- `sky.ts` - Sky textures and sky material.
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
| `src/components/GameViewport.tsx` | 7,812 | Scene lifetimes, live refs and per-frame performance. Preserve teardown symmetry and check rebuilds versus in-place edits. |
| `src/App.tsx` | 3,420 | Shared game/editor state and two UI layouts. Trace the action through its normal entry points. |
| `src/game/useGameState.ts` | 2,183 | Gameplay orchestration. Keep state transitions and side effects in their existing order. |
| `src/game/actors.ts` | 1,815 | Actor behavior and state. Exercise the affected actor paths. |
| `src/editor/AssetManager.tsx` | 1,245 | Asset editing, drafts and publishing. Check load, edit and save along the affected path. |
| `src/render/reliefMesh.ts` | 1,206 | Geometry generation. Check both normal and edge-case geometry. |

Keep edits in these files small and local. Put new logic in small modules and wire it in at the nearest existing boundary. See [AGENTS.md](AGENTS.md) for the working rules and verification commands.
