# Asset tree space (branch feature/tree-layout)
Repo = your cwd. Small task. Read src/editor/AssetTree.tsx and where the left column (minimap + AssetTree) is laid out (src/editor/EditorBar.tsx / src/App.tsx).
Problem: at 1024x768 the asset tree is only ~170px tall because the minimap above it is large.
Do: make the minimap block collapsible (small chevron toggle in its header, state kept in localStorage, default expanded; when collapsed show only a thin header row) so the tree gets the freed height; the tree must fill the remaining column height and scroll inside. All text via src/i18n (en + hu, existing area files). No logic changes elsewhere.
Run `npx tsc --noEmit` (clean). Commit on this branch; do not push. Write 5 lines of notes to concept/editor-ui/NOTES-layout.md.
