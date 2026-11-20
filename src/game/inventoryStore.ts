import { useSyncExternalStore } from "react";
import type { Weapon } from "./combat";
import {
  RIGHT,
  addLoot,
  emptyInventory,
  equipLoadout,
  handsOf,
  moveSlot,
  parseLoc,
  settleOverflow,
  swapHands,
  totals,
  type Inventory,
  type MoveResult,
  type Slot,
} from "./inventory";
import { isWeaponItem, itemRules, weaponItemId, weaponOf, weaponTypeOfItem } from "./itemRules";
import type { ItemStack } from "./items";
import { commitLoadout, getMeta, type CarriedWeapon } from "./meta";

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

let inventory: Inventory = seedRun();
const listeners = new Set<() => void>();
function set(next: Inventory) {
  inventory = next;
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

// a drag or click-click move between two places ("pack:3", "hand:reese:1")
export function moveItem(from: string, to: string): MoveResult {
  const a = parseLoc(from);
  const b = parseLoc(to);
  if (!a || !b) return { ok: false, reason: "place" };
  const result = moveSlot(inventory, a, b, itemRules);
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

// the weapon a crewmate fires: the one in the right hand, else the left's
export function crewWeapon(crewId: string): Weapon | undefined {
  const hands = handsOf(inventory, crewId);
  const owned = getMeta().weapons;
  for (const slot of [hands[RIGHT], hands[0]]) {
    const weapon = slot && weaponOf(slot.item, slot.uid, owned);
    if (weapon) return weapon;
  }
  return undefined;
}

// whether a crewmate holds a weapon in each hand, to switch between
export function canSwitch(crewId: string): boolean {
  const [left, right] = handsOf(inventory, crewId);
  return !!left && !!right && isWeaponItem(left.item) && isWeaponItem(right.item);
}

// the hands swap: the other weapon is the one in use
export function switchWeapon(crewId: string) {
  if (!canSwitch(crewId)) return;
  const next = swapHands(inventory, crewId, itemRules);
  if (next) set(next);
}
