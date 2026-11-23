# tesztsztori: what to delete to remove it all

Everything of the playable test story carries the prefix `tesztsztori` (files, ids, actor types, items, quests, maps). Shared files hold it
only in blocks marked `tesztsztori: remove together`. To remove it all:

## 1. Delete these files (all match `*tesztsztori*`)

| Path | What |
|---|---|
| `src/story/tesztsztori-*.twee` (7 files) | the story: campaign, chapters 1-3, smith, Lana, party banter |
| `src/story/tesztsztori-switch.ts` | the on/off switch (`?map=tesztsztori...`, `?story=`, `voidcrew-story`) |
| `src/story/TESZTSZTORI-REMOVE.md` | this file |
| `src/maps/fantasy/tesztsztori.json`, `src/maps/fantasy/tesztsztori-labirintus.json` | the two maps (town, labyrinth) |
| `src/dialogues/tesztsztori.twee` | the fallback dialogue library of the test NPCs (story layer off) |
| `public/textures/item_tesztsztori_fagyerc/`, `item_tesztsztori_gyuru/`, `item_tesztsztori_runakard/` | the pickup sprites (copies of `item_gem`, `item_coins`, `item_sword`) |
| `src/game/story/tesztsztori.test.ts`, `src/game/tesztsztoriMaps.test.ts` | the tests |

## 2. Edit these shared files (each place is marked `tesztsztori`)

| File | Place (line as of the commit; search `tesztsztori`) | Change |
|---|---|---|
| `src/game/actors.ts` | ~1097-1110, between `// tesztsztori: remove together` and `// (end of tesztsztori)`, right after `ACTOR_TYPES`' closing `};` | delete the whole block (the `for` loop and `ACTOR_TYPES.tesztsztori_zsarnok = ...`) |
| `src/game/items.ts` | ~68-72, in `ITEM_TYPES` after `gem` | delete the three `tesztsztori_*` entries and the two comment lines |
| `src/game/worlds.ts` | ~110-111, `assetWorld` | back to `return id.startsWith("fantasy") \|\| FANTASY_ASSETS.has(id) ? "fantasy" : "scifi";` (drop the comment and the `startsWith("tesztsztori")` part) |
| `src/story/load.ts` | line 5 (import) and ~15-16 (`const sources = ...`) | delete the import; make it `const sources = storySources(RAW);` again |
| `src/game/dialogueCatalog.test.ts` | ~11-12 | back to `readdirSync(dir).filter(f => f.endsWith(".twee"))`, drop the comment |
| `concept/verification-checklist.md` | the bullet "Tesztsztori" in "Újabb funkciók" | delete the bullet |
| `src/story/README.md` | the section "The test story (tesztsztori)" at the end | delete the section, and the sentence "The one exception is the playable test story ..." in the intro |

## 3. Check

```
git grep -il tesztsztori      # should print nothing
npx tsc --noEmit
npx tsx src/game/story/example.test.ts
npx tsx src/game/dialogueCatalog.test.ts
```

Notes:
- `concept/story-example/` and `src/story/example/` are the untouched reference copies; they are not part of this.
- A saved game that played the test story keeps a `storyState` for chapters that no longer exist. Without a campaign file the engine is not created and the
  field is ignored; if another story is added later, use "reset save" on the base screen once (or clear `voidcrew` keys in localStorage).
- Hide instead of delete: nothing needs removing to hide it. The story layer only loads for the test maps (see the README section); the maps stay in the
  editor's list. To hide the maps too, move the two JSON files out of `src/maps/fantasy/`.
