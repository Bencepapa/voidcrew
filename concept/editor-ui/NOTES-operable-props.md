# Operable props: lever, button, pressure plate, trap cell, wall traps (feature/operable-props)

## 1. Design summary (written before coding; kept up to date at the end of the file)

### What exists (and is reused)

- **Interactions** (`src/game/interactions.ts`): `Interaction` events (`message`, `image`, `dialogue`, `shop`) hang on
  props, decals, doors, items, actors and wall faces. The viewport (`GameViewport.tsx`) raycasts the click / Use
  (`findInteractionHit`, `activateInteraction`, `useInteraction`), `interactionAt(map, target)` maps a hit to its
  event and `App.openInteraction` consumes it. The editor's "Events" group places those (`selectEventTarget`).
- **Story** (`src/game/story.ts`): `Lock` (`key` flag / `hack` / `code` / `chance` / `message`) on a door
  (`DoorSpec.lock`, parsed straight from the map file) and on terminals; `Trigger` (`enter`/`read`/`open`/`pickup`/`start`
  -> `do: ["open:x,y", ...]`); `unlockedFlag(mapId, cell)`; a key is simply a **flag** a picked-up story item raises
  (`MapItem.sets`, `MapItem.name`). `runActions` in `useGameState.ts` executes `open:x,y` through `storyRef.current.open`.
- **Doors**: a door is a `door` cell in the layout (+ optional `DoorSpec`). It is open when its `x,y` key is in the
  `openDoors` set of `useGameState` (the viewport animates the panel from that set, `doorCrossed()` in `map.ts` blocks
  steps through a door plane that is not in the set). Standard doors stay open; lift doors close by timer.
- **Props** (`src/game/props.ts`): `PROP_TYPES` kinds (`box`, `views`, `panel`, ...), `PropSpec` in the map's `props`
  (cell, `at` anchor, `rotation`, `elevation`, ...), `wall: true` types hang on the wall they are anchored to. New kinds are
  built in `buildPropTemplate` of the viewport (roof / fence kinds are the examples). Edit-only floor marks use a child
  named `fenceMarker` (shown only while editing, see `syncFenceMarkers`) - reused here.
- **Editor**: the asset tree (`AssetTree.tsx`) lists props by kind for the Prop tool, `Inspector` -> `PropFields`,
  edits are pure functions on the `MapFile` (`mapEdits.ts`, `updateProp`), run through `applyEdit`. `validate.ts`
  produces the minimap problem list, `Minimap.tsx` draws markers.
- **Damage to the party**: there is no projectile system for enemies hitting the party - `useGameState`'s actor tick
  rolls a hit and then picks a random standing crewmate (`crewRef`, `setCrew`, `setHurtAt` flash, `wipeIfDown`).
  The fire damage block is the pattern; a trap does the same (an instant hit: log line + red flash).
- **Items on cells**: loose `MapItem`s are picked up when stepped on; items can **not** be dropped into the world yet
  (the inventory only moves between slots), so the "item on a plate" case cannot happen today.

### What is new

- `src/game/operables.ts` - the pure model: types (`OperableSpec`, `OperableTarget`), `readOperable` (parse/clean),
  the state (`OperableState`) and the reducers (`operate`, `evaluatePlates`, `tick`), trap line tracing, the effect list
  the runtime applies, validation (`operableProblems`), `relocateOperable` for area copy. No three.js, no React.
- `PropSpec.operable` / `DecalSpec.operable` in the map JSON (additive; a map without them parses as before).
- New prop kind `operable` (`lever1`, `button1`, `plate1`, `trapcell1`, `arrowslit1`, `glyph1`) built from plain
  three.js boxes in `src/render/operableModel.ts` (no artwork files), with a live pose (lever up/down, button
  sunk, plate pressed).
- `src/editor/operableEdits.ts` - pure edit functions on the `MapFile` (add / remove / change target, set defaults) and
  the Inspector section `OperableFields` with a "link target" mode (click a door or a trap in the view).
- Runtime hook `src/game/useOperables.ts` (called from `useGameState`) applies the effects: doors via the existing
  `storyRef.open` / the `openDoors` set, traps hurt the crew like the fire does.

## 2. Data format

(see the end of this file - filled in with the final format)
