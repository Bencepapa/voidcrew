import sharp from "sharp";
import * as fs from "node:fs";
import * as path from "node:path";
import { DECALS_DIR, registerDecal } from "./decal-manifest";
import { renderText, seededRandom } from "../src/render/pixelFont";

// Lift call panels: a small steel plate with a dark screen showing an arrow
// (up or down) and the deck the lift goes to, in lit yellow:
//   npm run decals:lift-buttons
// -> lift_btn_<deck>_<up|down> for every combination below.

type RGB = [number, number, number];

const W = 40;
const H = 64;
const PLATE: RGB = [52, 55, 60];
const EDGE: RGB = [24, 25, 28];
const LIGHT: RGB = [104, 108, 116];
const SCREEN: RGB = [14, 16, 18];
const LIT: RGB = [236, 196, 70];
const LIT_DIM: RGB = [196, 150, 40];

async function button(deck: number, up: boolean) {
  const rgba = new Uint8Array(W * H * 4);
  const set = (x: number, y: number, [r, g, b]: RGB) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = 255;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: RGB) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c);
  };

  // the plate: dark outline, lit top-left edge, rivets in the corners
  rect(0, 0, W, H, EDGE);
  rect(1, 1, W - 1, H - 1, PLATE);
  rect(1, 1, W - 1, 2, LIGHT);
  rect(1, 1, 2, H - 1, LIGHT);
  for (const [x, y] of [
    [3, 3],
    [W - 5, 3],
    [3, H - 5],
    [W - 5, H - 5],
  ]) {
    rect(x, y, x + 2, y + 2, LIGHT);
    set(x + 1, y + 1, EDGE);
  }
  // the screen
  rect(7, 7, W - 7, H - 7, SCREEN);

  // the arrow: a triangle over a short stem
  const cx = W / 2;
  const tipY = up ? 11 : 27;
  for (let i = 0; i < 9; i++) {
    const y = up ? tipY + i : tipY - i;
    const half = Math.floor(i * 0.9);
    rect(cx - half - 1, y, cx + half + 1, y + 1, i === 0 ? LIT_DIM : LIT);
  }
  const stem = up ? [tipY + 9, tipY + 13] : [tipY - 13, tipY - 9];
  rect(cx - 2, stem[0], cx + 2, stem[1], LIT);

  // the deck number under it
  const digit = renderText(String(deck), 3, LIT, LIT_DIM, 0, seededRandom(`${deck}`));
  const ox = Math.floor((W - digit.width) / 2);
  const oy = 32;
  for (let y = 0; y < digit.height; y++) {
    for (let x = 0; x < digit.width; x++) {
      const i = (y * digit.width + x) * 4;
      if (digit.rgba[i + 3]) set(ox + x, oy + y, [digit.rgba[i], digit.rgba[i + 1], digit.rgba[i + 2]]);
    }
  }

  const name = `lift_btn_${deck}_${up ? "up" : "down"}`;
  const dir = path.join(DECALS_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  await sharp(Buffer.from(rgba), { raw: { width: W, height: H, channels: 4 } }).png().toFile(path.join(dir, "diffuse.png"));
  registerDecal(name, { normal: false });
  console.log(`${name}: ${W}x${H}`);
}

async function main() {
  await button(1, true);
  await button(2, false);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
