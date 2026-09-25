import * as fs from "node:fs";
import * as path from "node:path";

// public/decals/index.json: the decals the game can place, by name. Each
// decal lives in public/decals/<name>/ as diffuse.png (with alpha) and,
// optionally, normal.png.
export const DECALS_DIR = path.resolve(import.meta.dirname, "../public/decals");
const MANIFEST = path.join(DECALS_DIR, "index.json");

export interface DecalEntry {
  normal: boolean;
}

export function registerDecal(name: string, entry: DecalEntry) {
  const manifest: Record<string, DecalEntry> = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
    : {};
  manifest[name] = entry;
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(DECALS_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
}
