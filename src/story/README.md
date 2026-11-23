# src/story: the game's story folder

Every `*.twee` file directly in this folder is the story the build ships (`load.ts` reads them with `import.meta.glob`).
**No campaign file here = the story layer is off** and the game behaves exactly as before. The reference example lives in
`example/` (a copy of `concept/story-example/`): it is not loaded; to try it, copy its files one level up (into this folder).

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
