// Run: npx tsx src/editor/losslessImage.test.ts
import assert from "node:assert/strict";
import { sameVisiblePixels } from "./losslessImage";

const img = (...px: number[][]) => ({ width: px.length, height: 1, data: Uint8ClampedArray.from(px.flat()) });
assert.ok(sameVisiblePixels(img([1, 2, 3, 255], [9, 9, 9, 0]), img([1, 2, 3, 255], [9, 9, 9, 0])), "identical");
assert.ok(sameVisiblePixels(img([1, 2, 3, 255], [9, 9, 9, 0]), img([1, 2, 3, 255], [0, 0, 0, 0])), "RGB under alpha 0 ignored");
assert.ok(!sameVisiblePixels(img([1, 2, 3, 255]), img([1, 2, 4, 255])), "visible colour differs");
assert.ok(!sameVisiblePixels(img([1, 2, 3, 128]), img([1, 2, 3, 127])), "alpha differs");
assert.ok(!sameVisiblePixels(img([1, 2, 3, 0]), img([1, 2, 3, 1])), "alpha 0 vs 1");
assert.ok(!sameVisiblePixels(img([1, 2, 3, 255]), img([1, 2, 3, 255], [1, 2, 3, 255])), "size differs");
console.log("losslessImage tests passed");
