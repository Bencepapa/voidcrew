# Locks on props: locked chests, levers and buttons (feature/locked-containers)

Doors, terminals and keypads could be locked already (`Lock` in `src/game/story.ts`, `keys.ts`). This adds the same idea to
**placed props**: a container (any prop with `contents`: crates, chests), a lever, a button. Everything new lives in
`src/game/propLocks.ts` (pure), `src/game/useLocks.ts` (runtime) and `src/editor/lockEdits.ts` + `inspector/LockFields.tsx`
(editor); the door code was not touched.

## 1. Data format

A prop's entry gets an optional `lock` block (additive: old maps parse as before, a prop without it is unlocked):

```json
{ "prop": "crate1", "x": 3, "y": 4, "lock": { "key": "key.vault", "message": "A heavy padlock.", "consumeKey": true } }
{ "prop": "lever1", "x": 1, "y": 1, "at": "N", "lock": { "key": "key.red" }, "operable": { "targets": [{ "kind": "door", "x": 3, "y": 1 }] } }
```

| field | meaning |
|---|---|
| `key` | the story flag that opens it (a door's `lock.key` is the same kind of thing). No key: it never opens (Problems warning). |
| `message` | what the party is told while it is shut; default "It's locked." (en) / "Zárva van." (hu, from `lock.locked` in `i18n/*/lock.ts`) |
| `consumeKey` | opening it uses the key up (see 2.) |

The block is read by `readPropLock` (junk dropped, message trimmed and cut at 300 characters). A block of its own, even `{}`,
is a lock: the editor's "Locked" checkbox adds `{}` and removes the block when unchecked.

## 2. Semantics

- **Locked / unlocked.** A lock is open once its run flag `unlocked:<map>:prop <index>` is up (`propUnlockedFlag`; the index is
  the prop's index in the deck's *full* map, like the loot keys; terminals use `unlocked:<map>:terminal <id>`, doors
  `unlocked:<map>:<x,y>`). The flags are run flags: they last for the run (not saved: they are not for doors either) and are
  cleared at a new run.
- **Keys are story flags.** `key.<item>` is raised when a key item (an item lying on the map with `sets`: the item panel's
  "Make it a key") is picked up; a terminal or trigger may `set:` it. A lock holds the key when its flag is up. On top of
  that, a *prop* lock keyed `key.<item>` also opens for anybody who *carries* that item (found in a chest's contents, bought):
  loot in containers cannot raise flags, so the convention covers it. Doors are unchanged (flag only).
- **One lock, one key; keys may be shared.** A lock has exactly one `key`; any number of locks, doors too, can name the same
  flag, and one key item opens all of them (unless one of them uses it up). There is no "any of these keys" or "all of these".
- **Use / click on a container** (both are `use()` in `useGameState.ts`): each locked container in reach is gated first.
  Shut: the log shows the message (warn) and nothing spills; held key: the lock is opened ("You unlock the crate." / "Kinyitod:
  ...", the unlocked flag raised) and the container opens in the same Use, as always; nothing is taken from it while it is
  shut, so it can be opened later. A locked container does not stop other containers or loose items within reach.
- **Lever / button** (`operate` in `useGameState.ts`, which both a click and Use reach): shut: the message, the lever does not
  move, its targets do nothing; held key: "You unlock the lever." and it is pulled in the same touch. Pressure plates, trap
  cells and wall traps work by themselves and cannot be locked (the editor shows no block; a hand-written `lock` on them is a
  Problems warning and is ignored).
- **`consumeKey`**: when the key opens the lock, one of the key's item (the map item that raises the flag, else the `<item>` of
  `key.<item>`) is taken from the party, and the flag is lowered if none of that item is left (a flag with no item behind it is
  just lowered). A second lock of the same key is shut again; a lock opened earlier stays open. The log says "The key is used up."
- **Edit mode.** Locks are ignored while the map is being edited (the editor walks the party about and opens chests freely);
  a small amber padlock hangs over each locked prop (`render/lockMarker.ts`, `updateLockMarkers` in GameViewport; not
  selectable, hidden with the prop layer).

## 3. Editor

Inspector, prop panel: a **Lock / Zár** block above the sections for a container, lever or button:
Locked (checkbox) - Key (text with a drop-down list: marked items on the map, story flags, items in containers' contents as
`key.<item>`, the keys of doors and of other locks) - "Create a key for this lock" (writes a fresh flag `key.<prop>_<x>_<y>` into
the key field and says to put an item on the map and give it that key flag in its panel; it creates no map objects) - Says
(message) - Key used up (checkbox). A line warns while nothing on the map raises the key.

Edits are `updateProp(file, index, { lock })` (`setPropLock` in `lockEdits.ts`), so undo, delete and area copy/paste already
work (a pasted chest carries its lock block and has its own unlocked state, being another prop).

Problems panel (warnings): `lockNoKey` (a lock with no key), `lockKeyNobody` (the key flag is raised by no item or event on the
map; a `key.<item>` of an item lying on the map or in a container counts), `lockNotLockable` (a lock on a prop that cannot be).

## 4. Decisions

- "Lockable anything" covers **containers, levers and buttons** (props). The Lock block is for those only.
- Prop locks have no `hack` / `code`: a door's hack and keypad need the ship plan (code per door cell) and an interaction that
  differs between walking into a door and Use; a container is always touched through Use. Left out on purpose.
- No new log kinds or events; no story-engine change (`has()` counting untouched).
- The new strings are in `src/i18n/{en,hu}/lock.ts` (one pair of files, not mixed into the shared ones). The door's own
  message is still English only, as before.

## 5. Not done / known limits

- Locks on decal levers/buttons (the painted ones), on loose items, on NPCs, and on props with an `interaction` message
  (`interaction` events do not name their prop when they reach the game: `openInteraction` in App.tsx).
- Hack / code locks on props (see above); several keys per lock.
- The unlocked state is a run flag like the doors' (lost on reload; the backpack is saved, so a `key.<item>` key carried still
  opens again).
- The minimap/loot scan still shows what a locked container holds.
- The padlock marker is a sprite over the prop; it is not shown in the 2D map view.
- Nothing was run in a browser: the pure parts are tested, the Inspector block, the marker and the Use/lever wiring are not.

## 6. Tests

`npx tsx src/game/propLocks.test.ts` (block parse/clean, decision with flags / carried keys / consume / shared keys / message,
key list, problem checks, map file round trip), `src/editor/lockEdits.test.ts` (edit functions, delete, copy-paste, panel info,
the Problems panel), `src/game/keys.test.ts` (a key shared by a door and a chest).

## 7. Kézi teszt (magyarul)

1. Tegyél le egy ládát; Inspector -> Zár -> Zárva. „Kulcs létrehozása ehhez a zárhoz": a kulcs mezőben megjelenik pl. `key.crate1_3_4`,
   alatta a magyarázat. A Problems panel: „A pályán semmi sem adja meg ezt a kulcsot" (figyelmeztetés).
2. Tegyél le egy felvehető tárgyat, a panelén a „Kulcsjelző" mezőbe írd ugyanezt (vagy „Legyen belőle kulcs", és a zár kulcsát
   válaszd a listából): a figyelmeztetés eltűnik. A ládán lakat jel van szerkesztő módban, játékban nincs.
3. Játék (Play): a ládánál Használ vagy kattintás: „Zárva van." / „It's locked.", semmi nem esik ki. Vedd fel a kulcsot, újra a
   ládához: „Kinyitod: láda." és a láda kinyílik, a tartalom a hátizsákban. Újra használva: már kiürítetted.
4. „Kulcs elhasználódik": a nyitás után „A kulcs elhasználódott.", a tárgy eltűnik; egy másik, azonos kulcsú zár zárva marad.
5. Közös kulcs: állítsd egy ajtó zárkulcsát ugyanarra a jelzőre: ugyanaz a tárgy nyitja az ajtót és a ládát.
6. Zárt kar: húzásra csak az üzenet; kulccsal „Kinyitod: kar." és meghúzza; a nyomólapon nincs Zár blokk.
7. Egyedi üzenet, undo/redo, mentés + újratöltés, másolás-beillesztés (a másolatnak saját zárállapota van).
