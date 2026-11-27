import assert from "node:assert/strict";
import { prismFaces } from "./propPrism";
import { prismFacePlacement } from "./prismFacePlacement";

for (const inset of [0, 45]) {
  for (const edge of prismFaces(2, 3, 5, inset, true, 2)) {
    const { width, position: [x, y, z], yaw } = prismFacePlacement(edge, 4, 1);
    assert.equal(y, 3);
    const checkEnds = (angle: number, mirror: number) => {
      for (const [end, sign] of [[edge.from, -1], [edge.to, 1]] as const) {
        const lx = sign * mirror * width / 2;
        assert.ok(Math.abs(x + Math.cos(angle) * lx - end[0]) < 1e-12);
        assert.ok(Math.abs(z - Math.sin(angle) * lx - end[1]) < 1e-12);
      }
    };
    checkEnds(yaw, 1);
    checkEnds(yaw + Math.PI, -1);
  }
}
