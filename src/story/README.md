# src/story: the game's story folder

Every `*.twee` file directly in this folder is the story the build ships (`load.ts` reads them with `import.meta.glob`).
**No campaign file here = the story layer is off** and the game behaves exactly as before. The reference example lives in
`example/` (a copy of `concept/story-example/`): it is not loaded; to try it, copy its files one level up (into this folder).
The one exception is the playable test story `tesztsztori-*.twee`, see the last section.

## How a story folder works

- One file per job, the file name (without `.twee`) is its id. `:: FileData` at the top says what it is (`@kind campaign | chapter | global`).
  - **campaign**: the chapter chain (`@start`, `@next` rules) and the variables that live for the whole game. Exactly one.
  - **chapter**: one chapter's NPC talks, events, quests; its variables are dropped when the chapter closes.
  - **global**: NPCs and reactions that are always there (their variables live for the whole game).
- Dialogue syntax, commands (`@set @give @take @reward @quest @shop @end @goto @endchapter @emit`), expressions and scopes: see
  `concept/story-example/README.md`. The engine is `src/game/story/`.
- At load the static checker runs; errors and warnings are logged **once** to the browser console as `[story] file/Passage: message`.

## NPCs

A passage with `@npc <id>` is a talk entry. `<id>` is the placed actor's **type** (`ActorSpec.actor`, e.g. `smith`); a trailing
variant number is ignored when only the bare name has an entry (`smith1` finds `smith`). The actor must be a friendly NPC that is
interactable in the editor today (it has a dialogue library or a shop set); when the story has an entry for it, the story talk runs in
the normal dialogue window, otherwise the old library/shop path runs unchanged. A story `@shop` without an id opens the NPC's own shop.

## Events the game raises

| Event | Argument | When |
|---|---|---|
| `enemy_dead` | actor type | an enemy is destroyed (once per actor) |
| `item_picked` | item id | something goes into the haul (loose item, crate, wreck) |
| `level_exit` | map id | the party takes a gate or stairs off a map |
| `map_entered` | map id | a map is arrived on (any way: lift, gate, stairs, boarding) |
| `chapter_start` | none | raised by the engine for every started chapter |

Use them as `@on enemy_dead tyrant` in an `[on]` or `[banter]` passage (the argument is optional). `[on]` text goes to the game log; a banter line
is shown as `NAME: text` with its optional reply after the delay.

## Saving

The story state is saved into the game's save (`Meta.storyState`) whenever it changes, and restored at start. Saving waits while a dialogue,
a shop or a cutscene (lift ride, gate or stairs transit) is on and happens as soon as it ends. "Reset save" on the base screen restarts the story.

## Testing with the debug panel

Open the debug panel, section **Story** (only there when a campaign is loaded): the active chapter, whether saving is allowed, the running
passage, a **jump to chapter** select, the campaign / chapter / global variables and quest states (all editable, saved at once), and a log of the last 50 effects
(`give`, `take`, `shop`, `text`, `questChanged`, `chapterStarted`, `error` ...).
Run the pure tests with `npx tsx src/game/story/<name>.test.ts`.

## The test story (tesztsztori)

A playable copy of the example (`concept/story-example/`, left untouched) with a town and a labyrinth map to play it on. Everything new carries
the prefix `tesztsztori`; `TESZTSZTORI-REMOVE.md` lists what to delete to remove it all.

**Start it:** `npm run dev`, then open `http://localhost:3000/?world=fantasy&map=tesztsztori` (the labyrinth is `?map=tesztsztori-labirintus`). In the
editor, picking one of the two maps from the Map panel moves `?map=` in the URL: reload the page and the story is on. Without a reload the story layer
stays as it was at page load (the NPCs then only say a fallback line).

**The switch** (`tesztsztori-switch.ts`, read by `load.ts`): the `tesztsztori-*.twee` files only count when `?map=` names a map starting with `tesztsztori`,
or `?story=on` is in the URL, or `localStorage.setItem("voidcrew-story", "on")`; `?story=off` / `"off"` always turns it off. On any other page the game
is exactly as before (no intro line in the log, no Story section in the debug panel). Files that do not start with `tesztsztori` are never switched.

**What is where** (cell x,y; the town is 12x12, the labyrinth 12x11):
- Town `tesztsztori`: start (2,3); smith Borbás `tesztsztori_kovacs` (4,3, shop `smith-shop`), innkeeper Lana `tesztsztori_lana` (7,2),
  the kneeling Count Varga `tesztsztori_zsarnok` (9,2, friendly, the judgement talk); south-west the cellar (the room under the gap at (3,5)) with 3 frost ore
  (`tesztsztori_fagyerc` at (1,8), (1,9), (2,9)) and, in a dead-end nook at its south end, Lana's ring (`tesztsztori_gyuru` at (5,10)); south-east the throne
  room (gap at (8,5)) with the hostile Count Varga (9,8); gate "Labirintus" at (1,1).
- Labyrinth `tesztsztori-labirintus`: arrival gate "Bejárat" (1,1) (also the way back to the town); the pilgrim `tesztsztori_zarandok` in the dead-end pocket at (10,1);
  the captain `tesztsztori_kapitany` (8,9) next to the gate "Kijárat" (10,9). Both gates lead to the town; leaving by either raises `level_exit tesztsztori-labirintus`.

**Design decisions**
- *The tyrant.* The story binds NPC talks to friendly actors and `enemy_dead` to hostile ones, and an actor cannot be both. So the type `tesztsztori_zsarnok`
  is placed twice: a friendly, kneeling Varga (judgement talk: "Megkíméled" ends chapter 1 as spared; "Végzel vele" only sends the player to the fight) and a hostile
  one in the throne room (a tougher ogre: 160 hp; killing him raises `enemy_dead tesztsztori_zsarnok`, which ends chapter 1 as killed). Either one closes the chapter;
  the other one is then just there (the judgement entry is a chapter-1 passage, so the kneeling Varga falls back to the silent line afterwards).
- *Items.* `@give` puts an item id straight into the backpack, and `has()` counts the same id, so all three are plain `ITEM_TYPES` entries (copied sprites in
  `public/textures/item_tesztsztori_*`). The runic sword is a trophy item, not a wieldable weapon: the fantasy weapons are all ranged and a new `WEAPON_TYPES`
  entry would show up in shops; to make it wieldable later, `@give weapon:spear` (an existing weapon id) works and `has("weapon:spear")` counts it.
- *Actors.* `tesztsztori_kovacs/lana/kapitany/zarandok` are `smith1`'s stats (friendly, harmless) on the mage1, thief1, goblin2, mage1 sheets; `tesztsztori_zsarnok` is `ogre1`'s sheet and stats, tougher.
  They carry a fallback dialogue (`src/dialogues/tesztsztori.twee`, the smith: the normal `void-fantasy` smith) because an NPC must have a dialogue or shop to be talkable; the
  story wins whenever it has an entry.
- *Banter.* The party remarks are by `aldra` and `borin` (the fantasy crew) instead of the example's `mira` / `rook`.

**What you will notice on other maps:** nothing, as long as the switch is off. With `?story=on` on any map: the chapter-1 intro line in the log, the Story section in the
debug panel, and `item_picked` / `map_entered` / `level_exit` / `enemy_dead` events reaching the story (which only reacts to the prefixed ones).
Run `npx tsx src/game/story/tesztsztori.test.ts` (checker + scenarios) and `npx tsx src/game/tesztsztoriMaps.test.ts` (maps through the game's parser).
