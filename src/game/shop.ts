// Shops (pure rules, no UI, no storage - see shopStore.ts for the session's
// live stock and shopCatalog.ts for where the shops come from): what a shop
// holds and charges, and buying and selling between it and the party's
// inventory (inventory.ts) and credits (a plain counter, meta.ts's).
//
// Items are named by item type id as in inventory.ts, a weapon "weapon:<type>".
// What an item is worth comes in as `value`, so these functions stay testable
// without the game's data. Every deal returns new values and leaves the old
// ones alone; a deal that can't be done returns { ok: false } and changes nothing.

import { addItem, equipHand, slotAt, takeSlot, type Inventory, type ItemRules, type Loc } from "./inventory";

// qty in a stock entry: how many the shop has (UNLIMITED: it never runs out)
export const UNLIMITED = -1;

export interface ShopStockEntry {
  item: string;
  // what buying one costs (default: its value x buyRate)
  price?: number;
  qty: number;
}

export interface ShopDef {
  id: string;
  name: string;
  // a shared still's id
  portrait?: string;
  stock: ShopStockEntry[];
  // what the party pays, and what the shop pays, as a share of an item's value
  buyRate: number;
  sellRate: number;
}

export interface ShopRules extends ItemRules {
  // what an item is worth (credits each)
  value(item: string): number;
}

export const DEFAULT_BUY_RATE = 1.25;
export const DEFAULT_SELL_RATE = 0.5;

const cleanRate = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : fallback);

// A shop from loose data (a json file): null if it isn't one. Wrong entries are
// dropped; the id falls back to `fallbackId`.
export function parseShop(raw: unknown, fallbackId: string): ShopDef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : fallbackId;
  const stock: ShopStockEntry[] = [];
  if (Array.isArray(r.stock)) {
    for (const e of r.stock) {
      if (typeof e !== "object" || e === null) continue;
      const { item, price, qty } = e as Record<string, unknown>;
      if (typeof item !== "string" || !item) continue;
      const entry: ShopStockEntry = { item, qty: typeof qty === "number" && Number.isFinite(qty) ? (qty < 0 ? UNLIMITED : Math.floor(qty)) : 1 };
      if (typeof price === "number" && Number.isFinite(price) && price >= 0) entry.price = Math.round(price);
      stock.push(entry);
    }
  }
  const shop: ShopDef = {
    id,
    name: typeof r.name === "string" && r.name.trim() ? r.name : id,
    stock,
    buyRate: cleanRate(r.buyRate, DEFAULT_BUY_RATE),
    sellRate: cleanRate(r.sellRate, DEFAULT_SELL_RATE),
  };
  if (typeof r.portrait === "string" && r.portrait) shop.portrait = r.portrait;
  return shop;
}

// --- prices ---

const priced = (value: number, rate: number) => (value > 0 ? Math.max(1, Math.round(value * rate)) : 0);

// what the party pays for one of a stock entry
export function buyPrice(shop: Pick<ShopDef, "buyRate">, entry: ShopStockEntry, rules: Pick<ShopRules, "value">): number {
  return entry.price ?? priced(rules.value(entry.item), shop.buyRate);
}

// what the shop pays for one of an item (0: it isn't worth anything, it won't buy it)
export function sellPrice(shop: Pick<ShopDef, "sellRate">, item: string, rules: Pick<ShopRules, "value">): number {
  return priced(rules.value(item), shop.sellRate);
}

// --- deals ---

export type ShopFailure = "empty" | "soldout" | "poor" | "full" | "worthless" | "place";
export type Deal =
  | { ok: true; inv: Inventory; credits: number; stock: ShopStockEntry[]; item: string; qty: number; amount: number }
  | { ok: false; reason: ShopFailure };

// Buys `qty` of the stock entry at `index`, to a place: a backpack cell (an
// empty one, or the same item's stack with room; else the first room there is),
// a hand (takes one; what it held goes to the backpack), or - `to` null -
// wherever the backpack has room. `amount` is what it cost. Entries that run
// out leave the stock.
export function buy(
  inv: Inventory,
  credits: number,
  stock: readonly ShopStockEntry[],
  shop: Pick<ShopDef, "buyRate">,
  index: number,
  to: Loc | null,
  rules: ShopRules,
  qty = 1,
): Deal {
  const entry = stock[index];
  if (!entry) return { ok: false, reason: "empty" };
  if (entry.qty === 0) return { ok: false, reason: "soldout" };
  const want = Math.max(1, Math.floor(qty));
  if (to?.kind === "hand" && want > 1) return { ok: false, reason: "place" };
  if (entry.qty !== UNLIMITED && want > entry.qty) return { ok: false, reason: "soldout" };
  const amount = buyPrice(shop, entry, rules) * want;
  if (amount > credits) return { ok: false, reason: "poor" };

  let next: Inventory | null = null;
  if (to?.kind === "hand") {
    next = equipHand(inv, to.crew, to.hand, { item: entry.item, qty: 1 }, rules);
  } else {
    let cur = inv;
    let left = want;
    if (to?.kind === "pack") {
      const cell = slotAt(inv, to);
      const max = Math.max(1, rules.stackMax(entry.item));
      if (!cell && to.index >= 0 && to.index < inv.pack.length) {
        const take = Math.min(left, max);
        const pack = inv.pack.slice();
        pack[to.index] = { item: entry.item, qty: take };
        cur = { ...inv, pack };
        left -= take;
      } else if (cell && cell.item === entry.item && cell.uid === undefined && cell.qty < max) {
        const take = Math.min(left, max - cell.qty);
        const pack = inv.pack.slice();
        pack[to.index] = { ...cell, qty: cell.qty + take };
        cur = { ...inv, pack };
        left -= take;
      }
    }
    if (left > 0) {
      const r = addItem(cur, entry.item, left, rules);
      cur = r.inv;
      left = r.left;
    }
    next = left > 0 ? null : cur;
  }
  if (!next) return { ok: false, reason: "full" };

  const rest = entry.qty === UNLIMITED ? entry.qty : entry.qty - want;
  const out = stock.map((e, i) => (i === index ? { ...e, qty: rest } : e)).filter((e) => e.qty !== 0);
  return { ok: true, inv: next, credits: credits - amount, stock: out, item: entry.item, qty: want, amount };
}

// the shop's stock after it was sold `qty` of an item
function stocked(stock: readonly ShopStockEntry[], item: string, qty: number): ShopStockEntry[] {
  const at = stock.findIndex((e) => e.item === item);
  if (at < 0) return [...stock, { item, qty }];
  return stock.map((e, i) => (i === at && e.qty !== UNLIMITED ? { ...e, qty: e.qty + qty } : e));
}

// Sells what's at a place (all of the stack, or `qty` of it) to the shop: the
// credits go up by `amount`, the stock up by the items. Worthless things aren't bought.
export function sell(
  inv: Inventory,
  credits: number,
  stock: readonly ShopStockEntry[],
  shop: Pick<ShopDef, "sellRate">,
  from: Loc,
  rules: ShopRules,
  qty?: number,
): Deal {
  // (nothing there, or a place that doesn't exist)
  const taken = takeSlot(inv, from, rules, qty);
  if (!taken) return { ok: false, reason: slotAt(inv, from) ? "place" : "empty" };
  const each = sellPrice(shop, taken.slot.item, rules);
  if (each <= 0) return { ok: false, reason: "worthless" };
  const amount = each * taken.slot.qty;
  return {
    ok: true,
    inv: taken.inv,
    credits: credits + amount,
    stock: stocked(stock, taken.slot.item, taken.slot.qty),
    item: taken.slot.item,
    qty: taken.slot.qty,
    amount,
  };
}
