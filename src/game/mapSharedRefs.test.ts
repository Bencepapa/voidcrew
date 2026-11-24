// Run: npx tsx src/game/mapSharedRefs.test.ts
import assert from "node:assert/strict";
import { isSharedDefinitionId, isSharedImageId, isSharedTextureId, mapSharedRefs, worldOfAssetId } from "./mapSharedRefs";
import type { GameMap } from "./types";

const u = (n: number) => `0b8c1f6e-1111-4222-8333-44445555${String(n).padStart(4, "0")}`;
const tex = (n: number) => `fantasy_shared_${u(n)}`;
const decal = `fantasy_decal_${u(10)}`, pickup = `fantasy_item_${u(11)}`, still = `fantasy_portrait_${u(12)}`, still2 = `fantasy_portrait_${u(13)}`;
const prop = `fantasy_prop_${u(20)}`, door = `fantasy_door_${u(21)}`, actor = `fantasy_actor_${u(22)}`;

const map = {
  width: 3, height: 2,
  textures: { wall: tex(1), floor: "stone", sky: "night" },
  floorAt: (x: number, y: number) => (x === 2 && y === 1 ? tex(2) : "stone"),
  wallTextureAt: (x: number) => (x === 0 ? tex(3) : undefined),
  ceilingTextureAt: () => undefined,
  faceTextureAt: (x: number, y: number, side: string) => (x === 1 && y === 1 && side === "W" ? tex(4) : undefined),
  props: [
    { prop, cell: { x: 0, y: 0 }, at: "center", loot: [{ item: pickup, count: 1 }, { item: "scrap", count: 2 }] },
    { prop: "crate1", cell: { x: 1, y: 0 }, at: "center", texture: tex(5), interaction: { kind: "image", text: "", image: still2 } },
  ],
  doors: [
    { type: door, cell: { x: 1, y: 0 }, kind: "standard", facing: "N", leafTexture: tex(6) },
    { type: "door1", cell: { x: 2, y: 0 }, kind: "standard", facing: "N", frameTexture: "wood" },
  ],
  actors: [{ actor, cell: { x: 0, y: 1 }, facing: "N", patrol: [], portrait: still }, { actor: "robot1", cell: { x: 1, y: 1 }, facing: "N", patrol: [] }],
  decals: [{ decal, cell: { x: 0, y: 0 }, surface: "N", x: 0, y: 0 }, { decal: "puddle", cell: { x: 0, y: 0 }, surface: "floor", x: 0, y: 0 }],
  items: [{ item: pickup, cell: { x: 2, y: 0 } }, { item: "scrap", cell: { x: 2, y: 1 } }],
  loadingImage: still,
} as unknown as GameMap;

// nothing loaded yet: a prop's / door's own textures are not known
let refs = mapSharedRefs(map, { propTexture: () => undefined, doorTextures: () => [] });
assert.deepEqual([...refs.textures].sort(), [tex(1), tex(2), tex(3), tex(4), tex(5), tex(6)]);
assert.deepEqual([...refs.props], [prop]);
assert.deepEqual([...refs.doors], [door]);
assert.deepEqual([...refs.actors], [actor]);
assert.deepEqual([...refs.images].sort(), [decal, pickup, still, still2].sort());

// once the definitions are loaded, their textures are referenced too
refs = mapSharedRefs(map, {
  propTexture: (id) => (id === prop ? tex(7) : undefined),
  doorTextures: (id) => (id === door ? [tex(8), undefined, "wood"] : []),
});
assert.ok(refs.textures.has(tex(7)) && refs.textures.has(tex(8)));
assert.ok(!refs.textures.has("wood") && !refs.textures.has("stone"), "built-in sets are not shared ids");

// a map with nothing shared references nothing
const plain = { width: 1, height: 1, props: [{ prop: "crate1", cell: { x: 0, y: 0 }, at: "center" }] } as unknown as GameMap;
refs = mapSharedRefs(plain, { propTexture: () => undefined, doorTextures: () => [] });
assert.equal(refs.textures.size + refs.images.size + refs.props.size + refs.doors.size + refs.actors.size, 0);

// the map's sky: a shared sky id is an image to load (a built-in name, like "night" above, is not)
const sky = `fantasy_sky_${u(30)}`;
const skyMap = { width: 1, height: 1, textures: { sky } } as unknown as GameMap;
refs = mapSharedRefs(skyMap, { propTexture: () => undefined, doorTextures: () => [] });
assert.deepEqual([...refs.images], [sky]);
assert.equal(refs.textures.size, 0, "a sky is not a texture set");
assert.ok(isSharedImageId(sky) && worldOfAssetId(`scifi_sky_${u(1)}`) === "scifi");

// id shapes
assert.ok(isSharedTextureId(tex(1)) && isSharedTextureId("scifi_shared_0b8c1f6e-1111-4222-8333-444455556666-name"));
assert.ok(!isSharedTextureId("stone") && !isSharedTextureId("fantasy_shared_"));
assert.ok(isSharedImageId(decal) && isSharedImageId(pickup) && !isSharedImageId("puddle") && !isSharedImageId(`fantasy_item_${u(1)}x`));
assert.ok(isSharedDefinitionId(prop) && isSharedDefinitionId(door) && isSharedDefinitionId(actor) && !isSharedDefinitionId("crate1"));
assert.equal(worldOfAssetId(`scifi_decal_${u(1)}`), "scifi");
assert.equal(worldOfAssetId(tex(1)), "fantasy");

console.log("mapSharedRefs: ok");
