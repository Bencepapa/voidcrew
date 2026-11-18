# Map place / name dialog (branch feature/map-place-dialog)

## What was done
- Data model: `MapFile.place?` and `MapFile.showTitle?` (optional). `GameMap` gets `place` (resolved), `hasPlace`, `showTitle`.
  Old maps keep their id; their place is the id prettified (`deck2-engineering` -> "Deck2 engineering"), name unchanged, no title caption by default.
  There is no JSON schema in the repo, so nothing else to extend (`validate.ts` works on the parsed map).
- Id derivation (`deriveMapId` in `src/editor/mapStore.ts`): slug of place + "-" + slug of name (accents stripped, lowercase,
  non `a-z0-9` runs become `-`), e.g. "Mualdeb városa" + "Tolvajok céhe" -> `mualdeb-varosa-tolvajok-cehe`; on collision `-2`, `-3`...
  The id is never asked, only previewed in the dialog. Rename keeps the id.
- `src/editor/Dialog.tsx`: reusable modal (+ `ConfirmDialog`); there was none before. `src/editor/MapDialog.tsx`: one dialog for
  New map (world, place combobox via datalist, name, size), Save as, Rename. Replaces the prompt() calls in `App.tsx` (`newMap`, `saveMapAs`).
  New "Rename…" button in the Map settings; `renameMap` in mapStore (an undoable edit).
- Loader: `src/editor/MapList.tsx`, collapsible groups by place, items shown "Place – Name"; used by the Map panel (MapFields) and the shared list.
- Shared maps: the head table has no place column, so the head title is saved as "Place – Name" (the body also carries `place`/`name`);
  the list splits the title on " – ". Heads without it go under "(no place)"; loading an old body without a place fills it from the title.
  The window.confirm on sign-in ("open latest shared revision") is now an in-app ConfirmDialog.
- Title caption: `src/components/MapTitle.tsx` (fade in/out ~3.6 s, 1.4 s after entering). Per-map `showTitle` checkbox in the map settings
  (default on when the map has an explicit place). No global switch (no obvious settings place; the per-map flag is enough).
- i18n: `src/i18n/{en,hu}/mapDialog.ts`. The old `app.newId/app.name/app.size/app.copyId` keys are now unused.

## Verified (dev server, browser)
New map dialog (derived id shown, map created and URL updated), Save as (+ `-2` collision suffix), Rename (list and status updated),
grouped list, caption appears with the flag on. `npx tsc --noEmit` clean.

## Not verified / caveats
- Screenshots were not possible (browser pane hidden); checked via DOM. Visual styling of the dialog is unreviewed.
- Shared (Supabase) save/load and the shared ConfirmDialog were not exercised (no login).
- Dev quirk (pre-existing): saving a new map file in dev adds a glob entry and HMR re-evaluates map modules, after which in-session
  unsaved maps/edits may not show; reload the page.
- The remaining window.confirm calls in TexturePanel / AssetManager / BaseScreen were left alone (not map flows).
- While testing I sent one Tab keydown to another agent's tab (port 4600) by mistake, toggling its editor.
