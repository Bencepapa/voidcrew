import { useSyncExternalStore } from "react";
import type { Weapon } from "./combat";
import {
  addLoot,
  effectiveHand,
  emptyInventory,
  equipLoadout,
  handsOf,
  moveSlot,
  moveSome,
  parseInventory,
  parseLoc,
  settleOverflow,
  splitSlot,
  totals,
  type HandIndex,
  type Inventory,
  type MoveResult,
  type Slot,
} from "./inventory";
import { isWeaponItem, itemRules, weaponItemId, weaponOf, weaponTypeOfItem } from "./itemRules";
import { ITEM_TYPES, type ItemStack } from "./items";
import { commitLoadout, getMeta, saveInventory, type CarriedWeapon } from "./meta";

// The run's live inventory (see inventory.ts for the rules): the party's
// backpack and each crewmate's two hands. Module state like meta.ts, so the
// panels and the game share it; like the haul it replaced it lasts as long as
// the run (it is not saved - what comes home goes to meta.ts's stash and
// loadout when the run is banked, see bankRun).

// A run begins with each crewmate's loadout in hand: the weapon in use in the
// right hand, the other in the left (see equipLoadout).
function seedRun(): Inventory {
  const meta = getMeta();
  const typeOf = (id: number) => meta.weapons.find((w) => w.id === id)?.type;
  let inv = emptyInventory();
  for (const [crew, slots] of Object.entries(meta.loadout)) {
    inv = equipLoadout(inv, crew, slots, meta.active[crew] ?? 0, typeOf, weaponItemId, itemRules);
  }
  return inv;
}

// What a save may still hold: an item that exists, a weapon that is still owned.
const isKnown = (slot: Slot): boolean => {
  const type = weaponTypeOfItem(slot.item);
  if (type !== null) return slot.uid === undefined ? true : getMeta().weapons.some((w) => w.id === slot.uid);
  return !!ITEM_TYPES[slot.item];
};

// The inventory the game starts with: the one saved in the meta (a reload keeps
// the backpack, the hands and what's carried loose); a crewmate who has no hands
// in the save (an older one, or a crew that came later) gets their loadout. No
// save (or an unreadable one): everyone's loadout in hand, an empty backpack.
function restoreRun(): Inventory {
  const meta = getMeta();
  const saved = meta.inventory?.v === 1 ? parseInventory(meta.inventory, itemRules, isKnown) : null;
  if (!saved) return seedRun();
  const typeOf = (id: number) => meta.weapons.find((w) => w.id === id)?.type;
  let inv = saved;
  for (const [crew, slots] of Object.entries(meta.loadout)) {
    if (inv.hands[crew]) continue;
    inv = equipLoadout(inv, crew, slots, meta.active[crew] ?? 0, typeOf, weaponItemId, itemRules);
  }
  return inv;
}

let inventory: Inventory = restoreRun();
const listeners = new Set<() => void>();
function set(next: Inventory) {
  inventory = next;
  saveInventory({
    v: 1,
    pack: next.pack.slice(),
    hands: Object.fromEntries(Object.entries(next.hands).map(([crew, pair]) => [crew, [pair[0], pair[1]]])),
    overflow: { ...next.overflow },
  });
  listeners.forEach((l) => l());
}

export const getInventory = () => inventory;
export function useInventory(): Inventory {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => inventory,
  );
}

// a new run: an empty backpack, the loadout (as the base has it now) in hand
export function startRun() {
  set(seedRun());
}

// A run that came home: the weapons the crew holds are their loadout from now
// on (and any weapon nobody owned yet is theirs to keep). Call it before the
// next startRun. What's in the backpack other than weapons is the haul (haulOf).
export function bankRun() {
  const held: Record<string, [CarriedWeapon | null, CarriedWeapon | null]> = {};
  const carried = (s: Slot | null): CarriedWeapon | null => {
    const type = s ? weaponTypeOfItem(s.item) : null;
    return s && type ? { type, uid: s.uid } : null;
  };
  for (const crew of Object.keys(inventory.hands)) {
    const [left, right] = handsOf(inventory, crew);
    held[crew] = [carried(right), carried(left)];
  }
  const spare = inventory.pack.flatMap((s) => (s && s.uid === undefined && isWeaponItem(s.item) ? [weaponTypeOfItem(s.item)!] : []));
  commitLoadout(held, spare);
}

// what the run has taken (how many of each - the weapons aren't haul)
export const haulOf = (inv: Inventory): Record<string, number> => totals(inv, isWeaponItem);

// Picks things up (see items.ts): into the backpack, what doesn't fit is
// carried loosely (the inventory's overflow). Returns what overflowed.
export function addToInventory(stacks: ItemStack[]): ItemStack[] {
  let inv = inventory;
  const overflowed: ItemStack[] = [];
  for (const s of stacks) {
    const r = addLoot(inv, s.item, s.count, itemRules);
    inv = r.inv;
    if (r.overflowed > 0) overflowed.push({ item: s.item, count: r.overflowed });
  }
  set(inv);
  return overflowed;
}

// a drag or click-click move between two places ("pack:3", "hand:reese:1");
// with `qty`, only that many of the stack (a split)
export function moveItem(from: string, to: string, qty?: number): MoveResult {
  const a = parseLoc(from);
  const b = parseLoc(to);
  if (!a || !b) return { ok: false, reason: "place" };
  const result = qty === undefined ? moveSlot(inventory, a, b, itemRules) : moveSome(inventory, a, b, qty, itemRules);
  if (result.ok) set(settleOverflow(result.inv, itemRules));
  return result;
}

// `qty` of the stack at a place into the first free backpack cell
export function splitItem(from: string, qty: number): MoveResult {
  const a = parseLoc(from);
  if (!a) return { ok: false, reason: "place" };
  const result = splitSlot(inventory, a, qty, itemRules);
  if (result.ok) set(settleOverflow(result.inv, itemRules));
  return result;
}

// for other panels (a shop): change the inventory with your own function; null
// leaves it as it was
export function changeInventory(fn: (inv: Inventory) => Inventory | null): boolean {
  const next = fn(inventory);
  if (!next) return false;
  set(settleOverflow(next, itemRules));
  return true;
}

// --- weapons in hand ---

// the weapon a crewmate holds in a hand (a two-handed one counts for both),
// if the hand holds one: each hand fires, and cools down, on its own
export function handWeapon(crewId: string, hand: HandIndex): Weapon | undefined {
  const real = effectiveHand(inventory, crewId, hand, itemRules);
  const slot = handsOf(inventory, crewId)[real];
  return (slot && weaponOf(slot.item, slot.uid, getMeta().weapons)) || undefined;
}
