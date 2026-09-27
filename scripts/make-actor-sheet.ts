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
// The AI never draws a grid exactly, so every cell's figure is found on its
// own (its bounding box within the cell's share of the image) and re-placed
// into an exact cell: all figures at one common scale, standing on the
// cell's bottom edge, centered on their feet. The depth sheet's figures are
// fitted onto the color sheet's the same way.

const { values: args } = parseArgs({
  options: {
    diffuse: { type: "string" },
    depth: { type: "string" },
    name: { type: "string" },
    cols: { type: "string", default: "5" },
    rows: { type: "string", default: "3" },
    // output cell size
    width: { type: "string", default: "96" },
    height: { type: "string", default: "128" },
  },
});

const ROOT = path.resolve(import.meta.dirname, "..");
// space kept free along a cell's top and sides (px)
const MARGIN = 2;
// how far in from a source cell's edges to look for its figure - skips the
// grid lines AI sheets tend to draw between cells
const INSET = 8;

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

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  // the feet's horizontal center (the lowest rows' middle)
  footX: number;
}

// the figure in a region: the rows and columns holding a few non-key pixels
function figure(img: Raw, rx: number, ry: number, rw: number, rh: number): Box {
  const cols = new Array(rw).fill(0);
  const rows = new Array(rh).fill(0);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (!isKey(img, rx + x, ry + y)) {
        cols[x]++;
        rows[y]++;
      }
    }
  }
  const min = 3;
  const first = (a: number[]) => a.findIndex((n) => n >= min);
  const last = (a: number[]) => a.length - 1 - [...a].reverse().findIndex((n) => n >= min);
  const x0 = first(cols);
  const y0 = first(rows);
  const x1 = last(cols) + 1;
  const y1 = last(rows) + 1;
  if (x0 < 0 || y0 < 0) throw new Error(`no figure in the cell at ${rx},${ry}`);
  // the feet: the solid pixels of the lowest tenth of the figure
  let sum = 0;
  let n = 0;
  for (let y = y1 - Math.max(1, Math.round((y1 - y0) / 10)); y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!isKey(img, rx + x, ry + y)) {
        sum += x;
        n++;
      }
    }
  }
  return { x0: rx + x0, y0: ry + y0, x1: rx + x1, y1: ry + y1, footX: rx + (n ? sum / n : (x0 + x1) / 2) };
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
  const rows = Number(args.rows);
  const cw = Number(args.width);
  const ch = Number(args.height);
  const color = await load(args.diffuse);
  const depth = await load(args.depth);

  const cells = (img: Raw) => {
    const out: Box[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = Math.floor((c * img.width) / cols);
        const y0 = Math.floor((r * img.height) / rows);
        const x1 = Math.floor(((c + 1) * img.width) / cols);
        const y1 = Math.floor(((r + 1) * img.height) / rows);
        out.push(figure(img, x0 + INSET, y0 + INSET, x1 - x0 - 2 * INSET, y1 - y0 - 2 * INSET));
      }
    }
    return out;
  };
  const colorBoxes = cells(color);
  const depthBoxes = cells(depth);

  // one scale for every figure: the tallest fits the cell's height, the
  // widest (either side of its feet) its width
  let scale = Infinity;
  for (const b of colorBoxes) {
    scale = Math.min(scale, (ch - MARGIN) / (b.y1 - b.y0), (cw / 2 - MARGIN) / Math.max(b.footX - b.x0, b.x1 - b.footX));
  }

  const W = cw * cols;
  const H = ch * rows;
  const colorSheet = sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 0, b: 255 } } });
  const depthSheet = sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } });
  const colorParts: sharp.OverlayOptions[] = [];
  const depthParts: sharp.OverlayOptions[] = [];
  for (let i = 0; i < colorBoxes.length; i++) {
    const b = colorBoxes[i];
    const d = depthBoxes[i];
    const w = Math.max(1, Math.round((b.x1 - b.x0) * scale));
    const h = Math.max(1, Math.round((b.y1 - b.y0) * scale));
    const left = (i % cols) * cw + Math.round(cw / 2 - (b.footX - b.x0) * scale);
    const top = Math.floor(i / cols) * ch + ch - h;
    const crop = (img: string, box: Box) =>
      sharp(img)
        .removeAlpha()
        .extract({ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 })
        .resize(w, h, { fit: "fill", kernel: "nearest" })
        .png()
        .toBuffer();
    colorParts.push({ input: await crop(args.diffuse, b), left, top });
    depthParts.push({ input: await crop(args.depth, d), left, top });
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
