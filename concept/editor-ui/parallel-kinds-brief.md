# Unified kind selectors (branch feature/kind-choice, folder voidcrew-ui)

Work only in this folder. Check with `npx tsc --noEmit`. Commit on this branch (if the sandbox blocks the commit, say so
in the notes); do not push. All text through `src/i18n` (en + hu). Dev server: your own, another port than 3000/3100,
with a separate Vite cacheDir (see `concept/editor-ui/NOTES-fixes.md`).

Implement the plan in `concept/editor-ui/UNIFY-KINDS.md` (already analysed: read it first, follow its "Proposal" and
"Exact edits per file"). Summary: one generic `KindChoice` in `src/editor/inspector/parts.tsx` (segmented button row for
<= 4 options, styled select for more) used by every kind/mode picker in the Inspector; a selected light can switch between
ceiling lamp and point light; actor type and door kind become editable in the Inspector; item type loses the duplicate
select. Palettes in the toolbar stay.

Constraints learned the hard way:
- Keyboard focus: after a choice is made the focus must go back to the game (see `src/keyboardFocus.ts`), WASD/Tab must work.
- The Inspector also has a "placing" mode (`Inspected.placing`, `templates` in `src/App.tsx`): choosing a kind there changes
  the template for the next element; do not break it.
- Editor UI is its own minimal style (see existing Inspector look), not the game UI.

## Done when
tsc clean; in the browser each kind control works in both languages, light kind switch works on a placed light, nothing
regressed in the Inspector (check the sci-fi world and the fantasy world, 1024x768). Write notes to
`concept/editor-ui/NOTES-kinds.md` including what you could not verify.
