import sharp from "sharp";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

// Turns an AI sprite sheet of an actor (a grid of poses x viewing angles on
// magenta, see ActorType in src/game/actors.ts) and its depth sheet (same
// layout) into the game's sheet: public/actors/<name>/ diffuse.png (keyed
// transparent) and normal.png.
//
//   npm run actors:sheet -- --diffuse sheet.png --depth sheet_depth.png --name robot1 --cols 5 --rows 3
//
// Several sheets (their rows one after another in the game's sheet) go in
// comma-separated, each with its row count, and how much bigger its figures
// are drawn than the first sheet's (the AI rarely keeps the scale):
//
//   npm run actors:sheet -- --diffuse a.png,b.png --depth a_d.png,b_d.png --rows 3,1 --source-scale 1,1.16 ...
//
// The AI never draws a grid exactly - a figure's feet or its gun's flash
// often reach into the next one's share of the image - so every figure is
// found as the blobs it's made of (see findFigures) and re-placed into an
// exact cell with only its own pixels: all figures at one common scale,
// standing on the cell's bottom edge, centered on their feet. The depth
// sheet's figures are found and fitted onto the color sheet's the same way.

const { values: args } = parseArgs({
  options: {
    diffuse: { type: "string" },
    depth: { type: "string" },
    name: { type: "string" },
    cols: { type: "string", default: "5" },
    rows: { type: "string", default: "3" },
    "source-scale": { type: "string" },
    // output cell size
    width: { type: "string", default: "96" },
    height: { type: "string", default: "128" },
  },
});

const ROOT = path.resolve(import.meta.dirname, "..");
// space kept free along a cell's top and sides (px)
const MARGIN = 2;

interface Raw {
  data: Buffer;
  width: number;
  height: number;
}

async function load(file: string): Promise<Raw> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const isKey = (img: Raw, x: number, y: number) => {
  const o = (y * img.width + x) * 3;
  return Math.hypot(img.data[o] - 255, img.data[o + 1], img.data[o + 2] - 255) < 120;
};

// what's background: the color sheets' magenta, the depth sheets' black
// (some depth sheets come on magenta too)
type Background = (img: Raw, x: number, y: number) => boolean;
const darkBackground: Background = (img, x, y) => {
  const o = (y * img.width + x) * 3;
  return img.data[o] + img.data[o + 1] + img.data[o + 2] < 60 || isKey(img, x, y);
};

// A figure: its box in the source sheet, its feet's horizontal center, and
// its own pixels within the box (row by row)
interface Figure {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  footX: number;
  mask: Uint8Array;
}

// The figures of a sheet, row by row, as blobs: pixels up to 2 * REACH
// apart (after grid lines - lines across the whole sheet - are left out)
// are one blob; the `count` biggest are the figures, and every smaller one
// (a spark, a puff of smoke) goes with the figure nearest to it.
const REACH = 3;
function findFigures(img: Raw, count: number, cols: number, isBg: Background): Figure[] {
  const { width: W, height: H } = img;
  const fg = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isBg(img, x, y)) fg[y * W + x] = 1;
  // grid lines: rows or columns of line-colored pixels nearly all the way
  // across - black, or the purple of black blended into the magenta
  // (figures side by side can fill a row too, but not in those colors)
  const dark = (i: number) => {
    const [r, g, b] = [img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2]];
    return r + g + b < 120 || (g < 40 && Math.abs(r - b) < 60);
  };
  const lineRows: number[] = [];
  const lineCols: number[] = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (fg[y * W + x] && dark(y * W + x)) n++;
    if (n > W * 0.9) lineRows.push(y);
  }
  for (let x = 0; x < W; x++) {
    let n = 0;
    for (let y = 0; y < H; y++) if (fg[y * W + x] && dark(y * W + x)) n++;
    if (n > H * 0.9) lineCols.push(x);
  }
  for (const y of lineRows) fg.fill(0, y * W, (y + 1) * W);
  for (const x of lineCols) for (let y = 0; y < H; y++) fg[y * W + x] = 0;
  // grown by REACH each way, so pixels a little apart touch
  const grow = (src: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!src[y * W + x]) continue;
        for (let d = -REACH; d <= REACH; d++) {
          const nx = horizontal ? x + d : x;
          const ny = horizontal ? y : y + d;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) out[ny * W + nx] = 1;
        }
      }
    }
    return out;
  };
  const near = grow(grow(fg, true), false);

  // the blobs: their pixel counts and boxes (of their own pixels)
  const label = new Int32Array(W * H).fill(-1);
  const blobs: { id: number; n: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < W * H; start++) {
    if (!near[start] || label[start] >= 0) continue;
    const blob = { id: blobs.length, n: 0, x0: W, y0: H, x1: 0, y1: 0 };
    blobs.push(blob);
    label[start] = blob.id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i - x) / W;
      if (fg[i]) {
        blob.n++;
        blob.x0 = Math.min(blob.x0, x);
        blob.y0 = Math.min(blob.y0, y);
        blob.x1 = Math.max(blob.x1, x + 1);
        blob.y1 = Math.max(blob.y1, y + 1);
      }
      const next = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of next) {
        if (j < 0 || label[j] >= 0 || !near[j]) continue;
        label[j] = blob.id;
        stack.push(j);
      }
    }
  }
  // (not bits of grid line - thin and long - nor stray pixels)
  const real = blobs.filter((b) => {
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    return b.n > 3 && !(Math.min(w, h) <= 4 && Math.max(w, h) > 30);
  });
  if (real.length < count) throw new Error(`found ${real.length} figures, not ${count}`);

  // the figures: the biggest blobs, in reading order (rows top to bottom,
  // then left to right)
  const seeds = [...real].sort((a, b) => b.n - a.n).slice(0, count);
  seeds.sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const ordered: typeof seeds = [];
  for (let r = 0; r < count / cols; r++) {
    ordered.push(...seeds.slice(r * cols, (r + 1) * cols).sort((a, b) => a.x0 + a.x1 - (b.x0 + b.x1)));
  }
  // every other blob goes with its nearest figure
  const owner = new Map<number, number>();
  ordered.forEach((s, f) => owner.set(s.id, f));
  const gap = (a: (typeof real)[number], b: (typeof real)[number]) =>
    Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));
  for (const b of real) {
    if (owner.has(b.id)) continue;
    let best = 0;
    ordered.forEach((s, f) => {
      if (gap(b, s) < gap(b, ordered[best])) best = f;
    });
    owner.set(b.id, best);
  }

  return ordered.map((_, f) => {
    const mine = real.filter((b) => owner.get(b.id) === f);
    const ids = new Set(mine.map((b) => b.id));
    const x0 = Math.min(...mine.map((b) => b.x0));
    const y0 = Math.min(...mine.map((b) => b.y0));
    const x1 = Math.max(...mine.map((b) => b.x1));
    const y1 = Math.max(...mine.map((b) => b.y1));
    const w = x1 - x0;
    const mask = new Uint8Array(w * (y1 - y0));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) if (fg[y * W + x] && ids.has(label[y * W + x])) mask[(y - y0) * w + (x - x0)] = 1;
    }
    // the feet: the middle of its lowest tenth's pixels - a figure lying
    // down (a wreck) has none to stand on: its box's middle
    let sum = 0;
    let n = 0;
    for (let y = Math.max(y0, y1 - Math.max(1, Math.round((y1 - y0) / 10))); y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (mask[(y - y0) * w + (x - x0)]) {
          sum += x;
          n++;
        }
      }
    }
    const lying = w > (y1 - y0) * 1.2;
    return { x0, y0, x1, y1, footX: n && !lying ? sum / n : (x0 + x1) / 2, mask };
  });
}

// The AI blends a figure's outline into the magenta: a rim of purplish
// pixels too far from the key color to be keyed out. Pixels touching the
// background whose red and blue both clearly exceed green (and are close to
// each other, unlike a red paint accent) join the background, a few layers
// deep.
const DESPILL_PASSES = 3;
function despillEdges(img: Raw) {
  const purplish = (o: number) => {
    const [r, g, b] = [img.data[o], img.data[o + 1], img.data[o + 2]];
    return r - g > 30 && b - g > 30 && Math.abs(r - b) < 90;
  };
  // the background itself: the AI's magenta varies a little - make it exact
  // so the keying (with its own, tighter tolerance) takes all of it
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (isKey(img, x, y)) img.data.set([255, 0, 255], (y * img.width + x) * 3);
    }
  }
  for (let pass = 0; pass < DESPILL_PASSES; pass++) {
    const clear: number[] = [];
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const o = (y * img.width + x) * 3;
        if (isKey(img, x, y) || !purplish(o)) continue;
        const touches = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < img.width && ny < img.height && isKey(img, nx, ny));
        if (touches) clear.push(o);
      }
    }
    for (const o of clear) {
      img.data[o] = 255;
      img.data[o + 1] = 0;
      img.data[o + 2] = 255;
    }
  }
}

async function main() {
  if (!args.diffuse || !args.depth || !args.name) {
    console.error("Usage: npm run actors:sheet -- --diffuse <file> --depth <file> --name <actor> [--cols 5 --rows 3]");
    process.exit(1);
  }
  const cols = Number(args.cols);
  const diffuseFiles = args.diffuse.split(",");
  const depthFiles = args.depth.split(",");
  const rowCounts = args.rows.split(",").map(Number);
  const sourceScales = (args["source-scale"] ?? "").split(",").map((v) => Number(v) || 1);
  if (depthFiles.length !== diffuseFiles.length || rowCounts.length !== diffuseFiles.length) {
    throw new Error("give as many --depth files and --rows counts as --diffuse files");
  }
  const rows = rowCounts.reduce((a, b) => a + b, 0);
  const cw = Number(args.width);
  const ch = Number(args.height);

  // every figure, with the sheets it's from (and their scale)
  const colorFigures: (Figure & { image: Raw; depthImage: Raw; unit: number })[] = [];
  const depthFigures: Figure[] = [];
  for (const [i, file] of diffuseFiles.entries()) {
    const unit = 1 / sourceScales[i];
    const color = await load(file);
    const depth = await load(depthFiles[i]);
    colorFigures.push(...findFigures(color, rowCounts[i] * cols, cols, isKey).map((f) => ({ ...f, image: color, depthImage: depth, unit })));
    depthFigures.push(...findFigures(depth, rowCounts[i] * cols, cols, darkBackground));
  }

  // one scale for every figure (each sheet's own taken out): the tallest
  // fits the cell's height, the widest (either side of its feet) its width
  const fit = (f: (typeof colorFigures)[number]) =>
    Math.min((ch - MARGIN) / ((f.y1 - f.y0) * f.unit), (cw / 2 - MARGIN) / (Math.max(f.footX - f.x0, f.x1 - f.footX) * f.unit));
  const scale = Math.min(...colorFigures.map(fit));
  const tightest = colorFigures.findIndex((f) => fit(f) === scale);
  const t = colorFigures[tightest];
  console.log(`scale set by cell ${tightest} (row ${Math.floor(tightest / cols)}, col ${tightest % cols}): ${t.x1 - t.x0}x${t.y1 - t.y0}`);

  // a figure's own pixels, on the background, scaled to its place
  const cut = (img: Raw, f: Figure, background: [number, number, number], w: number, h: number) => {
    const fw = f.x1 - f.x0;
    const fh = f.y1 - f.y0;
    const out = Buffer.alloc(fw * fh * 3);
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const o = (y * fw + x) * 3;
        const from = ((f.y0 + y) * img.width + f.x0 + x) * 3;
        if (f.mask[y * fw + x]) img.data.copy(out, o, from, from + 3);
        else out.set(background, o);
      }
    }
    return sharp(out, { raw: { width: fw, height: fh, channels: 3 } })
      .resize(w, h, { fit: "fill", kernel: "nearest" })
      .png()
      .toBuffer();
  };

  const W = cw * cols;
  const H = ch * rows;
  const colorSheet = sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 0, b: 255 } } });
  const depthSheet = sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } });
  const colorParts: sharp.OverlayOptions[] = [];
  const depthParts: sharp.OverlayOptions[] = [];
  for (let i = 0; i < colorFigures.length; i++) {
    const f = colorFigures[i];
    const k = scale * f.unit;
    const w = Math.max(1, Math.round((f.x1 - f.x0) * k));
    const h = Math.max(1, Math.round((f.y1 - f.y0) * k));
    const left = (i % cols) * cw + Math.round(cw / 2 - (f.footX - f.x0) * k);
    const top = Math.floor(i / cols) * ch + ch - h;
    colorParts.push({ input: await cut(f.image, f, [255, 0, 255], w, h), left, top });
    depthParts.push({ input: await cut(f.depthImage, depthFigures[i], [0, 0, 0], w, h), left, top });
  }

  const work = path.join(ROOT, "concept/gen/actors", args.name);
  fs.mkdirSync(work, { recursive: true });
  const colorFile = path.join(work, "sheet_color.png");
  const depthFile = path.join(work, "sheet_depth.png");
  const colorBuf = await colorSheet.composite(colorParts).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const cimg = { data: colorBuf.data, width: colorBuf.info.width, height: colorBuf.info.height };
  despillEdges(cimg);
  await sharp(cimg.data, { raw: { width: W, height: H, channels: 3 } }).png().toFile(colorFile);
  // the depth figures' background (their own leftover key color) goes dark
  const depthBuf = await depthSheet.composite(depthParts).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const dimg = { data: depthBuf.data, width: depthBuf.info.width, height: depthBuf.info.height };
  for (let y = 0; y < dimg.height; y++) {
    for (let x = 0; x < dimg.width; x++) {
      if (isKey(dimg, x, y)) dimg.data.fill(0, (y * dimg.width + x) * 3, (y * dimg.width + x) * 3 + 3);
    }
  }
  await sharp(dimg.data, { raw: { width: W, height: H, channels: 3 } }).png().toFile(depthFile);
  console.log(`${cols}x${rows} cells of ${cw}x${ch}, scale ${scale.toFixed(3)} -> ${path.relative(ROOT, work)}`);

  const out = path.join(ROOT, "public/actors", args.name);
  execFileSync(
    process.execPath,
    [
      path.join(ROOT, "node_modules/tsx/dist/cli.mjs"),
      path.join(ROOT, "scripts/process-texture.ts"),
      "--diffuse",
      colorFile,
      "--depth",
      depthFile,
      "--out",
      out,
      "--key",
      "ff00ff",
      "--size",
      String(W),
      "--colors",
      "48",
      "--normal-source",
      "smooth",
    ],
    { stdio: "inherit" },
  );
  fs.rmSync(path.join(out, "depth.png"), { force: true });
  console.log(`-> ${path.relative(ROOT, out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
