import assert from "node:assert/strict";
import { FOLIAGE, TILE_SIZE, foliageStats, renderFoliage, seamMismatches, type FoliageId } from "./foliageTexture";

for (const id of Object.keys(FOLIAGE) as FoliageId[]) {
  const seed = FOLIAGE[id].seed;
  const tile = renderFoliage(id, seed);
  assert.deepEqual(renderFoliage(id, seed), tile, id);
  assert.notDeepEqual(renderFoliage(id, seed + 1).diffuse, tile.diffuse, id);

  const offset = TILE_SIZE / 2;
  const shifted = renderFoliage(id, seed, offset);
  assert.equal(seamMismatches(tile.diffuse, shifted.diffuse, offset), 0, id);

  const stats = foliageStats(tile.diffuse);
  assert.ok(stats.edgeRows > 50, id);
  assert.ok(stats.transparent > 0.35 && stats.transparent < 0.82, id);
  assert.ok(stats.opaque > 0.15 && stats.partial > 0 && stats.partial < 0.12, id);
  assert.ok(stats.occupiedHeight >= FOLIAGE[id].maxHeight - 18, id);
  assert.ok(stats.occupiedHeight <= FOLIAGE[id].maxHeight + 4, id);
  for (let i = 3; i < tile.diffuse.length; i += 4) {
    assert.equal(tile.depth[i], tile.diffuse[i] >= 128 ? 255 : 0, id);
    if (i >= (TILE_SIZE - 1) * TILE_SIZE * 4) assert.equal(tile.diffuse[i], 255, id);
    if (id === "fantasygrass_mid" && i < TILE_SIZE * TILE_SIZE * 2) assert.equal(tile.diffuse[i], 0, id);
  }
}
