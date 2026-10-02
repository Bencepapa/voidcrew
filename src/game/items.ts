// Things to take home from a derelict: salvage, tech, supplies. On a run
// they only go into the haul (how many of each); the base turns them into
// upgrades and credits.

export type ItemCategory = "salvage" | "tech" | "supplies" | "valuables" | "data";

export interface ItemType {
  name: string;
  category: ItemCategory;
  // what it's worth at the base (credits each)
  value: number;
}

export const ITEM_TYPES: Record<string, ItemType> = {
  scrap: { name: "Scrap metal", category: "salvage", value: 2 },
  wiring: { name: "Wiring", category: "salvage", value: 4 },
  circuit: { name: "Circuit board", category: "tech", value: 12 },
  powercell: { name: "Power cell", category: "tech", value: 18 },
  servo: { name: "Servo motor", category: "tech", value: 25 },
  medkit: { name: "Medkit", category: "supplies", value: 15 },
  ammo: { name: "Ammo pack", category: "supplies", value: 8 },
  rations: { name: "Rations", category: "supplies", value: 5 },
  credits: { name: "Credit chip", category: "valuables", value: 50 },
  datachip: { name: "Data chip", category: "data", value: 30 },
};

export interface ItemStack {
  item: string;
  count: number;
}

// What a container holds when nobody put anything in it by hand: `rolls`
// picks (a few of them may come up empty), each an item by weight, a
// number of it in `count`'s range.
export interface LootTable {
  rolls: [number, number];
  empty: number;
  entries: { item: string; weight: number; count: [number, number] }[];
}

export const LOOT_TABLES: Record<string, LootTable> = {
  crate: {
    rolls: [1, 3],
    empty: 0.12,
    entries: [
      { item: "scrap", weight: 30, count: [2, 6] },
      { item: "wiring", weight: 20, count: [1, 4] },
      { item: "circuit", weight: 12, count: [1, 2] },
      { item: "powercell", weight: 8, count: [1, 2] },
      { item: "servo", weight: 4, count: [1, 1] },
      { item: "ammo", weight: 12, count: [1, 3] },
      { item: "rations", weight: 10, count: [1, 4] },
      { item: "medkit", weight: 5, count: [1, 1] },
      { item: "credits", weight: 3, count: [1, 1] },
      { item: "datachip", weight: 2, count: [1, 1] },
    ],
  },
  // a combat robot's wreck: parts
  robot: {
    rolls: [1, 3],
    empty: 0.05,
    entries: [
      { item: "scrap", weight: 25, count: [2, 5] },
      { item: "wiring", weight: 20, count: [1, 3] },
      { item: "servo", weight: 20, count: [1, 2] },
      { item: "circuit", weight: 18, count: [1, 2] },
      { item: "powercell", weight: 14, count: [1, 1] },
      { item: "ammo", weight: 8, count: [1, 2] },
    ],
  },
  medical: {
    rolls: [1, 2],
    empty: 0.2,
    entries: [
      { item: "medkit", weight: 40, count: [1, 2] },
      { item: "rations", weight: 20, count: [1, 3] },
      { item: "circuit", weight: 8, count: [1, 1] },
      { item: "datachip", weight: 4, count: [1, 1] },
    ],
  },
};

// a number 0..1 from a text, the same each time (FNV-1a, then scrambled)
function roll(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

// What the ship boarded does to its loot (see ships.ts): weights on the
// tables' entries by item category, and how much more of each there is.
let lootContext: { bias: Partial<Record<ItemCategory, number>>; scale: number } = { bias: {}, scale: 1 };
export function setLootContext(bias: Partial<Record<ItemCategory, number>>, scale: number) {
  lootContext = { bias, scale };
}

// A container's contents, rolled from its table: the same `key` (seed,
// deck, container) gives the same contents each time (on the same ship).
export function rollLoot(tableId: string, key: string): ItemStack[] {
  const table = LOOT_TABLES[tableId];
  if (!table) return [];
  if (roll(`${key}|empty`) < table.empty) return [];
  const [lo, hi] = table.rolls;
  const rolls = lo + Math.floor(roll(`${key}|rolls`) * (hi - lo + 1));
  const weight = (e: LootTable["entries"][number]) => e.weight * (lootContext.bias[ITEM_TYPES[e.item]?.category] ?? 1);
  const total = table.entries.reduce((sum, e) => sum + weight(e), 0);
  const out = new Map<string, number>();
  for (let r = 0; r < rolls; r++) {
    let pick = roll(`${key}|pick ${r}`) * total;
    const entry = table.entries.find((e) => (pick -= weight(e)) < 0) ?? table.entries[0];
    const [min, max] = entry.count;
    const count = Math.max(1, Math.round((min + Math.floor(roll(`${key}|count ${r}`) * (max - min + 1))) * lootContext.scale));
    out.set(entry.item, (out.get(entry.item) ?? 0) + count);
  }
  return [...out].map(([item, count]) => ({ item, count }));
}

// "3 × Scrap metal, 1 × Power cell"
export function stacksText(stacks: ItemStack[]): string {
  return stacks.map((s) => `${s.count} × ${ITEM_TYPES[s.item]?.name ?? s.item}`).join(", ");
}

// Where a loose item lies in its cell (cells from its center): its own
// offset, else a spot of its own scattered around the middle.
export function itemSpot(offset: [number, number] | undefined, index: number): [number, number] {
  if (offset) return offset;
  const a = roll(`spot ${index} a`) * Math.PI * 2;
  const r = 0.12 + roll(`spot ${index} r`) * 0.2;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

// a loot event the view shows (see GameViewport): a container's contents
// spilling out around it, then drawn in to the party's feet
export interface LootSpill {
  id: number;
  // the container's top (x, z in cells; y in wall heights)
  from: { x: number; y: number; z: number };
  // the floor it spills onto (wall heights)
  floorY: number;
  items: ItemStack[];
}
