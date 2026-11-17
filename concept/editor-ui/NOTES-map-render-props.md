# Map render attributes in the map settings panel

- Extracted the Debug panel's "Map attributes" section into
  `src/components/MapRenderSettings.tsx`. It keeps the same props and handlers
  (`settings`, `onChange`, `mapId`, `mapHasRender`, `onSaveRender`,
  `onClearRender`), slider ranges, labels and existing debug i18n keys, and the
  same save/clear calls.
- The extracted panel groups the fields into collapsible subsections: Walls
  (wall type, relief shape, relief/bevel/displacement sliders, wall height),
  Floors, Material, Light (sliders and fog colour), Sky light (preset, strength,
  azimuth, elevation, colour) and Gameplay (headlamp, idle head bob). The save
  and clear buttons sit below the subsections and stay visible. Each subsection
  remembers its open state in `localStorage` under
  `voidcrew-inspector:mapRender:<subsection>`.
- `MapFields` renders the new panel after the existing Transform and Look
  sections, so it appears in the Inspector's "Map settings" tab. `EditorBarProps`
  now carries the viewport settings and the save/clear handlers; `App` supplies
  them from the same `settings`/`setSettings`/`saveRender` state as before.
- Added only the subsection-title i18n keys (`inspector.walls`, `inspector.floors`,
  `inspector.material`, `inspector.light`, `inspector.skyLight`,
  `inspector.gameplay`) in the English and Hungarian inspector files.
- Removed the whole map-attributes section from `DebugPanel`. The "Edit map
  (Tab)" and "Download map JSON" buttons remain there only outside the editor
  (the compact mobile menu); the editor's Debug overlay passes `inEditor` and no
  longer shows them.

Verification:
- `npx tsc --noEmit` is clean.
- A temporary Vite config on port 3900 (cache in the approved temp directory)
  served the app and transformed the new/changed modules with HTTP 200; the
  server, config and cache were removed afterwards.
- Not verified interactively in a browser: the Inspector layout at narrow
  widths, subsection collapse persistence, and an actual Save/Clear write from
  the new location. No Playwright/browser automation is installed in this
  checkout.

Environment notes:
- The worktree's `node_modules` junction was missing; recreated it to the main
  checkout's `node_modules` before type-checking.
- The worktree `.git` file pointed at the main repository through an MSYS-style
  path that Git for Windows could not resolve; rewrote it locally to the Windows
  path. This is worktree metadata only and is not part of the commit.
