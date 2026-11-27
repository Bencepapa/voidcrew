import assert from "node:assert/strict";
import { windowHeightGrid, windowU } from "./reliefUvWindow";

const grid = {
  width: 4,
  height: 2,
  data: new Float32Array([0, 1, 0, 1, 1, 0, 1, 0]),
};
assert.equal(windowHeightGrid(grid, [0, 1]), grid);
assert.deepEqual([...windowHeightGrid(grid, [0.25, 0.5]).data], [1, 0]);
assert.deepEqual([...windowHeightGrid(grid, [0.125, 0.625]).data], [0.5, 0.5, 0.5, 0.5]);
assert.deepEqual([...windowHeightGrid(grid, [0.98, 1]).data], [1, 0]);
assert.deepEqual([...windowHeightGrid(grid, [0.125, 0.625], 8).data], [0.5]);
assert.deepEqual([...windowHeightGrid({
  width: 4, height: 1, data: new Float32Array([0, 1, 1, 0]),
}, [0.25, 0.75], 8).data], [1]);
const holes = new Uint8Array([1, 0, 1, 1, 1, 1, 1, 1]);
const cutout = windowHeightGrid({ ...grid, solid: holes }, [0.25, 0.5]);
assert.deepEqual([...cutout.solid!], [0, 1]);
assert.deepEqual([...cutout.data], [0, 0]);
assert.equal(windowU([0.125, 0.625], 0.5), 0.375);
assert.equal(windowU([0.125, 0.625], -0.5), 0.125);
assert.equal(windowU([0.125, 0.625], 1.5), 0.625);
