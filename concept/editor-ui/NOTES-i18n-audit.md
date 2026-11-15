# i18n audit of the editor UI — notes

Branch: `feature/i18n-audit`. `npx tsc --noEmit` is clean.

## What was moved

110 keys added to `src/i18n/en/editorShell.ts` and `src/i18n/hu/editorShell.ts`
(the existing editor-shell area; no new area files or `index.ts` changes).
Every new English key has its Hungarian pair, following the glossary.

- `src/editor/ActorEditor.tsx` — title, buttons, sheet/frame/preview labels,
  ghost options, tooltips, status lines, canvas frame label and footer.
  Also calls `useLang()`: this dev tool is rendered outside App's tree.
- `src/editor/PropEditor.tsx` — panel titles, relief/normal fields and hints,
  prop-kind descriptions, view labels, size/elevation/shape/face labels,
  add/remove buttons, table headers, drag hint, save status.
- `src/editor/SharedEditor.tsx` — button, dialog title/close, sign-in form
  (email/password/login), save/copy/upload texts, list, messages and errors.
- `src/editor/SheetViewport.tsx` — "Fit" and "Wheel to zoom".
- `src/editor/mapEdits.ts` — resize errors (short/narrow/edge not wall/something on edge).
- `src/editor/mapStore.ts` — missing/bad/duplicate map-id errors.
- `src/editor/materialMaps.ts` — "Invalid image file" error.

The last three surface in the editor log through `app.editorError` /
`app.saveFailed`.

Small mechanical adjustments needed by the extraction:
- `PropEditor.postEdit` now returns `{ ok, text }` so the "saved" state check
  no longer depends on an English prefix.
- `ActorEditor` re-renders on language change and redraws its canvas label.
No layout, styling or behaviour changed.

## What was left alone

- Shortcut key-column labels in `ShortcutHelp.tsx` ("Mouse drag", "Wheel",
  "Delete"…): the file explicitly documents that the keys themselves are not
  translated, only the descriptions (which already were).
- Asset/data names: `PROP_TYPES`/`ACTOR_TYPES`/`ITEM_TYPES` ids and names,
  texture-set labels, decal names, the fallback `"Shared texture"` label.
- Code tokens and paths: `terminal:log1` placeholder, texture folders in the
  prop-editor hint (`public/textures/...`), edge letters N/S/E/W, prop kinds.
- Units/symbols: `px`, `fps`, `%`, `°`, `×`, axis letters x/y/z, `#`, the
  `-` placeholder in link fields.
- Server-returned error text (`res.text()` / Supabase messages).
- Game UI (BaseScreen, combat, inventory, etc.) and `src/i18n/index.ts`.

## Missing keys

No key existed in `en` without a `hu` counterpart (or the reverse) before
this audit; the per-area key sets matched. All new keys were added to both
sides (the Hungarian `editorShell` file is a full `Record`, so a miss would
fail type-check).

## Unsure / worth a look

- The map settings in `DebugPanel` and the editor dock in `App.tsx` were
  already fully translated and needed no changes.
- `PropEditor` table headers are now keys whose Hungarian values intentionally
  match the English notation (`min x`, `max x`, …) — standard coordinate
  notation in Hungarian too.
- `mapStore`/`mapEdits` still pass through parse errors from `game/mapFormat`
  untranslated; that code is outside the assigned `src/editor/**` scope.
