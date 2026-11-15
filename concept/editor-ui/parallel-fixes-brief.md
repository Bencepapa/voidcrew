# Editor fixes (branch feature/editor-fixes, folder voidcrew-fixes)

Work only in this folder. Check with `npx tsc --noEmit`. Commit on this branch; do not push. Texts go through `src/i18n` (en + hu).

## 1. Keyboard focus after using the inspector
After changing a setting in the Inspector (select, slider, number field, colour input, checkbox) the focus stays on that
control, so WASD / Tab do not move the player in the 3D view; the user has to click into the game, which easily places a
new element. Fix: WASD, Tab and the other game/editor shortcuts must work right after an inspector edit.
- Controls that really take typed text (text/number inputs while being typed into, textareas) keep the keys.
- Everything else (select, range, checkbox, colour, buttons) must not swallow them: blur the control after a change
  (on change / pointer-up / Enter), and/or make the key handlers (see `src/App.tsx` ~line 610 and ~1147, plus the
  movement key handling in `src/components/GameViewport.tsx`) ignore only real text-entry targets.
- Escape from a text field should also give the focus back to the game.

## 2. Ground fog marker
Selected ground fog shows a ring + filled disc of its spread radius (`GameViewport.tsx`, search `fogRingMat`).
- Remove the filled disc; keep only the ring.
- Show the effect's height too: a thin vertical line / small marker from the floor to the fog height at the emitter
  (and optionally a second ring at the top height). Use the existing marker object, keep it visible only when selected.

## 3. Fog colour change lags
Dragging the fog colour picker in the Inspector re-generates the fog (rebuilds the effect) on every input event, so the
UI freezes while choosing a colour. Fix: a colour change must only update the material/uniform colour of the existing
effect (smoke/mist/groundFog systems in `src/render/`), never rebuild it; if the structure key currently includes the
colour, take it out. Also coalesce colour `input` events (one update per animation frame) and commit the undo step once,
on release. Check the same for the light colour.

## Done when
tsc is clean, in the browser (http://localhost:3000/voidcrew/ style dev server, or your own port) dragging the colour
picker stays smooth, WASD works right after an inspector edit, and the ring has no fill. Write what you did to
`concept/editor-ui/NOTES-fixes.md`.
