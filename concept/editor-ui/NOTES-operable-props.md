# Operable props: lever, button, pressure plate, trap cell, wall traps (feature/operable-props)

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
