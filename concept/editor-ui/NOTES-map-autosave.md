# Map autosave (feature/map-autosave)

## What it does
- `src/editor/mapDrafts.ts`: drafts of the edited map in IndexedDB `voidcrew-map-drafts` (store `drafts`, key = map id; record: id, savedAt, baseFp, file). All calls are try/catch; without storage nothing happens.
- Written 1.5 s after the last edit, and on `visibilitychange` (hidden) / `pagehide`. Drafts over 16M chars of JSON are skipped. Undoing back to the saved map deletes the draft.
- Pure logic (fingerprint = FNV-1a of the JSON + length, `planDraft`) in `mapDraftLogic.ts`; test: `npx tsx src/editor/mapDraftLogic.test.ts`.
- `mapStore.ts` got a change listener (`onMapChange`), `savedFile`, `anyUnsavedEdits`, `markSaved`, `restoreFile`, `revertToSaved`. applyEdit/undo/redo notify "edit"; saveMap "saved"; downloadMap "downloaded".
- Clearing: dev-server Save, shared-map Save (`markSaved` in SharedEditor; not for "save as new"), Download, Discard.
- Restore: `useMapDrafts` (src/editor/DraftNotice.tsx, one hook call + `{draftNotice}` in App.tsx) runs when the open map id changes. A draft differing from the loaded map is applied as one undo step (so the map is "unsaved"), pushLog(..., "editor") and a banner with Discard / Keep appears (en + hu). Draft equal to the map is deleted silently. Base fingerprint differing -> banner/log add a "saved map has changed since" hint (the draft is still applied, never silently).
- `beforeunload` warns while any map has unsaved edits (there was none before).
- Each map has its own draft; maps not in src/maps (generated) have none.

## Verified (Vite dev, port 4600, browser pane)
Edit via mapStore -> draft appears in IndexedDB after ~1.5 s -> reload -> banner (hu) + edited name restored; Discard -> saved name back, draft gone, no banner; edit + Save -> draft deleted, unsaved false. tsc --noEmit clean; logic test passes.

## Not verified
- Stale-base banner in the browser (only the unit test); Keep button, Download and shared-save clearing in the browser; beforeunload dialog; en wording shown on screen (hu was); a map edited through real tool clicks (edits were made via mapStore.applyEdit).
- Maps made in-session (createMap, `shared-*` ids) have no file in src/maps, so `savedFile` is the in-memory base and a draft for them is only restored if that id exists again (ids are random for shared copies, so effectively not restored). A new-map dialog flow by another agent may want to call `clearDraft` when a map is deleted/renamed; drafts of a deleted map just stay unused.
- The browser pane is shared with other agents; one early check landed on another server (port 4500) and only changed in-memory state there.
