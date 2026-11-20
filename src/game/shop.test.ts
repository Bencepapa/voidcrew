// Run: npx tsx src/game/shop.test.ts
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { emptyInventory, handLoc, packLoc, slotAt, takeSlot, totals, type Inventory } from "./inventory";
import { itemRules, itemValue, weaponTypeOfItem } from "./itemRules";
import { ITEM_TYPES } from "./items";
import { WEAPON_TYPES } from "./weapons";
import { UNLIMITED, buy, buyPrice, parseShop, sell, sellPrice, type ShopRules, type ShopStockEntry } from "./shop";

// our own small rules: scrap stacks to 5, a bow takes both hands, weapons don't stack
const rules: ShopRules = {
  stackMax: (item) => (item.startsWith("weapon:") ? 1 : item === "scrap" ? 5 : 10),
  twoHanded: (item) => item === "weapon:bow",
  value: (item) => ({ scrap: 10, medkit: 40, gem: 1, "weapon:bow": 300, junk: 0 })[item] ?? 0,
};
const shop = { buyRate: 1.5, sellRate: 0.5 };
const stock = (): ShopStockEntry[] => [
  { item: "medkit", qty: 2 },
  { item: "scrap", price: 7, qty: UNLIMITED },
  { item: "weapon:bow", qty: 1 },
  { item: "gem", qty: 3 },
];

// --- prices ---
assert.equal(buyPrice(shop, { item: "medkit", qty: 1 }, rules), 60); // value x buyRate
assert.equal(buyPrice(shop, { item: "scrap", price: 7, qty: 1 }, rules), 7); // its own price wins
assert.equal(sellPrice(shop, "medkit", rules), 20); // value x sellRate
assert.equal(sellPrice(shop, "gem", rules), 1); // never rounds a valuable down to nothing
assert.equal(sellPrice(shop, "junk", rules), 0);
assert.equal(buyPrice(shop, { item: "junk", qty: 1 }, rules), 0);

// --- buying ---
let inv: Inventory = emptyInventory(4);
let r = buy(inv, 100, stock(), shop, 0, null, rules);
assert.ok(r.ok);
if (r.ok) {
  assert.equal(r.credits, 40);
  assert.equal(r.amount, 60);
  assert.deepEqual(slotAt(r.inv, packLoc(0)), { item: "medkit", qty: 1 });
  assert.equal(r.stock[0].qty, 1);
  // the stock isn't touched in place
  assert.equal(stock()[0].qty, 2);
  inv = r.inv;
}
// too poor: nothing changes
assert.deepEqual(buy(inv, 59, stock(), shop, 0, null, rules), { ok: false, reason: "poor" });
// the last one leaves the stock
let st = stock();
r = buy(inv, 500, st, shop, 0, null, rules);
assert.ok(r.ok);
if (r.ok) st = r.stock;
r = buy(inv, 500, st, shop, 0, null, rules);
assert.ok(r.ok);
if (r.ok) {
  assert.equal(r.stock.some((e) => e.item === "medkit"), false);
  assert.equal(r.stock.length, 3);
}
// asking for more than it has, nothing at that place
assert.deepEqual(buy(inv, 500, stock(), shop, 0, null, rules, 3), { ok: false, reason: "soldout" });
assert.deepEqual(buy(inv, 500, stock(), shop, 9, null, rules), { ok: false, reason: "empty" });
assert.deepEqual(buy(inv, 500, [{ item: "medkit", qty: 0 }], shop, 0, null, rules), { ok: false, reason: "soldout" });
// unlimited stock never goes down, and a quantity stacks (5 to a cell: 7 scrap = 5 + 2)
r = buy(emptyInventory(4), 500, stock(), shop, 1, null, rules, 7);
assert.ok(r.ok);
if (r.ok) {
  assert.equal(r.amount, 49);
  assert.equal(r.stock[1].qty, UNLIMITED);
  assert.deepEqual(r.inv.pack.slice(0, 2), [{ item: "scrap", qty: 5 }, { item: "scrap", qty: 2 }]);
}
// to a chosen cell: an empty one, the same item's stack, else the first room
r = buy(emptyInventory(4), 500, stock(), shop, 0, packLoc(2), rules);
assert.ok(r.ok);
if (r.ok) assert.deepEqual(slotAt(r.inv, packLoc(2)), { item: "medkit", qty: 1 });
let withScrap = emptyInventory(4);
withScrap = { ...withScrap, pack: [{ item: "scrap", qty: 3 }, { item: "medkit", qty: 1 }, null, null] };
r = buy(withScrap, 500, stock(), shop, 1, packLoc(0), rules);
assert.ok(r.ok);
if (r.ok) assert.equal(slotAt(r.inv, packLoc(0))?.qty, 4);
r = buy(withScrap, 500, stock(), shop, 1, packLoc(1), rules); // another item's cell: goes to the first room
assert.ok(r.ok);
if (r.ok) {
  assert.equal(slotAt(r.inv, packLoc(0))?.qty, 4);
  assert.equal(slotAt(r.inv, packLoc(1))?.item, "medkit");
}
// a full backpack: refused, and nothing is paid
const full: Inventory = { ...emptyInventory(2), pack: [{ item: "gem", qty: 1 }, { item: "scrap", qty: 5 }] };
assert.deepEqual(buy(full, 500, stock(), shop, 0, null, rules), { ok: false, reason: "full" });
// ...but the same item still stacks on
const room: Inventory = { ...emptyInventory(1), pack: [{ item: "medkit", qty: 9 }] };
assert.ok(buy(room, 500, stock(), shop, 0, null, rules).ok);

// into a hand: one of it; what the hand held goes to the backpack
r = buy(emptyInventory(2), 1000, stock(), shop, 2, handLoc("reese", 1), rules);
assert.ok(r.ok);
if (r.ok) {
  assert.deepEqual(r.inv.hands.reese, [null, { item: "weapon:bow", qty: 1 }]);
  assert.equal(r.credits, 1000 - 450);
  // a second two-hander displaces the first into the backpack
  const again = buy(r.inv, 1000, [{ item: "weapon:bow", qty: 1 }], shop, 0, handLoc("reese", 0), rules);
  assert.ok(again.ok);
  if (again.ok) {
    assert.deepEqual(again.inv.hands.reese, [null, { item: "weapon:bow", qty: 1 }]);
    assert.equal(totals(again.inv)["weapon:bow"], 2);
  }
  // and if the old one can't go anywhere, the purchase is refused
  const stuck: Inventory = { ...r.inv, pack: [{ item: "gem", qty: 1 }, { item: "gem", qty: 1 }] };
  assert.deepEqual(buy(stuck, 1000, [{ item: "weapon:bow", qty: 1 }], shop, 0, handLoc("reese", 0), rules), { ok: false, reason: "full" });
}
// a hand takes one at a time
assert.deepEqual(buy(emptyInventory(2), 500, stock(), shop, 0, handLoc("reese", 0), rules, 2), { ok: false, reason: "place" });

// --- selling ---
const loaded: Inventory = { ...emptyInventory(4), pack: [{ item: "medkit", qty: 3 }, { item: "junk", qty: 1 }, null, null], hands: { reese: [null, { item: "weapon:bow", qty: 1, uid: 4 }] } };
let s = sell(loaded, 10, stock(), shop, packLoc(0), rules);
assert.ok(s.ok);
if (s.ok) {
  assert.equal(s.amount, 60); // the whole stack, 3 x 20
  assert.equal(s.credits, 70);
  assert.equal(slotAt(s.inv, packLoc(0)), null);
  assert.equal(s.stock[0].qty, 5); // 2 + 3
}
// part of a stack
s = sell(loaded, 0, stock(), shop, packLoc(0), rules, 1);
assert.ok(s.ok);
if (s.ok) {
  assert.equal(slotAt(s.inv, packLoc(0))?.qty, 2);
  assert.equal(s.credits, 20);
}
// an item the shop doesn't stock yet is added; an unlimited one stays unlimited
s = sell({ ...loaded, pack: [{ item: "scrap", qty: 2 }, { item: "gem", qty: 1 }, null, null] }, 0, [{ item: "scrap", qty: UNLIMITED }], shop, packLoc(1), rules);
assert.ok(s.ok);
if (s.ok) assert.deepEqual(s.stock, [{ item: "scrap", qty: UNLIMITED }, { item: "gem", qty: 1 }]);
s = sell({ ...loaded, pack: [{ item: "scrap", qty: 2 }, null, null, null] }, 0, [{ item: "scrap", qty: UNLIMITED }], shop, packLoc(0), rules);
assert.ok(s.ok);
if (s.ok) assert.deepEqual(s.stock, [{ item: "scrap", qty: UNLIMITED }]);
// worthless, empty
assert.deepEqual(sell(loaded, 0, stock(), shop, packLoc(1), rules), { ok: false, reason: "worthless" });
assert.deepEqual(sell(loaded, 0, stock(), shop, packLoc(3), rules), { ok: false, reason: "empty" });
// from a hand, and a two-handed item shown in the left one comes from the right
s = sell(loaded, 0, [], shop, handLoc("reese", 0), rules);
assert.ok(s.ok);
if (s.ok) {
  assert.equal(s.credits, 150);
  assert.deepEqual(s.inv.hands.reese, [null, null]);
  assert.deepEqual(s.stock, [{ item: "weapon:bow", qty: 1 }]);
}
// takeSlot: nothing there, or a place that doesn't exist
assert.equal(takeSlot(loaded, packLoc(3), rules), null);
assert.equal(takeSlot(loaded, packLoc(99), rules), null);

// --- loose data ---
assert.equal(parseShop(null, "x"), null);
assert.equal(parseShop("nope", "x"), null);
assert.deepEqual(parseShop({ stock: [{ item: "a", qty: -5 }, { item: 3 }, { item: "b", price: 4 }, null] }, "fallback"), {
  id: "fallback",
  name: "fallback",
  stock: [{ item: "a", qty: UNLIMITED }, { item: "b", qty: 1, price: 4 }],
  buyRate: 1.25,
  sellRate: 0.5,
});
assert.equal(parseShop({ id: "  s ", name: "S", buyRate: "x", sellRate: 0.3, portrait: "p" }, "f")?.sellRate, 0.3);

// --- the bundled shops: valid items, and the ids the dialogue names exist ---
const dir = "src/shops";
const shops = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => parseShop(JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), f.replace(/\.json$/, ""))!);
const ids = new Set(shops.map((x) => x.id));
for (const id of ["wizard-shop", "smith-shop"]) assert.ok(ids.has(id), id);
assert.equal(ids.size, shops.length, "shop ids are unique");
for (const x of shops) {
  assert.ok(x.stock.length > 0, x.id);
  for (const e of x.stock) {
    const weapon = weaponTypeOfItem(e.item);
    assert.ok(weapon !== null ? !!WEAPON_TYPES[weapon] : !!ITEM_TYPES[e.item], `${x.id}: unknown item ${e.item}`);
    assert.ok(buyPrice(x, e, { value: itemValue }) > 0, `${x.id}: ${e.item} has no price`);
    assert.ok(e.qty === UNLIMITED || e.qty > 0);
  }
  // everything it sells fits the game's own rules (a stack of it can be carried)
  assert.ok(itemRules.stackMax(x.stock[0].item) >= 1);
}
console.log("shop tests passed");
