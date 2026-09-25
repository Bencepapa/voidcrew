import sharp from "sharp";
import * as fs from "node:fs";
import * as path from "node:path";

// Repeating trim textures cut from the decals, for the ladders and bridges
// (until dedicated ones are made):
//   npm run textures:trim
// - trim_paint: worn safety-yellow paint, from the arrow decal's shaft; the
//   renderer mirror-repeats it, so it tiles without seams
// - trim_hazard: a band of the hazard stripes decal, cut to a whole number
//   of stripe periods so it repeats seamlessly along its length
// Paint chipped down to the key color shows as bare dark steel.

const ROOT = path.resolve(import.meta.dirname, "..");
const TEXTURES = path.join(ROOT, "public/textures");
const STEEL = { r: 44, g: 44, b: 46 };

async function save(name: string, image: sharp.Sharp) {
  const dir = path.join(TEXTURES, name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "diffuse.png");
  await image.flatten({ background: STEEL }).png().toFile(file);
  const { width, height } = await sharp(file).metadata();
  console.log(`${name}: ${width}x${height}`);
}

async function paint() {
  // the arrow's shaft: solid paint, clear of its outline
  const box = { left: 34, top: 58, width: 28, height: 60 };
  await save("trim_paint", sharp(path.join(ROOT, "public/decals/arrow/diffuse.png")).extract(box));
}

async function hazard() {
  const src = path.join(ROOT, "public/decals/hazard_stripes/diffuse.png");
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // a band through the middle, inside the plate's torn border
  const top = 38;
  const rows = 16;
  const x0 = 8;
  const x1 = info.width - 8;
  // how yellow each column of the band is
  const yellow = (x: number, y: number) => {
    const o = (y * info.width + x) * 4;
    return data[o] > 150 && data[o + 1] > 110 && data[o + 2] < 90 && data[o + 3] > 128 ? 1 : 0;
  };
  const profile: number[] = [];
  for (let x = x0; x < x1; x++) {
    let sum = 0;
    for (let y = top; y < top + rows; y++) sum += yellow(x, y);
    profile.push(sum / rows);
  }
  // the stripes' horizontal period: the lag the profile best matches itself
  let period = 0;
  let best = Infinity;
  for (let lag = 16; lag <= profile.length / 2; lag++) {
    let diff = 0;
    for (let i = 0; i + lag < profile.length; i++) diff += Math.abs(profile[i] - profile[i + lag]);
    diff /= profile.length - lag;
    if (diff < best) {
      best = diff;
      period = lag;
    }
  }
  const periods = Math.floor((x1 - x0) / period);
  console.log(`hazard stripe period ${period}px (mismatch ${best.toFixed(3)}), ${periods} periods`);
  const box = { left: x0, top, width: period * periods, height: rows };
  await save("trim_hazard", sharp(src).extract(box));
}

async function main() {
  await paint();
  await hazard();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
