# Operable props: lever, button, pressure plate, trap cell, wall traps (feature/operable-props)

## 0. Fire, poison-smoke and spawn traps (feature/fire-trap-effects): design summary

Goal: a lever / button / plate / trap cell can switch smoke-fire emitters on and off (one, a cell's, or all in an area),
raise a damaging poison smoke, bring dormant NPCs and items into the world, and pay credits / items straight to the party.
Everything is additive to the operable model below (`OperableSource` -> `targets[]`); no new top-level map arrays.

**What exists and is reused**

- Emitters: `SmokeSpec` (`types.ts`; `effect`, `color`, `blow`, `fire`, `light*`, `Linked` ids) in `map.smokes`; the viewport
  (`GameViewport.buildSmoke`) turns each into a particle emitter (+ a fire light for `effect: "fire"`) and an edit marker;
  the editor's panel is `SmokeFields.tsx` over `updateSmoke` (`mapEdits.ts`). A fire burns its own cell: `fire.ts fireCells`,
  read by the actor tick in `useGameState` (only `if trapsActive()`, see `playMode.ts`).
- Operables: `operables.ts` is the pure state machine (`work` runs a source's targets as it goes on / off),
  `useOperables.ts` the runtime (doors, flags, `hurt`), `operableStore.ts` the pose store the viewport reads,
  `operableEdits.ts` / `OperableFields.tsx` / `operableLink.ts` the editor (targets list + link mode).
- NPCs: `ActorSpec` -> `createActors` / `actorFromSpec` (`actors.ts`; the actor's id is its index in `map.actors`; `arrive`
  reinforcements are made with `actorFromSpec` in `useGameState.alertTick`). Items: `map.items`, hidden once their
  `lootKey` is in `looted`. Credits: `meta.ts setCredits` / `getMeta`; items `addToHaul`.

**Decisions**

- **Addresses** are absolute and explicit: a target names `x,y` (+ optional `index` = the n-th entry of that kind in the cell,
  in file order), or an `id` (the `Linked` id), or an `area` rectangle `{x0,y0,x1,y1}` (all entries inside it). Variation
  (`chance`) can drop entries, so the playing map is searched, not the file's index.
- **Emitters on/off**: `SmokeSpec.active` (default true; false = "inactive until switched on"). The runtime keeps an
  `emit` map (emitter key `x,y#n` -> on) inside `OperableState` (resets with the deck, like the levers); the store
  `emitterStore.ts` publishes it, the viewport hides inactive emitters (rebuilds the particle systems only when the set of
  shown emitters changed), the editor always shows all of them.
- **Fire kind / colour / presets** are patches of the existing smoke fields (`emitterPresets.ts`): Fire, Blue fire, Green
  fire, Smoke, Steam, Poison smoke, Flame jet from the wall (blow away from the wall the emitter sits against).
- **Poison smoke** = `SmokeSpec.harm {damage, every, reach, label}`: while the emitter is on and `trapsActive()`, a crewmate
  standing within `reach` steps (walkable cells, 0..3, default 1) takes `damage` every `every` s through the same `hurt`
  path as the wall traps. The fire keeps its own-cell burn but now also needs the emitter to be on.
- **Spawn**: `ActorSpec.dormant` ("appears when triggered") - `createActors` leaves it out of the world until a `spawn`
  target brings it in (`actorFromSpec` with its map index as id, so the killed-wreck bookkeeping keeps working).
  `ActorSpec.dormant` is the *map* flag; `ActorState.dormant` (powered down, waiting for the alert) is unrelated.
- **Items**: `MapItem.dormant`; hidden through the existing `looted` set until an `item` target reveals it (and kept
  revealed for the run).
- **Reward**: `{kind:"reward", credits?, items?:[{item,qty}], once?}` - once-only by default, remembered with a run flag.
- **Play mode**: harm (fire, poison, shots) only while `trapsActive()`; emitters still draw in wander mode; spawned
  enemies appear but are held by the existing `holdEnemies`.

**Not in this feature**: ceiling-lowering and chasm traps (saved for later).

## 1. Design summary (written before coding; kept up to date)

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
- **Key doors** already existed on the game side (`DoorSpec.lock.key` = a flag, `Lock.message`, hack, code) and the Door
  panel had the key / hack / code / message fields. What was missing: no way to make a placed *item* a key (its `name`
  and `sets` could only be written by hand) and no list of the keys the map has.

### What is new

| piece | file |
|---|---|
| pure model: types, parsing, state machine, trap line, problems, area-copy relocation | `src/game/operables.ts` (+ `operables.test.ts`) |
| `PropSpec.operable` / `DecalSpec.operable` in the map JSON | `types.ts`, `mapFormat.ts` |
| six prop types (`kind: "operable"`) | `props.ts`, `worlds.ts` (offered in both worlds) |
| models from plain boxes with a live pose | `src/render/operableModel.ts` |
| pose store (game -> viewport) | `src/game/operableStore.ts` |
| lever / button touch (click and Use) | `interactions.ts` (`OperateEvent`, `touchAt`), small hooks in `GameViewport.tsx`, `App.tsx` |
| runtime (doors, traps, flags) | `src/game/useOperables.ts`, one call in `useGameState.ts` |
| edit functions, link-mode target picking | `src/editor/operableEdits.ts`, `operableLink.ts` (+ tests) |
| Inspector fields | `src/editor/inspector/OperableFields.tsx` (+ lines in `PropFields`, `DecalFields`) |
| asset tree group "Operable" | `src/editor/operableEntries.tsx` |
| problems, minimap links and floor marks | `validate.ts`, `Minimap.tsx` |
| key doors | `src/game/keys.ts` (+ test), item panel and door key list |
| strings en + hu | `src/i18n/en/operable.ts`, `hu/operable.ts` |

## 2. Data format

Everything is additive: a map without these blocks parses exactly as before. Operable props are ordinary `props`
entries (the Prop tool places them); the block `operable` carries what they do. Absent fields mean the defaults.

```jsonc
// a lever on the north wall of cell (1,1): pulling it opens the door at (3,1) (forcing a lock) and toggles the one at (7,3)
{ "prop": "lever1", "x": 1, "y": 1, "at": "N",
  "operable": { "targets": [ { "kind": "door", "x": 3, "y": 1, "force": true },
                              { "kind": "door", "x": 7, "y": 3, "action": "toggle" } ] } }

// a button that springs back after 4 s, taking the door with it (hold is the default); a story flag while pressed
{ "prop": "button1", "x": 5, "y": 1, "at": "N",
  "operable": { "mode": "momentary", "delay": 4, "flag": "vault_open", "targets": [ { "kind": "door", "x": 6, "y": 3 } ] } }

// a pressure plate: the door is open while the party (or, one day, an item) is on it; "hold": false latches it
{ "prop": "plate1", "x": 2, "y": 2, "at": "center", "operable": { "targets": [ { "kind": "door", "x": 4, "y": 1 } ] } }

// a trap cell (looks like the floor): stepping on it fires the wall trap in cell (6,2) hanging on its east side
{ "prop": "trapcell1", "x": 3, "y": 2, "at": "center", "operable": { "once": true, "targets": [ { "kind": "trap", "x": 6, "y": 2, "side": "E" } ] } }

// the wall traps (they only fire when a source names them): an arrow slit and a spell glyph
{ "prop": "arrowslit1", "x": 6, "y": 2, "at": "E", "operable": { "damage": 7, "range": 6, "cooldown": 1.5 } }
{ "prop": "glyph1",     "x": 1, "y": 2, "at": "W", "operable": { "projectile": "spell", "damage": 9 } }

// a painted button on a wall that really works (any decal can carry the block; `kind` is lever or button)
{ "decal": "button_red", "x": 1, "y": 2, "surface": "W", "px": 100, "py": 90, "operable": { "kind": "button", "targets": [ { "kind": "door", "x": 3, "y": 1 } ] } }
```

Fields of `operable` (all optional):

| field | meaning |
|---|---|
| `targets[]` | `{kind:"door", x, y, action?: "open"\|"close"\|"toggle", force?: true}` or `{kind:"trap", x, y, side?: N\|E\|S\|W}` |
| `mode` | button: `"toggle"` (default, a lever) or `"momentary"` |
| `delay` | momentary button: seconds before it springs back (default 3) |
| `hold` | plate / momentary button: `false` = latch (effect stays); default `true` = the targets go back when it goes off |
| `once` | trap cell: fires only the first time (default: every time it is stepped on) |
| `projectile`, `damage`, `range`, `cooldown` | wall trap: `arrow` / `spell` (the prop type's default), hit points (arrow 6, spell 8), cells (8), seconds between shots (2) |
| `flag` | story flag raised while the source is on; a `story.*` flag also brings the source back on when the deck is loaded |
| `kind` | decal only: `lever` or `button` |

**Addresses.** A target is the absolute cell `x,y` of the door (a `door` cell of the layout) or of the wall trap's
prop (and its `side` = the anchor it hangs on, to tell two traps in one cell apart). A wall trap hangs on the wall
named by its `at` and fires straight out of it (`at: "E"` fires west, along the row) for `range` cells or until a
wall or a shut door. **For a future area copy** the data lives in the prop / decal entries, and
`relocateOperable(spec, area, dx, dy)` in `operables.ts` shifts the targets that lie inside the copied area (so a lever
and its door copied together keep working together) and leaves the ones outside - hook it into the paste. Sources are
identified at run time by `<prop>@<x>,<y>:<at>` (not by index), so removing other props does not disturb them.

**Semantics** (`operables.ts`, covered by `operables.test.ts`):

- lever / toggle button: each touch flips it; on = each target does its action (`open` default), off = the inverse
  (`close`; `toggle` toggles again).
- momentary button: pressing it works the targets, after `delay` it springs back and (unless `hold:false`) the inverse
  follows; pressing it while down does nothing.
- plate: on while the party stands on its cell (or an item lies on it: `itemsOn` in the context - nothing supplies that
  yet); `hold` default: off -> the inverse; `hold:false`: latched for good after the first press.
- trap cell: works its targets each time it is stepped on (or only the first with `once`); stepping off does nothing.
- wall trap shot: instant. The line of cells is traced from the trap; `hit` when the party's cell is on it. The runtime
  picks a random standing crewmate, hurts it (log line + the red flash), like the fire does. A missed shot only
  logs when the party is near. Cooldown per trap; a source firing a cooling trap does nothing.
- door effects use the game's own door state: `open` -> the door animation + the story's `open` event; `close` -> the
  panel slides back and `doorCrossed` blocks again at once. A door is never shut on the party standing in its cell. A
  **locked** door stays shut (log line) unless the target has `force`, which lifts the lock for good.
- State lives as long as the deck is loaded (a lever stays flipped while the party is on the deck); entering the deck
  again resets it - except sources with a `flag`: a lever / toggle button / latched plate whose flag is up comes back
  on and its doors are opened silently (`restoreFromFlags`). Power is ignored (the mechanisms are mechanical).

## 3. Editor

- Asset tree: group **Működtethető / Operable** next to the roof and fence groups: Lever, Button, Pressure plate, Trap
  cell, Arrow slit trap, Spell glyph trap. They are props: pick one, click a wall (lever, button, slits, glyphs hang on
  walls like a torch) or the floor (plate, trap cell).
- Inspector (selecting one, with the Prop tool or Select): an always-open block at the top - mode / delay / hold / once /
  flag, the wall trap's shot (arrow or spell, damage, range, cooldown, the way it fires), and the **targets list** (door
  action, force, remove). **Link a target**: the button turns on link mode - the next clicks in the 3D view name a door
  or a wall trap (a click on a door cell, or on the trap prop) and are added to the list; Esc, the right button or the
  button ends it. A decal's panel has "Works as a lever or button" with the same block.
- Edit-mode marks: a plate's cyan frame and a trap cell's red cross on the floor, a wall trap's line of fire (3D, only
  while editing); on the minimap a dashed line from each source to its targets (amber doors, red traps) and the plate /
  trap-cell squares.
- Problems panel (warnings): source without targets, target that is not a door, no wall trap at the target, wall trap that
  faces a wall, wall trap no source fires.
- Keys: the item panel has the story-item **name**, the **flag it raises** and a "Make it a key" button (name = the item's
  name, flag `key.<item>`); the Door panel's lock-key field lists the flags the map raises (items' `sets`, trigger and
  terminal `set:` actions). Wording of "It's locked." + the hacker hint is `keys.ts lockedMessage` (the lock's own `message`
  in the Door panel is what the party is told).

## 4. Decisions

- Operable props are ordinary props with an `operable` block (not a new top-level array): copy / paste, undo, variation
  (`chance`, `with`), delete and selection come for free, and a future area copy carries the data.
- A click / Use on a lever or button is an `OperateEvent` next to `Interaction` (not a new `Interaction` kind): it is never
  stored in a map and the editor's event panels stay untouched. `touchAt` = `interactionAt` + the operables.
- Models are plain three.js boxes (no artwork); the pose is driven through a tiny store (`operableStore.ts`), so no props
  travel through App.
- Edit-only marks reuse the child name `fenceMarker` (already shown only while editing).
- Wall traps are instant hits (no projectile entity): there is no projectile system for enemy fire either. A hit is 100 %
  when the party's cell is on the line (no dodge roll).
- The "Locked" door part: the game and the Door panel already had key / hack / code / message; the gap was making key items
  in the editor (done) and the flag list.

## 5. Not done / known limits

- **Items on plates**: no way to put an item into the world yet; the plate answers to the party only. The pure model takes
  `itemsOn(cell)`, so a future drop feature only has to pass it (and call `evaluatePlates` when items change).
- **No projectile animation**: a shot is a log line + the damage flash; the arrow / spell is not drawn flying.
- **Operable decals have no pose**: a painted lever / button works (click, Use, log line, targets) but its picture does
  not change.
- Free movement: `pos` changes cell-wise, so a plate reacts when the party's cell changes (not on a sub-cell edge).
- Area copy / paste itself belongs to another branch: only `relocateOperable` is provided.
- The `story.*` flag restore re-opens doors silently but does not replay the story's `open` triggers.
- Power: a lever works with the ship's power down (mechanical); a locked door is not opened by a lever without `force`.
- Not run in a browser here (see the risks in the final report): the models' look, the link-mode clicks and the pose
  animation were not seen; `tsc` and the logic tests pass.

## 6. Tests

`npx tsx src/game/operables.test.ts`, `src/game/operableMap.test.ts` (map parsing, touch events, plate placement, problems),
`src/editor/operableEdits.test.ts`, `src/game/keys.test.ts` and `npx tsc --noEmit`. (`dialogueCatalog.test.ts` fails on a
clean checkout too: a dialogue folder name, unrelated.)

## 7. Kézi teszt (magyarul)

Készíts egy próbapályát (szerkesztő mód, Prop eszköz):

1. **Kar és ajtó**: egy folyosón tegyél le egy ajtót (Közlekedés → Ajtó), a folyosó oldalfalára egy **Kart** (a fában
   Működtethető → Kar; a falra kattintva). Jelöld ki a kart: fent a „Működtethető: kar” blokk. „Cél összekötése” → kattints
   az ajtóra → a Célok közt megjelenik „Ajtó x,y”, a naplóban „Összekötve”; a minitérképen szaggatott vonal köti a kart az
   ajtóhoz. Esc kilép az összekötésből.
2. **Játékban** (kilépés a szerkesztőből): kattints a karra (vagy állj elé és Használ / Space) → a kar lebillen, az ajtó nyílik,
   a naplóban „Lehúzod a kart”. Még egy kattintás: a kar visszabillen, az ajtó becsukódik. Ha az ajtóban állsz, nem csukódik be.
3. **Gomb**: ugyanígy; kapcsoló módban váltogat, „Pillanatnyi” módban a megadott másodperc után visszaugrik és az ajtót is
   visszacsukja (a „Csak amíg nyomva van” kikapcsolva: az ajtó nyitva marad).
4. **Nyomólap**: Nyomólap a padlóra, célja az ajtó. Ráállsz → az ajtó nyílik, a lap lesüllyed; leszállsz róla → az ajtó csukódik.
   „Csak amíg nyomva van” kikapcsolva: örökre lenyomva marad és az ajtó nyitva.
5. **Csapda**: Nyílvető lőrés a falra (a lövés iránya: a fallal szemben, az Inspector mondja), a Csapdacella a padlóra, a cella
   célja a lőrés (összekötés: kattints a lőrésre). Rálépve: „Nyíl lő ki a falból…”, a csapat egyik tagja sérül, piros villanás.
   Hatótávon kívül / sorból kilépve nem talál. Varázsjel-csapda: ugyanígy, „Varázslat” lövedékkel. „Csak egyszer sül el” a
   csapdacellán.
6. **Zárt ajtó kulccsal**: ajtó → Speciális → „Zár kulcs” (a listából választható), tárgy lerakása (Tárgy eszköz) → „Legyen
   belőle kulcs” → a kulcs jelzője az ajtó kulcsa. Játékban: kulcs nélkül a „Zárva van.” üzenet (a Mondja mező szövege), a kulcs
   felvétele után az ajtó kinyílik. Egy kar, ami **zárat is feltör** („Zárat is feltör”), kinyitja; anélkül zárva marad (üzenet).
7. **Problems panel**: cél nélküli kar, nem ajtó célpont, falnak néző vagy senki által nem sütött lőrés → figyelmeztetés.
8. **Mentés / újratöltés / Undo**: a célok megmaradnak; Ctrl+Z visszavonja az összekötést; a kar törlése után a mutató
   hiba nélkül marad (a célok lógó hivatkozás csak a Problems-ben látszik, ha az ajtót törlöd).
9. **Pálya újratöltése**: a lift / kapu után visszatérve a kar újra alaphelyzetben van (kivéve a `story.` jelzős kar).

## 8. Fire, poison and spawn traps (feature/fire-trap-effects)

### Data format (all additive; a map without any of it parses exactly as before)

```jsonc
// a smoke / fire emitter that is OFF until a switch turns it on; the fire's kind and colour are the usual smoke fields
{ "x": 6, "y": 3, "pos": [0, 0.5, 0], "effect": "fire", "color": "#4dff6a", "lightColor": "#5dff7a", "active": false }
// poison smoke: green smoke that hurts whoever stands within `reach` steps (default 1, max 3), `damage` every `every` s (default 1)
{ "x": 3, "y": 2, "pos": [0, 0.4, 0], "effect": "smoke", "color": "#6fd23c", "density": 1.5, "active": false,
  "harm": { "damage": 2, "every": 1, "reach": 1, "label": "chokes on the poison smoke" } }
// a flame jet out of the west wall of (1,2): fire blown east, decorative (its own cell does not burn), the harm reaches 2 cells
{ "x": 1, "y": 2, "pos": [-0.45, 0.5, 0], "effect": "fire", "decorative": true, "size": 0.8, "active": false,
  "blow": { "speed": 2.5, "yaw": 90, "pitch": 0 }, "harm": { "damage": 4, "every": 1, "reach": 2, "label": "is scorched by the flames" } }
// an NPC / an item that is not in the world until something triggers it
{ "actor": "goblin1", "x": 6, "y": 1, "dormant": true }
{ "item": "medkit", "x": 7, "y": 1, "dormant": true }

// sources (lever / button / plate / trap cell / a painted decal with `operable`) list any mix of these targets:
{ "kind": "emitter", "x": 6, "y": 3 }                                        // every emitter in that cell: on (the default action)
{ "kind": "emitter", "x": 2, "y": 3, "index": 1, "action": "toggle" }        // the 2nd one in the cell (0 = first), on / off / toggle
{ "kind": "emitter", "id": "gas" }                                           // by the emitter's Linked id
{ "kind": "emitter", "area": { "x0": 1, "y0": 1, "x1": 5, "y1": 4 } }        // all emitters in a block of cells ("a fire on every tile")
{ "kind": "spawn", "x": 6, "y": 1 }          // the dormant NPC(s) at that start cell ("index", "id", "area" work the same)
{ "kind": "item",  "x": 7, "y": 1 }          // the dormant item(s) there
{ "kind": "reward", "credits": 50, "items": [{ "item": "medkit", "qty": 2 }], "once": false }   // straight into the party
```

### Semantics

- **Switching.** As the source goes on (a lever pulled, a plate stepped on, a trap cell stepped on) the emitter does its `action`
  (default `on`); as it goes off (lever pushed back, plate left, momentary button sprung back) the inverse follows - unless the
  source latches (`hold: false`) or is a trap cell (never goes back). Only emitters that really change are reported.
  State (`OperableState.emit`) resets with the deck, like the levers; a source with a `story.` flag comes back on and its emitters
  with it (`restoreFromFlags`).
- **Emitter addresses** are matched in the *played* map (a variation can drop emitters): by `id`, else by `area`, else by cell,
  `index` = the n-th emitter in that cell in file order. Runtime key `x,y` / `x,y#2`.
- **Spawn** brings each dormant NPC in once (the deck's visit); pushing a lever back does not remove it. It appears at its start
  cell (`actorFromSpec`, id = its index in the map's actors, so a killed spawn stays a wreck), on guard; the ship's robot stance
  does not apply (a trap's guard is awake), only the actor's own `wake`. A friendly NPC spawns as it is. An enemy spawned in
  wander mode is held by the existing `holdEnemies`.
- **Item reveal**: the dormant item is counted as "looted" (hidden, not pickable) until revealed; the reveal is kept for the run.
- **Reward**: pays when the source goes on; once only by default (`once: false` pays each time; a source's own `once` also
  limits it). Paid rewards are remembered with the run flag `reward.<map>.<source>#<n>`, so re-entering the deck does not pay
  twice. Credits through `meta.setCredits`, items through `addToHaul` (overflow is told as for any pickup).
- **Harm** (`harmTick`): the party standing in a cell within `reach` steps (over open floor; walls and shut doors stop the smoke)
  of an emitter that is ON is hurt at once on entering, then every `every` s (leaving and returning does not reset the count)
  through the same `hurt` path as the wall traps (random standing crewmate, log line "<name> <label>.", red flash). Nothing
  happens while `trapsActive()` is false (wander mode), while the game clock is paused, or in the editor. A fire still burns its
  own cell as before, but only while its emitter is on.
- **Viewport**: while the deck is being played an emitter that is off is not built (no particles, no fire light); switching
  rebuilds the particle systems only when the set of shown emitters really changed. The editor always shows all of them.

### Editor

- **Emitter panel** (Smoke tool or Select): section **Fire / Smoke type** (presets: Fire, Blue fire, Green fire, Smoke, Steam,
  Poison smoke, Flame jet from the wall - a preset sets / clears kind, colour, light, blow, density, size, harm, decorative, so
  nothing of the last one stays; the jet blows away from the wall the emitter sits against, `jetYawFor`), and section **Trap**
  ("On from the start" = `active`, "Hurts the crew in its smoke" = `harm` with damage / every / reach / log line). The existing
  fire, light and blow fields stay in their sections.
- **NPC / item panel**: "Appears when triggered" (`dormant`). A dormant NPC is drawn faded (`ActorState.ghost`) in the editor.
- **Operable block** of a source: the targets list shows one-line descriptions (door / wall trap / emitter / spawn NPC / reveal
  item / reward), the emitter target has a Switch on / off / toggle choice, a target that addresses nothing is amber. **Link a
  target**: click a door, a wall trap, an emitter marker, a dormant NPC or a dormant item in the 3D view. **Area**: drag a block
  in the zoomed minimap (wide screens), then the buttons "all emitters / dormant NPCs / dormant items in it" appear in the
  source's panel. **Add a reward**: credits, items (select + quantity), "Pays only once".
- **Problems** (warnings): a target that addresses nothing (emitter / spawn / item, with where), an emitter that is off from the
  start and nothing switches on, a dormant NPC / item nothing triggers. Minimap: dashed links from the source to each addressed
  emitter / NPC / item (orange / purple / green).
- **Undo / delete**: every edit is an `applyEdit` step. Removing an emitter / NPC / item fixes the targets that named it by its
  place in its cell (`index`): the one that pointed at it is dropped, later ones move up (`fixTargetsBeforeRemove`); targets by
  cell alone, id or area stay and show up as problems if nothing is left. Moving something does not rewrite targets (addresses
  are explicit): they show up as problems. Copy / paste of an area keeps the absolute addresses (as for doors).

### Not done / reduced

- **Ceiling-lowering and chasm traps**: saved for later (not started).
- No fade in / out of a switched emitter: it appears / disappears (the particle systems are rebuilt); a pop-in animation for a
  revealed item and a puff for a spawned NPC are not drawn (log lines only).
- No hover highlight of a target in the 3D view and no 3D floor marks from a source to its emitters / NPCs / items (the minimap
  lines and the amber "addresses nothing" row are the feedback); dormant items have no marker in the editor view.
- Poison / fire smoke hurts the crew only; actors are not hurt by `harm` (the own-cell fire still burns them as before).
- Harm uses a step distance over open cells, not the smoke's real particles.
- Not run in a browser: the look of coloured fire, the link-mode clicks, the faded NPC and the rebuild on switching were not seen.

### Tests

`npx tsx src/game/emitters.test.ts` (harm cadence, reach, presets, jet direction, store), `src/game/trapTargets.test.ts` (target
parsing, on / off / toggle / area / id, plates, trap cells, once, spawn, reveal, reward, problems, links),
`src/game/trapMap.test.ts` (map round trips, dormant NPCs, link clicks, edits keeping targets right) and `npx tsc --noEmit`.

### Kézi teszt (magyarul)

1. **Lángcsóva nyomólappal**: tegyél egy Nyomólapot a folyosóra, a folyosó falához egy tűz-kibocsátót (Füst eszköz), nyomd meg a
   „Lángcsóva a falból” gombot (Tűz / füst fajtája), vedd le az „Induláskor bekapcsolva” pipát. Jelöld ki a nyomólapot →
   „Cél összekötése” → kattints a kibocsátó jelölőjére. Szerkesztőből kilépve (Play bekapcsolva): ráállva a lángcsóva kigyullad,
   a csapat sebződik („…megperzselődik a lángoktól”); lelépve elalszik. Play nélkül (barangoló mód) a lángok látszanak, de nem sebeznek.
2. **Zöld mérgező szoba karral**: a szobába egy-két kibocsátó, „Mérgező füst”, induláskor kikapcsolva; a bejárat mellé Kar,
   célja a kibocsátók (vagy kijelölt blokk → „minden kibocsátó benne”). Kar lehúzva: zöld füst, másodpercenként sebzés a szobában;
   visszatolva: elfogy.
3. **Kar, ami ellenséget idéz**: egy NPC „Kiváltásra jelenik meg” (szerkesztőben halvány); kar célja az NPC. Játékban a kar
   meghúzásakor megjelenik, és támad (barangoló módban megjelenik, de áll).
4. **Kar, ami aranyat fizet**: kar → „Jutalom hozzáadása”, 50 kredit (+ tárgy). Meghúzva a napló „Találsz 50 kreditet.”, a kredit
   nő; újra meghúzva nem fizet többet (a „Csak egyszer fizet” kikapcsolva: minden bekapcsoláskor).
5. **Terület**: nagyított minitérképen húzz blokkot a szoba fölé, a kar paneljén „minden kibocsátó benne” → a szoba összes
   kibocsátója egyszerre kapcsol.
6. **Problems / törlés**: egy cél, amihez nincs kibocsátó, és egy kapcsolatlan „kiváltásra megjelenő” NPC figyelmeztetést ad; egy kibocsátó
   törlése után a rá mutató célok javulnak / figyelmeztetnek; Ctrl+Z visszahozza.
