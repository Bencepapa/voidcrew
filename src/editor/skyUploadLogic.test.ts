// Run: npx tsx src/editor/skyUploadLogic.test.ts
import assert from "node:assert/strict";
import { isOpaque, skyNameFromFile, sniffImageFormat } from "./skyUploadLogic";

assert.equal(sniffImageFormat([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), "png");
assert.equal(sniffImageFormat([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), "jpeg");
assert.equal(sniffImageFormat(new TextEncoder().encode("RIFF\u0001\u0002\u0003\u0004WEBPVP8 ")), "webp");
assert.equal(sniffImageFormat(new TextEncoder().encode("RIFF\u0001\u0002\u0003\u0004WAVEfmt ")), undefined, "a RIFF that is not WebP");
assert.equal(sniffImageFormat(new TextEncoder().encode("GIF89a......")), undefined);
assert.equal(sniffImageFormat([]), undefined);
assert.equal(sniffImageFormat([0x89, 0x50]), undefined, "a cut-off header");

assert.equal(skyNameFromFile("storm_clouds-2k.PNG"), "storm clouds 2k");
assert.equal(skyNameFromFile("C:\\pics\\Alkony.jpeg"), "Alkony");
assert.equal(skyNameFromFile("/home/a/sky.webp"), "sky");
assert.equal(skyNameFromFile("noext"), "noext");
assert.equal(skyNameFromFile("a".repeat(150) + ".png").length, 100);

assert.equal(isOpaque([1, 2, 3, 255, 4, 5, 6, 255]), true);
assert.equal(isOpaque([1, 2, 3, 255, 4, 5, 6, 254]), false);
assert.equal(isOpaque([]), true);

console.log("skyUploadLogic: ok");
