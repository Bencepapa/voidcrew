// Run: npx tsx src/game/dropItem.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import { RIGHT, emptyInventory, equipHand, packLoc, usedCells, type Inventory, type ItemRules } from "./inventory";
import {
  DROP_GAP, armDrops, autoExempt, dropLootKey, itemsOnCell, landingCell, liveDrops, makeDrop, pickSpot, planInventoryDrop, platesKey, spotCandidates,
  type DroppedItem, type LandingWorld, type Spot,
} from "./dropItem";
import { clickPickup, resolvePickupMode, stepCollects } from "./pickupMode";
import { countOf } from "./inventory";
import { createStoryHost } from "./story/storyHost";
import type { CellType, MapItem } from "./types";

// (the operables module reads Vite's import.meta.env: a stand-in is put in its place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { evaluatePlates, initialOperableState } = await import("./operables");

const rules: ItemRules = {
  stackMax: (item) => (item.startsWith("weapon:") ? 1 : item === "scrap" ? 5 : 10),
  twoHanded: (item) => item === "weapon:rifle",
};
const check = { isWeapon: (item: string) => item.startsWith("weapon:"), known: (item: string) => item !== "mystery" };

const withPack = (cells: ({ item: string; qty: number; uid?: number } | null)[]): Inventory => {
  const inv = emptyInventory(6);
  return { ...inv, pack: inv.pack.map((_, i) => cells[i] ?? null) };
};

// ---- what leaves the inventory: a stack, or part of it
{
  const inv = withPack([null, { item: "scrap", qty: 4 }, { item: "medkit", qty: 1 }]);
  const all = planInventoryDrop(inv, "pack:1", undefined, rules, check);
  assert.ok(all.ok);
  if (all.ok) {
    assert.equal(all.item, "scrap");
    assert.equal(all.count, 4, "the whole stack");
    assert.equal(all.inv.pack[1], null, "the cell is empty");
    assert.equal(usedCells(all.inv), 1);
  }
  const some = planInventoryDrop(inv, "pack:1", 1, rules, check);
  assert.ok(some.ok);
  if (some.ok) {
    assert.equal(some.count, 1, "one piece");
    assert.equal(some.inv.pack[1]?.qty, 3, "the rest stays");
  }
  const more = planInventoryDrop(inv, "pack:1", 99, rules, check);
  assert.ok(more.ok);
  if (more.ok) assert.equal(more.count, 4, "no more than there is");
  const part = planInventoryDrop(inv, "pack:1", 0, rules, check);
  assert.ok(part.ok);
  if (part.ok) assert.equal(part.count, 1, "at least one");
  assert.deepEqual(planInventoryDrop(inv, "pack:0", undefined, rules, check), { ok: false, reason: "empty" });
  assert.deepEqual(planInventoryDrop(inv, "pack:99", undefined, rules, check), { ok: false, reason: "empty" });
  assert.deepEqual(planInventoryDrop(inv, "shop:1", undefined, rules, check), { ok: false, reason: "empty" }, "a place that is not ours");
  // (the source is untouched)
  assert.equal(inv.pack[1]?.qty, 4);
}

// ---- a hand box's item (and a two-handed one shown in the left hand)
{
  let inv = emptyInventory(6);
  inv = equipHand(inv, "reese", RIGHT, { item: "scrap", qty: 1 }, rules)!;
  const out = planInventoryDrop(inv, "hand:reese:1", undefined, rules, check);
  assert.ok(out.ok);
  if (out.ok) {
    assert.equal(out.item, "scrap");
    assert.equal(out.inv.hands.reese[1], null);
  }
  assert.deepEqual(planInventoryDrop(inv, "hand:reese:0", undefined, rules, check), { ok: false, reason: "empty" });
}

// ---- what stays: owned weapons, unique items, things the world has no picture for
{
  assert.deepEqual(planInventoryDrop(withPack([{ item: "weapon:pistol", qty: 1 }]), "pack:0", undefined, rules, check), { ok: false, reason: "weapon" });
  assert.deepEqual(planInventoryDrop(withPack([{ item: "weapon:pistol", qty: 1, uid: 7 }]), "pack:0", undefined, rules, check), { ok: false, reason: "unique" });
  assert.deepEqual(planInventoryDrop(withPack([{ item: "mystery", qty: 1 }]), "pack:0", undefined, rules, check), { ok: false, reason: "unknown" });
}

// ---- where it lands
const FACING = { x: 1, y: 0 };
const world = (over: Partial<LandingWorld> = {}, types: Record<string, CellType> = {}, floors: Record<string, number> = {}): LandingWorld => ({
  cellType: (c) => types[`${c.x},${c.y}`] ?? "floor",
  floor: (c) => floors[`${c.x},${c.y}`] ?? 0,
  walkable: () => true,
  doorShut: () => false,
  ...over,
});
{
  const party = { x: 3, y: 3 };
  assert.deepEqual(landingCell(party, FACING, 0, world()), { cell: { x: 4, y: 3 }, ahead: true }, "a free floor ahead: there");
  assert.deepEqual(landingCell(party, FACING, 0, world({}, { "4,3": "wall" })), { cell: party, ahead: false }, "a wall ahead: the party's own cell");
  assert.deepEqual(landingCell(party, FACING, 0, world({}, { "4,3": "door" })), { cell: party, ahead: false }, "(a door cell is no floor to lie on)");
  assert.equal(landingCell(party, FACING, 0, world({ walkable: () => false })).ahead, false, "a ledge, a fence, a big prop in the way");
  assert.equal(landingCell(party, FACING, 0, world({ doorShut: () => true })).ahead, false, "a shut door between");
  assert.equal(landingCell(party, FACING, 0, world({}, {}, { "4,3": 0.2 })).ahead, true, "a small step up is the same level");
  assert.equal(landingCell(party, FACING, 0, world({}, {}, { "4,3": 0.6 })).ahead, false, "another level: not there");
  assert.equal(landingCell(party, FACING, 0.6, world({}, {}, { "4,3": 0 })).ahead, false, "(standing on a bridge: not down below)");
  assert.equal(landingCell(party, { x: 0, y: 0 }, 0, world()).ahead, false, "(no facing: here)");
  assert.deepEqual(landingCell(party, { x: 0, y: -1 }, 0, world()), { cell: { x: 3, y: 2 }, ahead: true }, "(any direction)");
  // (the map's edge is a wall)
  assert.equal(landingCell({ x: 0, y: 0 }, { x: -1, y: 0 }, 0, world({}, { "-1,0": "wall" })).ahead, false);
}

// ---- where in the cell: apart, and in front
{
  const here = spotCandidates(false, FACING);
  assert.equal(here.length, 17);
  assert.deepEqual(here[0], [0.28, 0], "in the party's cell: the front of it first");
  assert.deepEqual(spotCandidates(false, { x: 0, y: -1 })[0], [0, -0.28], "(the way it faces)");
  const ahead = spotCandidates(true, FACING);
  assert.deepEqual(ahead[0], [0, 0], "in the cell ahead: the middle first");
  assert.deepEqual(ahead[1], [-0.28, 0], "then the near side");
  for (const spot of [...here, ...ahead]) assert.ok(Math.abs(spot[0]) <= 0.4 + 1e-9 && Math.abs(spot[1]) <= 0.4 + 1e-9, "inside the cell");

  // each pile gets a place of its own
  const taken: Spot[] = [];
  const cands = spotCandidates(true, FACING);
  for (let i = 0; i < 9; i++) {
    const spot = pickSpot(cands, taken);
    for (const t of taken) assert.ok(Math.hypot(t[0] - spot[0], t[1] - spot[1]) >= DROP_GAP - 1e-9, `pile ${i} clear of the others`);
    taken.push(spot);
  }
  assert.equal(new Set(taken.map((s) => s.join(","))).size, 9, "nine different places");
  // (a cell as crowded as can be: the least bad place, never an exception)
  const crowded: Spot[] = cands.slice();
  const last = pickSpot(cands, crowded);
  assert.ok(cands.some((c) => c[0] === last[0] && c[1] === last[1]));
  assert.deepEqual(pickSpot(cands, []), [0, 0], "an empty cell: the first place");
  assert.deepEqual(pickSpot([], []), [0, 0], "(no candidates: the middle)");
}

// ---- the runtime item
const scope = "7|deck1";
const mk = (id: number, cell: { x: number; y: number }, party: { x: number; y: number }): DroppedItem =>
  makeDrop({ id, scope, item: "scrap", count: 3, cell, spot: [0.28, 0], party });
{
  const d = mk(1, { x: 3, y: 3 }, { x: 3, y: 3 });
  assert.deepEqual(d.spec, { item: "scrap", cell: { x: 3, y: 3 }, count: 3, offset: [0.28, 0], dropped: 1 });
  assert.equal(mk(2, { x: 4, y: 3 }, { x: 3, y: 3 }).spec.count, 3);
  const one = makeDrop({ id: 3, scope, item: "scrap", count: 1, cell: { x: 1, y: 1 }, spot: [0, 0], party: { x: 1, y: 1 } });
  assert.equal("count" in one.spec, false, "one piece: no count");
  assert.equal(dropLootKey(scope, 5), "7|deck1|drop 5");
}

// ---- the ship loop collects by stepping - but not what was just dropped
{
  const here = mk(1, { x: 3, y: 3 }, { x: 3, y: 3 });
  const ahead = mk(2, { x: 4, y: 3 }, { x: 3, y: 3 });
  assert.equal(here.armed, false, "dropped under the party: waits");
  assert.equal(ahead.armed, true, "dropped ahead: the party is not on it");
  const party = { x: 3, y: 3 };
  assert.equal(autoExempt(here, party), true, "(the instant it is dropped, and while the party stands on it)");
  assert.equal(autoExempt(ahead, { x: 4, y: 3 }), false, "stepping onto one dropped ahead takes it, as any item lying there");
  assert.equal(autoExempt(undefined, party), false, "(an item of the map's own)");
  // leaving the cell arms it...
  const list = [here, ahead];
  assert.equal(armDrops(list, scope, party), list, "still there: the same list");
  const left = armDrops(list, scope, { x: 5, y: 3 });
  assert.notEqual(left, list);
  assert.equal(left[0].armed, true);
  assert.equal(left[1], ahead, "(untouched ones are the same objects)");
  // ...and from then on a step back takes it
  assert.equal(autoExempt(left[0], party), false);
  assert.equal(armDrops(left, scope, party), left, "nothing left to arm");
  // (another deck's drops are not armed by this deck's steps)
  const other = { ...mk(9, { x: 1, y: 1 }, { x: 1, y: 1 }), scope: "7|deck2" };
  assert.equal(armDrops([other], scope, { x: 5, y: 5 })[0].armed, false);
  // the pickup modes: "click" never collects by stepping, so none of this matters there; "auto" does
  assert.equal(stepCollects(resolvePickupMode({ world: "fantasy" })), false);
  assert.equal(stepCollects(resolvePickupMode({ world: "scifi" })), true);
  // (a click or Use takes it at any time within reach: clickPickup does not look at the drop)
  assert.equal(clickPickup({ taken: false, busy: false, reach: true }), "take");
}

// ---- the plates: a pile on the cell presses it
{
  const a = mk(1, { x: 2, y: 2 }, { x: 0, y: 0 }).spec;
  const b = mk(2, { x: 2, y: 2 }, { x: 0, y: 0 }).spec;
  const c = mk(3, { x: 5, y: 1 }, { x: 0, y: 0 }).spec;
  const own: MapItem = { item: "scrap", cell: { x: 2, y: 2 } };
  assert.equal(itemsOnCell([a, b, c], { x: 2, y: 2 }), 2);
  assert.equal(itemsOnCell([a, b, c], { x: 5, y: 1 }), 1);
  assert.equal(itemsOnCell([a, b, c], { x: 0, y: 0 }), 0);
  assert.equal(itemsOnCell([own], { x: 2, y: 2 }), 0, "the map's own loose items do not count (no old map changes)");
  assert.equal(platesKey([a, b, c, own]), "2,2;5,1", "the cells, once each, in order");
  assert.equal(platesKey([own]), "");
  assert.notEqual(platesKey([a]), platesKey([]), "taking the pile away changes it");

  // live drops: those of the scope that are not taken
  const drops = [mk(1, { x: 2, y: 2 }, { x: 0, y: 0 }), mk(2, { x: 5, y: 1 }, { x: 0, y: 0 }), { ...mk(3, { x: 1, y: 1 }, { x: 0, y: 0 }), scope: "7|deck2" }];
  const taken = new Set([dropLootKey(scope, 2)]);
  const live = liveDrops(drops, scope, (id) => taken.has(dropLootKey(scope, id)));
  assert.deepEqual(live.map((s) => s.dropped), [1], "not the taken one, not another deck's");
}

// ---- through the operables' own model: a plate held by an item, and latched by one
{
  const door = { x: 6, y: 3 };
  const plate = (hold: boolean) => ({
    width: 8, height: 6,
    cells: Array.from({ length: 6 }, (_, y) => Array.from({ length: 8 }, (_, x) => (x === door.x && y === door.y ? "door" : "floor"))) as CellType[][],
    props: [{ prop: "plate1", cell: { x: 2, y: 2 }, at: "center", operable: { targets: [{ kind: "door", x: door.x, y: door.y }], ...(hold ? {} : { hold: false }) } }],
  });
  const run = (map: ReturnType<typeof plate>, items: MapItem[], state = initialOperableState(), party: { x: number; y: number } | null = null) =>
    evaluatePlates(map as never, state, { now: 0, party, doorOpen: () => false, itemsOn: (cell) => itemsOnCell(items, cell) });
  const pile = mk(1, { x: 2, y: 2 }, { x: 0, y: 0 }).spec;

  const held = plate(true);
  const none = run(held, []);
  assert.equal(none.effects.length, 0, "nothing on the plate: nothing happens");
  const on = run(held, [pile], none.state);
  assert.ok(on.effects.some((e) => e.type === "door" && e.action === "open" && e.cell.x === door.x), "an item on it: the door opens");
  const off = run(held, [], on.state);
  assert.ok(off.effects.some((e) => e.type === "door" && e.action === "close"), "the item taken: the door shuts");
  const again = run(held, [pile], on.state);
  assert.equal(again.effects.length, 0, "while it lies there: nothing changes");

  const latch = plate(false);
  const latched = run(latch, [pile]);
  assert.ok(latched.effects.some((e) => e.type === "door" && e.action === "open"), "latching: opens");
  const after = run(latch, [], latched.state);
  assert.ok(!after.effects.some((e) => e.type === "door" && e.action === "close"), "latching: taking the item does not shut it");

  // the party and an item together: the party leaving does not release a plate an item still holds
  const both = run(held, [pile], none.state, { x: 2, y: 2 });
  const partyLeft = run(held, [pile], both.state, null);
  assert.equal(partyLeft.effects.length, 0, "the item still holds it");
}

// ---- the story counts what is carried: a drop un-readies a quest that needs it
{
  let inv = withPack([{ item: "scrap", qty: 4 }]);
  const host = createStoryHost({ inventory: () => inv, party: () => [] });
  assert.equal(host.has("scrap"), 4);
  const out = planInventoryDrop(inv, "pack:0", 3, rules, check);
  assert.ok(out.ok);
  if (out.ok) inv = out.inv;
  assert.equal(host.has("scrap"), 1, "the quest sees what is left");
  assert.equal(countOf(inv, "scrap"), 1);
  assert.equal(packLoc(0).kind, "pack");
}

console.log("dropItem: ok");
