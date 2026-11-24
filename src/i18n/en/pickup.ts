// English strings for picking items up (game/pickupMode.ts), the testing switch for the enemies
// (game/enemiesOff.ts) and the crew's revival while the editor is on (game/editorWipe.ts).
export const pickupEn = {
  "pickup.tooFar": "Too far - step closer to pick it up.",
  "pickup.mode": "Item pickup",
  "pickup.modeHint": "Auto: stepping onto an item takes it. Click: only a click on it (or Use) does, so what is not wanted stays on the floor.",
  "pickup.default": "World default ({mode})",
  "pickup.auto": "Auto (step on it)",
  "pickup.click": "Click (or Use)",
  "pickup.mapDefault": "Viewer's choice / world default",
  "pickup.mapHint": "How loose items are picked up on this map. Unset: the player's choice, else the world's (the ship loop: auto, the open world: click).",
  "debug.enemiesInactive": "Enemies inactive (they stand still and do no harm)",
  "editor.crewRevived": "Editor: the crew was revived",
  "play.start": "Play: turn the enemies and the traps on",
  "play.stop": "Back to wander mode: enemies and traps off",
  "play.wander": "Wander mode: enemies and traps off",
  "play.logOn": "Play mode: the enemies and the traps are active.",
  "play.logOff": "Wander mode: the enemies stand still and the traps are off.",
} as const satisfies Record<string, string>;
