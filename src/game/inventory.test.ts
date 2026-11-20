// Run: npx tsx src/game/inventory.test.ts
import assert from "node:assert/strict";
import {
  LEFT,
  RIGHT,
  addItem,
  addLoot,
  countOf,
  emptyInventory,
  equipHand,
  equipLoadout,
  freeCells,
  handLoc,
  handView,
  handsOf,
  inventoryFromHaul,
  locKey,
  moveSlot,
  packLoc,
  parseLoc,
  removeItem,
  settleOverflow,
  slotAt,
  swapHands,
  totals,
  usedCells,
  type Inventory,
  type ItemRules,
  type Loc,
} from "./inventory";
import { itemRules, weaponItemId } from "./itemRules";

// a small rule set of our own: scrap stacks to 5, a medkit to 3, a weapon doesn't stack;
// rifle and bow take both hands
const rules: ItemRules = {
  stackMax: (item) => (item.startsWith("weapon:") ? 1 : item === "scrap" ? 5 : item === "medkit" ? 3 : 10),
  twoHanded: (item) => item === "weapon:rifle" || item === "weapon:bow",
};

const small = () => emptyInventory(4);
const ok = (r: ReturnType<typeof moveSlot>): Inventory => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return (r as { ok: true; inv: Inventory }).inv;
};
const fail = (r: ReturnType<typeof moveSlot>, reason: string) => assert.deepEqual(r, { ok: false, reason });
const pack = (i: number): Loc => packLoc(i);
const hand = (crew: string, h: 0 | 1): Loc => handLoc(crew, h);
const gun = (uid: number, item = "weapon:pistol") => ({ item, qty: 1, uid });

// locations as text
{
  assert.equal(locKey(pack(3)), "pack:3");
  assert.equal(locKey(hand("reese", 1)), "hand:reese:1");
  assert.deepEqual(parseLoc("pack:12"), pack(12));
  assert.deepEqual(parseLoc("hand:reese:0"), hand("reese", 0));
  assert.deepEqual(parseLoc("hand:a:b:1"), hand("a:b", 1));
  assert.equal(parseLoc("shop:1"), null);
  assert.equal(parseLoc("hand:reese:2"), null);
}

// adding: stacks fill up first, then empty cells; capacity
{
  let r = addItem(small(), "scrap", 7, rules);
  assert.deepEqual([r.added, r.left], [7, 0]);
  assert.deepEqual(r.inv.pack.slice(0, 2), [{ item: "scrap", qty: 5 }, { item: "scrap", qty: 2 }]);
  r = addItem(r.inv, "scrap", 4, rules);
  assert.deepEqual(r.inv.pack.slice(0, 3), [{ item: "scrap", qty: 5 }, { item: "scrap", qty: 5 }, { item: "scrap", qty: 1 }]);
  // a medkit goes to an empty cell, not onto the scrap
  r = addItem(r.inv, "medkit", 1, rules);
  assert.equal(usedCells(r.inv), 4);
  assert.equal(freeCells(r.inv), 0);
  // (no empty cell left, but the last scrap cell has room for 4)
  assert.equal(freeCells(r.inv), 0);
  const full = addItem(r.inv, "scrap", 6, rules);
  assert.deepEqual([full.added, full.left], [4, 2]);
  assert.equal(full.inv.pack[2]?.qty, 5);
  assert.deepEqual(addItem(full.inv, "scrap", 1, rules), { inv: full.inv, added: 0, left: 1 });
  // the old inventory stays as it was
  assert.equal(countOf(r.inv, "scrap"), 11);
  assert.equal(countOf(emptyInventory(4), "scrap"), 0);
  // a one-of-a-kind item has its own cell
  const w = addItem(small(), "weapon:pistol", 1, rules, 7);
  assert.deepEqual(w.inv.pack[0], { item: "weapon:pistol", qty: 1, uid: 7 });
  const w2 = addItem(w.inv, "weapon:pistol", 1, rules, 8);
  assert.deepEqual(w2.inv.pack.slice(0, 2), [gun(7), gun(8)]);
  // a partial stack with room: a cell that is not full takes only what fits
  const part = addItem(addItem(small(), "scrap", 3, rules).inv, "scrap", 4, rules);
  assert.deepEqual(part.inv.pack.slice(0, 2), [{ item: "scrap", qty: 5 }, { item: "scrap", qty: 2 }]);
}

// loot that doesn't fit: plain items overflow (and come home), a weapon is refused
{
  let inv = small();
  inv = addLoot(inv, "medkit", 12, rules).inv; // 4 cells x 3
  assert.equal(freeCells(inv), 0);
  const r = addLoot(inv, "scrap", 6, rules);
  assert.deepEqual([r.overflowed, r.refused], [6, 0]);
  assert.deepEqual(r.inv.overflow, { scrap: 6 });
  assert.equal(countOf(r.inv, "scrap"), 6);
  assert.deepEqual(totals(r.inv), { medkit: 12, scrap: 6 });
  const w = addLoot(inv, "weapon:pistol", 1, rules, 3);
  assert.deepEqual([w.overflowed, w.refused], [0, 1]);
  // room opens up: the overflow moves in
  const freed = ok(moveSlot(r.inv, pack(0), hand("reese", RIGHT), rules)); // one medkit to the hand: cell 0 now 2 medkits
  assert.equal(freeCells(freed), 0);
  const gone = removeItem(freed, "medkit", 6); // two cells' worth, from the last cells
  assert.equal(gone.removed, 6);
  const settled = settleOverflow(gone.inv, rules);
  assert.deepEqual(settled.overflow, {});
  assert.equal(countOf(settled, "scrap"), 6);
  assert.equal(totals(settled).scrap, 6);
}

// moving between cells: into an empty one, stacking, swapping
{
  let inv = small();
  inv = addItem(inv, "scrap", 5, rules).inv;
  inv = addItem(inv, "scrap", 2, rules).inv; // cells: 5, 2
  inv = addItem(inv, "medkit", 1, rules).inv; // cell 2
  // to an empty cell
  const moved = ok(moveSlot(inv, pack(2), pack(3), rules));
  assert.deepEqual([moved.pack[2], moved.pack[3]], [null, { item: "medkit", qty: 1 }]);
  // onto a full stack of the same item: nothing to do
  fail(moveSlot(inv, pack(1), pack(0), rules), "full");
  // onto another item: they swap
  const swapped = ok(moveSlot(inv, pack(1), pack(2), rules));
  assert.deepEqual([swapped.pack[1], swapped.pack[2]], [{ item: "medkit", qty: 1 }, { item: "scrap", qty: 2 }]);
  // the same place, an empty one, a place that isn't there
  fail(moveSlot(inv, pack(0), pack(0), rules), "same");
  fail(moveSlot(inv, pack(3), pack(0), rules), "empty");
  fail(moveSlot(inv, pack(0), pack(9), rules), "place");
  // the original is intact
  assert.deepEqual(inv.pack[2], { item: "medkit", qty: 1 });
}

// a stack split by merging: some moves, the rest stays
{
  let inv = small();
  inv = addItem(inv, "scrap", 4, rules).inv; // cell 0: 4
  inv = addItem(inv, "medkit", 1, rules).inv; // cell 1
  inv = { ...inv, pack: [inv.pack[0], inv.pack[1], { item: "scrap", qty: 3 }, null] }; // cell 2: 3 scrap
  const r = ok(moveSlot(inv, pack(2), pack(0), rules));
  assert.deepEqual([r.pack[0], r.pack[2]], [{ item: "scrap", qty: 5 }, { item: "scrap", qty: 2 }]);
}

// hands: a stack gives ONE to a hand; the same item adds up
{
  let inv = small();
  inv = addItem(inv, "medkit", 3, rules).inv;
  let r = ok(moveSlot(inv, pack(0), hand("reese", LEFT), rules));
  assert.deepEqual(handsOf(r, "reese")[LEFT], { item: "medkit", qty: 1 });
  assert.deepEqual(r.pack[0], { item: "medkit", qty: 2 });
  r = ok(moveSlot(r, pack(0), hand("reese", LEFT), rules));
  assert.deepEqual(handsOf(r, "reese")[LEFT], { item: "medkit", qty: 2 });
  assert.deepEqual(r.pack[0], { item: "medkit", qty: 1 });
  // (a crewmate with nothing in hand: empty hands)
  assert.deepEqual(handsOf(r, "lyn"), [null, null]);
  // hand to backpack, whole stack
  r = ok(moveSlot(r, hand("reese", LEFT), pack(2), rules));
  assert.deepEqual(r.pack[2], { item: "medkit", qty: 2 });
  assert.deepEqual(handsOf(r, "reese"), [null, null]);
}

// hands: swapping with what's held; the displaced goes where the new item came from
{
  let inv = small();
  inv = addItem(inv, "weapon:pistol", 1, rules, 1).inv; // cell 0
  inv = addItem(inv, "weapon:blade", 1, rules, 2).inv; // cell 1
  let r = ok(moveSlot(inv, pack(0), hand("reese", RIGHT), rules));
  assert.deepEqual(handsOf(r, "reese")[RIGHT], gun(1));
  assert.equal(r.pack[0], null);
  // the other onto the same hand: swap, the pistol takes the blade's old cell
  r = ok(moveSlot(r, pack(1), hand("reese", RIGHT), rules));
  assert.deepEqual(handsOf(r, "reese")[RIGHT], gun(2, "weapon:blade"));
  assert.deepEqual(r.pack[1], gun(1));
  // a stack of 3 medkits onto a hand that holds a pistol: the pistol goes to a free cell, the stack stays
  const k = addItem(r, "medkit", 3, rules).inv;
  const at = k.pack.findIndex((s) => s?.item === "medkit");
  const r2 = ok(moveSlot(k, pack(at), hand("reese", RIGHT), rules));
  assert.deepEqual(handsOf(r2, "reese")[RIGHT], { item: "medkit", qty: 1 });
  assert.equal(countOf(r2, "weapon:blade"), 1);
  assert.equal(countOf(r2, "medkit"), 3);
}

// hands to hands, and between crewmates
{
  let inv = emptyInventory(4);
  inv = equipHand(inv, "reese", RIGHT, gun(1), rules)!;
  inv = equipHand(inv, "reese", LEFT, gun(2, "weapon:blade"), rules)!;
  const swapped = ok(moveSlot(inv, hand("reese", LEFT), hand("reese", RIGHT), rules));
  assert.deepEqual(handsOf(swapped, "reese"), [gun(1), gun(2, "weapon:blade")]);
  const given = ok(moveSlot(inv, hand("reese", RIGHT), hand("lyn", RIGHT), rules));
  assert.deepEqual(handsOf(given, "lyn"), [null, gun(1)]);
  assert.deepEqual(handsOf(given, "reese"), [gun(2, "weapon:blade"), null]);
  // the swap button
  assert.deepEqual(handsOf(swapHands(inv, "reese", rules)!, "reese"), [gun(1), gun(2, "weapon:blade")]);
  assert.equal(swapHands(inv, "kell", rules), null);
}

// two-handed: both hands
{
  let inv = small();
  inv = addItem(inv, "weapon:rifle", 1, rules, 5).inv; // cell 0
  inv = addItem(inv, "weapon:pistol", 1, rules, 6).inv; // cell 1
  inv = addItem(inv, "weapon:blade", 1, rules, 7).inv; // cell 2

  // onto an empty hand: held in the right; the left shows it blocked
  let r = ok(moveSlot(inv, pack(0), hand("reese", LEFT), rules));
  assert.deepEqual(handsOf(r, "reese"), [null, gun(5, "weapon:rifle")]);
  assert.deepEqual(handView(r, "reese", rules), { left: null, right: gun(5, "weapon:rifle"), leftBlocked: true });
  assert.equal(r.pack[0], null);
  // a one-handed item into the left: the rifle is put away (swap: it takes the pistol's cell)
  const swapLeft = ok(moveSlot(r, pack(1), hand("reese", LEFT), rules));
  assert.deepEqual(handsOf(swapLeft, "reese"), [gun(6), null]);
  assert.deepEqual(swapLeft.pack[1], gun(5, "weapon:rifle"));
  // the same into the right
  const swapRight = ok(moveSlot(r, pack(1), hand("reese", RIGHT), rules));
  assert.deepEqual(handsOf(swapRight, "reese"), [null, gun(6)]);
  assert.deepEqual(swapRight.pack[1], gun(5, "weapon:rifle"));
  // moving the rifle by its left (blocked) hand lifts the rifle
  const lifted = ok(moveSlot(r, hand("reese", LEFT), pack(3), rules));
  assert.deepEqual(handsOf(lifted, "reese"), [null, null]);
  assert.deepEqual(lifted.pack[3], gun(5, "weapon:rifle"));
  // the rifle onto the other hand it takes: nothing to do
  fail(moveSlot(r, hand("reese", RIGHT), hand("reese", LEFT), rules), "same");
  fail(moveSlot(r, hand("reese", LEFT), hand("reese", RIGHT), rules), "same");

  // a rifle into hands that hold two things: both go away (to the cells: the rifle's and a free one)
  let two = ok(moveSlot(inv, pack(1), hand("lyn", LEFT), rules));
  two = ok(moveSlot(two, pack(2), hand("lyn", RIGHT), rules));
  assert.deepEqual(handsOf(two, "lyn"), [gun(6), gun(7, "weapon:blade")]);
  const takeBoth = ok(moveSlot(two, pack(0), hand("lyn", RIGHT), rules));
  assert.deepEqual(handsOf(takeBoth, "lyn"), [null, gun(5, "weapon:rifle")]);
  assert.equal(countOf(takeBoth, "weapon:pistol"), 1);
  assert.equal(countOf(takeBoth, "weapon:blade"), 1);
  assert.equal(usedCells(takeBoth), 2);
  // ... and with no room for both, nothing changes
  const nospace = { ...two, pack: [two.pack[0], { item: "medkit", qty: 1 }, { item: "medkit", qty: 2 }, { item: "medkit", qty: 3 }] };
  // the rifle's cell is freed when it is lifted, but two hand items need two cells
  fail(moveSlot(nospace, pack(0), hand("lyn", RIGHT), rules), "full");
  assert.deepEqual(handsOf(nospace, "lyn"), [gun(6), gun(7, "weapon:blade")]);

  // a two-handed item straight to a hand with one thing in it
  const mixed = equipHand(emptyInventory(4), "kell", LEFT, gun(6), rules)!;
  const withBow = equipHand(mixed, "kell", RIGHT, gun(8, "weapon:bow"), rules)!;
  assert.deepEqual(handsOf(withBow, "kell"), [null, gun(8, "weapon:bow")]);
  assert.deepEqual(withBow.pack[0], gun(6));
  // no room for the displaced: not equipped
  const none = { ...emptyInventory(0), hands: mixed.hands };
  assert.equal(equipHand(none, "kell", RIGHT, gun(8, "weapon:bow"), rules), null);
  // swapping hands does nothing for a two-hander
  assert.equal(swapHands(withBow, "kell", rules), null);
}

// removing and counting across the pack, hands and overflow
{
  let inv = small();
  inv = addItem(inv, "medkit", 3, rules).inv;
  inv = addItem(inv, "medkit", 2, rules).inv; // cells: 3, 2
  inv = ok(moveSlot(inv, pack(1), hand("reese", LEFT), rules)); // one into a hand: cells 3, 1; hand 1
  assert.equal(countOf(inv, "medkit"), 5);
  const r = removeItem(inv, "medkit", 4);
  assert.equal(r.removed, 4);
  assert.equal(countOf(r.inv, "medkit"), 1);
  // taken from the last cells first, the hand last
  assert.deepEqual(r.inv.pack.slice(0, 2), [null, null]);
  assert.deepEqual(handsOf(r.inv, "reese")[LEFT], { item: "medkit", qty: 1 });
  assert.equal(removeItem(inv, "medkit", 99).removed, 5);
  assert.equal(removeItem(inv, "scrap", 1).removed, 0);
  assert.equal(countOf(inv, "medkit"), 5);
}

// the haul total leaves out what is skipped (weapons)
{
  let inv = addItem(small(), "scrap", 7, rules).inv;
  inv = addItem(inv, "weapon:pistol", 1, rules, 1).inv;
  inv = equipHand(inv, "reese", RIGHT, { item: "medkit", qty: 1 }, rules)!;
  assert.deepEqual(totals(inv), { scrap: 7, "weapon:pistol": 1, medkit: 1 });
  assert.deepEqual(totals(inv, (item) => item.startsWith("weapon:")), { scrap: 7, medkit: 1 });
}

// an older run's haul becomes a backpack (sorted, stacked, the overflow kept)
{
  const inv = inventoryFromHaul({ scrap: 12, medkit: 2, wiring: 0, gem: 3 }, rules, 6);
  assert.deepEqual(inv.pack, [
    { item: "gem", qty: 3 },
    { item: "medkit", qty: 2 },
    { item: "scrap", qty: 5 },
    { item: "scrap", qty: 5 },
    { item: "scrap", qty: 2 },
    null,
  ]);
  assert.deepEqual(totals(inv), { gem: 3, medkit: 2, scrap: 12 });
  const big = inventoryFromHaul({ scrap: 40 }, rules, 2);
  assert.deepEqual(big.pack, [{ item: "scrap", qty: 5 }, { item: "scrap", qty: 5 }]);
  assert.deepEqual(big.overflow, { scrap: 30 });
  assert.deepEqual(totals(big), { scrap: 40 });
  assert.deepEqual(inventoryFromHaul({}, rules, 3).pack, [null, null, null]);
}

// the loadout in hand: the weapon in use right, the other left; a two-hander wins the right
{
  const typeOf = (id: number) => ({ 0: "pistol", 1: "blade", 2: "rifle" } as Record<number, string>)[id];
  const w = (t: string) => `weapon:${t}`;
  let inv = equipLoadout(emptyInventory(4), "merlen", [0, 1], 0, typeOf, w, rules);
  assert.deepEqual(handsOf(inv, "merlen"), [gun(1, "weapon:blade"), gun(0)]);
  // the second in use: it is the right one
  inv = equipLoadout(emptyInventory(4), "merlen", [0, 1], 1, typeOf, w, rules);
  assert.deepEqual(handsOf(inv, "merlen"), [gun(0), gun(1, "weapon:blade")]);
  // one weapon, in the second slot: still the right hand
  inv = equipLoadout(emptyInventory(4), "kell", [null, 1], 0, typeOf, w, rules);
  assert.deepEqual(handsOf(inv, "kell"), [null, gun(1, "weapon:blade")]);
  // a two-handed one in use: the other goes to the backpack
  inv = equipLoadout(emptyInventory(4), "reese", [0, 2], 1, typeOf, w, rules);
  assert.deepEqual(handsOf(inv, "reese"), [null, gun(2, "weapon:rifle")]);
  assert.deepEqual(inv.pack[0], gun(0));
  // nobody owns it: nothing in hand
  inv = equipLoadout(emptyInventory(4), "lyn", [null, null], 0, typeOf, w, rules);
  assert.deepEqual(handsOf(inv, "lyn"), [null, null]);
  assert.equal(slotAt(inv, hand("lyn", RIGHT)), null);
}

// the game's own rules (itemRules.ts): the starting weapons fit the hands, weapons don't stack
{
  assert.equal(itemRules.stackMax(weaponItemId("sidearm")), 1);
  assert.equal(itemRules.stackMax("scrap"), 20);
  assert.equal(itemRules.stackMax("medkit"), 10);
  assert.equal(itemRules.stackMax("nothing-like-it"), 10);
  assert.equal(itemRules.twoHanded(weaponItemId("rail_rifle")), true);
  assert.equal(itemRules.twoHanded(weaponItemId("sidearm")), false);
  assert.equal(itemRules.twoHanded("scrap"), false);
  // the party's two-weapon mage keeps both: neither staff takes two hands
  assert.equal(itemRules.twoHanded(weaponItemId("arcane_staff")) || itemRules.twoHanded(weaponItemId("healing_staff")), false);
}

console.log("inventory.test.ts: ok");
