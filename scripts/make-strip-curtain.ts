import sharp from "sharp";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// Makes the strip curtain's texture set (public/textures/blinds1): rubber
// strips hanging from a rail, to cover a duct's mouth (the low corridors
// the cleaning drones use).
//
//   npx tsx scripts/make-strip-curtain.ts
//
// From the painted art if it's there - concept/gen/props/blinds1.png (the
// strips on magenta) and blinds1_depth.png - else from a drawn placeholder.

const ROOT = path.resolve(import.meta.dirname, "..");
const WORK = path.join(ROOT, "concept/gen/props");
const W = 512;
const H = 138;
const RAIL = 16;
const STRIPS = 13;

// a number 0..1 from an integer, the same each time
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function draw(depth: boolean): string {
  const parts: string[] = [];
  const step = W / STRIPS;
  for (let i = 0; i < STRIPS; i++) {
    // each strip a little narrower than its share, hanging to its own
    // length, every other one in front
    const x = i * step + 2 + rnd(i) * 2;
    const w = step - 4 - rnd(i + 20) * 2;
    const bottom = H - 2 - rnd(i + 40) * 10;
    const front = i % 2 === 0;
    if (depth) {
      parts.push(`<rect x="${x}" y="${RAIL - 2}" width="${w}" height="${bottom - RAIL + 2}" fill="${front ? "#b0b0b0" : "#787878"}"/>`);
    } else {
      const shade = 34 + Math.round(rnd(i + 60) * 14);
      const base = `rgb(${shade}, ${shade + 4}, ${shade + 6})`;
      parts.push(`<rect x="${x}" y="${RAIL - 2}" width="${w}" height="${bottom - RAIL + 2}" fill="${base}" stroke="#101214" stroke-width="2"/>`);
      // a worn sheen down one side, a scuffed hem
      parts.push(`<rect x="${x + 4}" y="${RAIL + 2}" width="4" height="${bottom - RAIL - 8}" fill="rgba(170,180,190,0.22)"/>`);
      parts.push(`<rect x="${x + 2}" y="${bottom - 7}" width="${w - 4}" height="4" fill="rgba(140,120,90,0.35)"/>`);
    }
  }
  // the rail, with its bolts
  if (depth) {
    parts.push(`<rect x="0" y="0" width="${W}" height="${RAIL}" fill="#ffffff"/>`);
  } else {
    parts.push(`<rect x="1" y="1" width="${W - 2}" height="${RAIL - 2}" fill="#5c6166" stroke="#16181c" stroke-width="2"/>`);
    parts.push(`<rect x="3" y="3" width="${W - 6}" height="3" fill="#8b9197"/>`);
    for (let i = 0; i < 7; i++) parts.push(`<circle cx="${24 + (i * (W - 48)) / 6}" cy="${RAIL / 2 + 1}" r="3" fill="#24272b"/>`);
  }
  const background = depth ? `<rect width="${W}" height="${H}" fill="#000000"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${background}${parts.join("")}</svg>`;
}

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  let color = path.join(WORK, "blinds1.png");
  let depth = path.join(WORK, "blinds1_depth.png");
  const painted = fs.existsSync(color) && fs.existsSync(depth);
  if (!painted) {
    color = path.join(WORK, "blinds1_placeholder.png");
    depth = path.join(WORK, "blinds1_placeholder_depth.png");
    await sharp(Buffer.from(draw(false))).png().toFile(color);
    await sharp(Buffer.from(draw(true))).png().toFile(depth);
  }
  const args = ["tsx", "scripts/process-texture.ts", "--diffuse", color, "--depth", depth, "--out", path.join(ROOT, "public/textures/blinds1")];
  args.push("--size", "256", "--levels", painted ? "4" : "3", "--min-island", "2");
  if (painted) args.push("--key", "ff00ff", "--trim");
  execFileSync("npx", args, { cwd: ROOT, stdio: "inherit", shell: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
