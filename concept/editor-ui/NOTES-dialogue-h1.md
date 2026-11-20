# Dialogue H1 notes (branch feature/dialogue-twee)

## What was done
- `src/game/dialogue.ts` (pure): `parseTwee(source, id, knownShops?)`, `checkDialogue`, `startDialogue`, `choose`, types per the plan. Rules: one .twee = one library, entries = `start`-tagged passages plus one named `Start`, duplicates are errors, links removed from text, `@` lines are commands (`@end`, `@shop [id]`, anything else = unknown warning).
- `src/game/dialogue.test.ts`: `npx tsx src/game/dialogue.test.ts` (void-fantasy and invalid-duplicate samples, CRLF/BOM, four link forms, name escapes, run Wizard -> Buy/Sell -> Goodbye). Passes.
- Assets: new main category "Dialogues" / "Párbeszédek". `src/editor/DialoguesPanel.tsx` renders the whole body of the manager for it (list, test window, properties). Drafts: `src/editor/dialogueDrafts.ts`, IndexedDB store `dialogueDrafts` (`{id, name, twee, updated}`); `idb.ts` DB version bumped 3 -> 4 to add the store.
- i18n: `src/i18n/{en,hu}/dialogue.ts`, registered in `src/i18n/index.ts`.
- Plan: `concept/dialogue-shop-plan.md` sections 1 and 2 rewritten with the final rules; H1 ticked.

## Choices worth knowing
- A passage that is reachable but has an empty text, no choices and no commands gets the "empty passage" warning; one with only `@end` or `@shop` does not.
- Unreachable AND completely empty passages (Twine's "Untitled Passage") are silent.
- Dead-end warning only applies to entry passages (as specified).
- The test log accumulates across the whole run: `shop: wizard-shop`, `end`. In the window `@shop` only prints "would open the shop ...".
- The sub-category and world selectors of the manager header are hidden for Dialogues (they do not apply).
- Name shown for a library = StoryTitle, else the file name. Re-importing the same id asks to replace.

## Not verified
- No browser run at all (as instructed): `npx tsc --noEmit`, the pure test and `npm run build` pass. The UI (file picker, paste, key 1-9, IndexedDB persistence, the DB version upgrade) is untested in a browser.
- Not tested: opening an older profile whose IndexedDB is at version 3 (the upgrade only adds a store, like the earlier bumps).

## How to test (browser)
1. Open the editor, Assets, main category "Dialogues".
2. `+ New`, pick `concept/dialogue/samples/void-fantasy.twee`: expect no problems, entries Wizard in town and Smith in town, 8 passages incl. the empty one.
3. Test window: Wizard in town -> choose Buy/Sell (key 2): log shows `[command] shop: wizard-shop ...`; Goodbye (key 2) -> `[command] end`, "The dialogue ended". Restart works; switch the entry to Smith in town.
4. Import `invalid-duplicate.twee`: red duplicate and broken link errors, yellow unknown command; clicking a problem selects the passage.
5. Reload the page: the libraries are still there. Re-import the same file: replace confirmation. Delete: confirmation, then gone. Try "Paste text instead" too.
