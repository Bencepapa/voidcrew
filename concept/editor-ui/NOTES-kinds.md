# Unified Inspector kind selectors — 2026-11-15

Implemented the Proposal and file edits from UNIFY-KINDS.md:
- Shared KindChoice: up to four options use neutral segmented radio buttons;
  larger lists use a styled select. Labels and tooltips reuse i18n. The toolbar
  supplies its darker idle style. Choices blur their control after activation
  and finish the Inspector undo gesture.
- Converted light placement/effect, particle effect, actor wake, door hack,
  map texture slots and weather. Added selected prop/actor type and door kind.
  Replaced the item type select with the shared control; toolbar palettes stay.
- Selected lights switch between point and ceiling. Point conversion starts at
  clamped mid-room height; ceiling conversion clears pos and bulb.
- Placing lights use lightPlace for the Inspector choice and update that state
  from kind patches, while other settings still update templates. The Inspector
  forwards its placing flag so the choice shows placement state without exposing
  selected-point transform controls for a next-light template. Point placement
  still uses the clicked surface position.
- Added editorBar.kind (Kind / Fajta); removed dead mist-style translation keys.
  Asset IDs, item names and texture labels follow the existing catalog labels.

Validation:
- npx.cmd tsc --noEmit: passed after final source changes.
- git diff --check: passed.
- Temporary esbuild/Node checks in ignored concept/gen: passed for shared control
  rendering at the segmented/dropdown threshold, exactly one selected radio,
  dropdown selection and en/hu labels; direct LightFields callback checks passed
  for point position defaults, clearing point-only fields and placing state.
  These checks do not verify DOM events, rendering in the game or keyboard input.
- Own Vite server: http://127.0.0.1:3201/voidcrew/, HTTP 200. Separate cacheDir:
  concept/gen/vite-kinds-cache. Config loader runner avoids writes to the shared
  node_modules/.vite-temp. Temporary helper: concept/gen/serve-kinds.mjs.
- Browser checks blocked: browser inventory reports the browser access host is
  unavailable; native Chrome access reports Computer Use was not approved to use
  Google Chrome. Could not verify each picker interactively in either language,
  sci-fi/fantasy at 1024x768, placed-light rendering, WASD/Tab focus return,
  placement behavior in-game, undo/redo or visual Inspector regressions.
- Commit blocked: git add cannot create
  C:/dev/js/VoidCrew/.git/worktrees/voidcrew-ui/index.lock (Permission denied).
  This linked-worktree index is outside the writable folder. No push attempted.
