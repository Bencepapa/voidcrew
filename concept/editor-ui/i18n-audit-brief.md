# i18n audit of the editor UI (small mechanical task)

Repo = your working directory (a git worktree on branch feature/i18n-audit). First read `concept/editor-ui/i18n-brief.md`
(the rules: `t()`, keys in `src/i18n/en/<area>.ts` and `src/i18n/hu/<area>.ts`, glossary) and `src/i18n/index.ts`.

Task: find user-visible strings in the EDITOR code that are still hard-coded (not going through `t()`), and move them into
the i18n files, with Hungarian texts following the glossary. Scope: `src/editor/**` (not AssetManager internals' asset
names/ids), `src/components/EditorBar*`-like files, `src/App.tsx` editor parts, `src/components/Minimap.tsx`,
`src/components/DebugPanel.tsx`. Look for: JSX text, `title=`, `aria-label=`, `placeholder=`, option texts, string
literals shown in UI, log messages. Do NOT touch the game UI (BaseScreen, combat, inventory etc.), ids, asset names from data.
Also find keys that exist in `en` but are missing in `hu` (or the reverse) and add the missing ones; remove nothing.

Rules: do not change layout or logic. Keep edits small and mechanical. Run `npx tsc --noEmit` (must be clean).
Commit on this branch when done; do not push. Write a short report of what you moved and what you left to
`concept/editor-ui/NOTES-i18n-audit.md`.
