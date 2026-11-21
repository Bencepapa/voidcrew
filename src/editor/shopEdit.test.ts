// Run: npx tsx src/editor/shopEdit.test.ts
import assert from "node:assert/strict";
import { UNLIMITED, parseShop, type ShopDef } from "../game/shop";
import {
  draftFromShop, hasErrors, newShopDraft, normalizeShopDraft, previewItem, previewRow, shopFromDraft, shopFromJsonText, shopSlug,
  shopToJson, uniqueShopId, validateShop, type ShopContext, type ShopDraft,
} from "./shopEdit";

const values: Record<string, number> = { scrap: 2, medkit: 15, "weapon:laser_pistol": 220, junk: 0 };
const ctx: ShopContext = {
  known: item => item in values,
  value: item => values[item] ?? 0,
  portraits: new Set(["fantasy_portrait_a"]),
  otherDraftIds: new Set(["taken"]),
  publishedIds: new Set(["smith-shop"]),
};
const codes = (draft: ShopDraft, c = ctx) => validateShop(draft, c).map(p => `${p.severity}:${p.code}${p.row !== undefined ? "@" + p.row : ""}`);
const base = (patch: Partial<ShopDraft> = {}): ShopDraft => ({
  id: "my-shop", name: "My shop", buyRate: 1.25, sellRate: 0.5, updated: 1,
  stock: [{ item: "scrap", qty: 5 }, { item: "medkit", price: 30, qty: UNLIMITED }], ...patch,
});

// --- slugs and ids ---
assert.equal(shopSlug("My Smith's Shop.json"), "my-smith-s-shop");
assert.equal(shopSlug("Kovács Bolt.JSON"), "kovacs-bolt");
assert.equal(shopSlug("  ---  "), "shop");
assert.equal(shopSlug("a".repeat(100)).length, 64);
assert.equal(uniqueShopId("New shop", new Set()), "new-shop");
assert.equal(uniqueShopId("New shop", new Set(["new-shop", "new-shop-2"])), "new-shop-3");

// --- draft <-> shop ---
const shop: ShopDef = { id: "smith-shop", name: "Smith", portrait: "p", stock: [{ item: "scrap", qty: 3 }, { item: "medkit", price: 20, qty: UNLIMITED }], buyRate: 1.5, sellRate: 0.4 };
const draft = draftFromShop(shop, 7);
assert.deepEqual(shopFromDraft(draft), shop);
assert.equal(draft.updated, 7);
// the draft is a copy: editing it leaves the shop alone
draft.stock[0].qty = 99;
assert.equal(shop.stock[0].qty, 3);
// no portrait stays absent
assert.equal("portrait" in draftFromShop({ ...shop, portrait: undefined }), false);
// the game's view cleans what the editor allows while typing
const messy = base({ name: "  ", buyRate: NaN, sellRate: -1, stock: [{ item: "", qty: 1 }, { item: "scrap", price: -5, qty: -7 }, { item: "medkit", price: 4.6, qty: 2.9 }] });
const cleaned = shopFromDraft(messy);
assert.equal(cleaned.name, "my-shop");
assert.equal(cleaned.buyRate, 1.25);
assert.equal(cleaned.sellRate, 0.5);
assert.deepEqual(cleaned.stock, [{ item: "scrap", qty: UNLIMITED }, { item: "medkit", price: 5, qty: 2 }]);
// new drafts are empty shops with the default rates
const fresh = newShopDraft("x", "X", 3);
assert.deepEqual(shopFromDraft(fresh), { id: "x", name: "X", stock: [], buyRate: 1.25, sellRate: 0.5 });

// --- storage normalisation ---
assert.equal(normalizeShopDraft(null), null);
assert.equal(normalizeShopDraft({ id: "Bad Id" }), null);
assert.deepEqual(normalizeShopDraft({ id: "ok", stock: [null, { item: 5 }, { item: "scrap", qty: "x", price: 3 }], buyRate: "no", extra: 1 }),
  { id: "ok", name: "", buyRate: 1.25, sellRate: 0.5, stock: [{ item: "", qty: 1 }, { item: "scrap", qty: 1, price: 3 }], updated: 0 });

// --- files ---
const text = shopToJson(shop);
assert.ok(text.endsWith("\n"));
assert.deepEqual(shopFromJsonText(text, "other"), shop);
assert.equal(shopFromJsonText("not json", "x"), null);
assert.equal(shopFromJsonText("[1,2]", "x"), null);
assert.equal(shopFromJsonText("3", "x"), null);
assert.equal(shopFromJsonText(JSON.stringify({ name: "No id", stock: [] }), "from-file")!.id, "from-file");
// a published revision's meta.json is accepted too
assert.deepEqual(shopFromJsonText(JSON.stringify({ v: 1, type: "shop", rev: 2, definition: shop }), "x"), shop);
// the exported file loads back to the same shop through the game's parser
assert.deepEqual(parseShop(JSON.parse(text), "x"), shop);

// --- validation ---
assert.deepEqual(codes(base()), []);
assert.deepEqual(codes(base({ id: "Bad Id" })), ["error:idInvalid"]);
assert.deepEqual(codes(base({ id: "taken" })), ["error:idTaken"]);
assert.deepEqual(codes(base({ id: "smith-shop" })), ["warning:idShadows"]);
assert.deepEqual(codes(base({ name: " " })), ["warning:noName"]);
assert.deepEqual(codes(base({ buyRate: -1 })), ["error:buyRate"]);
assert.deepEqual(codes(base({ sellRate: NaN })), ["error:sellRate"]);
assert.deepEqual(codes(base({ sellRate: 2 })), ["warning:sellAboveBuy"]);
assert.deepEqual(codes(base({ portrait: "nope" })), ["warning:portraitMissing"]);
assert.deepEqual(codes(base({ portrait: "fantasy_portrait_a" })), []);
assert.deepEqual(codes(base({ portrait: "nope" }), { ...ctx, portraits: undefined }), []);
assert.deepEqual(codes(base({ stock: [] })), ["warning:noStock"]);
assert.deepEqual(codes(base({ stock: [{ item: "", qty: 1 }] })), ["error:itemEmpty@0"]);
assert.deepEqual(codes(base({ stock: [{ item: "ghost", qty: 1 }] })), ["error:itemUnknown@0"]);
assert.deepEqual(codes(base({ stock: [{ item: "scrap", qty: 1 }, { item: "scrap", qty: 2 }] })), ["warning:itemDuplicate@1"]);
assert.deepEqual(codes(base({ stock: [{ item: "scrap", price: -1, qty: 1 }] })), ["error:priceInvalid@0"]);
assert.deepEqual(codes(base({ stock: [{ item: "scrap", price: 2.5, qty: 1 }] })), ["warning:priceFraction@0"]);
assert.deepEqual(codes(base({ stock: [{ item: "scrap", qty: -2 }] })), ["error:qtyInvalid@0"]);
assert.deepEqual(codes(base({ stock: [{ item: "scrap", qty: NaN }] })), ["error:qtyInvalid@0"]);
assert.deepEqual(codes(base({ stock: [{ item: "scrap", qty: 1.5 }] })), ["warning:qtyFraction@0"]);
assert.deepEqual(codes(base({ stock: [{ item: "scrap", qty: 0 }] })), ["warning:qtyZero@0"]);
assert.deepEqual(codes(base({ stock: [{ item: "scrap", qty: UNLIMITED }] })), []);
// a worthless item with no price is given away; with a price it is not
assert.deepEqual(codes(base({ stock: [{ item: "junk", qty: 1 }] })), ["warning:free@0"]);
assert.deepEqual(codes(base({ stock: [{ item: "junk", price: 3, qty: 1 }] })), []);
assert.deepEqual(codes(base({ stock: [{ item: "scrap", price: 0, qty: 1 }] })), ["warning:free@0"]);
assert.equal(hasErrors(validateShop(base(), ctx)), false);
assert.equal(hasErrors(validateShop(base({ id: "Bad Id" }), ctx)), true);
assert.equal(hasErrors(validateShop(base({ stock: [] }), ctx)), false);

// --- the price preview uses the game's price functions ---
const p = base();
assert.deepEqual(previewRow(p, 0, ctx), { value: 2, buy: 3, sell: 1, auto: 3 });          // 2 x 1.25 = 2.5 -> 3; 2 x 0.5 = 1
assert.deepEqual(previewRow(p, 1, ctx), { value: 15, buy: 30, sell: 8, auto: 19 });       // own price 30; 15 x 1.25 = 18.75 -> 19; 7.5 -> 8
assert.equal(previewRow(p, 5, ctx), null);
assert.equal(previewRow(base({ stock: [{ item: "", qty: 1 }] }), 0, ctx), null);
// the rates the game would use (a wrong one falls back to the default), not the typed garbage
assert.deepEqual(previewRow(base({ buyRate: NaN }), 0, ctx), { value: 2, buy: 3, sell: 1, auto: 3 });
assert.deepEqual(previewItem(base({ buyRate: 2, sellRate: 1 }), "weapon:laser_pistol", ctx), { value: 220, buy: 440, sell: 220, auto: 440 });
assert.equal(previewItem(base(), "junk", ctx).sell, 0);

console.log("shopEdit ok");
