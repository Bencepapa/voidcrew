// The default keyboard controls of the game view (both movement modes, both
// worlds): W / S step or move forward / back, A / D strafe, Q / E turn; the
// arrow keys do up / down = forward / back, left / right = turn. WASD never
// turns. Pure mapping, shared by the grid key handler and the free-movement
// driver (see concept/editor-ui/NOTES-controls.md).
export type MoveAction = "forward" | "back" | "strafeLeft" | "strafeRight" | "turnLeft" | "turnRight";

const KEY_ACTIONS: Record<string, MoveAction> = {
  w: "forward",
  arrowup: "forward",
  s: "back",
  arrowdown: "back",
  a: "strafeLeft",
  d: "strafeRight",
  q: "turnLeft",
  arrowleft: "turnLeft",
  e: "turnRight",
  arrowright: "turnRight",
};

// the movement action a `KeyboardEvent.key` stands for, if any
export function moveActionForKey(key: string): MoveAction | undefined {
  return KEY_ACTIONS[key.toLowerCase()];
}

// the keys (lowercased) bound to an action, for held-key movement
export function keysFor(...actions: MoveAction[]): string[] {
  return Object.keys(KEY_ACTIONS).filter((k) => actions.includes(KEY_ACTIONS[k]));
}
