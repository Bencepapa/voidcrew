// Run: npx tsx src/game/pickupMode.test.ts
import assert from "node:assert/strict";
import { clickPickup, inPickupReach, parsePickupMode, resolvePickupMode, stepCollects, worldDefaultPickup } from "./pickupMode";

// parsing: only the two names
assert.equal(parsePickupMode("auto"), "auto");
assert.equal(parsePickupMode("click"), "click");
assert.equal(parsePickupMode("off"), undefined);
assert.equal(parsePickupMode(null), undefined);
assert.equal(parsePickupMode(3), undefined);

// world defaults: the ship loop collects, the open world is by click
assert.equal(worldDefaultPickup("scifi"), "auto");
assert.equal(worldDefaultPickup("fantasy"), "click");

// resolution: map override > stored > world default
assert.equal(resolvePickupMode({ world: "scifi" }), "auto");
assert.equal(resolvePickupMode({ world: "fantasy" }), "click");
assert.equal(resolvePickupMode({ world: "fantasy" }, null), "click");
assert.equal(resolvePickupMode({ world: "fantasy" }, "auto"), "auto");
assert.equal(resolvePickupMode({ world: "scifi" }, "click"), "click");
assert.equal(resolvePickupMode({ world: "scifi", pickup: "click" }, "auto"), "click");
assert.equal(resolvePickupMode({ world: "fantasy", pickup: "auto" }, "click"), "auto");
// (a bad value in a hand-edited map is ignored)
assert.equal(resolvePickupMode({ world: "fantasy", pickup: "off" as never }, "auto"), "auto");

// stepping collects in auto mode only
assert.equal(stepCollects("auto"), true);
assert.equal(stepCollects("click"), false);

// reach: the own cell and the ones round it, on the same surface
const party = { x: 5, y: 5 };
assert.equal(inPickupReach(party, 0, { x: 5, y: 5 }, 0), true);
assert.equal(inPickupReach(party, 0, { x: 5, y: 4 }, 0), true);
assert.equal(inPickupReach(party, 0, { x: 6, y: 6 }, 0), true);
assert.equal(inPickupReach(party, 0, { x: 5, y: 7 }, 0), false);
assert.equal(inPickupReach(party, 0, { x: 3, y: 5 }, 0), false);
// a step up of a quarter is reachable, a whole wall height is not
assert.equal(inPickupReach(party, 0, { x: 5, y: 4 }, 0.25), true);
assert.equal(inPickupReach(party, 0, { x: 5, y: 4 }, 1), false);
assert.equal(inPickupReach(party, 1, { x: 5, y: 5 }, 0), false);

// the click's outcome
assert.equal(clickPickup({ taken: false, busy: false, reach: true }), "take");
assert.equal(clickPickup({ taken: false, busy: false, reach: false }), "far");
assert.equal(clickPickup({ taken: false, busy: true, reach: true }), "busy");
assert.equal(clickPickup({ taken: true, busy: false, reach: true }), "taken");

console.log("pickupMode ok");
