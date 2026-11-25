// Where a world item dragged onto the screen is handed to the game (see worldDrop.ts for the rules,
// components/slotDrag.ts for the drag): the game's state sets the handler - it knows the map, the
// reach and the crew - and the drag calls it once the item is let go over a target.
//
// And the other way: an item dragged out of the inventory (a backpack cell, a hand box) and let go over
// the 3D view, or dropped with the Drop button or the D key (see dropItem.ts): the app sets that handler.

import type { DropTarget } from "./worldDrop";

export type WorldDropFn = (index: number, target: DropTarget) => void;

let handler: WorldDropFn | null = null;
export function setWorldDropHandler(fn: WorldDropFn | null) {
  handler = fn;
}
export function dropWorldItemOn(index: number, target: DropTarget) {
  handler?.(index, target);
}

// `from`: the slot key ("pack:3", "hand:reese:1"); `qty`: only that many of the stack (default: all). Returns why
// not ("busy", "editor", "keep", "empty", "crowded"), or null when it was dropped.
export type InventoryDropFn = (from: string, qty?: number) => string | null;

let inventoryHandler: InventoryDropFn | null = null;
export function setInventoryDropHandler(fn: InventoryDropFn | null) {
  inventoryHandler = fn;
}
export const canDropToWorld = (): boolean => inventoryHandler !== null;
export function dropInventoryItemToWorld(from: string, qty?: number): string | null {
  return inventoryHandler ? inventoryHandler(from, qty) : "busy";
}
