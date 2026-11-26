import assert from "node:assert/strict";
import { prismFaces, prismInset, prismSides } from "./propPrism";

for (let sides = 3; sides <= 12; sides++) {
  const polygon = prismFaces(2, 2, sides, 0, true);
  const star = prismFaces(2, 2, sides, 45, true);
  assert.equal(polygon.length, sides);
  assert.equal(star.length, sides * 2);
  for (const [index, edge] of star.entries()) {
    assert.deepEqual(edge.to, star[(index + 1) % star.length].from);
    assert.equal(edge.material, index % 2);
    if (index % 2 === 0) {
      assert.deepEqual(edge.from, polygon[index / 2].from);
      const r = Math.hypot(...edge.to);
      assert.ok(r > 0 && r < Math.cos(Math.PI / sides));
    }
  }
  assert.ok(prismFaces(2, 1, sides, 90, false).every(edge => edge.material === 0));
}
assert.equal(prismSides(-2), 3);
assert.equal(prismSides(14), 12);
assert.equal(prismSides(5.8), 6);
assert.equal(prismSides(Infinity), 5);
assert.equal(prismInset(-1), 0);
assert.equal(prismInset(100), 90);
