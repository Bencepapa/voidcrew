# Story engine example (campaign + 2 chapters + 2 global NPCs + 2 side quests)

Spec by example for the Twee story engine. The files here are the reference the parser/engine is written and tested against
(`scenarios.md` lists the expected results). The pure engine (`src/game/story/`) runs them; see `IMPLEMENTATION-NOTES.md` (UI, debug panel and editor are not built yet).

## Files

| File | Kind | Content |
|---|---|---|
| `campaign.twee` | campaign | chapter chain, the few variables that live for the whole game |
| `chapter-1-zsarnok.twee` | chapter | the tyrant arc; overrides smith and Lana; quests `sword` (expires) and `ring` (carries) |
| `chapter-2-labirintus.twee` | chapter | the labyrinth; a chapter-only NPC (pilgrim) |
| `npc-kovacs.twee` | global | smith (`smith`): everyday talk, shop, reacts to the campaign |
| `chapter-3-hajo.twee` | chapter | skeleton: reached from a choice in chapter 2 (`@endchapter chapter-3-hajo`) |
| `npc-lana.twee` | global | innkeeper (`lana`): rumours, takes the carried ring quest |
| `party-banter.twee` | global | party reactions to events (`@on`) |

## Scopes

- Bare `name` in a file = that file's own variable (declared with `@var` in `FileData`).
  Campaign file: lives for the whole game. Chapter file: dropped when the chapter closes. Global file: lives for the whole game.
- `campaign.name` = a campaign variable. Everyone may read it; a chapter may write only the ones in its `@returns`.
- `file.name` (e.g. `kovacs.met`) = read another global file's variable. Never writable from outside.
- Inventory, credits and quest states belong to the engine; the story only asks (`has()`, `quest()`) or orders (`@give`, `@take`, `@quest`).

## Expressions

`==  !=  <  <=  >  >=  &&  ||  !  ( )`, numbers, `"text"`, `true/false`, and the queries
`has(item)` (count), `quest(id)` (`"none" | "active" | "ready" | "done" | "failed" | "expired"`), `party(id)` (bool),
`chapter()` (current chapter id), `visited(passage)` (bool).

## Commands (own line, start with `@`)

| Command | Meaning |
|---|---|
| `@set x = e`, `@set x += n` | write a variable (own scope or an allowed `campaign.`) |
| `@give item [n]`, `@take item [n]` | inventory |
| `@reward credits n` | credits |
| `@quest start\|done\|fail id` | quest state |
| `@shop [id]`, `@end` | as today |
| `@emit event [arg]` | the story raises an event (can close a chapter, trigger banter) |
| `@if e` / `@else` / `@endif` | block around text, choices and commands |
| `@goto file/Passage` | jump to a passage of another file |

A choice line may end with a guard: `[[Label->Target]] @if e`. A link to another file: `[[Label->file/Passage]]`.

## Passage headers (first lines of a passage)

| Header | Where | Meaning |
|---|---|---|
| `@npc id` | entry passage `[start]` | this passage is an entry of that NPC |
| `@overlay` | entry passage in a chapter file | wins over the NPC's global entries while the chapter is active |
| `@when e`, `@priority n`, `@once` | entry / banter | guard; higher priority first (default 0); show only once |
| `@on event [arg]` | `[on]` / `[banter]` passage | runs when the engine raises the event; no text = silent handler |
| `@speaker id`, `@reply id delay` | `[banter]` passage | who says it; a party member answers after the delay |
| `@title`, `@goal`, `@ready_when e`, `@fate expires\|carry` | `[quest]` passage | quest definition |
| `@chapter file`, `@next file [@if e]` | `[chapter]` passage in the campaign | the chain |

`FileData` passage (every file): `@kind campaign|chapter|global`, `@var`, and for chapters `@returns a, b`.

## Ending a chapter

Only the story ends a chapter: `@endchapter [chapter-file]` (the existing `@end` ends only the dialogue).
- It just marks the chapter as ending. The rest of the passage still runs (rewards, `@set campaign...`, text); the close happens at the end of the passage, and a running dialogue finishes first.
- Without a target the campaign file's `@next` rules pick the next chapter; with a target (`@endchapter chapter-3-hajo`) that chapter is started and the `@next` rules are skipped. A choice in the last passage can therefore pick the next chapter.
- A map change, a boss death or any other game event ends a chapter by running an `[on]` handler that contains `@endchapter`.

## Saving and debugging

- The story state (campaign variables, active chapter and its variables, quest states, global file variables) is saved with the game (the `story` field next to `Meta`, versioned).
- Saving is refused while a dialogue, a shop or a cutscene is running (`canSave()` is false); an auto-save waits for the end.
- A debug panel shows the active chapter, all variables (editable), quest states and the running passage, and can jump to any chapter.

## Entry resolution for an NPC (first match wins)

1. entries of the **active chapter** with `@overlay` (by `@priority`, then file order), guard true
2. entries of the NPC's **global** file, guard true
3. none left: the NPC stays silent (checker warns when no unguarded fallback exists)

## What happens when a chapter closes

- Chapter variables, chapter passages and chapter-only NPCs are dropped. Inventory and credits stay.
- `@returns` values stay in `campaign.*`.
- Each quest of the chapter: `@fate carry` becomes global (state and definition survive; its turn-in must be written in a global file),
  `@fate expires` is forgotten but leaves a tombstone: `quest(id)` answers `"expired"` so global files can still react.
- Banter and `[on]` handlers of the chapter file are dropped with it.
