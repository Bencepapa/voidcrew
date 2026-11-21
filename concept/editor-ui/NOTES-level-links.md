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
