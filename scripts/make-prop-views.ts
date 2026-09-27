import sharp from "sharp";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

// Cuts an AI "view sheet" of a prop - on magenta, front view top left, side
// view (from the +x end) top right, top view below the front one -
// and its depth sheet (same layout) into the three texture sets a views
// prop is built from (see PropType in src/game/props.ts):
// public/textures/<name>_front, _side and _top.
//
//   npm run props:views -- --sheet crewbed1.png --depth crewbed1_depth.png --name crewbed1
//
// Each view is trimmed to its figure, so it covers the prop's whole extent.
// The sizes printed at the end give the views' proportions, to set the
// prop's size and measure its parts from.

const { values: args } = parseArgs({
  options: {
    sheet: { type: "string" },
    depth: { type: "string" },
    name: { type: "string" },
    // output width of the front view (the others at the same pixel scale)
    size: { type: "string", default: "256" },
  },
});

const ROOT = path.resolve(import.meta.dirname, "..");
const VIEWS = ["front", "side", "top"];
// a run of rows or columns counts as figure with at least this many
// non-magenta pixels; gaps narrower than MIN_GAP don't split figures
const MIN_PIXELS = 3;
const MIN_GAP = 12;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

// runs of indices whose count reaches MIN_PIXELS, merged across short gaps
function runs(counts: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] < MIN_PIXELS) continue;
    const last = out[out.length - 1];
    if (last && i - last[1] <= MIN_GAP) last[1] = i + 1;
    else out.push([i, i + 1]);
  }
  return out;
}

// The views, found by the magenta gaps between them: the upper band of
// rows holds the front and side views (left to right), the lower one the
// top view. Each box is trimmed to its figure.
async function viewBoxes(file: string): Promise<Box[]> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const figure = (x: number, y: number) => {
    const o = (y * W + x) * 3;
    return Math.hypot(data[o] - 255, data[o + 1], data[o + 2] - 255) >= 120;
  };
  const trim = (x0: number, x1: number, y0: number, y1: number): Box => {
    const cols = new Array(x1 - x0).fill(0);
    const rows = new Array(y1 - y0).fill(0);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (figure(x, y)) {
          cols[x - x0]++;
          rows[y - y0]++;
        }
      }
    }
    const [cx0, cx1] = [runs(cols)[0][0], runs(cols).at(-1)![1]];
    const [ry0, ry1] = [runs(rows)[0][0], runs(rows).at(-1)![1]];
    return { left: x0 + cx0, top: y0 + ry0, width: cx1 - cx0, height: ry1 - ry0 };
  };
  const rowCounts = new Array(info.height).fill(0);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < W; x++) if (figure(x, y)) rowCounts[y]++;
  const bands = runs(rowCounts);
  if (bands.length < 2) throw new Error(`${path.basename(file)}: expected two bands of views, found ${bands.length}`);
  const colCounts = (y0: number, y1: number) => {
    const counts = new Array(W).fill(0);
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (figure(x, y)) counts[x]++;
    return runs(counts);
  };
  const upper = colCounts(...bands[0]);
  const lower = colCounts(...bands[1]);
  if (upper.length < 2 || !lower.length) throw new Error(`${path.basename(file)}: can't find the three views`);
  return [
    trim(upper[0][0], upper[0][1], ...bands[0]),
    trim(upper[1][0], upper[1][1], ...bands[0]),
    trim(lower[0][0], lower[0][1], ...bands[1]),
  ];
}

async function main() {
  if (!args.sheet || !args.depth || !args.name) {
    console.error("Usage: npm run props:views -- --sheet <file> --depth <file> --name <prop> [--size 256]");
    process.exit(1);
  }
  const work = path.join(ROOT, "concept/gen/props", args.name);
  fs.mkdirSync(work, { recursive: true });

  // one pixel scale for all three views: the front view's
  const boxes = await viewBoxes(args.sheet);
  const depthBoxes = await viewBoxes(args.depth);
  const scale = Number(args.size) / boxes[0].width;

  const sizes: string[] = [];
  for (let i = 0; i < VIEWS.length; i++) {
    const view = VIEWS[i];
    const box = boxes[i];
    // the depth sheet's figure, fitted onto the color one's
    const dbox = depthBoxes[i];
    const color = path.join(work, `${view}.png`);
    const depth = path.join(work, `${view}_depth.png`);
    await sharp(args.sheet).extract(box).png().toFile(color);
    await sharp(args.depth).extract(dbox).resize(box.width, box.height, { fit: "fill" }).png().toFile(depth);
    const out = path.join(ROOT, "public/textures", `${args.name}_${view}`);
    execFileSync(
      process.execPath,
      [
        path.join(ROOT, "node_modules/tsx/dist/cli.mjs"),
        path.join(ROOT, "scripts/process-texture.ts"),
        "--diffuse",
        color,
        "--depth",
        depth,
        "--out",
        out,
        "--key",
        "ff00ff",
        "--size",
        String(Math.max(8, Math.round(box.width * scale))),
      ],
      { stdio: "inherit" },
    );
    sizes.push(`${view}: ${box.width} x ${box.height} (aspect ${(box.width / box.height).toFixed(3)})`);
  }
  console.log(`\n${args.name} views (source pixels):\n  ${sizes.join("\n  ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
