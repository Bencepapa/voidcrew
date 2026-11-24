// Where a world item dragged onto the screen is handed to the game (see worldDrop.ts for the rules,
// components/slotDrag.ts for the drag): the game's state sets the handler - it knows the map, the
// reach and the crew - and the drag calls it once the item is let go over a target.

import type { DropTarget } from "./worldDrop";

export type WorldDropFn = (index: number, target: DropTarget) => void;

let handler: WorldDropFn | null = null;
export function setWorldDropHandler(fn: WorldDropFn | null) {
  handler = fn;
}
export function dropWorldItemOn(index: number, target: DropTarget) {
  handler?.(index, target);
}
