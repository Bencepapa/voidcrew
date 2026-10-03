import sharp from "sharp";
import * as fs from "node:fs";
import * as path from "node:path";

// Makes the painted smoke puffs' atlas (public/textures/smoke1/puffs.png)
// from the art in concept/gen/smoke: a 6 x 6 sheet of white puffs on
// magenta, and its depth map (white: thick). Each column is one puff, its
// rows the puff thinning away over time. The atlas keeps them 6 x 6, each
// in a square tile with the puff in its middle: white, its opacity from the
// sheet's shape and the depth (see render/smoke.ts).
//
//   npx tsx scripts/make-smoke-puffs.ts

const ROOT = path.resolve(import.meta.dirname, "..");
const WORK = path.join(ROOT, "concept/gen/smoke");
const OUT = path.join(ROOT, "public/textures/smoke1");
const GRID = 6;
const TILE = 128;
// how much of its opacity the thinnest part of a puff keeps
const THIN = 0.3;

async function raw(file: string) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function main() {
  // the two pictures: the one with magenta in it is the art, the other its depth
  const files = fs.readdirSync(WORK).filter((f) => f.endsWith(".png")).map((f) => path.join(WORK, f));
  const pictures = await Promise.all(files.map(raw));
  const magenta = (p: { data: Buffer }) => p.data[0] > 180 && p.data[1] < 90 && p.data[2] > 180;
  const art = pictures.find(magenta);
  const depth = pictures.find((p) => !magenta(p));
  if (!art || !depth) throw new Error("expected the art (on magenta) and its depth map in " + WORK);
  const { width, height } = art;
  // how much of a pixel is puff: by how far it is from magenta (its green
  // - the magenta isn't quite clean, so a little green is still none)
  const mask = (i: number) => Math.max(0, Math.min(1, (art.data[i * 3 + 1] - 40) / 160));

  // where the puffs' rows and columns are: the middles of the puff along
  // each, from the shape itself (the sheet's grid isn't quite even)
  const cw = width / GRID;
  const ch = height / GRID;
  const middles = (along: "x" | "y") =>
    Array.from({ length: GRID }, (_, k) => {
      let sum = 0;
      let weight = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const at = along === "x" ? x : y;
          if (Math.floor(at / (along === "x" ? cw : ch)) !== k) continue;
          const m = mask(y * width + x);
          sum += at * m;
          weight += m;
        }
      }
      return weight ? sum / weight : (k + 0.5) * (along === "x" ? cw : ch);
    });
  const xs = middles("x");
  const ys = middles("y");
  const side = Math.floor(Math.min(cw, ch));

  const atlas = Buffer.alloc(GRID * TILE * GRID * TILE * 4);
  const across = GRID * TILE;
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      // the square around the puff, read with a smooth step (it's scaled down)
      const x0 = xs[col] - side / 2;
      const y0 = ys[row] - side / 2;
      for (let ty = 0; ty < TILE; ty++) {
        for (let tx = 0; tx < TILE; tx++) {
          let m = 0;
          let d = 0;
          let n = 0;
          // (a few samples a pixel)
          for (let sy = 0; sy < 2; sy++) {
            for (let sx = 0; sx < 2; sx++) {
              const x = Math.round(x0 + ((tx + (sx + 0.5) / 2) * side) / TILE);
              const y = Math.round(y0 + ((ty + (sy + 0.5) / 2) * side) / TILE);
              n++;
              if (x < 0 || y < 0 || x >= width || y >= height) continue;
              const i = y * width + x;
              m += mask(i);
              d += depth.data[i * 3] / 255;
            }
          }
          m /= n;
          d /= n;
          const o = ((row * TILE + ty) * across + col * TILE + tx) * 4;
          atlas[o] = atlas[o + 1] = atlas[o + 2] = 255;
          atlas[o + 3] = Math.round(255 * Math.min(1, m * (THIN + (1 - THIN) * Math.min(1, d * 1.15))));
        }
      }
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, "puffs.png");
  await sharp(atlas, { raw: { width: across, height: across, channels: 4 } }).png().toFile(out);
  console.log(`${path.relative(ROOT, out)}: ${GRID} x ${GRID} puffs of ${TILE} px (sheet rows at ${ys.map((y) => Math.round(y)).join(", ")})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
