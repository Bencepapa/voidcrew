// Run: npx tsx src/render/roofMesh.test.ts
import assert from "node:assert/strict";
import { ROOF_SHAPES, ROOF_THICKNESS, roofShapeHeight, roofShapeRise, type RoofShape } from "../game/roofPieces";
import { buildRoofGeometry } from "./roofMesh";

// Every roof piece's mesh is the surface its shape says: each top triangle is exactly planar there (its
// centre is on the heightfield: a triangle cut across a crease would sag or bulge), faces up, and together
// the triangles cover the cell once.
for (const [id, shape] of Object.entries(ROOF_SHAPES) as [string, RoofShape][]) {
  const { top, under } = buildRoofGeometry([...shape.profile], shape.corner, shape.eaves);
  const pos = top.getAttribute("position").array as Float32Array;
  assert.equal(pos.length % 9, 0);
  let area = 0;
  let peak = 0;
  for (let t = 0; t < pos.length; t += 9) {
    const v = [0, 1, 2].map((k) => [pos[t + 3 * k], pos[t + 3 * k + 1], pos[t + 3 * k + 2]]);
    // (the piece's own space: x and z in 0..1, the surface a slab's thickness above the underside)
    const centre = [0, 1, 2].map((k) => (v[0][k] + v[1][k] + v[2][k]) / 3);
    const x = centre[0] + 0.5;
    const z = centre[2] + 0.5;
    assert.ok(Math.abs(centre[1] - (roofShapeHeight(shape, x, z) + ROOF_THICKNESS)) < 1e-5, `${id}: a triangle at ${x.toFixed(3)},${z.toFixed(3)} isn't on the surface`);
    for (const p of v) {
      assert.ok(p[0] >= -0.5 - 1e-6 && p[0] <= 0.5 + 1e-6 && p[2] >= -0.5 - 1e-6 && p[2] <= 0.5 + 1e-6, `${id}: outside the cell`);
      assert.ok(Math.abs(p[1] - (roofShapeHeight(shape, p[0] + 0.5, p[2] + 0.5) + ROOF_THICKNESS)) < 1e-5, `${id}: a corner off the surface`);
      peak = Math.max(peak, p[1] - ROOF_THICKNESS);
    }
    // the face looks up
    const u = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
    const w = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const ny = u[2] * w[0] - u[0] * w[2];
    assert.ok(ny > 0, `${id}: a triangle faces down`);
    area += ny / 2;
  }
  assert.ok(Math.abs(area - 1) < 1e-5, `${id}: the triangles cover ${area} of the cell`);
  assert.ok(Math.abs(peak - roofShapeRise(shape)) < 1e-6, `${id}: peak ${peak}, rise ${roofShapeRise(shape)}`);
  assert.ok(under.getAttribute("position").count > 0);
  // every vertex has its texture coordinates
  assert.equal(top.getAttribute("uv").count, top.getAttribute("position").count);
}

// the new pieces' heights: a pyramid is 0.5 up in the middle and level with its eaves round the edge
{
  const pyramid = ROOF_SHAPES.roof_pyramid;
  assert.equal(roofShapeHeight(pyramid, 0.5, 0.5), 0.5);
  for (const [x, z] of [[0, 0], [1, 0], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5], [1, 1]]) assert.equal(roofShapeHeight(pyramid, x, z), 0);
  assert.equal(roofShapeHeight(pyramid, 0.25, 0.5), 0.25);
  // a ridge: eaves front and back, rising along the middle, the ends (left and right) cut straight
  const ridge = ROOF_SHAPES.roof_ridge;
  assert.equal(roofShapeHeight(ridge, 0, 0.5), 0.5);
  assert.equal(roofShapeHeight(ridge, 1, 0.5), 0.5);
  assert.equal(roofShapeHeight(ridge, 0.3, 0), 0);
  assert.equal(roofShapeHeight(ridge, 0.3, 1), 0);
  // a hipped end: the ridge goes on to the right, falls to the left
  const end = ROOF_SHAPES.roof_hipend;
  assert.equal(roofShapeHeight(end, 1, 0.5), 0.5);
  assert.equal(roofShapeHeight(end, 0, 0.5), 0);
  assert.equal(roofShapeHeight(end, 0.25, 0.5), 0.25);
  assert.equal(roofShapeHeight(end, 0.75, 0.5), 0.5);
}

console.log("roofMesh ok");
