# Keyboard shortcut help overlay

- Added `src/editor/ShortcutHelp.tsx`: a self-contained dark modal, grouped as
  Editor, View and movement, Selection, and one group per tool. Every listed
  shortcut was checked against `App.tsx`, `GameViewport.tsx` and
  `useViewControls.ts`; nothing invented.
- Opens with `?` while editing (ignored in text entry) or the new `?` button in
  the editor top bar; closes on Escape, the `×` button, or a click outside.
  It stops pointer/click events from reaching the view underneath.
- All strings go through `src/i18n`; new keys were appended to `editorShell`
  for both `en` and `hu`, and the status bar hint now mentions `?`.
- Verified with `npx tsc --noEmit` (passes).
