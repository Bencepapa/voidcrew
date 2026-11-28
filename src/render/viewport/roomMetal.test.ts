import assert from "node:assert/strict";
import { MeshStandardMaterial, ShaderLib, Texture } from "three";
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

function compiledFragment(material: MeshStandardMaterial) {
  type CompileArgs = Parameters<MeshStandardMaterial["onBeforeCompile"]>;
  const shader = { ...ShaderLib.standard, uniforms: {} };
  material.onBeforeCompile(shader as CompileArgs[0], {} as CompileArgs[1]);
  return shader.fragmentShader;
}

const opaqueFragment = compiledFragment(copy);
assert.doesNotMatch(opaqueFragment, /iblIrradiance\s*\+=/);
assert.match(opaqueFragment, /smoothstep\(0\.25, 0\.65, material\.roughness\)/);
assert.match(opaqueFragment, /radiance \+= iblRadiance \* roomReflectionWeight;/);
assert.match(opaqueFragment, /lightMapIrradiance/);

const bakedReflectionMask = { value: 1 };
surface.onBeforeCompile = shader => { shader.uniforms.uLgReflectionMask = bakedReflectionMask; };
const shader = { ...ShaderLib.standard, uniforms: {} as Record<string, {value: unknown}> };
copy.onBeforeCompile(shader as Parameters<typeof copy.onBeforeCompile>[0], {} as Parameters<typeof copy.onBeforeCompile>[1]);
assert.equal(shader.uniforms.uLgReflectionMask, bakedReflectionMask);

for (const textureId of ["wall4", "wall5", "floor1", "floor2", "ceiling1"]) {
  const panel = new MeshStandardMaterial({ metalness: 0.45 });
  panel.userData.roomReflectionTexture = textureId;
  assert.equal(hasRoomMetal(panel), true, textureId);
}

setTextureTuning("rough_metal_test", { rough: 0.4 });
const glossy = new MeshStandardMaterial({ metalness: 0.45, roughness: 0.22 });
glossy.userData.roomReflectionTexture = "rough_metal_test";
assert.equal(hasRoomMetal(glossy), true);
glossy.roughness = 1;
assert.equal(hasRoomMetal(glossy), false);

const glass = new MeshStandardMaterial({ transparent: true, depthWrite: false });
glass.userData.roomWindowReflection = true;
assert.equal(hasRoomMetal(glass), true);
const reflectiveGlass = syncRoomMetal(glass, capture, { origin: [0, 1, 0] }, variants);
assert.equal(reflectiveGlass.roughness, 0.085);
const glassFragment = compiledFragment(reflectiveGlass);
assert.doesNotMatch(glassFragment, /iblIrradiance\s*\+=|roomReflectionWeight/);
assert.match(glassFragment, /radiance \+= iblRadiance;/);
