import { createServer } from "vite";

// Load the source catalogs with the same import.meta transforms as the game.
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
try {
  const { ACTOR_TYPES } = await server.ssrLoadModule("/src/game/actors.ts");
  const { ITEM_TYPES } = await server.ssrLoadModule("/src/game/items.ts");
  const { AMBIENT_EFFECTS } = await server.ssrLoadModule("/src/game/types.ts");
  const { TEXTURE_SETS } = await server.ssrLoadModule("/src/render/textureSets.ts");
  const { assetWorld } = await server.ssrLoadModule("/src/game/worlds.ts");
  const assets = (catalog) => Object.keys(catalog).sort().map((id) => ({ id, world: assetWorld(id) }));
  const manifest = {
    version: 1,
    actors: assets(ACTOR_TYPES),
    items: assets(ITEM_TYPES),
    effects: [...AMBIENT_EFFECTS].sort(),
    textures: assets(TEXTURE_SETS),
  };
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
} finally {
  await server.close();
}
