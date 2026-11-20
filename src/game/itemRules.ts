import { DEFAULT_STACK, ITEM_TYPES } from "./items";
import type { ItemRules } from "./inventory";
import { WEAPON_TYPES, weaponStats, type OwnedWeapon } from "./weapons";
import type { Weapon } from "./combat";

// What the inventory (see inventory.ts) knows of the game's items: the item
// types' stack sizes and two-handed flags, and the weapons (meta.ts's
// WEAPON_TYPES) as items - "weapon:<type>", one to a cell, held in the hands.

const WEAPON_PREFIX = "weapon:";
export const weaponItemId = (type: string) => `${WEAPON_PREFIX}${type}`;
// the weapon type an item id names (null: not a weapon)
export const weaponTypeOfItem = (item: string): string | null => (item.startsWith(WEAPON_PREFIX) ? item.slice(WEAPON_PREFIX.length) : null);
export const isWeaponItem = (item: string) => item.startsWith(WEAPON_PREFIX);

export const itemRules: ItemRules = {
  stackMax: (item) => (isWeaponItem(item) ? 1 : (ITEM_TYPES[item]?.stack ?? DEFAULT_STACK)),
  twoHanded(item) {
    const weapon = weaponTypeOfItem(item);
    return weapon !== null ? !!WEAPON_TYPES[weapon]?.twoHanded : !!ITEM_TYPES[item]?.twoHanded;
  },
};

// the name of an item, weapon or not
export function itemName(item: string): string {
  const weapon = weaponTypeOfItem(item);
  return weapon !== null ? (WEAPON_TYPES[weapon]?.name ?? weapon) : (ITEM_TYPES[item]?.name ?? item);
}

// what an item is worth at the base (a weapon: its shop price; credits each)
export function itemValue(item: string): number {
  const weapon = weaponTypeOfItem(item);
  return weapon !== null ? (WEAPON_TYPES[weapon]?.price ?? 0) : (ITEM_TYPES[item]?.value ?? 0);
}

// a weapon item as it fires: the owned weapon's level (see meta.ts) if it has one
export function weaponOf(item: string, uid: number | undefined, owned: readonly OwnedWeapon[]): Weapon | undefined {
  const type = weaponTypeOfItem(item);
  if (type === null || !WEAPON_TYPES[type]) return undefined;
  return weaponStats(owned.find((w) => w.id === uid) ?? { id: -1, type, level: 0 });
}
