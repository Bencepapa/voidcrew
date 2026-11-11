import sharp from "sharp";
import * as fs from "node:fs";

// The palette swatch of the "sky" texture set (public/textures/sky): a tiny
// starry tile. The game never draws it - a wall or ceiling set to "sky" is
// left open and the starry sky shows through (see GameViewport).
//
//   npx tsx scripts/make-sky-swatch.ts

const out = "public/textures/sky";
const size = 64;
fs.mkdirSync(out, { recursive: true });

const diffuse = Buffer.alloc(size * size * 3);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 3;
    const star = (x * 7 + y * 13) % 97 === 0;
    diffuse[o] = star ? 230 : 6;
    diffuse[o + 1] = star ? 230 : 10;
    diffuse[o + 2] = star ? 255 : 30 + Math.round((y / size) * 20);
  }
}
const normal = Buffer.alloc(size * size * 3);
for (let i = 0; i < size * size; i++) normal.set([128, 128, 255], i * 3);

await sharp(diffuse, { raw: { width: size, height: size, channels: 3 } }).png().toFile(`${out}/diffuse.png`);
await sharp(Buffer.alloc(size * size, 128), { raw: { width: size, height: size, channels: 1 } }).png().toFile(`${out}/depth.png`);
await sharp(normal, { raw: { width: size, height: size, channels: 3 } }).png().toFile(`${out}/normal.png`);
console.log("wrote", out);
