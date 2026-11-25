# Working in Voidcrew

- Start with [CODEMAP.md](CODEMAP.md) and verify the relevant paths in code. Keep changes scoped and commit them in small, focused commits.
- Put new logic in new small files. Target under 600 lines per file. Make only small, well-delimited edits to shared files, especially `src/components/GameViewport.tsx`, `src/App.tsx`, `src/game/mapFormat.ts`, `src/game/types.ts`, `src/i18n/index.ts`, `src/releaseNotes.ts` and `concept/verification-checklist.md`.
- Keep pure logic in separate modules free of React, three.js and DOM dependencies. Add a neighboring `name.test.ts` using `node:assert`. For a single test, use a command such as `npx tsx src/game/sounds.test.ts`.
- Use English for code and comments. Put every user-visible UI string in the matching English and Hungarian dictionaries under `src/i18n/`. Keep both sides' registrations when resolving merge conflicts in registration files.
- Add one concise Hungarian item per user-facing feature in the top release in `src/releaseNotes.ts`. Add an unchecked Hungarian manual check with steps and expected results to `concept/verification-checklist.md` when browser verification is needed. Mark it checked after running it.
- Run the type checker and all assertion scripts before handing off. Use PowerShell from the worktree root.

  ```powershell
  npx tsc --noEmit
  if ($LASTEXITCODE -ne 0) { throw "Type check failed" }
  Get-ChildItem -Recurse src,scripts -Include *.test.ts,*.test.tsx | ForEach-Object {
    npx tsx $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Test failed: $($_.FullName)" }
  }
  ```

- Work in the current worktree. Leave a linked `node_modules` in place. Do not push, merge or bump a version unless explicitly instructed.
