// Run: npx tsx src/game/invpolish.test.ts
// split stacks, per-hand cooldown keys, saved inventory, loadout fallback
import assert from "node:assert/strict";
import {
  LEFT,
  RIGHT,
  effectiveHand,
  emptyInventory,
  equipHand,
  halfOf,
  handLoc,
  moveSome,
  packLoc,
  parseInventory,
  slotAt,
  splitSlot,
  totals,
  type Inventory,
  type ItemRules,
} from "./inventory";
import { handCooldownKey } from "./handCooldown";
import { resolveLoadout } from "./loadout";

const rules: ItemRules = {
  stackMax: (item) => (item.startsWith("weapon:") ? 1 : item === "scrap" ? 5 : 10),
  twoHanded: (item) => item === "weapon:rifle",
};
const withPack = (cells: ({ item: string; qty: number; uid?: number } | null)[]): Inventory => ({ ...emptyInventory(4), pack: cells });
const must = (r: ReturnType<typeof moveSome>) => {
  assert.ok(r.ok, "expected ok");
  return (r as { ok: true; inv: Inventory }).inv;
};

assert.equal(halfOf(1), 1);
assert.equal(halfOf(5), 2);
assert.equal(halfOf(10), 5);

// moveSome: a part to an empty cell
{
  const inv = withPack([{ item: "scrap", qty: 5 }, null, null, null]);
  const out = must(moveSome(inv, packLoc(0), packLoc(2), 2, rules));
  assert.deepEqual(out.pack[0], { item: "scrap", qty: 3 });
  assert.deepEqual(out.pack[2], { item: "scrap", qty: 2 });
  // all of it is a plain move
  const all = must(moveSome(inv, packLoc(0), packLoc(1), 9, rules));
  assert.equal(all.pack[0], null);
  assert.deepEqual(all.pack[1], { item: "scrap", qty: 5 });
}
// a part onto the same item stacks, the rest that doesn't fit stays
{
  const inv = withPack([{ item: "scrap", qty: 5 }, { item: "scrap", qty: 4 }, null, null]);
  const out = must(moveSome(inv, packLoc(0), packLoc(1), 3, rules));
  assert.deepEqual(out.pack[1], { item: "scrap", qty: 5 });
  assert.deepEqual(out.pack[0], { item: "scrap", qty: 4 });
  assert.equal(totals(out).scrap, 9);
}
// a part onto a different item is refused, nothing changes
{
  const inv = withPack([{ item: "scrap", qty: 5 }, { item: "wiring", qty: 1 }, null, null]);
  const r = moveSome(inv, packLoc(0), packLoc(1), 2, rules);
  assert.deepEqual(r, { ok: false, reason: "place" });
}
// a part into a hand: the hand takes one, the rest stays
{
  const inv = withPack([{ item: "medkit", qty: 6 }, null, null, null]);
  const out = must(moveSome(inv, packLoc(0), handLoc("reese", RIGHT), 3, rules));
  assert.deepEqual(slotAt(out, handLoc("reese", RIGHT)), { item: "medkit", qty: 1 });
  assert.equal(totals(out).medkit, 6);
}
// splitSlot: into the first free cell; none free: full
{
  const inv = withPack([{ item: "scrap", qty: 4 }, { item: "wiring", qty: 2 }, null, null]);
  const out = must(splitSlot(inv, packLoc(0), 2, rules));
  assert.deepEqual(out.pack[2], { item: "scrap", qty: 2 });
  assert.deepEqual(splitSlot(withPack([{ item: "scrap", qty: 4 }, { item: "a", qty: 1 }, { item: "b", qty: 1 }, { item: "c", qty: 1 }]), packLoc(0), 2, rules), { ok: false, reason: "full" });
}

// cooldown keys: per crewmate and hand; a two-hander shown on the left is the right hand's
{
  assert.notEqual(handCooldownKey("reese", LEFT), handCooldownKey("reese", RIGHT));
  assert.notEqual(handCooldownKey("reese", LEFT), handCooldownKey("lyn", LEFT));
  const two = equipHand(emptyInventory(4), "reese", RIGHT, { item: "weapon:rifle", qty: 1, uid: 0 }, rules)!;
  assert.equal(effectiveHand(two, "reese", LEFT, rules), RIGHT);
  const one = equipHand(emptyInventory(4), "lyn", LEFT, { item: "weapon:gun", qty: 1, uid: 1 }, rules)!;
  assert.equal(effectiveHand(one, "lyn", LEFT, rules), LEFT);
}

// a saved inventory comes back; junk is cleaned, unknown items dropped
{
  const inv = equipHand(withPack([{ item: "scrap", qty: 3 }, null, null, null]), "lyn", RIGHT, { item: "weapon:gun", qty: 1, uid: 7 }, rules)!;
  const again = parseInventory(JSON.parse(JSON.stringify({ ...inv, overflow: { wiring: 2 } })), rules, () => true, 4)!;
  // (what was carried loose moves into the backpack as room allows)
  assert.deepEqual(again.pack, [{ item: "scrap", qty: 3 }, { item: "wiring", qty: 2 }, null, null]);
  assert.deepEqual(again.hands, inv.hands);
  assert.deepEqual(again.overflow, {});
  const full = parseInventory({ ...inv, pack: Array.from({ length: 4 }, () => ({ item: "scrap", qty: 5 })), overflow: { wiring: 2 } }, rules, () => true, 4)!;
  assert.deepEqual(full.overflow, { wiring: 2 });
  assert.equal(parseInventory(null, rules), null);
  assert.equal(parseInventory({ pack: "no" }, rules), null);
  const messy = parseInventory(
    { pack: [{ item: "scrap", qty: 99 }, { item: 5 }, { item: "ghost", qty: 2 }, { item: "weapon:gun", qty: 4, uid: 9 }], hands: { lyn: [{ item: "weapon:rifle", qty: 1, uid: 3 }, null] }, overflow: { scrap: -1, ghost: 3 } },
    rules,
    (s) => s.item !== "ghost",
    4,
  )!;
  assert.deepEqual(messy.pack[0], { item: "scrap", qty: 5 });
  assert.equal(messy.pack[1], null);
  assert.equal(messy.pack[2], null);
  assert.deepEqual(messy.pack[3], { item: "weapon:gun", qty: 1, uid: 9 });
  // (the two-hander ends in the right hand alone)
  assert.deepEqual(messy.hands.lyn, [null, { item: "weapon:rifle", qty: 1, uid: 3 }]);
  assert.deepEqual(messy.overflow, {});
  // more than the backpack holds: the rest is carried loose
  const big = parseInventory({ pack: Array.from({ length: 6 }, (_, i) => ({ item: `i${i}`, qty: 1 })) }, rules, () => true, 4)!;
  assert.equal(big.pack.length, 4);
  assert.equal(Object.keys(big.overflow).length, 2);
}

// loadout fallback: a crewmate holding no weapon keeps their previous one (unless someone else holds it)
{
  const prev = { a: [0, 1], b: [2, null], c: [3, null] } as Record<string, [number | null, number | null]>;
  const { loadout, keptPrevious } = resolveLoadout(prev, { a: [null, null], b: [null, 5], c: [null, null], d: [3, null] });
  assert.deepEqual(loadout.a, [0, 1]);
  assert.deepEqual(loadout.b, [5, null]);
  // c's weapon 3 is now d's: c is left with none
  assert.deepEqual(loadout.c, [null, null]);
  assert.deepEqual(loadout.d, [3, null]);
  assert.deepEqual(keptPrevious.sort(), ["a", "c"]);
}

console.log("invpolish.test.ts: ok");
