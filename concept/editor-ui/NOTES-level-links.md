# Links between maps (fantasy world): gates, stairs, loading pictures

Branch `feature/level-links`. Three stages, one commit each. Nothing here was
run in a browser (see "Not verified" at the end); `npx tsc --noEmit` and the
tsx tests are green.

## Stage 1 - gates

A gate is an **exit with a target**. `ExitSpec` (src/game/types.ts) got an
optional `to: MapLinkTarget`; an exit without one still ends the run, so the
sci-fi world is untouched.

```json
"exits": [
  { "x": 5, "y": 0, "name": "North gate", "to": { "map": "forest" } },
  { "x": 1, "y": 8, "to": { "map": "cellar", "arrival": "Hatch", "facing": "S" } },
  { "x": 9, "y": 4, "name": "Hangar bay" }
]
```

`to`: `map` is the target map's id (its file name); `arrival` (optional) is the
*name* of one of the target's gates, or a cell `{ "x": 3, "y": 2 }`; `facing`
(optional) is `N|E|S|W`; `loadingImage` is stage 3.

**Where the party arrives** (`resolveArrival`, src/game/mapLinks.ts, pure and
tested in mapLinks.test.ts): 1. `arrival` if it names a gate / is a walkable
cell of the target; 2. else the target's gate that points back to the map left
(same way as the lifts: `to.lifts.find(l => l.to === from.id)`); 3. else the
target's start. Facing: `to.facing`, else toward open ground (the start's
facing first).

**Game flow** (src/game/useGameState.ts `startTransit`, `linkPrompt`):
standing on a gate shows `GatePrompt` ("Leave <this> for <target>?", Enter /
Space = go, Esc = stay, plus two buttons for pointer / touch). Esc stays; the
question is not asked again until the party steps off the cell. Space on the
cell also goes (Use). Going: a `MapTransit` object (like the lift's `ride`) is
set, `GameViewport` fades a black sheet in over 700 ms (per frame, in
`renderFrame`), `startTransit` then swaps the map exactly as the lift does
(`readyMapRef = null`, `setMap`, `setPos`, ... , `pendingArrivalRef` until
`sceneReady`), the existing `LoadingScreen` covers the load, and on arrival the
black sheet and the loading screen fade out together. The party is held still
by `busy()` (a new `transitBusyRef`), and for free movement `inLift` (which the
hook now also returns true during a transit) freezes it. Arriving on a gate
does not prompt (the arrival cell is "quiet" until stepped off).

Not offered while editing (`variation === null`), nor during a lift ride,
terminal, keypad, aiming or when the crew is down.

**Missing target**: a log line ("The way is blocked: there is no map ...") on
stepping onto the gate / using it; a gate onto its own map is refused (free
movement could not re-seat the pose for a same-map jump). The editor flags it.

**Which maps can be targets**: whatever is in `MAPS` (src/game/map.ts: the
files under src/maps/, plus every map created or opened in the editor session
through mapStore - `createMap` puts it in `MAPS`). A shared map opened from
Supabase becomes a *local* id `shared-<uuid>`; a gate to it works while that map
is open, but the id is per session, so a saved gate should target a map saved
as a file (or created with an id of its own).

**Editor**: Exit tool (Events group) - the panel has Name, and in the fantasy
world **Leads to** (dropdown of the world's maps), **Arrives at** (auto / the
target's named gates), **Facing**. `updateExit` in mapEdits.ts; the old
`nameExit` is gone. Validation (validate.ts -> `linkProblems`): unknown target
= error, own map = error, arrival not found = warning, target has no way back =
warning (it arrives at the start). Exits are now also shifted when the grid
grows at the north / west edge (they were missed before). A gate's floor plate
is amber and says GATE.

Files: src/game/mapLinks.ts (+ .test.ts), src/components/GatePrompt.tsx,
src/editor/inspector/ExitFields.tsx, src/i18n/{en,hu}/links.ts.

## Stage 2 - stairs

A `stairs` list in the map file, a `StairsSpec` in `GameMap.stairs`. It shares
the link target (`to`), the arrival rules, the transit state and the map swap
with gates - one `startTransit(link)` in useGameState.ts, only the animation
differs.

```json
"stairs": [
  { "x": 3, "y": 2, "direction": "up", "name": "Tower stairs", "to": { "map": "tower-1" } },
  { "x": 7, "y": 5, "direction": "down", "style": "spiral", "to": { "map": "cellar", "arrival": "Way up", "facing": "N" } },
  { "x": 1, "y": 1, "direction": "up" }
]
```

`direction` is `up` or `down` (required), `style` is `spiral` or left out
(straight), `to` as for a gate (without it the stairs go nowhere yet: a log line
and an editor warning, not a load error). The cell must be a floor cell.

**Arrival**: as for gates, but the way back is looked for among the target's
links with the *same kind first, and for stairs the other way first* - going up,
you come out of the target's stairs down. A name can be a gate's or a
staircase's (`namedPlaces`).

**Game**: stepping onto the cell takes the stairs (no question - the brief says
"standing on the cell triggers"). The viewport lays a timed offset over the
camera for `MapTransit.kind === "stairs"` (1.5 s): the eye walks 0.55 cell ahead
and rises (up) or sinks (down) 0.7 wall heights, a spiral also turns the view
half round (clockwise up, counter-clockwise down), and the black sheet fades in
over the last 60 %. Then the same swap / loading screen / fade in as a gate. The
pose kept in `liveRef` is not touched by the offset, so the arrival starts clean.
The arrival cell is quiet (no immediate re-trigger); Use (Space) on a staircase
takes it again, so arriving on the way back and pressing Space returns. In free
movement just walking over the cell triggers it. Taking stairs is refused (log) if the
target map doesn't exist or is the map itself; the cell stays quiet until stepped off.

**Marker**: the cheapest thing that reads - a floor plate like the exits' (a
canvas texture: four steps rising / sinking, a spiral for spiral stairs, UP /
DOWN, cyan up / violet down, throbbing). No 3D steps.

**Editor**: a *Stairs* entry in the asset tree's Traverse group (fantasy maps
only), tool `stairs`: click a floor to place (up, straight), click again to
pick, right click removes. `StairsFields.tsx`: direction, style, name and the
shared `LinkTargetFields.tsx` (target / arrival / facing, also used by the Exit
panel). `toggleStairs` / `updateStairs` in mapEdits.ts; stairs are shifted with
the grid and cleared with their cell like the other lists; validate.ts treats
them as exits (a map with only stairs has no "no exit" warning) and as gameplay
objects for the inside-a-wall check. The minimap marks them with the exits'
marker (same layer toggle; they can't be picked from the minimap).

Files: src/components/GameViewport.tsx (`makeStairsMarker`, the camera offset),
src/editor/inspector/{StairsFields,LinkTargetFields}.tsx.