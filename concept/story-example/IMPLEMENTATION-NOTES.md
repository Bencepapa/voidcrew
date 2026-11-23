# Story engine: implementation notes

The pure core (no DOM, no storage) is done and tested against the files in this folder. Nothing is wired into the React UI, the game loop or the editor.

## Module map (`src/game/story/`)

| Module | Role | Test |
|---|---|---|
| `expr.ts` | tokenizer, parser (typed error, never throws), evaluator, `collectRefs` for the checker | `expr.test.ts` |
| `state.ts` | `StoryState` (JSON, `v: 1`), `readVar`/`setVar` (scope rules, `@returns`), `setVarDebug`, quest transitions, `closeChapter`, `canSave`, `serializeState`/`migrateState`/`deserializeState` | `state.test.ts` |
| `storyParse.ts` | Twee story dialect: FileData, commands, `@if/@else/@endif`, choice guards, passage headers, `[quest]`, `[chapter]`, `StoryBundle`, `resolveTarget` (`file/Passage`) | `storyParse.test.ts` |
| `storyEngine.ts` | `StoryEngine` class: runtime on state + bundle, host queries in, `Effect[]` out | `storyEngine.test.ts` |
| `storyCheck.ts` | static checker, `{severity, file, passage?, message}` | `storyCheck.test.ts` |
| `example.test.ts` | scenarios 1-21 on the real example files with a fake host | itself |

`dialogue.ts` is unchanged except that `parseHeader` and `parseLink` are exported; `@end`/`@shop` dialogues keep working (old tests pass). `meta.ts` got `storyState?` plus `saveStoryState`/`loadStoryState`.

Run: `npx tsx src/game/story/<name>.test.ts` from the repo root (the tests read `concept/` by relative path, like `dialogue.test.ts`).

## Decisions that the spec left open

- **Entry tiers.** Entries of an NPC: (1) active-chapter entries with `@overlay`, (2) global entries, (3) active-chapter entries *without* `@overlay`. Tier 3 exists because the chapter-only NPCs (`pilgrim`, `captain`) have no `@overlay` in the example but must talk. Inside a tier: `@priority` desc, then file order (bundle order, then passage order). `@once` entries that were shown are skipped. The checker warns when a chapter entry lacks `@overlay` although the NPC also has global entries.
- **Entry = a passage with `@npc`.** The `[start]` tag alone does not make an entry (the checker warns).
- **File ids** are the file names without `.twee`. `kovacs.met` also finds `npc-kovacs` (a leading `npc-` is optional in a `file.var` read), because the README writes `kovacs.met`.
- **Bare names in call arguments are text**: `has(frost_ore)` is the same as `has("frost_ore")`. Names may contain `-`.
- **Unknown variable reads as `false`** at runtime (the checker reports it). `<`/`>` on mixed types is false.
- **`@set` needs an existing variable**: values are created from `@var` defaults at chapter start (chapter vars) and at `startCampaign` (campaign, global files).
- **Sequential execution.** A passage runs top to bottom; an `@if` sees the effects of earlier `@set`s of the same passage. Choice guards are evaluated at that point too. The inventory is NOT updated mid-passage (the host applies the effects after the call), so `@take x` followed by `has(x)` in the same passage sees the old count.
- **`@end`** stops the passage and ends the dialogue; text above it is kept. A passage with no visible choices also ends the dialogue (this is how `@shop`-only passages and text-only passages finish).
- **`@goto`** stops the current passage, discards its choices, and shows the target's text after the text so far. Depth limit 20 (an `error` effect).
- **`@emit`** is returned as an effect and also queued internally; the handlers run after the current passage. `@emit` inside `[on]` handlers is fine; the loop is capped (200 steps).
- **Chapter close** happens in `settle`: queued events first, then a pending close, once no dialogue is running. A close with no true `@next` rule (and no target), or an unknown target, is refused: effect `chapterBlocked`, the chapter stays open (a stuck chapter is easier to debug than a story with no chapter). `@endchapter` called twice: the first wins, unless only the second has a target.
- **`closeChapter` fates**: a `carry` quest that is not `none` becomes global (`state.carried[id] = file`, definition stays in the bundle). An `expires` quest that is `active`/`ready` becomes `"expired"` (tombstone); a `done`/`failed` one keeps its state; a quest that never started stays `"none"`. Visited/once keys of the chapter are dropped.
- **Quest readiness** (`@ready_when`) is re-evaluated before every dialogue step, in `settle`, and by `refreshQuests()`; it goes both ways (`active` <-> `ready`) so removing the ore un-readies the quest.
- **Events**: `[on]` and `[banter]` passages with `@on event [arg]`; a handler without arg matches any arg. Handlers of the active chapter run first, then global files; priority then file order within each. `chapter_start` is raised by the engine for every started chapter (global handlers see it too). A banter's `@reply id delay` is resolved to the first banter passage in the same file with `@speaker id`, no `@on`, and a true `@when`; it comes back as `reply: {speaker, delayMs, text}`. If the guard is false there is no `reply`.
- **Save name**: `Meta.story` is the older flag list, so the new field is `Meta.storyState`.

## Fixes made to the example

- `chapter-1-zsarnok.twee`, `Tyrant spared`: added `@emit tyrant_spared`. Scenario 6 says "`tyrant_spared` raised", but the passage never emitted it (the scenarios and the example contradicted each other). Nothing else in the example or scenarios was changed. The stale README sentence "the engine does not run them yet" was updated.

## Checker coverage (`storyCheck.ts`)

Errors: malformed expressions anywhere (`@when`, `@if`, guards, `@ready_when`, `@next @if`, `@set` values, `@var` values); unknown variable (own scope, `campaign.x`, `file.x`), unknown file in `file/Passage` and in `file.var`; broken links/`@goto`; unknown quest in `@quest` and `quest("..")`; `@set campaign.x` not in `@returns`, global file writing `campaign.*`, writing another file's variable; `@returns` naming a non-campaign variable; quest without or with a bad `@fate`; carry quest without a `@quest done` in a global file; duplicate quest ids; unknown `@next`/`@chapter`/`@start`/`@endchapter` target; no campaign file.
Warnings: no reachable `@endchapter` in a chapter file; unreachable passages; passage whose choices are all guarded (no fallback); NPC whose entries are all guarded/`@once`; chapter entry without `@overlay` for an NPC with global entries; chapter not in the campaign chain; unknown commands.
The only warning on the example is chapter 3 (a skeleton, never ends).

## What the debug panel (not built) will need from the engine

- `engine.snapshot()` (deep copy of `StoryState`: chapter, all variables, quests, carried, visited, once), `engine.status()` (active chapter, ended, running dialogue's npc/file/passage, `closePending`).
- `engine.debugSetVar(scope, name, value)` with scope `"campaign"`, `"chapter"` or a global file id (skips the `@returns` rules, existing variables only).
- `engine.jumpToChapter(id)` (closes the active chapter with its quest fates, starts `id`, skips `@next` rules). Missing: a debug "set quest state" (add `debugSetQuest` using `transitionQuest`-less direct write) and "run passage X" (a thin wrapper around `step`, which is private now).
- Every `Effect` including `error` ones is returned to the host; the panel should log them (`error` effects carry file/passage).

## Open risks

- **Inventory is the host's.** Quest readiness and `has()` are only as fresh as the host's `StoryHost.has`; the host must call `refreshQuests()` after pickups (or raise `item_picked`, which settles). A real inventory must apply `give/take/reward` effects in order.
- **Running dialogue is not saved.** `load()` drops any open dialogue and pending close; `canSave()` must be consulted by the host (the engine only knows about its own dialogue; the host reports shop/cutscene via `setShopOpen`/`setCutscene`).
- **Pending chapter close vs. a shop left open.** The close happens when the dialogue view ends, even if the `@shop` it opened is still on screen. The host decides whether that is fine.
- **Same quest id in two files** is a checker error but the runtime takes the first match.
- **Passage names containing `/`** (`Buy/Sell`): a local passage wins over `file/Passage`; a name like `a/b` that is also a file prefix is resolved local first.
- **Event args are single tokens**; `@on enemy_dead tyrant` matches `dispatch("enemy_dead","tyrant")` only (a handler without arg matches all).
- **`MAX_SETTLE_STEPS` (200)** protects against event loops; hitting it drops the queue and emits an `error` effect.
- **Strings**: `\"` escapes only; no string concatenation or arithmetic in expressions (`+=`/`-=` in `@set` only).
- The existing editor/dialogue catalog does not know the story dialect yet (`DialoguesPanel` parses with the old `parseTwee`, which reports `@set`, `@if` etc. as unknown commands in story files).

## Game wiring (decisions)

The engine is wired into the running game: `src/game/story/storyRuntime.ts` is the single engine per session; `storyHost.ts`, `storyEffects.ts`, `storySaveGate.ts` are its pure, tested parts (`storyRuntimeParts.test.ts`); `src/story/load.ts` bundles `src/story/*.twee`; `StoryDialoguePopup` and the debug panel's `StoryDebugSection` are the UI. All five debug methods (`snapshot`, `status`, `debugSetVar`, `jumpToChapter`, `debugSetQuest`) exist now and are tested.

- **Off by default.** `src/story/` ships no campaign file (the example is in `src/story/example/`, not loaded: copy it up to try), so nothing changes in the shipped game until a story is added. No campaign = no engine, no debug section.
- **NPC id** = the actor type (`ActorSpec.actor`); a trailing number is stripped if only the bare name has an entry (`smith1` -> `smith`). The story takes over when `resolveEntry` finds an entry (it wins over `ActorSpec.dialogue` of the same NPC); no entry = the old dialogue/shop path. The NPC must still be interactable (dialogue library or shop set in its spec: `talkMode` is unchanged).
- **Window**: `StoryDialoguePopup` (same look and keys as `DialoguePopup`) renders the engine's `DialogueView`; a story `@shop` opens the existing `ShopPanel` over it.
- **Events raised**: `enemy_dead <actor type>` (first death of an actor on a run, not in the editor), `item_picked <item>` (in `addToHaul`: loose items, crates, wrecks), `level_exit <map id>` (gate/stairs transit start, not lifts), `map_entered <map id>` (every map change while playing). The arg is the map **id** (a single token, so `@on level_exit labirintus` works), not the display name.
- **Effects**: `give`/`take` -> inventory store, `reward credits` -> meta credits (other rewards warn), `shop` -> shop window, `text`/`banter` -> game log (`NAME: text`, the reply after its delay), `error` -> console. Quest readiness is refreshed after a batch that touched the inventory. The last 50 effects are kept for the debug panel.
- **Save moments**: after every effect batch and every debug edit the state goes to `Meta.storyState` through a save gate; also at the run end (`bankHaul`/`failRun` in App). Restored at first use (App mount). `canSave()` is false while an engine dialogue, the story shop, a lift ride or map transit, or an old dialogue/simple-shop window is open; the gate keeps the save pending and flushes it when the last of them ends. There is no visible save control in the game, so nothing to grey out. "reset save" restarts the story (`storyReset`).
- **Not done**: lifts raise no `level_exit`; non-credit `@reward`s only warn; the editor/Assets panel does not know the story dialect; nothing was run in a browser.
