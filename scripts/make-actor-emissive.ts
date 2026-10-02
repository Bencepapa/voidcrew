import sharp from "sharp";
import { createServer } from "vite";
import * as fs from "node:fs";
import * as path from "node:path";

// Writes each actor's glow map - public/actors/<sheet>/emissive.png: its
// sheet's glowing pixels in their own color, black elsewhere - from its
// sheet and its type's `glow` (see ActorType in src/game/actors.ts). The
// game loads it (and works it out itself only if the file is missing).
//
//   npm run actors:emissive            (every actor type with a glow)
//   npm run actors:emissive -- robot2  (these sheets only)
//
// The file can be painted over by hand, or replaced by a painted one of the
// same size: whatever isn't black in it glows. Running this again writes it
// anew - pass --keep to leave the ones that exist alone.

const ROOT = path.resolve(import.meta.dirname, "..");

type Zone = [number, number, number, number];
interface Glow {
  crits?: string[];
  zones?: Zone[][];
  color?: "red" | "blue" | "cyan";
}
interface ActorType {
  sheet: string;
  cols: number;
  rows: number;
  glow?: Glow;
  crits: { label: string; zones: Zone[][] }[];
}

// (the same tests as the game's own - see GLOW_COLORS in GameViewport.tsx)
const SHINES: Record<"red" | "blue" | "cyan", (r: number, g: number, b: number) => boolean> = {
  red: (r, g, b) => r >= 150 && Math.max(g, b) <= 90,
  blue: (r, _g, b) => b > 170 && b - r > 70,
  cyan: (r, g, b) => g > 170 && b > 170 && r < 130,
};

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const keep = process.argv.includes("--keep");
  // the actor types, through vite (their module reads the maps its way)
  const server = await createServer({
    root: ROOT,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, entries: [] },
    appType: "custom",
    logLevel: "error",
  });
  const { ACTOR_TYPES } = (await server.ssrLoadModule("/src/game/actors.ts")) as { ACTOR_TYPES: Record<string, ActorType> };
  await server.close();

  for (const type of Object.values(ACTOR_TYPES)) {
    if (!type.glow || (only.length && !only.includes(type.sheet))) continue;
    const dir = path.join(ROOT, "public/actors", type.sheet);
    const out = path.join(dir, "emissive.png");
    if (keep && fs.existsSync(out)) continue;
    const { data, info } = await sharp(path.join(dir, "diffuse.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cw = info.width / type.cols;
    const ch = info.height / type.rows;
    const glow = type.glow;
    const glowing = type.crits.filter((c) => glow.crits?.includes(c.label));
    const zonesOf = (col: number): Zone[] => {
      const zones = [...glowing.flatMap((c) => c.zones[col] ?? []), ...(glow.zones?.[col] ?? [])];
      return glow.crits || glow.zones ? zones : [[0, 0, 1, 1]];
    };
    const shines = SHINES[glow.color ?? "red"];
    const result = Buffer.alloc(info.width * info.height * 3);
    let lit = 0;
    for (let row = 0; row < type.rows; row++) {
      for (let col = 0; col < type.cols; col++) {
        for (const [x0, y0, x1, y1] of zonesOf(col)) {
          // a little past the zone: its glow's edge
          const px0 = Math.max(0, Math.floor((col + x0 - 0.02) * cw));
          const px1 = Math.min(info.width, Math.ceil((col + x1 + 0.02) * cw));
          const py0 = Math.max(0, Math.floor((row + y0 - 0.02) * ch));
          const py1 = Math.min(info.height, Math.ceil((row + y1 + 0.02) * ch));
          for (let y = py0; y < py1; y++) {
            for (let x = px0; x < px1; x++) {
              const i = (y * info.width + x) * 4;
              if (data[i + 3] < 128 || !shines(data[i], data[i + 1], data[i + 2])) continue;
              data.copy(result, (y * info.width + x) * 3, i, i + 3);
              lit++;
            }
          }
        }
      }
    }
    await sharp(result, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toFile(out);
    console.log(`${type.sheet}: ${lit} glowing pixels -> ${path.relative(ROOT, out)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
