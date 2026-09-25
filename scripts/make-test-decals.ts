import sharp from "sharp";
import * as fs from "node:fs";
import * as path from "node:path";
import { DECALS_DIR, registerDecal } from "./decal-manifest";
import { renderText } from "../src/render/pixelFont";

// The map's stenciled number and text decals, from the shared pixel font:
//   npm run decals:test
// (bullet holes, arrows, signs and stains come from AI sheets via
// decals:import). Sizes are in surface pixels (256 per cell), so they read at
// the same pixel density as the walls.

let seed = 7;
function random() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

type RGB = [number, number, number];

async function save(name: string, width: number, height: number, rgba: Uint8Array) {
  const dir = path.join(DECALS_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  await sharp(Buffer.from(rgba), { raw: { width, height, channels: 4 } }).png().toFile(path.join(dir, "diffuse.png"));
  registerDecal(name, { normal: false });
  console.log(`${name}: ${width}x${height}`);
}

// the dark red of the walls' painted stripes (wall4), and its darker shade
const WALL_PAINT_RED: RGB = [156, 27, 26];
const WALL_PAINT_RED_DARK: RGB = [133, 22, 24];

// stenciled text from the shared pixel font
async function text(name: string, str: string, scale: number, color: RGB, darker: RGB) {
  const t = renderText(str, scale, color, darker, 0.08, random);
  await save(name, t.width, t.height, t.rgba);
}

async function main() {
  await text("num_07", "07", 4, [184, 40, 42], [156, 34, 36]);
  // big wall stencils, wider than one wall panel (256px): they run on
  // across the next panels of a straight wall
  await text("text_danger", "DANGER", 8, WALL_PAINT_RED, WALL_PAINT_RED_DARK);
  await text("text_engine", "ENGINE", 8, WALL_PAINT_RED, WALL_PAINT_RED_DARK);
  await text("text_lift", "LIFT", 8, WALL_PAINT_RED, WALL_PAINT_RED_DARK);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
