import assert from "node:assert/strict";
import { prismFaces } from "../game/propPrism";
import { propPrismGeometry } from "./propPrismMesh";

const geometry = propPrismGeometry(prismFaces(2, 2, 4, 0, true), 3);
assert.deepEqual(geometry.groups, [
  { start: 0, count: 12, materialIndex: 0 },
  { start: 12, count: 12, materialIndex: 1 },
]);
assert.equal(geometry.getAttribute("position").count, 24);
assert.deepEqual(Array.from(geometry.getAttribute("uv").array).slice(0, 12), [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
const normals = geometry.getAttribute("normal");
assert.ok(normals.getZ(0) > 0.99, "the front face points outward");
geometry.dispose();
