# Log colours in the editor — 2026-11-15

- LogPanel's kind→colour map is now exported, and EditorStatusBar uses it for both the history and the latest message.
- Added a `success` log kind (green); saved-map and saved-render messages use it instead of the neutral `editor` kind.
- Existing error (red) and warning (amber) colours are unchanged, and plain info keeps the status bar's own colour.
- The status bar's Saved label is green and Unsaved stays amber; no message text, layout or logic changed.
- `npx tsc --noEmit` passed.
