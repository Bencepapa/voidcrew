// What an editor-made (shared) pickup is worth. The built-in ITEM_TYPES have their own values and are
// not touched; a pickup made in the Asset Manager has an optional `value` in its definition, and when it
// has none (empty field, or a pickup published before the field existed) its category's default counts.
// Pure: no UI, no storage.
import type { ItemCategory } from "./items";

/** Credits each, by category: in line with what the built-in items of that category are worth. */
export const CATEGORY_VALUES: Readonly<Record<ItemCategory, number>> = {
  salvage: 4,
  tech: 15,
  supplies: 10,
  valuables: 40,
  data: 30,
};

export const MAX_PICKUP_VALUE = 10_000;

export const categoryValue = (category: ItemCategory): number => CATEGORY_VALUES[category];

/** A stored value if it is a usable one (a finite number >= 0, rounded, capped), else undefined ("use the category's"). */
export function cleanPickupValue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(MAX_PICKUP_VALUE, Math.round(value));
}

/** The value a pickup is registered with: its own, else its category's default. */
export const pickupValue = (value: unknown, category: ItemCategory): number => cleanPickupValue(value) ?? categoryValue(category);
