import assert from "node:assert/strict";
import { createReliefWallGeometry } from "./reliefMesh";

const grid = {
  width: 8,
  height: 4,
  data: Float32Array.from({ length: 32 }, (_, i) => i % 8 === 5 ? 1 : 0),
};
for (const smooth of [false, true]) {
  const { geometry, aoMap } = createReliefWallGeometry(grid, {
    wallWidth: 2, wallHeight: 1, depth: 0.2, levels: 4, minIsland: 1,
    aoRadius: 1, flushEdges: false, smooth, uvWindow: [0.5, 0.75],
  });
  geometry.computeBoundingBox();
  assert.equal(geometry.boundingBox!.min.x, -1);
  assert.equal(geometry.boundingBox!.max.x, 1);
  assert.ok(geometry.boundingBox!.max.z > 0.19);
  const uv = geometry.getAttribute("uv");
  const aoUV = geometry.getAttribute("uv1");
  const frontIndices = geometry.index!.array.slice(0, geometry.groups[0].count);
  const frontU = Array.from(frontIndices, (i) => uv.getX(i));
  const frontAoU = Array.from(frontIndices, (i) => aoUV.getX(i));
  assert.equal(Math.min(...frontU), 0.5);
  assert.equal(Math.max(...frontU), 0.75);
  assert.equal(Math.min(...frontAoU), 0);
  assert.equal(Math.max(...frontAoU), 1);
  geometry.dispose();
  aoMap.dispose();
}
