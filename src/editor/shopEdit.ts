// The shop editor's pure parts (no React, no storage): a local draft of a shop, its conversion to and from the
// game's ShopDef, validation with a problems list, the live price preview, and file import/export text.
// The draft keeps what is typed as it is (an empty item row, a negative price) so editing never fights the
// typist; `shopFromDraft` is what the game, the catalog and Publish see (it goes through parseShop, which cleans).
import { DEFAULT_BUY_RATE, DEFAULT_SELL_RATE, UNLIMITED, buyPrice, parseShop, sellPrice, type ShopDef, type ShopStockEntry } from "../game/shop";
import { commonIdOk } from "../game/sharedContent";

export interface ShopDraft {
  id: string;
  name: string;
  // a shared still's id
  portrait?: string;
  buyRate: number;
  sellRate: number;
  stock: ShopStockEntry[];
  updated: number;
}

/** "My Smith's Shop.json" -> "my-smith-s-shop" (a valid shop id, never empty). */
export function shopSlug(text: string): string {
  const base = text.replace(/\.[^./\\]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const slug = base.toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^[-_]+|-+$/g, "").slice(0, 64).replace(/-+$/, "");
  return slug || "shop";
}

/** `base` if free, else base-2, base-3 ... (within the 64 character id limit). */
export function uniqueShopId(base: string, taken: ReadonlySet<string>): string {
  const root = shopSlug(base);
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const id = `${root.slice(0, 64 - String(n).length - 1)}-${n}`;
    if (!taken.has(id)) return id;
  }
}

export function newShopDraft(id: string, name: string, now = Date.now()): ShopDraft {
  return { id, name, buyRate: DEFAULT_BUY_RATE, sellRate: DEFAULT_SELL_RATE, stock: [], updated: now };
}

export function draftFromShop(shop: ShopDef, now = Date.now()): ShopDraft {
  return {
    id: shop.id,
    name: shop.name,
    ...(shop.portrait ? { portrait: shop.portrait } : {}),
    buyRate: shop.buyRate,
    sellRate: shop.sellRate,
    stock: shop.stock.map(entry => ({ ...entry })),
    updated: now,
  };
}

// the draft as loose json, what parseShop reads
const looseShop = (draft: ShopDraft) => ({
  id: draft.id,
  name: draft.name,
  portrait: draft.portrait,
  stock: draft.stock,
  buyRate: draft.buyRate,
  sellRate: draft.sellRate,
});

/** The shop the game gets from a draft: parseShop's cleaning (empty items dropped, wrong numbers fixed, a blank name = the id). */
export function shopFromDraft(draft: ShopDraft): ShopDef {
  return parseShop(looseShop(draft), draft.id)!;
}

/** A draft read back from storage (or anything): null when it is not a usable one. */
export function normalizeShopDraft(raw: unknown): ShopDraft | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!commonIdOk(r.id)) return null;
  const num = (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback);
  const stock: ShopStockEntry[] = [];
  if (Array.isArray(r.stock)) {
    for (const e of r.stock) {
      if (typeof e !== "object" || e === null) continue;
      const { item, price, qty } = e as Record<string, unknown>;
      stock.push({ item: typeof item === "string" ? item : "", qty: num(qty, 1), ...(typeof price === "number" ? { price } : {}) });
    }
  }
  return {
    id: r.id,
    name: typeof r.name === "string" ? r.name : "",
    ...(typeof r.portrait === "string" && r.portrait ? { portrait: r.portrait } : {}),
    buyRate: num(r.buyRate, DEFAULT_BUY_RATE),
    sellRate: num(r.sellRate, DEFAULT_SELL_RATE),
    stock,
    updated: num(r.updated, 0),
  };
}

/** The text of a shop file (what src/shops/<id>.json holds). */
export const shopToJson = (shop: ShopDef): string => JSON.stringify(shop, null, 2) + "\n";

/** A shop from the text of a .json file; null when it is not json or not a shop. The id falls back to `fallbackId`. */
export function shopFromJsonText(text: string, fallbackId: string): ShopDef | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (Array.isArray(raw)) return null;
  // (a published revision's meta.json holds the shop as its "definition")
  if (typeof raw === "object" && raw !== null && "definition" in raw && typeof (raw as { definition: unknown }).definition === "object") raw = (raw as { definition: unknown }).definition;
  return parseShop(raw, fallbackId);
}

// --- validation ---

export interface ShopContext {
  /** whether the game knows this item id ("scrap", "weapon:laser_pistol") */
  known(item: string): boolean;
  /** what an item is worth (credits each) */
  value(item: string): number;
  /** the portrait ids to choose from; without it a portrait is not checked */
  portraits?: ReadonlySet<string>;
  /** the ids of the other local drafts */
  otherDraftIds: ReadonlySet<string>;
  /** the ids of the bundled and shared shops (a draft with such an id replaces that shop on this computer) */
  publishedIds: ReadonlySet<string>;
}

export type ProblemCode =
  | "idInvalid" | "idTaken" | "idShadows" | "noName"
  | "buyRate" | "sellRate" | "sellAboveBuy" | "portraitMissing" | "noStock"
  | "itemEmpty" | "itemUnknown" | "itemDuplicate"
  | "priceInvalid" | "priceFraction" | "qtyInvalid" | "qtyFraction" | "qtyZero" | "free";

export interface ShopProblem {
  severity: "error" | "warning";
  code: ProblemCode;
  /** the stock row (0-based) it is about, if any */
  row?: number;
  /** the item it is about, if any */
  item?: string;
}

const isRate = (n: number) => Number.isFinite(n) && n >= 0;

export function validateShop(draft: ShopDraft, ctx: ShopContext): ShopProblem[] {
  const out: ShopProblem[] = [];
  const error = (code: ProblemCode, extra: Partial<ShopProblem> = {}) => out.push({ severity: "error", code, ...extra });
  const warn = (code: ProblemCode, extra: Partial<ShopProblem> = {}) => out.push({ severity: "warning", code, ...extra });

  if (!commonIdOk(draft.id)) error("idInvalid");
  else if (ctx.otherDraftIds.has(draft.id)) error("idTaken");
  else if (ctx.publishedIds.has(draft.id)) warn("idShadows");
  if (!draft.name.trim()) warn("noName");
  if (!isRate(draft.buyRate)) error("buyRate");
  if (!isRate(draft.sellRate)) error("sellRate");
  if (isRate(draft.buyRate) && isRate(draft.sellRate) && draft.sellRate > draft.buyRate) warn("sellAboveBuy");
  if (draft.portrait && ctx.portraits && !ctx.portraits.has(draft.portrait)) warn("portraitMissing");
  if (!draft.stock.length) warn("noStock");

  const rates = shopFromDraft(draft);
  const seen = new Set<string>();
  draft.stock.forEach((entry, row) => {
    const item = entry.item;
    let rowError = false;
    if (!item) { error("itemEmpty", { row }); rowError = true; }
    else if (!ctx.known(item)) { error("itemUnknown", { row, item }); rowError = true; }
    else if (seen.has(item)) warn("itemDuplicate", { row, item });
    if (item) seen.add(item);

    if (entry.price !== undefined) {
      if (!Number.isFinite(entry.price) || entry.price < 0) { error("priceInvalid", { row, item }); rowError = true; }
      else if (!Number.isInteger(entry.price)) warn("priceFraction", { row, item });
    }
    if (!Number.isFinite(entry.qty) || (entry.qty < 0 && entry.qty !== UNLIMITED)) { error("qtyInvalid", { row, item }); rowError = true; }
    else if (entry.qty !== UNLIMITED) {
      if (!Number.isInteger(entry.qty)) warn("qtyFraction", { row, item });
      else if (entry.qty === 0) warn("qtyZero", { row, item });
    }
    if (!rowError && item && priceOf(rates, entry, ctx) === 0) warn("free", { row, item });
  });
  return out;
}

export const hasErrors = (problems: readonly ShopProblem[]) => problems.some(p => p.severity === "error");

// --- live preview ---

const rulesOf = (ctx: Pick<ShopContext, "value">) => ({ value: ctx.value });

// what the party pays for one of a stock entry, as the game computes it (the draft's rates cleaned like the game's)
function priceOf(shop: Pick<ShopDef, "buyRate">, entry: ShopStockEntry, ctx: Pick<ShopContext, "value">): number {
  const price = typeof entry.price === "number" && Number.isFinite(entry.price) && entry.price >= 0 ? Math.round(entry.price) : undefined;
  return buyPrice(shop, { item: entry.item, qty: entry.qty, ...(price !== undefined ? { price } : {}) }, rulesOf(ctx));
}

export interface PricePreview {
  /** the item's base value (credits) */
  value: number;
  /** what the player pays for one */
  buy: number;
  /** what the player is paid for one of it (0: the shop won't take it) */
  sell: number;
  /** what buying would cost without the entry's own price (value x buy rate) */
  auto: number;
}

/** What one stock row costs and pays, with shop.ts's own price functions. */
export function previewRow(draft: ShopDraft, row: number, ctx: Pick<ShopContext, "value">): PricePreview | null {
  const entry = draft.stock[row];
  if (!entry || !entry.item) return null;
  const shop = shopFromDraft(draft);
  return {
    value: ctx.value(entry.item),
    buy: priceOf(shop, entry, ctx),
    sell: sellPrice(shop, entry.item, rulesOf(ctx)),
    auto: buyPrice(shop, { item: entry.item, qty: 1 }, rulesOf(ctx)),
  };
}

/** The same numbers for an item that is not in the stock (the "example" line under the rates). */
export function previewItem(draft: ShopDraft, item: string, ctx: Pick<ShopContext, "value">): PricePreview {
  const shop = shopFromDraft(draft);
  const auto = buyPrice(shop, { item, qty: 1 }, rulesOf(ctx));
  return { value: ctx.value(item), buy: auto, auto, sell: sellPrice(shop, item, rulesOf(ctx)) };
}
