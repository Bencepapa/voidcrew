import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, basename, dirname } from "node:path";
import { createServer } from "vite";

// Vite's SSR loader handles the runtime's import.meta.glob asset registries;
// map JSON discovery itself uses fs, independent of browser glob loading.
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, cacheDir: ".cache/minimap-validator", server: { middlewareMode: true }, appType: "custom" });
try {
  const { parseMap } = await server.ssrLoadModule("/src/game/mapFormat.ts");
  const { validateMap, validateMapFilePlacements } = await server.ssrLoadModule("/src/editor/validate.ts");
  const { registerMapWorld } = await server.ssrLoadModule("/src/game/worlds.ts");
  const { minimapEn } = await server.ssrLoadModule("/src/i18n/en/minimap.ts");
  async function walk(folder: string): Promise<string[]> {
    const entries = await readdir(folder, { withFileTypes: true });
    return (await Promise.all(entries.map(e => e.isDirectory() ? walk(resolve(folder, e.name)) : Promise.resolve(e.name.endsWith(".json") ? [resolve(folder, e.name)] : [])))).flat();
  }
  let total = 0;
  for (const path of (await walk(resolve("src/maps"))).sort()) {
    const id = basename(path, ".json");
    registerMapWorld(id, basename(dirname(path)));
    const file = JSON.parse(await readFile(path, "utf8"));
    let problems;
    try { problems = validateMap(parseMap(id, file)); }
    catch (error) {
      console.log(relative(process.cwd(), path) + ": parse error: " + String(error));
      problems = validateMapFilePlacements(file);
    }
    console.log(`${relative(process.cwd(), path)}: ${problems.length} problems`);
    for (const p of problems) {
      const text = (minimapEn[p.key] ?? p.key).replace(/\{(\w+)\}/g, (_: string, k: string) => String(p.params?.[k] ?? k));
      console.log(`  ${p.severity} ${p.code}${p.cell ? ` (${p.cell.x},${p.cell.y})` : ""}: ${text}`);
    }
    total += problems.length;
  }
  console.log(`Total: ${total} problems`);
} finally {
  await server.close();
}

