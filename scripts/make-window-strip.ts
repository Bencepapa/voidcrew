import sharp from "sharp";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

// Turns an AI image of a three-panel window (a 3:1 strip of wall on magenta,
// its openings magenta too, with a mullion on each panel seam) and its depth
// map into three wall panel texture sets: <name>_left, <name>_mid,
// <name>_right. A window of any width is then left + mid x n + right.
//
//   npm run texture:window-strip -- --diffuse strip.png --depth strip_depth.png --name window1
//
// The two images may be framed differently: each has its strip found and
// warped horizontally so the mullions land exactly on the panel seams (at
// 1/3 and 2/3) - that's what lets the middle panel tile with itself. The
// strip is then processed as one texture (one palette, one set of height
// levels) and only cut into panels afterwards.

const { values: args } = parseArgs({
  options: {
    diffuse: { type: "string" },
    depth: { type: "string" },
    name: { type: "string", default: "window1" },
  },
});

const ROOT = path.resolve(import.meta.dirname, "..");
const PANEL = 256;
// working resolution of the warped strip (process-texture downscales it)
const WORK = PANEL * 3;

interface Raw {
  data: Buffer;
  width: number;
  height: number;
}

async function load(file: string): Promise<Raw> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const isMagenta = (img: Raw, x: number, y: number) => {
  const o = (y * img.width + x) * 3;
  return img.data[o] > 180 && img.data[o + 2] > 180 && img.data[o + 1] < 90;
};

// the strip: rows where the wall's left edge isn't magenta (a row through
// the openings is mostly magenta, but not at its ends), and the columns
// where its top rows aren't
function stripBounds(img: Raw) {
  const edgeCols = [0.01, 0.02, 0.03].map((f) => Math.floor(img.width * f));
  const rowIsWall = (y: number) => edgeCols.filter((x) => !isMagenta(img, x, y)).length >= 2;
  let y0 = 0;
  while (y0 < img.height && !rowIsWall(y0)) y0++;
  let y1 = img.height - 1;
  while (y1 > y0 && !rowIsWall(y1)) y1--;
  const probe = y0 + Math.floor((y1 - y0) * 0.08);
  let x0 = 0;
  while (x0 < img.width && isMagenta(img, x0, probe)) x0++;
  let x1 = img.width - 1;
  while (x1 > x0 && isMagenta(img, x1, probe)) x1--;
  return { x0, x1: x1 + 1, y0, y1: y1 + 1 };
}

// Centers of the two mullions: the gaps between the three openings along a
// band of rows through them. Openings are magenta in the color image and
// dark in the depth map.
function mullions(img: Raw, b: ReturnType<typeof stripBounds>, depth: boolean): [number, number] {
  const rows = [0.42, 0.46, 0.5].map((f) => b.y0 + Math.floor((b.y1 - b.y0) * f));
  const opening = (x: number) =>
    rows.filter((y) => {
      if (!depth) return isMagenta(img, x, y);
      const o = (y * img.width + x) * 3;
      return img.data[o] < 70 && !isMagenta(img, x, y);
    }).length >= 2;
  const runs: [number, number][] = [];
  let start = -1;
  for (let x = b.x0; x <= b.x1; x++) {
    const open = x < b.x1 && opening(x);
    if (open && start < 0) start = x;
    if (!open && start >= 0) {
      if (x - start > (b.x1 - b.x0) * 0.05) runs.push([start, x]);
      start = -1;
    }
  }
  if (runs.length !== 3) throw new Error(`expected 3 window openings, found ${runs.length}`);
  return [(runs[0][1] + runs[1][0]) / 2, (runs[1][1] + runs[2][0]) / 2];
}

// the strip cropped, scaled to WORK x WORK/3 and warped piecewise-linearly
// so the mullions sit at 1/3 and 2/3
async function warp(img: Raw, depth: boolean): Promise<Buffer> {
  const b = stripBounds(img);
  const [m1, m2] = mullions(img, b, depth);
  console.log(`  strip ${b.x0}-${b.x1} x ${b.y0}-${b.y1}, mullions at ${m1.toFixed(0)}, ${m2.toFixed(0)}`);
  const W = WORK * 3;
  const H = WORK;
  const out = Buffer.alloc(W * H * 3);
  const knots: [number, number][] = [
    [0, b.x0],
    [W / 3, m1],
    [(2 * W) / 3, m2],
    [W, b.x1],
  ];
  for (let x = 0; x < W; x++) {
    const k = x < W / 3 ? 0 : x < (2 * W) / 3 ? 1 : 2;
    const [ax, as] = knots[k];
    const [bx, bs] = knots[k + 1];
    const sx = Math.min(img.width - 1, Math.floor(as + ((x + 0.5 - ax) / (bx - ax)) * (bs - as)));
    for (let y = 0; y < H; y++) {
      const sy = Math.min(img.height - 1, Math.floor(b.y0 + ((y + 0.5) / H) * (b.y1 - b.y0)));
      const s = (sy * img.width + sx) * 3;
      const o = (y * W + x) * 3;
      out[o] = img.data[s];
      out[o + 1] = img.data[s + 1];
      out[o + 2] = img.data[s + 2];
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

async function main() {
  if (!args.diffuse || !args.depth) {
    console.error("Usage: npm run texture:window-strip -- --diffuse <file> --depth <file> [--name window1]");
    process.exit(1);
  }
  const work = path.join(ROOT, "concept/gen/window-strip");
  fs.mkdirSync(work, { recursive: true });
  console.log("diffuse:");
  fs.writeFileSync(path.join(work, "diffuse.png"), await warp(await load(args.diffuse), false));
  console.log("depth:");
  fs.writeFileSync(path.join(work, "depth.png"), await warp(await load(args.depth), true));

  const strip = path.join(work, "processed");
  execFileSync(
    process.execPath,
    [
      path.join(ROOT, "node_modules/tsx/dist/cli.mjs"),
      path.join(ROOT, "scripts/process-texture.ts"),
      "--diffuse",
      path.join(work, "diffuse.png"),
      "--depth",
      path.join(work, "depth.png"),
      "--out",
      strip,
      "--key",
      "ff00ff",
      "--size",
      String(PANEL * 3),
    ],
    { stdio: "inherit" },
  );

  const parts = ["left", "mid", "right"];
  for (let i = 0; i < 3; i++) {
    const dir = path.join(ROOT, "public/textures", `${args.name}_${parts[i]}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const file of ["diffuse.png", "depth.png", "normal.png"]) {
      await sharp(path.join(strip, file))
        .extract({ left: i * PANEL, top: 0, width: PANEL, height: PANEL })
        .png()
        .toFile(path.join(dir, file));
    }
    console.log(`-> public/textures/${args.name}_${parts[i]}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
