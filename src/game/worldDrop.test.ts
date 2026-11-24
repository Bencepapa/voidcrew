// Run: npx tsx src/game/worldDrop.test.ts
import assert from "node:assert/strict";
import { LEFT, RIGHT, emptyInventory, equipHand, handLoc, packLoc, slotAt, usedCells, type Inventory, type ItemRules, type Slot } from "./inventory";
import { ITEM_TYPES } from "./items";
import { applyWorldDrop, dropTargetOf, planWorldDrop, putInPack, type DropTarget } from "./worldDrop";
import type { Crewmate } from "./types";

// scrap stacks to 5, a medkit to 3, a weapon doesn't stack; the rifle takes both hands
const rules: ItemRules = {
  stackMax: (item) => (item.startsWith("weapon:") ? 1 : item === "scrap" ? 5 : item === "medkit" ? 3 : 10),
  twoHanded: (item) => item === "weapon:rifle",
};
const mate = (id: string, hp: number): Crewmate => ({ id, name: id, role: "MARINE", hp, maxHp: 20, en: 10, maxEn: 10 });
const crew = [mate("a", 20), mate("b", 5)];
const low = ([lo]: [number, number]) => lo;
const pistol: Slot = { item: "weapon:pistol", qty: 1 };
const scrap = (qty: number): Slot => ({ item: "scrap", qty });

// ---- which target the elements under the pointer name ----
assert.equal(dropTargetOf([]), null);
assert.equal(dropTargetOf([{}]), null);
assert.deepEqual(dropTargetOf([{ slot: "hand:a:1", crew: "a" }]), { kind: "hand", crew: "a", hand: RIGHT });
assert.deepEqual(dropTargetOf([{ slot: "hand:b:0", crew: "b" }]), { kind: "hand", crew: "b", hand: LEFT });
assert.deepEqual(dropTargetOf([{ crew: "a" }]), { kind: "avatar", crew: "a" });
assert.deepEqual(dropTargetOf([{ slot: "pack:3", pack: true }]), { kind: "pack", index: 3 });
assert.deepEqual(dropTargetOf([{ pack: true }]), { kind: "pack", index: null });
// (a shop's slot names no place of ours: the next mark decides)
assert.equal(dropTargetOf([{ slot: "shop:2" }]), null);
assert.deepEqual(dropTargetOf([{ slot: "shop:2" }, { crew: "a" }]), { kind: "avatar", crew: "a" });
// (the top element decides: a hand box beats the card around it; a plain card the window below it)
assert.deepEqual(dropTargetOf([{ crew: "a" }, { pack: true }]), { kind: "avatar", crew: "a" });
assert.deepEqual(dropTargetOf([{}, { pack: true }]), { kind: "pack", index: null });

// ---- what a drop does ----
const hand: DropTarget = { kind: "hand", crew: "a", hand: RIGHT };
const avatar: DropTarget = { kind: "avatar", crew: "a" };
const pack: DropTarget = { kind: "pack", index: null };
const ok = { taken: false, busy: false, reach: true, usable: false };
assert.equal(planWorldDrop({ ...ok, target: null }), "cancel", "anywhere else: nothing");
assert.equal(planWorldDrop({ ...ok, target: null, reach: false }), "cancel", "(out of reach or not)");
assert.equal(planWorldDrop({ ...ok, target: hand }), "hand");
assert.equal(planWorldDrop({ ...ok, target: hand, usable: true }), "hand", "a hand holds a consumable too");
assert.equal(planWorldDrop({ ...ok, target: avatar }), "pack");
assert.equal(planWorldDrop({ ...ok, target: avatar, usable: true }), "use");
assert.equal(planWorldDrop({ ...ok, target: pack, usable: true }), "pack");
assert.equal(planWorldDrop({ ...ok, target: { kind: "pack", index: 2 } }), "pack");
for (const target of [hand, avatar, pack]) {
  assert.equal(planWorldDrop({ ...ok, target, reach: false }), "far");
  assert.equal(planWorldDrop({ ...ok, target, taken: true }), "cancel");
  assert.equal(planWorldDrop({ ...ok, target, busy: true }), "cancel");
}

// ---- the backpack ----
const inv4 = emptyInventory(4);
assert.equal(usedCells(putInPack(inv4, scrap(3), rules)!), 1);
// (into the chosen cell)
let p = putInPack(inv4, scrap(3), rules, 2)!;
assert.equal(p.pack[2]?.qty, 3);
assert.equal(p.pack[0], null);
// (a taken cell: the item goes where there is room)
p = putInPack(p, pistol, rules, 2)!;
assert.equal(p.pack[2]?.item, "scrap");
assert.equal(p.pack[0]?.item, "weapon:pistol");
// (the same item in the chosen cell stacks on, the rest goes elsewhere)
p = putInPack(p, scrap(4), rules, 2)!;
assert.equal(p.pack[2]?.qty, 5);
assert.equal(p.pack[1]?.qty, 2);
// a stack bigger than a cell: the cell takes its share, the rest the next cells
p = putInPack(inv4, scrap(8), rules, 1)!;
assert.deepEqual([p.pack[1]?.qty, p.pack[0]?.qty], [5, 3]);
// nothing fits: null, nothing changed
const jammed: Inventory = { ...inv4, pack: [scrap(5), scrap(5), scrap(5), scrap(5)] };
assert.equal(putInPack(jammed, scrap(1), rules), null);
assert.equal(putInPack(jammed, scrap(1), rules, 0), null);
assert.equal(jammed.pack[0]?.qty, 5);
// a cell out of range is no cell
assert.equal(usedCells(putInPack(inv4, scrap(1), rules, 99)!), 1);

// ---- into a hand ----
let r = applyWorldDrop({ plan: "hand", target: hand, inv: inv4, crew, stack: pistol, rules, roll: low });
assert.ok(r.ok && r.how === "hand");
if (r.ok) assert.equal(slotAt(r.inv, handLoc("a", RIGHT))?.item, "weapon:pistol");
// what the hand held goes to the backpack
const armed = equipHand(inv4, "a", RIGHT, { item: "weapon:knife", qty: 1 }, rules)!;
r = applyWorldDrop({ plan: "hand", target: hand, inv: armed, crew, stack: pistol, rules, roll: low });
assert.ok(r.ok);
if (r.ok) {
  assert.equal(slotAt(r.inv, handLoc("a", RIGHT))?.item, "weapon:pistol");
  assert.equal(r.inv.pack.find((s) => s?.item === "weapon:knife")?.qty, 1);
}
// a stack: the hand takes one, the rest is in the backpack
r = applyWorldDrop({ plan: "hand", target: { kind: "hand", crew: "b", hand: LEFT }, inv: inv4, crew, stack: scrap(3), rules, roll: low });
assert.ok(r.ok);
if (r.ok) {
  assert.equal(slotAt(r.inv, handLoc("b", LEFT))?.qty, 1);
  assert.equal(r.inv.pack[0]?.qty, 2);
}
// a two-handed item takes both hands, what they held goes to the backpack
const both = equipHand(equipHand(inv4, "a", LEFT, scrap(1), rules)!, "a", RIGHT, pistol, rules)!;
r = applyWorldDrop({ plan: "hand", target: hand, inv: both, crew, stack: { item: "weapon:rifle", qty: 1 }, rules, roll: low });
assert.ok(r.ok);
if (r.ok) assert.equal(usedCells(r.inv), 2);
// the hand's old item has nowhere to go: refused, nothing changed
const crammed: Inventory = { ...armed, pack: [scrap(5), scrap(5), scrap(5), scrap(5)] };
assert.deepEqual(applyWorldDrop({ plan: "hand", target: hand, inv: crammed, crew, stack: pistol, rules, roll: low }), { ok: false, reason: "full" });
// an empty hand takes it even with a full backpack
const emptyHandFull: Inventory = { ...inv4, pack: [scrap(5), scrap(5), scrap(5), scrap(5)] };
assert.ok(applyWorldDrop({ plan: "hand", target: hand, inv: emptyHandFull, crew, stack: pistol, rules, roll: low }).ok);

// ---- onto an avatar ----
const medkit = ITEM_TYPES.medkit.use!;
r = applyWorldDrop({ plan: "use", target: { kind: "avatar", crew: "b" }, inv: inv4, crew, stack: { item: "medkit", qty: 1 }, use: medkit, rules, roll: low });
assert.ok(r.ok && r.how === "used" &&r.target === "b" && (r.hp ?? 0) > 0);
if (r.ok) {
  assert.equal(r.crew![1].hp, 5 + (r.hp ?? 0));
  assert.equal(usedCells(r.inv), 0, "one medkit, used up");
}
// of a stack of 3, one is used and 2 are kept
r = applyWorldDrop({ plan: "use", target: { kind: "avatar", crew: "b" }, inv: inv4, crew, stack: { item: "medkit", qty: 3 }, use: medkit, rules, roll: low });
assert.ok(r.ok && r.how === "used");
if (r.ok) assert.equal(r.inv.pack[0]?.qty, 2);
// the rest has no room: refused, nothing used
assert.deepEqual(
  applyWorldDrop({ plan: "use", target: { kind: "avatar", crew: "b" }, inv: { ...inv4, pack: [scrap(5), scrap(5), scrap(5), scrap(5)] }, crew, stack: { item: "medkit", qty: 2 }, use: medkit, rules, roll: low }),
  { ok: false, reason: "full" },
);
// nobody needs it (full health): not used, into the backpack
r = applyWorldDrop({ plan: "use", target: avatar, inv: inv4, crew, stack: { item: "medkit", qty: 1 }, use: medkit, rules, roll: low });
assert.ok(r.ok && r.how === "pack" && r.notUsed === "nothing");
if (r.ok) assert.equal(r.inv.pack[0]?.item, "medkit");
// a downed crewmate: not used, into the backpack
r = applyWorldDrop({ plan: "use", target: { kind: "avatar", crew: "z" }, inv: inv4, crew: [mate("z", 0)], stack: { item: "medkit", qty: 1 }, use: medkit, rules, roll: low });
assert.ok(r.ok && r.how === "pack" && r.notUsed === "down");
// a plain item on an avatar: the backpack
r = applyWorldDrop({ plan: "pack", target: avatar, inv: inv4, crew, stack: scrap(2), rules, roll: low });
assert.ok(r.ok && r.how === "pack" && r.notUsed === undefined);

// ---- onto the open window's cell ----
r = applyWorldDrop({ plan: "pack", target: { kind: "pack", index: 3 }, inv: inv4, crew, stack: scrap(2), rules, roll: low });
assert.ok(r.ok);
if (r.ok) assert.equal(slotAt(r.inv, packLoc(3))?.qty, 2);
assert.deepEqual(applyWorldDrop({ plan: "pack", target: pack, inv: jammed, crew, stack: scrap(1), rules, roll: low }), { ok: false, reason: "full" });

console.log("worldDrop ok");
