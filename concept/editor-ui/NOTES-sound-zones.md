# Sound zones and room echo

Map authors mark areas (rooms, corridors, halls) and give each an acoustics; the game plays every sound with the echo of
the room the listener stands in, and a zone's walls can dull sound that passes through them more. A map with no zones
still gets an automatic echo from each room's size. Branch `feature/sound-zones`. The author has simple sliders, no wall
types.

## Map format (additive: old maps parse as before)

`MapFile.acoustics?: AcousticZone[]` (src/game/acousticZones.ts):

```json
"acoustics": [
  { "name": "Great hall", "cells": [[2, 1, 11], [3, 1, 11], [4, 1, 11]], "preset": "hall",
    "reverb": 0.6, "decay": 2.2, "softness": 0.3, "insulation": 0.2 }
]
```

| field | meaning |
|---|---|
| `cells` | rows of the zone as `[y, x0, x1]` (x0..x1 inclusive), sorted by row then column. Compact, and a run is one readable line |
| `name` | optional, max 60 chars |
| `preset` | `corridor` / `room` / `hall` / `cave` / `outdoor` / `custom` |
| `reverb` | 0..1: how much of every sound comes back as echo (the wet level) |
| `decay` | 0.1..8 s: the echo's RT60 |
| `softness` | 0..1: how much the highs are soaked up (a soft room sounds dark) |
| `insulation` | 0..1: how much the zone's walls dull sound coming from outside (or going out) |

A value that is not written follows the preset (`custom` or no preset: the room's). The presets (`PRESETS`): corridor 0.35 /
0.6 s / 0.3 / 0.2, room 0.3 / 0.5 s / 0.5 / 0.3, hall 0.6 / 2.2 s / 0.3 / 0.2, cave 0.7 / 3.5 s / 0.75 / 0.1 (dark), outdoor
0 / - (no echo). `readZones` (the one reader) limits every number, drops cells that are off the map, in a wall or repeated, and
a cell named by two zones belongs to the later one. A zone that is no object, or has no cells, stays as an empty zone, so the
editor's indices (the list order) hold. `GameMap.acoustics` is the cleaned list (with a runtime-only `lost` count of dropped
cells, for the problems list). `structureKey` leaves the zones out: a zone edited is never a scene rebuild; the audio follows live.

## What the engine works out

1. `src/audio/acoustics.ts` (pure, tested):
   - **Rooms** (`autoRooms`): the connected areas of open cells (four neighbours) that walls and doors bound; a door cell, open or
     shut, is the border and belongs to no room (a sound in a doorway takes the first neighbour that is a room: W, N, E, S).
   - **Sabine** (`estimateReverb`): RT60 = 0.161 V / A. A cell is 2 m across and a wall height (the unit of floors and ceilings)
     is 3 m, so a plain 5 x 5 cell room is 10 x 10 x 3 m, V = 300 m3 (the volume sums each cell's own height: ceiling - floor).
     A = sum of surface x coefficient: walls, floor and ceiling 0.15..0.3 (by the softness, 0.4 for an automatic room: 0.21),
     a door 0.5, the sky and any open gap 1.0. Limited to 0.15..6 s. About 0.7 s for that room, ~1.7 s for 18 x 18 cells under
     a 9 m ceiling, ~0.45 s for a corridor. A room whose ceiling is mostly sky (`ceilingTextureAt` / `textures.ceiling` = "sky")
     or whose boundary is mostly doorway has no echo. The automatic wet level is mild: 0.12 + 0.1 x decay (max 0.45), less with
     openness; automatic insulation is 0.
   - `zoneAt(map, x, y)`: the cell's place - the zone it is in (`resolveZone`), else its room's estimate, else none (wall);
     `{ acoustics, source: "zone" | "auto" | "none", key, name?, preset? }`. Worked out once per map object (cached).
   - `estimateArea`, `connectedArea`: what the editor shows for a selection and what a Shift+click picks.
2. `src/audio/impulse.ts` (pure): `makeImpulse(decay, softness, sampleRate)` - two channels (different seeded noise: a wide echo)
   of 12 ms pre-delay + `decay` seconds, energy 1 each, an envelope falling 60 dB over the decay, and a low-pass gliding down
   over the decay (for softness 1 from 1.9 kHz to a quarter of that; 0: none) so the highs die first. `impulseParams` rounds the
   numbers to 0.05 so a slider drag does not make an impulse for every step.
3. `src/audio/roomMix.ts` (pure): `wetRatio(distance)` - 0.2 within a cell, smoothly 0.8 from 16 cells (a far sound is more
   echo); `wetSend(reverb, distance)` = the zone's reverb x that; `masterSend` - the Debug "Echo" slider (default 0.6 plays the
   zones' numbers as they are, 1.0 is 1.67x) and switch; `insulationFactor(i)` = 1 + 0.6 i; `createRoomTracker` - the listener's
   room counts only after 0.3 s in it (no flicker on a border), a zone edited (same key, other numbers) counts at once.
4. `src/audio/soundField.ts`: `muffle(walls, factor)` - each wall counts for `factor` walls (the cutoff slides along the octaves
   between the table's steps; beyond the third no worse, up to 200 Hz / -24 dB at the extreme); `SourcePlan.insulation` is the
   stronger of the listener's zone and the sound's zone, worked out by the sound system only for a sound with a wall in the way.
   The doorway's voice is not dulled, so insulation does not touch it.
5. `src/audio/soundSystem.ts`: `setAcoustics(at)` takes the map's `zoneAt` (the game wires it in `useGameAcoustics`, from App,
   so nothing in `GameViewport.tsx` changed); the listener's place is looked up when its cell changes, held by the tracker and
   told to the backend (`setRoom`); every voice's state carries `send`.
6. `src/audio/reverbBus.ts` + `engine.ts`: each voice sends `presence -> send gain -> bus` (after its fade, so the echo comes and
   goes with it, and after the walls' filter), and the bus is `high cut (softness) -> two ConvolverNodes cross-faded -> Howler's
   master gain` (so master volume and mute rule the echo, and the limiter is after it). A room change loads the new impulse
   into the idle convolver and cross-fades (equal power, 0.5 s, in 16 straight steps); changes sooner than 0.55 s wait; the last
   six impulses are cached. The send level is chased by the smoother (0.2 s). Settings (`voidcrew-sound`): `reverbAmount`
   (0.6), `reverbOn` (true). The Debug "Sound" section shows the zone (name, preset, decay, echo %) and the echo level in dB;
   the probe voices ("Sound (probe)") echo too.

## The editor

- **Minimap** (small and zoomed): Shift+click a walkable cell picks its connected area (pink); Ctrl+Shift adds another, Alt+Shift
  takes one off; Esc lets go. Plain clicks and the dragged block are as before (Shift does not start a block drag). Zones are
  tinted with their own colour (the selected one stronger); a "Zones" toggle in the header (the header wraps now).
- **Panel**: map settings ("Pályabeállítások", no object selected) -> "Sound zones" (`inspector/AcousticsFields.tsx`; opens by
  itself when cells are picked): the pick and its automatic estimate, "Make a zone of the selection", "Add the block" (the
  zoomed minimap's dragged block), the zone list, and for the selected zone name, preset, four sliders (reverb, decay, softness,
  insulation), "Use the automatic value", add / take the selection to / from the zone, delete. A preset writes its four numbers;
  a slider moves the zone to `custom` keeping the other numbers as heard. State and edits: `editor/useAcousticsEditor.ts`.
- **Edits** (`editor/acousticEdits.ts`, pure): create / delete / rename / preset / values / add / remove cells; a cell is in one
  zone only. `clearCells`, `fill` (so `fillCells` too) take the cells out of the zones; `resizeMap` moves them. Undo / redo
  through `applyEdit` (a slider drag is one step).
- **Area copy** (`AreaClip.zones`): the zone cells inside the area (relative, as runs) with the zone's settings; turned / mirrored
  with the cells; pasted as new zones in the target map (the area's old zone cells are cleared first).
- **Problems**: `zoneEmpty`, `zoneWalls` (cells that are walls or off the map). i18n: `src/i18n/{en,hu}/acoustics.ts`.

## Not done (on purpose)

- One zone = one echo: a single convolver bus for the listener's room; no per-source room, no echo of the *sound's* room heard
  through a wall, no early reflections or real room geometry (the impulse is statistical noise, not a ray trace).
- The room change is simple: the listener's cell decides, with a hold and a cross-fade; no blending by position inside a zone.
- No wall materials; the insulation is one slider per zone and only changes how much a wall dulls.
- Not shown in the 3D view (the minimap is enough); no sound files.
- Later: a sound probe (click a spot, hear it from here), wall materials, per-zone filters, the echo of a sound's own room.

## Tests

```
npx tsx src/game/acousticZones.test.ts   # runs, reading / cleaning, last zone wins, presets, parseMap, structureKey
npx tsx src/audio/acoustics.test.ts      # rooms (door / no door), Sabine, limits, sky, zoneAt, estimateArea, connectedArea
npx tsx src/audio/impulse.test.ts        # length, energy, falling envelope, softness dulls the highs, rounding
npx tsx src/audio/roomMix.test.ts        # wet ratio, send, master, insulation, muffle factor, room tracker
npx tsx src/audio/soundRoom.test.ts      # the system: room told, sends, hold, live edit, insulation through the voices
npx tsx src/editor/acousticEdit.test.ts  # edits, clear / fill / resize, area copy / turn / mirror / paste, problems
```

## Measurements (Chrome in the Vite dev server, 48 kHz, master volume 0.8; the Debug probe's pink noise 6 cells ahead)

| room (reverb / decay / softness) | dry L / R | echo bus | echo's tail |
|---|---:|---:|---|
| none (reverb 0) | -34.4 / -34.4 dB | silent | - |
| room (0.3 / 0.5 s / 0.5) | -34.2 / -34.4 dB | -53.3 dB | -30 dB per 0.25 s (about 0.5 s RT60) |
| hall (0.6 / 2.2 s / 0.3) | -34.2 / -34.2 dB | -48.1 dB | ~-6.5 dB per 0.25 s (about 2.3 s) |
| cave (0.7 / 3.5 s / 0.75) | -33.1 / -33.1 dB | -43.2 dB | ~-5 dB per 0.25 s (about 3 s, darker) |

Left and right are equal straight ahead: the echo does not shift the balance. A saw tone through a hall -> corridor-like
(0.6 s) change: the echo level moves 3 dB over ~0.14 s and then settles (the biggest step per 25 ms is 2.4 dB, the RMS window is
43 ms), no click. Hand listening is still the test.

## Kézi teszt (magyarul)

A teljes lista: `concept/verification-checklist.md`, a „Hangzónák és visszhang” pont.
