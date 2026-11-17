# Tuning download (production builds)

- Extracted the JSON serialisation of the tuning table into `textureTuningJson()` in `src/render/textureTuning.ts`; the dev save now posts the same string.
- In the Asset Manager, outside `import.meta.env.DEV` the save button becomes "Download tuning" / "Hangolás letöltése": it downloads the current table as `textureTuning.json` (pretty-printed, same shape as the dev save).
- Added a "Copy" / "Másolás" button next to it (non-dev only) using `navigator.clipboard.writeText`; it shows "Copied" / "Másolva" or a plain error message.
- Added the non-dev hint near the buttons explaining that the browser cannot write the project file and the downloaded file belongs at `src/render/textureTuning.json`.
- Added the i18n keys in the English and Hungarian `assetManager` files.
- Dev behaviour is unchanged: the button still writes through the dev endpoint.

Verified: `npx --no-install tsc --noEmit` is clean.

Not verified in a browser: the download and clipboard flows, and the production-build label swap. The worktree had no `node_modules`, so I recreated the junction to the main checkout's `node_modules` before running `tsc`.
