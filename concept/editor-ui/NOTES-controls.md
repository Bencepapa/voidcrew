# Default game controls (fantasy and sci-fi alike)

| Input | Action |
| --- | --- |
| W / Up | step / move forward |
| S / Down | step / move back |
| A | strafe left |
| D | strafe right |
| Q / Left | turn left |
| E / Right | turn right |
| X | jump down (grid) |
| Mouse: left button + drag | look: grid movement peeks sideways (released far enough it commits to a 90 degree turn, vertical swipe steps); free movement turns the view |
| Mouse: just moving | nothing - no free look, no pointer lock |

WASD never turns. Mapping lives in `src/game/controls.ts` (`moveActionForKey`, `keysFor`), used by the
grid key handler in `App.tsx` and by `useFreeMovement`; test: `npx tsx src/game/controls.test.ts`.
On-screen arrow buttons and touch swipes / joysticks are unchanged.

## Previous behaviour

- Grid movement: W/S forward/back, **A/D turned**, **Q/E strafed**. Moving the mouse with no button
  glanced around (peek, +-60 degrees, eased back); left-drag peeked.
- Free movement: W/S move, A/D strafe, Q/E turn (already as now), but clicking the view took pointer
  lock for mouselook (Esc released); hint "Click the view for mouselook".
- There was no control-scheme setting, so no stored value to migrate (the only related setting,
  `gridMovement`, is unchanged).

## Editor

Edit-mode shortcuts are unchanged: the editor never bound W/A/S/D/Q/E itself. The grid key handler also
runs in edit mode, so the same new mapping applies there; the top-down view (O) captures WASD/QE first
(capture phase) as before, and edit-mode mouse drag looking is as before. Shortcut help (`?`) rows and
the free-movement hint text were updated (en, hu).
