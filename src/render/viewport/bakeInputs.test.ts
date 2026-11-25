import assert from "node:assert/strict";
import type { PropType } from "../../game/props";
import type { CellType, PropSpec } from "../../game/types";
import { bakeInputs, shouldBakeQuickFirst } from "./bakeInputs";

const noSkyWall = () => false;
const settings = {
  lightGridDensity: 8,
  lightGridQuickDensity: 2,
  lightGridMode: "directional" as const,
  lightBounce: 0.25,
  skyLightIntensity: 1,
  skyDomeIntensity: 0.45,
  skyLightAzimuth: 200,
  skyLightElevation: 40,
  skyLightColor: "#a8bcff",
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

const final = bakeInputs(map, false, false, settings, [], 2, propTypes, isSharedPropId, noSkyWall);
assert.deepEqual(final.options, { perCell: 6, mode: "directional", bounce: 0.25 });
assert.equal(final.ambientDensity, 3);
assert.deepEqual(final.sharedPropTypes, { [sharedId]: propTypes[sharedId] });
assert.equal(bakeInputs({ ...map }, false, false, settings, [], 2, propTypes, isSharedPropId, noSkyWall).cacheKey, final.cacheKey);
assert.notEqual(bakeInputs(map, false, false, settings, [], 3, propTypes, isSharedPropId, noSkyWall).cacheKey, final.cacheKey);
assert.notEqual(bakeInputs(map, false, false, settings, [], 2, {}, isSharedPropId, noSkyWall).cacheKey, final.cacheKey);

const quick = bakeInputs(map, true, false, settings, [], 2, propTypes, isSharedPropId, noSkyWall);
assert.equal(quick.options.perCell, 2);
assert.equal(quick.ambientDensity, undefined);
assert.notEqual(quick.cacheKey, final.cacheKey);
assert.equal(bakeInputs(map, true, false, { ...settings, lightGridQuickDensity: 0 }, [], 2, propTypes, isSharedPropId, noSkyWall).options.perCell, 1);

const preview = bakeInputs(map, false, true, settings, [], 2, propTypes, isSharedPropId, noSkyWall);
assert.equal(preview.options.perCell, 1);
assert.equal(preview.ambientDensity, undefined);
assert.equal(bakeInputs({ ...map, lightGridDensity: undefined }, false, false, settings, [], 2, propTypes, isSharedPropId, noSkyWall).options.perCell, 8);
assert.equal(bakeInputs({ ...map, lightGridAmbient: 6 }, false, false, settings, [], 2, propTypes, isSharedPropId, noSkyWall).ambientDensity, undefined);
assert.equal(bakeInputs(map, false, false, { ...settings, lightGridMode: "cube" }, [], 2, propTypes, isSharedPropId, noSkyWall).ambientDensity, undefined);

const outdoors = { ...map, textures: { ceiling: "sky" } };
const skyInputs = (m = outdoors, s = settings, quick = false, preview = false) =>
  bakeInputs(m, quick, preview, s, [], 2, propTypes, isSharedPropId, noSkyWall);
const outdoorBake = skyInputs();
assert.deepEqual(outdoorBake.skySurfaces, Uint8Array.of(1));
assert.equal(outdoorBake.options.sky?.quick, false);
assert.equal(skyInputs(outdoors, settings, true).options.sky?.quick, true);
assert.equal(skyInputs(outdoors, settings, false, true).options.sky?.quick, true);
assert.notEqual(outdoorBake.cacheKey, final.cacheKey);
for (const change of [
  { skyLightIntensity: 0 }, { skyDomeIntensity: 0 }, { skyLightAzimuth: 90 },
  { skyLightElevation: 25 }, { skyLightColor: "#ffffff" },
]) {
  assert.notEqual(skyInputs(outdoors, { ...settings, ...change }).cacheKey, outdoorBake.cacheKey);
}
assert.equal(skyInputs(outdoors, { ...settings, skyLightIntensity: 0, skyDomeIntensity: 0 }).options.sky, undefined);
assert.notEqual(
  bakeInputs(outdoors, false, false, settings, [], 2, propTypes, isSharedPropId, () => true).cacheKey,
  outdoorBake.cacheKey,
);
