// The party's carried things (pure rules, no UI, no storage - see
// inventoryStore.ts for the run's live state): one shared backpack, a grid
// of cells where like items stack, and two hands (left, right) per
// crewmate. A held item is a weapon in use or a thing in the hand; a
// two-handed one takes both hands.
//
// Items are named by item type id (see items.ts); a weapon is the id
// "weapon:<type>" (see itemRules.ts) and carries its owned weapon's `uid`
// (so its level follows it). What an item can do (how many to a stack, whether
// both hands hold it) comes in as `ItemRules`, so these functions stay testable
// without the game's data.
//
// Everything here returns a new Inventory and leaves the old one alone; a move
// that can't be done returns { ok: false } and changes nothing.

export interface ItemRules {
  // how many of an item fit one cell (1: it doesn't stack)
  stackMax(item: string): number;
  // whether holding it takes both hands
  twoHanded(item: string): boolean;
}

// a stack: `qty` of an item. `uid` marks a single, one-of-a-kind item (an
// owned weapon): it never stacks or merges.
export interface Slot {
  item: string;
  qty: number;
  uid?: number;
}

export const LEFT = 0;
export const RIGHT = 1;
export type HandIndex = 0 | 1;
// [left, right]. A two-handed item is kept in the right one, the left one empty.
export type Hands = readonly [Slot | null, Slot | null];
export const EMPTY_HANDS: Hands = [null, null];

export const PACK_COLS = 6;
export const PACK_ROWS = 4;
export const PACK_SIZE = PACK_COLS * PACK_ROWS;

export interface Inventory {
  pack: readonly (Slot | null)[];
  hands: Readonly<Record<string, Hands>>;
  // what didn't fit the backpack (plain items only): carried loosely, it
  // comes home all the same, and moves into the grid as room opens up
  overflow: Readonly<Record<string, number>>;
}

export function emptyInventory(size = PACK_SIZE): Inventory {
  return { pack: Array.from({ length: size }, () => null), hands: {}, overflow: {} };
}

// where a thing is (or can go): a backpack cell, or a crewmate's hand
export type Loc = { kind: "pack"; index: number } | { kind: "hand"; crew: string; hand: HandIndex };
export const packLoc = (index: number): Loc => ({ kind: "pack", index });
export const handLoc = (crew: string, hand: HandIndex): Loc => ({ kind: "hand", crew, hand });
// the text form (a DOM data attribute, a drag source): "pack:3", "hand:reese:1"
export const locKey = (loc: Loc): string => (loc.kind === "pack" ? `pack:${loc.index}` : `hand:${loc.crew}:${loc.hand}`);
export function parseLoc(key: string): Loc | null {
  const pack = /^pack:(\d+)$/.exec(key);
  if (pack) return packLoc(Number(pack[1]));
  const hand = /^hand:(.+):([01])$/.exec(key);
  return hand ? handLoc(hand[1], Number(hand[2]) as HandIndex) : null;
}
const sameLoc = (a: Loc, b: Loc) => locKey(a) === locKey(b);

export const handsOf = (inv: Inventory, crew: string): Hands => inv.hands[crew] ?? EMPTY_HANDS;

// what a crewmate's two hands show: the item in each, and whether the left
// is taken by a two-handed one held in the right
export function handView(inv: Inventory, crew: string, rules: ItemRules): { left: Slot | null; right: Slot | null; leftBlocked: boolean } {
  const [left, right] = handsOf(inv, crew);
  return { left, right, leftBlocked: !!right && rules.twoHanded(right.item) };
}

// the item at a place (the left hand shows the two-handed item held in the right)
export function slotAt(inv: Inventory, loc: Loc): Slot | null {
  if (loc.kind === "pack") return inv.pack[loc.index] ?? null;
  const [left, right] = handsOf(inv, loc.crew);
  return loc.hand === LEFT ? left : right;
}

const same = (a: Slot, b: Slot) => a.item === b.item && a.uid === undefined && b.uid === undefined;
const withPack = (inv: Inventory, index: number, slot: Slot | null): Inventory => {
  const pack = inv.pack.slice();
  pack[index] = slot;
  return { ...inv, pack };
};
const withHands = (inv: Inventory, crew: string, hands: Hands): Inventory => ({ ...inv, hands: { ...inv.hands, [crew]: hands } });

function put(inv: Inventory, loc: Loc, slot: Slot | null): Inventory {
  if (loc.kind === "pack") return withPack(inv, loc.index, slot);
  const hands = handsOf(inv, loc.crew);
  return withHands(inv, loc.crew, loc.hand === LEFT ? [slot, hands[1]] : [hands[0], slot]);
}

const validLoc = (inv: Inventory, loc: Loc) => (loc.kind === "pack" ? loc.index >= 0 && loc.index < inv.pack.length : loc.hand === LEFT || loc.hand === RIGHT);

// --- adding and taking out ---

// Puts `qty` of an item into the backpack: onto stacks of it first, then into
// empty cells. What didn't fit is `left`.
export function addItem(inv: Inventory, item: string, qty: number, rules: ItemRules, uid?: number): { inv: Inventory; added: number; left: number } {
  let pack = inv.pack.slice();
  let left = Math.max(0, Math.floor(qty));
  const max = uid === undefined ? Math.max(1, rules.stackMax(item)) : 1;
  if (uid === undefined) {
    for (let i = 0; i < pack.length && left > 0; i++) {
      const cell = pack[i];
      if (!cell || cell.item !== item || cell.uid !== undefined || cell.qty >= max) continue;
      const take = Math.min(left, max - cell.qty);
      pack[i] = { ...cell, qty: cell.qty + take };
      left -= take;
    }
  }
  for (let i = 0; i < pack.length && left > 0; i++) {
    if (pack[i]) continue;
    const take = Math.min(left, max);
    pack[i] = uid === undefined ? { item, qty: take } : { item, qty: 1, uid };
    left -= take;
  }
  const requested = Math.max(0, Math.floor(qty));
  return { inv: { ...inv, pack }, added: requested - left, left };
}

// Picks something up that may not fit: what's left over of a plain item
// goes to the overflow (carried loosely), a one-of-a-kind item is not taken.
export function addLoot(inv: Inventory, item: string, qty: number, rules: ItemRules, uid?: number): { inv: Inventory; overflowed: number; refused: number } {
  const r = addItem(inv, item, qty, rules, uid);
  if (r.left <= 0) return { inv: r.inv, overflowed: 0, refused: 0 };
  if (uid !== undefined) return { inv: r.inv, overflowed: 0, refused: r.left };
  return { inv: { ...r.inv, overflow: { ...r.inv.overflow, [item]: (r.inv.overflow[item] ?? 0) + r.left } }, overflowed: r.left, refused: 0 };
}

// Moves what's in the overflow into cells that have room.
export function settleOverflow(inv: Inventory, rules: ItemRules): Inventory {
  let cur = inv;
  for (const [item, qty] of Object.entries(inv.overflow)) {
    const r = addItem(cur, item, qty, rules);
    const overflow = { ...cur.overflow };
    if (r.left > 0) overflow[item] = r.left;
    else delete overflow[item];
    cur = { ...r.inv, overflow };
  }
  return cur;
}

// how many of an item the party carries (backpack, hands and overflow)
export function countOf(inv: Inventory, item: string): number {
  let n = inv.overflow[item] ?? 0;
  for (const s of inv.pack) if (s?.item === item) n += s.qty;
  for (const hands of Object.values(inv.hands)) for (const s of hands) if (s?.item === item) n += s.qty;
  return n;
}

// Takes up to `qty` of an item out of wherever it is: the overflow first,
// then the backpack from its last cell, then the hands. (Selling, using up.)
export function removeItem(inv: Inventory, item: string, qty: number): { inv: Inventory; removed: number } {
  let need = Math.max(0, Math.floor(qty));
  const overflow = { ...inv.overflow };
  const pack = inv.pack.slice();
  let hands = inv.hands;
  const fromOverflow = Math.min(need, overflow[item] ?? 0);
  if (fromOverflow > 0) {
    overflow[item] -= fromOverflow;
    if (!overflow[item]) delete overflow[item];
    need -= fromOverflow;
  }
  for (let i = pack.length - 1; i >= 0 && need > 0; i--) {
    const s = pack[i];
    if (!s || s.item !== item) continue;
    const take = Math.min(need, s.qty);
    pack[i] = take === s.qty ? null : { ...s, qty: s.qty - take };
    need -= take;
  }
  for (const [crew, pair] of Object.entries(hands)) {
    if (need <= 0) break;
    const next = pair.slice() as [Slot | null, Slot | null];
    next.forEach((s, h) => {
      if (!s || s.item !== item || need <= 0) return;
      const take = Math.min(need, s.qty);
      next[h] = take === s.qty ? null : { ...s, qty: s.qty - take };
      need -= take;
    });
    hands = { ...hands, [crew]: next };
  }
  return { inv: { ...inv, overflow, pack, hands }, removed: Math.max(0, Math.floor(qty)) - need };
}

// how many of each item is carried, in all (what goes home as the haul):
// `skip` leaves items out (the weapons, which are not haul)
export function totals(inv: Inventory, skip: (item: string) => boolean = () => false): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (item: string, qty: number) => {
    if (qty > 0 && !skip(item)) out[item] = (out[item] ?? 0) + qty;
  };
  for (const s of inv.pack) if (s) add(s.item, s.qty);
  for (const hands of Object.values(inv.hands)) for (const s of hands) if (s) add(s.item, s.qty);
  for (const [item, qty] of Object.entries(inv.overflow)) add(item, qty);
  return out;
}

export const usedCells = (inv: Inventory) => inv.pack.filter(Boolean).length;
export const freeCells = (inv: Inventory) => inv.pack.length - usedCells(inv);

// --- moving ---

export type MoveFailure = "same" | "empty" | "place" | "full";
export type MoveResult = { ok: true; inv: Inventory } | { ok: false; reason: MoveFailure };

// Puts a stack at a place; what doesn't stay there (the rest of a stack a hand
// couldn't take, whatever the hand or cell held) comes back as `rest`.
//  - a cell: an empty one takes it; the same item stacks on; another item swaps
//  - a hand: takes ONE of the stack; what the hand held is displaced; a
//    two-handed item displaces both hands' items, and any item into a hand
//    next to a two-handed one displaces that one
function drop(inv: Inventory, loc: Loc, slot: Slot, rules: ItemRules): { inv: Inventory; rest: Slot[] } | null {
  if (loc.kind === "pack") {
    const there = inv.pack[loc.index];
    if (!there) return { inv: withPack(inv, loc.index, slot), rest: [] };
    if (same(there, slot)) {
      const max = Math.max(1, rules.stackMax(slot.item));
      const take = Math.min(slot.qty, max - there.qty);
      if (take <= 0) return null;
      const rest = slot.qty > take ? [{ ...slot, qty: slot.qty - take }] : [];
      return { inv: withPack(inv, loc.index, { ...there, qty: there.qty + take }), rest };
    }
    return { inv: withPack(inv, loc.index, slot), rest: [there] };
  }
  const [left, right] = handsOf(inv, loc.crew);
  const one: Slot = slot.uid === undefined ? { item: slot.item, qty: 1 } : { ...slot };
  const rest: Slot[] = slot.qty > 1 ? [{ ...slot, qty: slot.qty - 1 }] : [];
  if (rules.twoHanded(slot.item)) {
    for (const held of [left, right]) if (held) rest.push(held);
    return { inv: withHands(inv, loc.crew, [null, one]), rest };
  }
  if (right && rules.twoHanded(right.item)) {
    rest.push(right);
    return { inv: withHands(inv, loc.crew, loc.hand === LEFT ? [one, null] : [null, one]), rest };
  }
  const held = loc.hand === LEFT ? left : right;
  if (held && same(held, one)) {
    if (held.qty >= Math.max(1, rules.stackMax(held.item))) return null;
    return { inv: put(inv, loc, { ...held, qty: held.qty + 1 }), rest };
  }
  if (held) rest.push(held);
  return { inv: put(inv, loc, one), rest };
}

// Finds room for a stack: `preferred` first (only if it takes it without
// displacing anything), then onto stacks of the same item, then empty cells.
function settle(inv: Inventory, slot: Slot, preferred: Loc | null, rules: ItemRules): Inventory | null {
  let cur = inv;
  let left: Slot | null = slot;
  if (preferred && validLoc(cur, preferred)) {
    const here = slotAt(cur, preferred);
    if (preferred.kind === "hand" && !here) {
      const d = drop(cur, preferred, left, rules);
      if (d && d.rest.length <= (left.qty > 1 ? 1 : 0) && (left.qty <= 1 || d.rest[0].item === left.item)) {
        cur = d.inv;
        left = d.rest[0] ?? null;
      }
    } else if (preferred.kind === "pack") {
      if (!here) {
        cur = withPack(cur, preferred.index, left);
        left = null;
      } else if (same(here, left)) {
        const max = Math.max(1, rules.stackMax(left.item));
        const take = Math.min(left.qty, max - here.qty);
        if (take > 0) {
          cur = withPack(cur, preferred.index, { ...here, qty: here.qty + take });
          left = left.qty > take ? { ...left, qty: left.qty - take } : null;
        }
      }
    }
  }
  if (!left) return cur;
  const r = addItem(cur, left.item, left.qty, rules, left.uid);
  return r.left > 0 ? null : r.inv;
}

// Moves a stack from one place to another (drag and drop, click and click);
// the same rules as `drop` above, with what's displaced going to where the
// stack came from if it can, else to any room in the backpack.
export function moveSlot(inv: Inventory, from: Loc, to: Loc, rules: ItemRules): MoveResult {
  if (!validLoc(inv, from) || !validLoc(inv, to)) return { ok: false, reason: "place" };
  // (the left hand shows the two-handed item the right one holds)
  let source = from;
  if (from.kind === "hand" && from.hand === LEFT) {
    const right = handsOf(inv, from.crew)[1];
    if (right && rules.twoHanded(right.item) && !handsOf(inv, from.crew)[0]) source = handLoc(from.crew, RIGHT);
  }
  if (sameLoc(source, to)) return { ok: false, reason: "same" };
  const lifted = slotAt(inv, source);
  if (!lifted) return { ok: false, reason: "empty" };
  // (a two-handed item onto the other hand it already takes)
  if (source.kind === "hand" && to.kind === "hand" && source.crew === to.crew && rules.twoHanded(lifted.item)) return { ok: false, reason: "same" };
  const dropped = drop(put(inv, source, null), to, lifted, rules);
  if (!dropped) return { ok: false, reason: "full" };
  let cur = dropped.inv;
  for (const r of dropped.rest) {
    const settled = settle(cur, r, source, rules);
    if (!settled) return { ok: false, reason: "full" };
    cur = settled;
  }
  return { ok: true, inv: cur };
}

// the hand a thing shown in `hand` is really held in (a two-handed item shown
// dimmed in the left hand is held in the right one): where its cooldown lives
export function effectiveHand(inv: Inventory, crew: string, hand: HandIndex, rules: ItemRules): HandIndex {
  if (hand === LEFT) {
    const [left, right] = handsOf(inv, crew);
    if (!left && right && rules.twoHanded(right.item)) return RIGHT;
  }
  return hand;
}

// the usual "half" of a stack for a split: rounded down, at least one
export const halfOf = (qty: number): number => Math.max(1, Math.floor(qty / 2));

// Moves only `qty` of the stack at `from` to `to` (a split: shift+drag). The
// same rules as moveSlot, except that a part never swaps with a different item
// in a cell ("place": it would leave the rest and the displaced one fighting
// for the cell). The whole stack (or a one-of-a-kind item) is a plain move.
export function moveSome(inv: Inventory, from: Loc, to: Loc, qty: number, rules: ItemRules): MoveResult {
  if (!validLoc(inv, from) || !validLoc(inv, to)) return { ok: false, reason: "place" };
  let source = from;
  if (from.kind === "hand" && from.hand === LEFT) {
    const right = handsOf(inv, from.crew)[1];
    if (right && rules.twoHanded(right.item) && !handsOf(inv, from.crew)[0]) source = handLoc(from.crew, RIGHT);
  }
  if (sameLoc(source, to)) return { ok: false, reason: "same" };
  const lifted = slotAt(inv, source);
  if (!lifted) return { ok: false, reason: "empty" };
  const n = Math.max(1, Math.floor(qty));
  if (n >= lifted.qty || lifted.uid !== undefined) return moveSlot(inv, from, to, rules);
  if (to.kind === "pack") {
    const there = inv.pack[to.index];
    if (there && !same(there, lifted)) return { ok: false, reason: "place" };
  }
  const part: Slot = { item: lifted.item, qty: n };
  const dropped = drop(put(inv, source, { ...lifted, qty: lifted.qty - n }), to, part, rules);
  if (!dropped) return { ok: false, reason: "full" };
  let cur = dropped.inv;
  for (const r of dropped.rest) {
    const settled = settle(cur, r, source, rules);
    if (!settled) return { ok: false, reason: "full" };
    cur = settled;
  }
  return { ok: true, inv: cur };
}

// Splits `qty` off the stack at `from` into the first empty backpack cell.
export function splitSlot(inv: Inventory, from: Loc, qty: number, rules: ItemRules): MoveResult {
  const free = inv.pack.findIndex((s) => !s);
  if (free < 0) return { ok: false, reason: "full" };
  return moveSome(inv, from, packLoc(free), qty, rules);
}

// --- saving ---

// An inventory read back from a save (anything may be wrong in it: it is
// checked, cleaned and padded to `size`). `known` drops items that no longer
// exist (a weapon not owned any more); a stack beyond its size is split, what
// doesn't fit the backpack goes to the overflow. Null when `raw` isn't one.
export function parseInventory(raw: unknown, rules: ItemRules, known: (slot: Slot) => boolean = () => true, size = PACK_SIZE): Inventory | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.pack)) return null;
  const slotOf = (v: unknown): Slot | null => {
    if (!v || typeof v !== "object") return null;
    const { item, qty, uid } = v as Record<string, unknown>;
    if (typeof item !== "string" || !item) return null;
    const n = typeof qty === "number" && Number.isFinite(qty) ? Math.floor(qty) : 1;
    if (n < 1) return null;
    const slot: Slot = typeof uid === "number" && Number.isFinite(uid) ? { item, qty: 1, uid } : { item, qty: Math.min(n, Math.max(1, rules.stackMax(item))) };
    return known(slot) ? slot : null;
  };
  let inv = emptyInventory(size);
  const pack = inv.pack.slice();
  const extra: Slot[] = [];
  r.pack.forEach((v, i) => {
    const s = slotOf(v);
    if (!s) return;
    if (i < size) pack[i] = s;
    else extra.push(s);
  });
  inv = { ...inv, pack };
  const hands: Record<string, Hands> = {};
  if (r.hands && typeof r.hands === "object") {
    for (const [crew, pair] of Object.entries(r.hands as Record<string, unknown>)) {
      if (!Array.isArray(pair)) continue;
      let left = slotOf(pair[0]);
      let right = slotOf(pair[1]);
      // (a two-handed item belongs in the right hand alone)
      if (left && rules.twoHanded(left.item)) {
        if (!right) right = left;
        left = null;
      }
      if (right && rules.twoHanded(right.item)) left = null;
      hands[crew] = [left, right];
    }
  }
  inv = { ...inv, hands };
  const overflow: Record<string, number> = {};
  if (r.overflow && typeof r.overflow === "object") {
    for (const [item, qty] of Object.entries(r.overflow as Record<string, unknown>)) {
      if (typeof qty === "number" && Number.isFinite(qty) && qty >= 1 && known({ item, qty: 1 })) overflow[item] = Math.floor(qty);
    }
  }
  inv = { ...inv, overflow };
  for (const s of extra) inv = addLoot(inv, s.item, s.qty, rules, s.uid).inv;
  return settleOverflow(inv, rules);
}

// Takes `qty` (default: all) of what's at a place out of the party's things
// (a sale). A two-handed item shown in the left hand is taken from the right.
export function takeSlot(inv: Inventory, from: Loc, rules: ItemRules, qty?: number): { inv: Inventory; slot: Slot } | null {
  if (!validLoc(inv, from)) return null;
  let source = from;
  if (from.kind === "hand" && from.hand === LEFT) {
    const right = handsOf(inv, from.crew)[1];
    if (right && rules.twoHanded(right.item) && !handsOf(inv, from.crew)[0]) source = handLoc(from.crew, RIGHT);
  }
  const lifted = slotAt(inv, source);
  if (!lifted) return null;
  const n = Math.max(1, Math.min(Math.floor(qty ?? lifted.qty), lifted.qty));
  return { inv: put(inv, source, n >= lifted.qty ? null : { ...lifted, qty: lifted.qty - n }), slot: { ...lifted, qty: n } };
}

// Puts a stack straight into a hand (a purchase, the starting loadout):
// whatever the hand held goes into the backpack. Null if there's no room for it.
export function equipHand(inv: Inventory, crew: string, hand: HandIndex, slot: Slot, rules: ItemRules): Inventory | null {
  const dropped = drop(inv, handLoc(crew, hand), slot, rules);
  if (!dropped) return null;
  let cur = dropped.inv;
  for (const r of dropped.rest) {
    const settled = settle(cur, r, null, rules);
    if (!settled) return null;
    cur = settled;
  }
  return cur;
}

// the two hands swap what they hold (not while one holds a two-handed item)
export function swapHands(inv: Inventory, crew: string, rules: ItemRules): Inventory | null {
  const [left, right] = handsOf(inv, crew);
  if ((!left && !right) || (right && rules.twoHanded(right.item))) return null;
  return withHands(inv, crew, [right, left]);
}

// --- the run's start ---

// An older run's haul (how many of each) as a backpack: sorted by item so it
// lays out the same each time; what doesn't fit goes to the overflow.
export function inventoryFromHaul(haul: Readonly<Record<string, number>>, rules: ItemRules, size = PACK_SIZE): Inventory {
  let inv = emptyInventory(size);
  for (const item of Object.keys(haul).sort()) {
    if (!(haul[item] > 0)) continue;
    inv = addLoot(inv, item, haul[item], rules).inv;
  }
  return inv;
}

// A crewmate's hands from their loadout (two slots of owned weapons, one in
// use): the one in use goes in the right hand, the other in the left - and if
// the right one is two-handed the other goes to the backpack. `typeOf` says
// what weapon type an owned id is.
export function equipLoadout(
  inv: Inventory,
  crew: string,
  slots: readonly [number | null, number | null],
  active: 0 | 1,
  typeOf: (id: number) => string | undefined,
  weaponItem: (type: string) => string,
  rules: ItemRules,
): Inventory {
  const held = (id: number | null): Slot | null => {
    const type = id === null ? undefined : typeOf(id);
    return id !== null && type ? { item: weaponItem(type), qty: 1, uid: id } : null;
  };
  // (the one in use; its other slot when that's empty - as the base has always done)
  const first = held(slots[active]) ?? held(slots[active ? 0 : 1]);
  const second = held(slots[active]) ? held(slots[active ? 0 : 1]) : null;
  let cur = inv;
  // (the left first, so the right - the weapon in use - wins a two-handed clash)
  for (const [hand, slot] of [[LEFT, second], [RIGHT, first]] as const) {
    if (!slot) continue;
    cur = equipHand(cur, crew, hand, slot, rules) ?? cur;
  }
  return cur;
}
