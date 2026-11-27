import assert from "node:assert/strict";
import { prismFaces, prismInset, prismSides, prismWrap } from "./propPrism";

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
// wrap: one copy of the texture runs on across n sides (a star side's two halves count as one)
{
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  const polygon = prismFaces(2, 2, 6, 0, true, 3);
  assert.deepEqual(polygon.map(f => f.material), [0, 0, 0, 1, 1, 1]);
  near(polygon[0].u0, 0); near(polygon[0].u1, 1 / 3); near(polygon[1].u1, 2 / 3); near(polygon[2].u1, 1);
  near(polygon[3].u0, 0); near(polygon[5].u1, 1);
  const star = prismFaces(2, 2, 4, 40, false, 1);
  assert.equal(star.length, 8);
  for (let i = 0; i < 8; i += 2) {
    near(star[i].u0, 0); near(star[i].u1, star[i + 1].u0); near(star[i + 1].u1, 1);
    near(star[i].u1, 0.5); // the two halves of a regular star side are equally wide
  }
  assert.ok(star.every(f => f.material === 0));
  const whole = prismFaces(2, 2, 5, 30, false, 5);
  near(whole[0].u0, 0); near(whole[whole.length - 1].u1, 1);
  for (let i = 1; i < whole.length; i++) near(whole[i].u0, whole[i - 1].u1);
  // wrap 0 keeps the old per-face mapping
  assert.ok(prismFaces(2, 2, 5, 30, true).every(f => f.u0 === 0 && f.u1 === 1));
}
assert.equal(prismWrap(-1), 0);
assert.equal(prismWrap(2.4), 2);
assert.equal(prismWrap(undefined), 0);
assert.equal(prismSides(-2), 3);
assert.equal(prismSides(14), 12);
assert.equal(prismSides(5.8), 6);
assert.equal(prismSides(Infinity), 5);
assert.equal(prismInset(-1), 0);
assert.equal(prismInset(100), 90);
