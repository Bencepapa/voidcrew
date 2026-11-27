import assert from "node:assert/strict";
import { MeshStandardMaterial, Texture } from "three";
import { setTextureTuning } from "../textureTuning";
import { hasRoomMetal, syncRoomMetal } from "./roomMetal";

const texture = new Texture();
const surface = new MeshStandardMaterial({ metalness: 1, roughness: 1, emissiveMap: texture });
surface.userData.roomReflectionTexture = "room_metal_test";
assert.equal(hasRoomMetal(surface), false);
surface.metalnessMap = surface.roughnessMap = texture;
assert.equal(hasRoomMetal(surface), true);
setTextureTuning("room_metal_test", { roomReflection: false });
assert.equal(hasRoomMetal(surface), false);
setTextureTuning("room_metal_test", { roomReflection: true });
surface.metalnessMap = null;
assert.equal(hasRoomMetal(surface), true);

const capture = new Texture();
const variants = new Map();
const copy = syncRoomMetal(surface, capture, { origin: [0, 1, 0] }, variants);
assert.equal(copy.envMap, capture);
assert.equal(copy.roughnessMap, texture);
assert.equal(copy.emissiveMap, texture);
assert.equal(surface.envMap, null);
surface.roughness = 0.25;
assert.equal(syncRoomMetal(surface, capture, { origin: [0, 1, 0] }, variants), copy);
assert.equal(copy.roughness, 0.25);
