// An item lying in the world, dragged from the 3D view and let go over the screen (the pure
// decisions; the pointer and the DOM are in components/slotDrag.ts, the game's side is
// useGameState's dropWorldItem).
//
// Where it can be let go (the elements carry `data-slot`, `data-drop-crew`, `data-drop-pack`):
//   - a hand box: that crewmate takes it in that hand (what the hand held goes to the backpack)
//   - anywhere on a crewmate's card (avatar): a consumable is used on THEM at once, anything else
//     goes into the backpack
//   - the inventory button, the open inventory window, or one of its cells: into the backpack
//     (into that cell if it takes it)
//   - anywhere else: nothing happens, the item stays where it lies
// It must be within reach, as for a click pickup (see pickupMode.ts).

import { addItem, equipHand, parseLoc, type HandIndex, type Inventory, type ItemRules, type Slot } from "./inventory";
import { applyUse } from "./itemUse";
import type { ItemUse } from "./items";
import { clickPickup } from "./pickupMode";
import type { Crewmate } from "./types";

export type DropTarget =
  | { kind: "hand"; crew: string; hand: HandIndex }
  | { kind: "avatar"; crew: string }
  // `index`: the cell of the open window it was let go on (null: just the backpack)
  | { kind: "pack"; index: number | null };

// what an element under the pointer says it is: its `data-slot` key, the crewmate whose card it is
// in, and whether it is the inventory (the button, the window)
export interface DropMarks {
  slot?: string | null;
  crew?: string | null;
  pack?: boolean;
}

// The target the marks name - `marks` are the elements under the pointer, the top one first: the
// first that names one (a hand box inside a card is the hand, a cell inside the window is the cell).
export function dropTargetOf(marks: readonly DropMarks[]): DropTarget | null {
  for (const m of marks) {
    const loc = m.slot ? parseLoc(m.slot) : null;
    if (loc?.kind === "hand") return { kind: "hand", crew: loc.crew, hand: loc.hand };
    if (loc?.kind === "pack") return { kind: "pack", index: loc.index };
    if (m.crew) return { kind: "avatar", crew: m.crew };
    if (m.pack) return { kind: "pack", index: null };
  }
  return null;
}

// What happens: nothing ("cancel": no target, taken already, the party is busy), "far" (out of
// reach: said so), or into a "hand", "use" (on the avatar's crewmate), the "pack".
export type WorldDropPlan = "cancel" | "far" | "hand" | "use" | "pack";

export function planWorldDrop(input: { target: DropTarget | null; taken: boolean; busy: boolean; reach: boolean; usable: boolean }): WorldDropPlan {
  if (!input.target) return "cancel";
  const click = clickPickup(input);
  if (click === "taken" || click === "busy") return "cancel";
  if (click === "far") return "far";
  if (input.target.kind === "hand") return "hand";
  if (input.target.kind === "avatar") return input.usable ? "use" : "pack";
  return "pack";
}

// Puts a stack into the backpack: into `cell` if it is free (or holds the same item, with room),
// the rest - or all of it, with no cell - onto stacks and into free cells. Null when it doesn't all fit.
export function putInPack(inv: Inventory, stack: Slot, rules: ItemRules, cell: number | null = null): Inventory | null {
  let cur = inv;
  let left = stack.qty;
  if (cell !== null && cell >= 0 && cell < inv.pack.length) {
    const max = stack.uid === undefined ? Math.max(1, rules.stackMax(stack.item)) : 1;
    const there = inv.pack[cell];
    const room = !there ? max : there.item === stack.item && there.uid === undefined && stack.uid === undefined ? max - there.qty : 0;
    const take = Math.min(left, room);
    if (take > 0) {
      const pack = inv.pack.slice();
      pack[cell] = there ? { ...there, qty: there.qty + take } : { ...stack, qty: take };
      cur = { ...inv, pack };
      left -= take;
    }
  }
  if (left <= 0) return cur;
  const r = addItem(cur, stack.item, left, rules, stack.uid);
  return r.left > 0 ? null : r.inv;
}

export type WorldDropResult =
  // "full": the backpack has no room for what has to go there - nothing was changed, the item stays
  | { ok: false; reason: "full" }
  | {
      ok: true;
      how: "hand" | "pack" | "used";
      inv: Inventory;
      // "used": the crew as it is now, who was helped and by how much
      crew?: Crewmate[];
      target?: string;
      hp?: number;
      en?: number;
      // "pack" after an avatar drop: why the item was not used (the crewmate is down / needs nothing)
      notUsed?: "down" | "nothing";
    };

// Does a plan ("hand", "use" or "pack") on the inventory and the crew; `stack` is what lay there
// (everything of it is taken, or all but the one used up).
export function applyWorldDrop(input: {
  plan: "hand" | "use" | "pack";
  target: DropTarget;
  inv: Inventory;
  crew: readonly Crewmate[];
  stack: Slot;
  use?: ItemUse;
  rules: ItemRules;
  roll: (range: [number, number]) => number;
}): WorldDropResult {
  const { plan, target, inv, stack, rules } = input;
  const cell = target.kind === "pack" ? target.index : null;
  if (plan === "hand" && target.kind === "hand") {
    const next = equipHand(inv, target.crew, target.hand, stack, rules);
    return next ? { ok: true, how: "hand", inv: next } : { ok: false, reason: "full" };
  }
  let notUsed: "down" | "nothing" | undefined;
  if (plan === "use" && target.kind === "avatar" && input.use) {
    const outcome = applyUse(input.crew, target.crew, input.use, input.roll, target.crew);
    if (outcome.ok) {
      // (one is used up; the rest of a stack goes into the backpack)
      const rest = stack.qty - 1;
      const next = rest > 0 ? putInPack(inv, { ...stack, qty: rest }, rules) : inv;
      if (!next) return { ok: false, reason: "full" };
      return { ok: true, how: "used", inv: next, crew: outcome.crew, target: outcome.target, hp: outcome.hp, en: outcome.en };
    }
    notUsed = outcome.reason;
  }
  const next = putInPack(inv, stack, rules, cell);
  return next ? { ok: true, how: "pack", inv: next, notUsed } : { ok: false, reason: "full" };
}
