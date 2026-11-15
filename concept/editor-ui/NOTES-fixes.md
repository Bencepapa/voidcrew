# Editor fixes ? 2026-11-15

- Shared text-entry detection across the app and viewport: text/number entry,
  textareas and editable content retain typing keys; other controls allow shortcuts.
- Inspector selects, checkboxes and buttons release focus after edits/activation;
  range and numeric drags release focus on pointer-up. Numeric controls no longer
  swallow WASD/Tab. Escape leaves text entry; Enter finishes single-line input.
- Ground fog selection shows only the radius ring, plus a thin floor-to-height
  line and top tick. Both use the existing selected-only, non-pickable marker.
- Colour-only effect edits retain particle systems, markers, textures and particle
  state. Existing smoke/mist/fire emitter colours update directly; ground fog and
  sprite materials copy emitter tints. Colour is excluded from the effect rebuild
  comparison (the scene structure key already excludes all smoke settings).
- Fog and light colour pickers coalesce input to one callback per animation frame,
  flush the final value on native change, and close the undo merge gesture once.
  Light updates retain the existing in-place preview and debounced light bake.
- No new user-facing text; existing en/hu i18n labels are reused.

Validation:
- `npx.cmd tsc --noEmit` (Windows PowerShell blocks npx.ps1): passed.
- `git diff --check`: passed.
- Dev server started at http://localhost:3001/voidcrew/ using a temporary local
  Vite cache because the shared node_modules cache is outside writable scope.
- Browser interaction verification is blocked: browser access host unavailable,
  then native Chrome automation returned ?Computer Use was not approved to use
  Google Chrome?. Smooth dragging, immediate movement and visual ring appearance
  still require an interactive browser check; they are not claimed as verified.
- Commit blocked by workspace permissions: this linked worktree stores its Git index at C:/dev/js/VoidCrew/.git/worktrees/voidcrew-fixes/index.lock, outside the writable folder. No commit or push was made.
