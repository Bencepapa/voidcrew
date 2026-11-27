import assert from "node:assert/strict";
import { packReflectionProbe } from "./reflectionProbe";

const packed = packReflectionProbe({
  nx: 1, nz: 1, ny: 2,
  min: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 2, z: 1 },
  faces: Array.from({ length: 6 }, (_, index) => new Uint16Array(8).fill(index + 1)),
});
assert.equal(packed.ny, 6);
assert.deepEqual(packed.size, { x: 1, y: 2, z: 1 });
assert.deepEqual(packed.faces, [[1, 3, 5], [2, 4, 6]].map(axes => Uint16Array.from(axes.flatMap(axis => Array(8).fill(axis)))));
