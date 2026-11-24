// Dropping an item from the inventory onto the ground (the pure rules; the pointer and the keys are in
// components/slotDrag.ts and InventoryPanel.tsx, the game's side is useGameState's dropInventoryItem).
//
// What leaves the inventory: a backpack cell's stack or a hand box's item - all of it, or `qty` of it (a
// quantity chooser, Shift on the release, Shift+D) - except an owned weapon (it carries its own uid and
// the loadout, not the floor, is where it belongs) and anything the world has no picture for.
//
// Where it lands: the cell the party faces (one ahead) if the party could simply walk onto it - a floor
// cell on the surface the party stands on, no wall, ledge, fence, big prop or shut door in the way - else
// the cell the party stands in. Each pile gets a spot of its own in the cell (spotCandidates, pickSpot) so
// several do not overlap, up to DROP_PER_CELL piles.
//
// What it is afterwards: a runtime loose item (`MapItem.dropped` marks it, it is appended to the played
// map's items - never to a map file) that is picked up, clicked and dragged like any loose item. In the
// ship loop ("auto" pickup) stepping onto a cell takes what lies there - but not what was dropped while
// the party stood on that cell, until it has left the cell once (armDrops, autoExempt). A pressure plate
// answers to the dropped items lying on its cell (itemsOnCell, platesKey).

import { parseLoc, takeSlot, type Inventory, type ItemRules } from "./inventory";
import { inPickupReach } from "./pickupMode";
import type { CellType, MapItem, Vec2 } from "./types";

// piles of dropped items one cell holds (what lies there still)
export const DROP_PER_CELL = 12;
// the least distance between two piles in a cell (cells), when there is room
export const DROP_GAP = 0.2;

// ---- what may be dropped

export type DropRefusal = "empty" | "weapon" | "unique" | "unknown";

export interface DropCheck {
  // an owned weapon (see itemRules.ts)
  isWeapon(item: string): boolean;
  // an item type the world can show on the floor
  known(item: string): boolean;
}

export type InventoryDrop = { ok: true; inv: Inventory; item: string; count: number } | { ok: false; reason: DropRefusal };

// `qty` (default: all) of the stack at `from` ("pack:3", "hand:reese:1") out of the inventory
export function planInventoryDrop(inv: Inventory, from: string, qty: number | undefined, rules: ItemRules, check: DropCheck): InventoryDrop {
  const loc = parseLoc(from);
  const taken = loc ? takeSlot(inv, loc, rules, qty) : null;
  if (!taken) return { ok: false, reason: "empty" };
  const { slot } = taken;
  if (slot.uid !== undefined) return { ok: false, reason: "unique" };
  if (check.isWeapon(slot.item)) return { ok: false, reason: "weapon" };
  if (!check.known(slot.item)) return { ok: false, reason: "unknown" };
  return { ok: true, inv: taken.inv, item: slot.item, count: slot.qty };
}

// ---- where it lands

// the map as the landing rule asks about it
export interface LandingWorld {
  cellType(cell: Vec2): CellType;
  floor(cell: Vec2): number;
  // the step from the party's cell onto `to` is a plain walk (no wall, ledge, ladder, fence or big prop)
  walkable(from: Vec2, to: Vec2): boolean;
  // a door that is shut lies between them
  doorShut(from: Vec2, to: Vec2): boolean;
}

// `facing`: the unit step the party faces; `elevation`: the height it stands at
export function landingCell(party: Vec2, facing: Vec2, elevation: number, world: LandingWorld): { cell: Vec2; ahead: boolean } {
  const ahead = { x: party.x + facing.x, y: party.y + facing.y };
  const free =
    (facing.x !== 0 || facing.y !== 0) &&
    world.cellType(ahead) === "floor" &&
    inPickupReach(party, elevation, ahead, world.floor(ahead)) &&
    world.walkable(party, ahead) &&
    !world.doorShut(party, ahead);
  return free ? { cell: ahead, ahead: true } : { cell: { x: party.x, y: party.y }, ahead: false };
}

// ---- where in the cell

export type Spot = [number, number];
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// The places a pile may lie in a cell, best first (cells from its middle, as MapItem.offset): in the cell
// the party stands in, the front of it first (the party's eye is the middle) and round; in the one ahead,
// the middle first and then round from the near side. Two rings, 17 places.
export function spotCandidates(ahead: boolean, facing: Vec2): Spot[] {
  const look = Math.atan2(facing.y, facing.x);
  const start = ahead ? look + Math.PI : look;
  const ring = (radius: number): Spot[] =>
    [0, 1, -1, 2, -2, 3, -3, 4].map((k) => {
      const a = start + (k * Math.PI) / 4;
      return [round3(Math.cos(a) * radius), round3(Math.sin(a) * radius)] as Spot;
    });
  return ahead ? [[0, 0], ...ring(0.28), ...ring(0.4)] : [...ring(0.28), [0, 0], ...ring(0.4)];
}

// the first place at least `gap` from every spot taken; when none is, the one furthest from them all
export function pickSpot(candidates: readonly Spot[], taken: readonly Spot[], gap = DROP_GAP): Spot {
  let best = candidates[0] ?? [0, 0];
  let bestRoom = -1;
  for (const c of candidates) {
    const room = taken.length ? Math.min(...taken.map((t) => Math.hypot(t[0] - c[0], t[1] - c[1]))) : Infinity;
    if (room >= gap - 1e-9) return c;
    if (room > bestRoom + 1e-9) {
      best = c;
      bestRoom = room;
    }
  }
  return best;
}

// ---- the runtime item

// A dropped item as the game keeps it (for the run: it is not saved with anything). `scope`: the deck and
// variation it lies in (see lootKey in useGameState); `armed`: the party has left its cell since.
export interface DroppedItem {
  id: number;
  scope: string;
  spec: MapItem & { dropped: number };
  armed: boolean;
}

// what marks a dropped item taken (the same set as the map's own loose items - see lootKey)
export const dropLootKey = (scope: string, id: number): string => `${scope}|drop ${id}`;

export function makeDrop(input: { id: number; scope: string; item: string; count: number; cell: Vec2; spot: Spot; party: Vec2 }): DroppedItem {
  const { id, scope, item, count, cell, spot, party } = input;
  return {
    id,
    scope,
    spec: { item, cell: { x: cell.x, y: cell.y }, ...(count > 1 ? { count } : {}), offset: [spot[0], spot[1]], dropped: id },
    // (dropped ahead, the party is not on it: nothing to wait for)
    armed: !sameCell(cell, party),
  };
}

export const sameCell = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;

// The drops of this scope the party has left behind: armed from now on. The same array if nothing changed.
export function armDrops(drops: readonly DroppedItem[], scope: string, party: Vec2): readonly DroppedItem[] {
  if (!drops.some((d) => !d.armed && d.scope === scope && !sameCell(d.spec.cell, party))) return drops;
  return drops.map((d) => (!d.armed && d.scope === scope && !sameCell(d.spec.cell, party) ? { ...d, armed: true } : d));
}

// whether stepping onto (or standing on) the party's cell leaves this drop alone: it was dropped there
// and the party has not left it since (Use still takes it)
export const autoExempt = (drop: DroppedItem | undefined, party: Vec2): boolean => !!drop && !drop.armed && sameCell(drop.spec.cell, party);

// the specs of the drops lying in a scope that are not taken (`taken`: by the drop's id)
export function liveDrops(drops: readonly DroppedItem[], scope: string, taken: (id: number) => boolean): (MapItem & { dropped: number })[] {
  return drops.filter((d) => d.scope === scope && !taken(d.id)).map((d) => d.spec);
}

// ---- the pressure plates

// how many piles of dropped items lie on a cell (a plate is pressed by one)
export const itemsOnCell = (specs: readonly MapItem[], cell: Vec2): number => specs.filter((s) => s.dropped !== undefined && sameCell(s.cell, cell)).length;

// which cells hold dropped items (sorted): changes when a pile lands on a cell or is taken from it, so a
// plate is looked at again then
export function platesKey(specs: readonly MapItem[]): string {
  return [...new Set(specs.filter((s) => s.dropped !== undefined).map((s) => `${s.cell.x},${s.cell.y}`))].sort().join(";");
}
