import sharp from "sharp";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { DECALS_DIR, registerDecal } from "./decal-manifest";
import { renderText, seededRandom } from "../src/render/pixelFont";

// Stenciled text decal from the 5x7 pixel font:
//   npm run decals:text -- --text "ENGINE ROOM" --name text_engine_room
// Sizes are in surface pixels (256 per cell): at the default --scale 8 each
// letter is 40x56, so longer words run across several wall panels.

const USAGE = `Usage: npm run decals:text -- --text "WORDS" --name <decal name>
  [--scale 8]        pixels per font pixel (letter = 5x7 font pixels)
  [--color 9c1b1a]   paint color (default: the walls' dark red stripe paint)
  [--wear 0.08]      share of paint pixels knocked out`;

const { values: args } = parseArgs({
  options: {
    text: { type: "string" },
    name: { type: "string" },
    scale: { type: "string", default: "8" },
    color: { type: "string", default: "9c1b1a" },
    wear: { type: "string", default: "0.08" },
  },
});

async function main() {
  if (!args.text || !args.name) {
    console.error(USAGE);
    process.exit(1);
  }
  const hex = args.color!.replace("#", "");
  const color = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  const darker = color.map((c) => Math.round(c * 0.85)) as [number, number, number];

  // seeded from the text, so re-running gives the same wear pattern; "\n"
  // in the text (e.g. "EN\nGI\nNE") stacks lines
  const text = args.text.replace(/\\n/g, "\n");
  const random = seededRandom(text);
  const { width, height, rgba } = renderText(text, parseInt(args.scale!, 10), color, darker, parseFloat(args.wear!), random);
  const dir = path.join(DECALS_DIR, args.name);
  fs.mkdirSync(dir, { recursive: true });
  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(path.join(dir, "diffuse.png"));
  registerDecal(args.name, { normal: false });
  console.log(`${args.name}: "${args.text}" ${width}x${height}px (${(width / 256).toFixed(2)} wall panels wide)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
