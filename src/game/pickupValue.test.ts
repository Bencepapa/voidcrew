// Run: npx tsx src/game/pickupValue.test.ts
import assert from "node:assert/strict";
import { ITEM_CATEGORIES } from "./items";
import { CATEGORY_VALUES, MAX_PICKUP_VALUE, categoryValue, cleanPickupValue, pickupValue } from "./pickupValue";

// every category has a sensible (positive, whole) default
for (const category of ITEM_CATEGORIES) {
  assert.ok(Number.isInteger(CATEGORY_VALUES[category]) && CATEGORY_VALUES[category] > 0, category);
  assert.equal(categoryValue(category), CATEGORY_VALUES[category]);
}

// no own value (an old pickup, an empty field): the category's default
assert.equal(pickupValue(undefined, "tech"), CATEGORY_VALUES.tech);
assert.equal(pickupValue(null, "valuables"), CATEGORY_VALUES.valuables);
assert.equal(pickupValue("12", "salvage"), CATEGORY_VALUES.salvage);
assert.equal(pickupValue(NaN, "data"), CATEGORY_VALUES.data);
assert.equal(pickupValue(-3, "supplies"), CATEGORY_VALUES.supplies);

// an own value wins, rounded and capped; 0 is a deliberate "worthless"
assert.equal(pickupValue(7, "tech"), 7);
assert.equal(pickupValue(7.6, "tech"), 8);
assert.equal(pickupValue(0, "tech"), 0);
assert.equal(pickupValue(1e9, "tech"), MAX_PICKUP_VALUE);
assert.equal(cleanPickupValue(Infinity), undefined);
assert.equal(cleanPickupValue(undefined), undefined);

console.log("pickupValue ok");
