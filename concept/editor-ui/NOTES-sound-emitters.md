# Sound emitters

The first built-in sound asset: an emitter placed in a cell of a map, like a light or a smoke emitter - a generated
beep (a tone) or hiss (noise) that the player hears in 3D in the game, muffled by walls and arriving through doorways.
There is no sound file anywhere: the wave is made from a few numbers. Branch `feature/sound-emitters`.

## Map format (additive: old maps parse as before)

`MapFile.sounds?: SoundSpec[]` (src/game/sounds.ts), next to `lights` and `smokes`:

```json
{ "x": 9, "y": 1, "pos": [0, 0.5, 0], "kind": "tone", "wave": "saw", "pitch": 440, "volume": 0.6,
  "pulse": { "on": 0.3, "off": 0.7 }, "range": 4, "rolloff": 1, "active": true }
```

| field | meaning |
|---|---|
| `x`, `y` | the cell (integers; off the map: dropped) |
| `pos` | `[across, up, along]` from the cell's middle and floor; across/along -0.5..0.5 cells, up 0..8 wall heights; default `[0, 0.5, 0]` |
| `kind` | `"tone"` or `"noise"` (anything else: the sound is dropped) |
| `wave` | tone: `sine` (default) / `triangle` / `saw` / `square` |
| `pitch` | tone: Hz 55..2000 (default 440) |
| `noise` | noise: `white` (default) / `pink` / `brown` |
| `volume` | 0..1 (default 0.6) |
| `pulse` | none: a loop that never stops; `{on, off}` seconds: bursts (an `off` of 0 is no pulse); optional `attack` / `release` (seconds, 0..1, default 0.02): how long a burst takes to swell in / die away - the gate is smoothed, not a switch (only written when not the default) |
| `range` | cells, 0.25..32 (default 4): not heard at all from this far; it fades out over the last quarter |
| `rolloff` | 0.5..3 (default 1): how fast it dies away with distance (0.5 carries far, 3 is gone quickly) |
| `active` | `false`: silent until something switches it on (a lever, button or plate with a `sound` target, see below) |
| `id` | optional name (max 60 chars) for the operable targets to address the sound by, instead of its cell; a new sound does not inherit the last one's |

`readSound` (the one reader) limits every number and leaves off what doesn't belong to the kind, so a hand-edited
file can't make the engine misbehave. The editor keeps the raw file; `parseMap` gives `GameMap.sounds` cleaned (sounds
off the map or with no kind are left out - a damaged file can therefore shift the indices of the later ones).
`structureKey` leaves `sounds` out: a sound edited is **never** a scene rebuild (like the lights, "redone in place" -
the markers are rebuilt in `applyLightsRef`, the sound by the audio system).

## What the engine works out

Layers (each file does one thing; only the last touches Howler):

1. `src/audio/synth.ts` - pure: the samples. A tone is a band-limited sum of overtones with a **whole number of periods**
   in the buffer (the pitch is retuned by a hair to make it so), so it loops without a click; a noise is made once
   (fixed seed) with its end cross-faded into its start. Peak 0.9 for tones, an RMS of 0.28 for noises (capped at the
   peak): no clipping. The buffer is made **once per wave** (`waveKey`: kind + wave + pitch, or the noise colour) and
   cached; volume, range, pulse... are applied while it plays.
2. `src/audio/soundField.ts` - pure, tested: what the player hears, from the map alone (a `blocked(x, y)` callback).
   - **Pool:** the 12 nearest emitters within their range (3D distance; the ones already playing get half a cell of
     head start so two alike don't swap places).
   - **Walls:** `wallsBetween` walks the straight line from the listener to the sound through the grid (an exact
     traversal) and counts the blocked cells between, not the ones it starts and ends in; a line through the crack where
     two walls meet at a corner counts one. A shut door is a wall (the viewport's `blocked` says `door && !open`), an
     open one is not. `muffle(walls)`: 0 - none; 1 / 2 / 3+ - a low-pass at 1600 / 800 / 400 Hz (two in a row) and -6 dB
     per wall (0.5 ^ walls), no worse after the third.
   - **Doorways:** if there is >= 1 wall, one breadth-first search from the listener's cell (four neighbours, over
     cells that don't block, at most `range` steps; one search serves every blocked source) gives the shortest way to
     the sound's cell. If there is one, a **second voice** (the portal voice) is played from about 1 cell from the
     listener toward the **farthest cell of the way that is in clear sight** (the doorway - the first step alone could
     point at the wrong wall of a big room), with a level from the **length of the way** (never less than the straight
     distance), **not dulled**. The direct voice stays dulled, so the sound is heard from both places. Both voices play
     the same buffer.
   - **Distance:** `attenuation(d, range, rolloff)`: full up to 1 cell, then `1 / (1 + rolloff (d - 1))` (the air's
     1/d at rolloff 1), times a smooth fade to 0 over the last quarter of the range. The panner's own falloff is
     **switched off** (rolloffFactor 0): it only pans. (The task said panner refDistance / maxDistance; `inverse` ignores
     maxDistance, and the portal voice sits 1 cell away so it needs its own level anyway - one formula for both.)
   - **Behind the listener** (`behindness`, `rear.ts` `rearFilter(behind, strength)`): a low-pass and a little level
     straight behind, sides untouched. How much is the Debug "Dulling behind" strength 0..1 (saved with the master
     settings): 0 nothing, **0.5 (default) about 4 kHz and -2.5 dB** straight behind, 1 about 2 kHz and -6 dB (the first
     version, 720 Hz and -6 dB, was "under water"). It lives in the engine (it needs the listener every frame).
   - **Stereo balance** (`stereo.ts`, pure, tested): `pan = sin(azimuth) * width`. The width grows with the apparent
     distance (0.35 within a cell, 0.75 from 7 cells, smooth), is cut by up to 30% for a loud sound, and is at most 0.6 for
     the doorway's voice (its apparent distance is the way round). So both ears always hear a sound (a near one nearly in
     the middle, a far one up to ~14 dB down in the far ear) and a sound dead ahead or behind is in the middle. A sound on
     the listener's spot has no side (the azimuth fades in over half a cell). `VoiceTarget.distance` carries the apparent
     distance; the system puts `pan` in the `VoiceState`.
3. `src/audio/soundSystem.ts` - the controller, with the backend injected (so it is tested with a stand-in, no Howler).
   The searches (pool, walls, doorways) run when the **listener changes cells**, **5 times a second**, and on `invalidate`
   (a door moved: the viewport calls it when `openDoors` changes) and when the scene changes. Every frame: the voices'
   places, the distance levels, the pulse's gate (from the clock: a burst is on while `t mod (on + off) < on`), and the
   listener. A voice whose emitter leaves the pool, or whose wave changes (pitch...), is stopped (and a new one started).
   The editor is silent except the **preview** (the inspector's Listen button, which plays the selected emitter whether
   it is `active` or not; it stops when the selection, the map or the editor mode changes); the game always plays
   (not tied to the Play button - a sound doesn't hurt).
4. `src/audio/engine.ts` - Howler 2.2.4 on Web Audio behind `SoundBackend` (`start` / `set` / `stop` / `setListener`),
   plus the master volume and mute (kept in `localStorage` `voidcrew-sound`, in try/catch; the Debug panel's "Hang"
   section), the limiter on the master (a compressor: 30 voices must not clip), the HRTF toggle, the unlock of the
   audio context on the first pointer / key press (and Howler's own `autoUnlock`), and the context suspended while the
   page is hidden (no frames, no pulses). A voice's chain: `source -> panner -> rear low-pass -> rear gain -> wall
   low-pass x2 -> wall gain -> level -> pulse gate -> presence (fade) -> Howler's gain node -> master`.
   `src/audio/gameSound.ts` is the one instance; `audioProbe.ts` (the Debug "Hang (próba)" test buttons) now plays its
   test voices through the same engine and maths.
   **Smoothing** (`smoothing.ts`, pure, tested): nothing that is heard jumps. The engine chases each number with an
   exponential approach (the balance `TAU.pan` 0.12 s, loudness / walls' filter and level / shadow behind 0.2 s, the
   place 0.15 s; filter cutoffs in the log domain), a short glide on the parameter bridges two frames. A voice fades in
   and out (`presence` node: direct 0.06 s, doorway's voice 0.12 s = ~0.35 s to 95%). A pulse's gate follows its
   `attack` / `release` (a time constant of a third of it). **Panners:** by default a StereoPannerNode (Howler's `stereo()`)
   driven by `VoiceState.pan`; with the Debug HRTF switch the old 3D PannerNode (`pos()`, HRTF model) places the voice
   from its position instead and the stereo rules do not apply (the switch works on playing voices: they change over).
   `meter.ts`: a splitter and two analysers on the limiter's output give the left / right RMS (Debug line).

### The fragile place

Howler has no hook for effects, so the chain is wired through its internals: `Howl._soundById(id)._panner` (a
StereoPannerNode after `stereo()`, a PannerNode after `pos()` - Howler keeps both in `_panner`, and each call replaces
the other kind) and `._node` (see `wire` / `unwire` / `makePanner` in engine.ts, the only place they are touched). `unwire` puts Howler's own wiring back
before a voice is released, because Howler hands the same sound object to the next `play()`. Howler is pinned at 2.2.4.
If it changes, either mend `wire` / `unwire` or replace the engine with raw Web Audio nodes - nothing else knows.

## The editor

- Tool `sound` (the "Hangok" group in the asset tree: one entry per wave form and noise colour; it is also the layer
  name for the eye / lock toggles and the minimap's category). A click on a floor / ceiling puts an emitter in that
  cell, in the middle, at chest height (`[0, 0.5, 0]`), made from the last settings used (`templates.sound`); a click on
  a marker picks it, the right button deletes it; drag moves (Ctrl copies); arrows / PgUp / PgDn move it in the cell;
  Delete; undo / redo (one step per slider gesture); Select picks it too.
- Inspector (`inspector/SoundFields.tsx`): kind, wave / noise colour, pitch (a log slider and a number), volume, range,
  rolloff, repeat (continuous / pulse with on / off seconds), active, Listen; the spot in the cell in a Transform section.
- 3D marker: its own sign, a loudspeaker with sound waves (`render/soundGlyph.ts` path data, `render/soundIcon.ts`
  canvas texture) on a plane that faces the camera (it grows with the distance so it reads from the top-down view),
  **only while editing**; the selected one shows its range as a ring on the floor. Picking and dragging work on the
  plane. Minimap: the same glyph as SVG in the `sound` layer's teal.
- Also in the Inspector: the pulse's Attack / Release sliders and an optional Name (`id`).
- **Operable target** `{ kind: "sound", x, y, index? | id? | area?, action?: "on" | "off" | "toggle" }` on a lever, button or
  plate (the same panel, link mode - click the sound's sign - and area button as for smoke emitters; `game/operables.ts`,
  `game/soundOperables.ts`). A sound's on / off lives in the operable state's `emit` record under `sound:x,y[#n]` keys,
  published through `emitterView`; the viewport hands the sound system `isOn: soundsOn(map)` and calls `invalidate` when
  it changes. The map is never edited. Problems: `operableSoundMissing`, `operableSoundInactiveUnused`. Removing a sound
  fixes the targets that named it by its place in its cell (`fixTargetsBeforeRemove`).
- Area copy: `LOCAL_LISTS` has `sounds`; turning rotates `pos` with the cell (like a smoke's), mirroring flips across.
  `clearCells` / `fillCells` take sounds with the cell; `resizeMap` moves them.
- Problems panel (`soundProblems`, game/sounds.ts): volume 0, range < 1, a pulse with a 0 time; a sound inside a wall
  and two equal ones in a spot come from the shared placement checks.
- i18n: `src/i18n/{en,hu}/sound.ts`.

## Not done (on purpose)

- Sound files / an asset manager for them (uploading, a library); only the two built-in kinds.
- Room acoustics (reverb zones, a different tone in a big hall): done later, see `NOTES-sound-zones.md`.
- Event sounds: UI clicks, footsteps, doors, shots; NPC voices.
- Occlusion by props, floors and ceilings: only the grid's walls and shut doors count (a high ledge or a pit does not
  muffle; the vertical distance is in the distance, nothing else).
- A sound that is moving; the chance / `with` / `without` of variations (`Linked`) - sounds are always there.

## Tests

```
npx tsx src/audio/soundField.test.ts     # walls, muffling, the way round, pool, rear dulling, voices (the fixture map)
npx tsx src/audio/soundSystem.test.ts    # the controller with a stand-in backend
npx tsx src/audio/synth.test.ts          # the waves: no clipping, loop seams, pitches
npx tsx src/audio/smoothing.test.ts      # the exponential approach, the smoother, the gate's time constant
npx tsx src/audio/stereo.test.ts         # the balance: width by distance / loudness / doorway, the ears' gains
npx tsx src/audio/rear.test.ts           # the shadow behind: strengths, the default's 4 kHz / -2.5 dB
npx tsx src/audio/meter.test.ts          # RMS / dB
npx tsx src/game/sounds.test.ts          # reading / cleaning, pulse edges, id, parseMap, structureKey, problems
npx tsx src/game/soundTargets.test.ts    # the levers' sound targets, the system's view, problems, link / remove edits
npx tsx src/editor/soundEdit.test.ts     # edits, area copy / turn / mirror / paste, validate
```

## Measurements (branch `feature/audio-polish`; Chrome in the Vite dev server, 48 kHz, master volume 0.8)

A 440 Hz sine (volume 0.6, range 60) in an open room, the listener looking north, the output's left / right RMS from the
meter (`outputLevels`), averaged over 0.3 s after the voice settled; `pan` is what the system gave the engine:

| sound | pan | left dB | right dB | right - left |
|---|---:|---:|---:|---:|
| exactly right, 1 cell (volume 0.9) | 0.26 | -9.9 | -6.3 | 3.6 |
| exactly right, 1 cell | 0.29 | -13.7 | -9.6 | 4.1 |
| exactly right, 3 cells | 0.43 | -24.9 | -18.6 | 6.3 |
| exactly right, 8 cells | 0.73 | -39.9 | -26.4 | 13.5 |
| exactly right, 16 cells | 0.74 | -46.2 | -32.4 | 13.8 |
| exactly left, 3 cells | -0.43 | -18.6 | -24.9 | -6.3 |
| ahead, 3 cells | 0 | -20.7 | -20.7 | 0 |
| behind, 3 cells (default dulling; a sine is not dulled by 4 kHz, only the -2.5 dB shows) | 0 | -23.2 | -23.2 | 0 |
| *the old hard pan (pan 1.0), right, 1 cell* | 1 | **-332 (silent)** | -8.2 | - |
| HRTF mode, right, 1 cell / 3 cells | - | -10.1 / -18.9 | -5.2 / -14.0 | 4.9 / 4.9 |

Through a wall (x = 12, sound at 16,10, listener at 10,10, pink noise): door shut: direct voice only (pan 0.69), left -49
dB, right -36.9 dB; the doorway (12,6) open: the doorway's voice joins (pan 0.14, level 0.06, not dulled), left -39.1
dB, right -33.0 dB - the left ear gains 10 dB and the sides are only 6 dB apart.

The dulling behind (white noise, 3 cells, behind minus ahead): strength 0: 0 dB; **0.5 (default): -8.5 dB**; 1: -15 dB.
(The first version - 720 Hz and -6 dB - was about -19 dB on white noise by calculation.)

Transitions (tone, A/B with every time constant set to ~0): a wall disappearing (1 wall -> 0) steps the level by 1.8 dB
per 20 ms and settles in 88 ms without smoothing, 0.6 dB per 20 ms and ~430 ms with it; walking at 3 cells / s past a
doorway the biggest step per 40 ms is 2.2 dB without, 0.6 dB with smoothing; the left ear never drops below the right by
more than 9 dB there. The doorway's voice fades in in 355 ms and out in 353 ms (95%); a direct voice in ~180 ms. A pulse's
gate rises in about its attack (0 -> 5 ms, 0.02 -> 21 ms, 0.3 -> 307 ms, 1 -> 996 ms) and falls in about its release.
The meter and the A/B are crude (the RMS window is 46 ms; two identical tones played through two voices interfere by their
phase, so a tone through a doorway is a bad probe) - hand listening is still the test.

The fixture (`src/audio/soundFixture.ts`): two rooms, a wall with a door between them, the listener in one and a sound
in the other. Nobody has heard any of it yet: the logic is tested, the sound itself is not.

## Kézi teszt (magyarul)

A teljes lista: `concept/verification-checklist.md`, a „Hangelemek” pont.
