import assert from "node:assert/strict";
import { clearLine, createSkyRayTest, SKY_CEILING, SKY_FACE, type LightBakeMap, type Occluder } from "./bakeOcclusion";
import { sunDirection } from "./skySampling";

const map: LightBakeMap = {
  width: 5,
  height: 1,
  cells: [["floor", "floor", "wall", "floor", "floor"]],
  floorHeights: [[0, 0, 0, 0, 0]],
  ceilingHeights: [[1, 1, 1, 1, 1]],
  skySurfaces: Uint8Array.of(SKY_CEILING, SKY_CEILING, 0, SKY_CEILING, SKY_CEILING),
};
const trace = (m: LightBakeMap, cells: Occluder[][] = []) => createSkyRayTest(m, { width: m.width, cells });
const shallowEast = sunDirection(90, 20);
assert.equal(trace(map)(1, 0.1, 0, shallowEast), false, "a wall blocks the low sun");
assert.equal(trace(map)(1, 0.1, 0, sunDirection(270, 45)), true, "the opposite side is exposed");
assert.equal(trace(map)(0, 0.5, 0, shallowEast), true, "a high enough ray passes over a wall");
assert.equal(trace(map)(1, 0.1, 0, sunDirection(0, 90)), true, "the sky ceiling lets rays through");
assert.equal(trace({ ...map, skySurfaces: Uint8Array.of(1, 0, 0, 1, 1) })(1, 0.1, 0, sunDirection(0, 90)), false);

const stepped = { ...map, ceilingHeights: [[1, 1, 1, 2, 1]] };
assert.equal(trace(stepped)(0, 0.5, 0, shallowEast), false, "a taller wall casts a longer shadow");
assert.equal(trace({
  ...stepped,
  skySurfaces: Uint8Array.of(1, 1, 0, SKY_CEILING | SKY_FACE.W | SKY_FACE.E, 1),
})(0, 0.5, 0, shallowEast), true, "a sky-textured wall span is an opening");

const deck = { minX: 0.75, maxX: 1.25, minY: 0.54, maxY: 0.6, minZ: -0.5, maxZ: 0.5 };
const underBridge = trace(map, [[], [deck]]);
assert.equal(underBridge(1, 0.1, 0, sunDirection(0, 90)), false, "a thin bridge deck blocks the ray");
assert.equal(underBridge(1.4, 0.1, 0, sunDirection(0, 90)), true, "the sky beside the bridge is visible");
const scaled = trace(map, [[], [{ ...deck, skyMaxY: 2.5 }]]);
assert.equal(scaled(0, 0.95, 0, sunDirection(90, 55)), false, "a scaled prop casts a taller shadow");
assert.equal(underBridge(0, 0.95, 0, sunDirection(90, 55)), true);
const roof = { ...deck, minY: 0.6, maxY: 0.66, skyOnly: true };
const underRoof = trace(map, [[], [roof]]);
assert.equal(underRoof(1, 0.1, 0, sunDirection(0, 90)), false, "a roof can shade a sky-ceiling cell");
assert.equal(clearLine(map, { width: map.width, cells: [[], [roof]] }, 1, 0.1, 0, 1, 0.9, 0, { x: 0, z: 0 }), true);
