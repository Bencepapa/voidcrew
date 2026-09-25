import sharp from "sharp";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { DECALS_DIR, registerDecal } from "./decal-manifest";

// Imports a sheet of decals drawn in a grid on a flat key color (see the
// Gemini prompt in the README): cuts each grid cell out, keys out the
// background, crops to the decal, downscales it to its in-game size (in
// surface pixels, 256 per cell) and registers it in public/decals/index.json.
//
//   npm run decals:import -- --sheet sheet.png --grid 3x3 \
//     --names bullet_hole,scorch,-,oil,... --sizes 16,64,-,48,...
//
// A matching --depth sheet (same layout) adds a normal map for decals with
// relief, like bullet holes and scratches; "-" in --names skips a cell.
// Decals listed in --flat (painted signs, stains) get no normal map even then.

const USAGE = `Usage: npm run decals:import -- --sheet <file> --grid <cols>x<rows> --names a,b,... --sizes 16,48,...
  [--depth <file>]   matching height sheet (mid gray = surface) -> normal maps
  [--flat a,b]       decals that get no normal map from --depth (paint)
  [--key ff00ff]     background key color
  [--colors 16]      palette size per decal`;

const { values: args } = parseArgs({
  options: {
    sheet: { type: "string" },
    depth: { type: "string" },
    grid: { type: "string" },
    names: { type: "string" },
    sizes: { type: "string" },
    flat: { type: "string", default: "" },
    key: { type: "string", default: "ff00ff" },
    colors: { type: "string", default: "16" },
  },
});

async function main() {
  if (!args.sheet || !args.grid || !args.names || !args.sizes) {
    console.error(USAGE);
    process.exit(1);
  }
  const [cols, rows] = args.grid.split("x").map((n) => parseInt(n, 10));
  const names = args.names.split(",").map((n) => n.trim());
  const sizes = args.sizes.split(",").map((n) => n.trim());
  const flat = new Set(args.flat!.split(",").map((n) => n.trim()));
  const meta = await sharp(args.sheet).metadata();
  const cellW = Math.floor(meta.width! / cols);
  const cellH = Math.floor(meta.height! / rows);
  const workDir = path.resolve(import.meta.dirname, "../concept/gen/decals");
  fs.mkdirSync(workDir, { recursive: true });
  const tsx = path.resolve(import.meta.dirname, "../node_modules/tsx/dist/cli.mjs");

  for (let i = 0; i < Math.min(names.length, cols * rows); i++) {
    const name = names[i];
    if (!name || name === "-") continue;
    const size = sizes[i];
    if (!size || size === "-") throw new Error(`no --sizes entry for "${name}"`);

    const box = { left: (i % cols) * cellW, top: Math.floor(i / cols) * cellH, width: cellW, height: cellH };
    const diffuse = path.join(workDir, `${name}_diffuse.png`);
    await sharp(args.sheet).extract(box).png().toFile(diffuse);
    const depth = args.depth && !flat.has(name) ? path.join(workDir, `${name}_depth.png`) : null;
    if (depth) {
      await sharp(args.depth!).resize(meta.width, meta.height, { fit: "fill" }).extract(box).png().toFile(depth);
    }

    const out = path.join(DECALS_DIR, name);
    execFileSync(
      process.execPath,
      [
        tsx,
        path.resolve(import.meta.dirname, "process-texture.ts"),
        "--diffuse",
        diffuse,
        ...(depth ? ["--depth", depth, "--normal-bevel", "1"] : []),
        "--out",
        out,
        "--key",
        args.key!,
        "--trim",
        "--size",
        size,
        "--colors",
        args.colors!,
      ],
      { stdio: "inherit" },
    );
    // the depth map itself isn't used for decals, only the normal map
    fs.rmSync(path.join(out, "depth.png"), { force: true });
    if (!depth) fs.rmSync(path.join(out, "normal.png"), { force: true });
    registerDecal(name, { normal: !!depth });
    console.log(`-> decal "${name}" (${size}px wide)\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
