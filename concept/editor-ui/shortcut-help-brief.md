# Keyboard shortcut help overlay (small, self-contained)

Repo: C:\dev\js\voidcrew (you work in your own git worktree; commit there, do not push). Check with `npx tsc --noEmit`.

Add a keyboard-shortcut help overlay for the map editor:
- New component `src/editor/ShortcutHelp.tsx`: a modal panel listing the editor's shortcuts grouped by tool (find them in
  `src/App.tsx` key handlers, `src/editor/EditorBar.tsx` hints and `src/editor/EditorStatusBar.tsx`: Tab, Ctrl+S, Ctrl+Z/Y,
  Escape, Delete, Ctrl+C/V, Alt, tool keys, WASD/mouse in the view, etc. - list only what really exists in the code).
- Opens with the `?` key (when focus is not in a text field; see `src/keyboardFocus.ts`) and from a small `?` button in the
  editor top bar; closes with Escape or a click outside.
- All text through `src/i18n` (add a new area file only if needed, else append to `editorShell` keys, both `en` and `hu`).
- Editor UI is its own minimal dark style (copy the look of the existing editor panels), keep it small.
Write a few lines about what you did to `concept/editor-ui/NOTES-shortcuts.md`.
