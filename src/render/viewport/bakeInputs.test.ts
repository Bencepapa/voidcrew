import assert from "node:assert/strict";
import type { PropType } from "../../game/props";
import type { CellType, PropSpec } from "../../game/types";
import { bakeInputs, shouldBakeQuickFirst } from "./bakeInputs";

const settings = {
  lightGridDensity: 8,
  lightGridQuickDensity: 2,
  lightGridMode: "directional" as const,
  lightBounce: 0.25,
};
const sharedId = "fantasy_prop_00000000-0000-0000-0000-000000000001";
const missingId = "fantasy_prop_00000000-0000-0000-0000-000000000002";
const props: PropSpec[] = [sharedId, missingId, "fence_edge"].map((prop) => ({
  prop, cell: { x: 0, y: 0 }, at: "center",
}));
const map = {
  width: 1,
  height: 1,
  cells: [["floor"]] as CellType[][],
  floorHeights: [[0]],
  ceilingHeights: [[1]],
  lightGridDensity: 6,
  lightGridAmbient: 3,
  props,
};
const crate: PropType = { kind: "box", size: [1, 1, 1], side: "crate", top: "crate" };
const propTypes = { [sharedId]: crate, fence_edge: crate };
const isSharedPropId = (id: string) => id === sharedId || id === missingId;

assert.equal(shouldBakeQuickFirst(0, map, settings), false);
assert.equal(shouldBakeQuickFirst(1, map, settings), true);
assert.equal(shouldBakeQuickFirst(6, map, settings), false);
assert.equal(shouldBakeQuickFirst(6, {}, settings), true);
assert.equal(shouldBakeQuickFirst(8, {}, settings), false);

const final = bakeInputs(map, false, false, settings, [], 2, propTypes, isSharedPropId);
assert.deepEqual(final.options, { perCell: 6, mode: "directional", bounce: 0.25 });
assert.equal(final.ambientDensity, 3);
assert.deepEqual(final.sharedPropTypes, { [sharedId]: propTypes[sharedId] });
assert.equal(bakeInputs({ ...map }, false, false, settings, [], 2, propTypes, isSharedPropId).cacheKey, final.cacheKey);
assert.notEqual(bakeInputs(map, false, false, settings, [], 3, propTypes, isSharedPropId).cacheKey, final.cacheKey);
assert.notEqual(bakeInputs(map, false, false, settings, [], 2, {}, isSharedPropId).cacheKey, final.cacheKey);

const quick = bakeInputs(map, true, false, settings, [], 2, propTypes, isSharedPropId);
assert.equal(quick.options.perCell, 2);
assert.equal(quick.ambientDensity, undefined);
assert.notEqual(quick.cacheKey, final.cacheKey);
assert.equal(bakeInputs(map, true, false, { ...settings, lightGridQuickDensity: 0 }, [], 2, propTypes, isSharedPropId).options.perCell, 1);

const preview = bakeInputs(map, false, true, settings, [], 2, propTypes, isSharedPropId);
assert.equal(preview.options.perCell, 1);
assert.equal(preview.ambientDensity, undefined);
assert.equal(bakeInputs({ ...map, lightGridDensity: undefined }, false, false, settings, [], 2, propTypes, isSharedPropId).options.perCell, 8);
assert.equal(bakeInputs({ ...map, lightGridAmbient: 6 }, false, false, settings, [], 2, propTypes, isSharedPropId).ambientDensity, undefined);
assert.equal(bakeInputs(map, false, false, { ...settings, lightGridMode: "cube" }, [], 2, propTypes, isSharedPropId).ambientDensity, undefined);
