import { type Interaction } from "../../game/interactions";
import * as THREE from "three";
import type { LightBakeResult } from "../lightBake.worker";
import { createReliefWallGeometry, loadHeightGrid } from "../reliefMesh";
import { fetchDecalManifest } from "../decals";
import { createBakeCache } from "../lightBakeCache";

// the baked light grids of the last few scenes (see render/lightBakeCache.ts): a rebuild whose light inputs did not change
// (a wall texture, say) reuses its grid instead of baking again
export const bakeCache = createBakeCache<Omit<LightBakeResult, "timing">>(4);

// What one build of the scene leaves for the next - an edit rebuilds the
// deck, but its walls' textures and relief don't change: the renderer (and
// the shaders it has compiled), the wall kits' textures, the depth maps and
// the relief geometry (with its AO map and raycast hierarchy), each keyed
// by everything it's made from. Emptied when the textures hot-reload
// (`version`) and when the view goes.
export interface SceneCache {
  renderer: THREE.WebGLRenderer | null;
  // whether the renderer was asked for antialiasing (fixed when it's made:
  // a change of the setting makes a new one)
  antialias: boolean;
  version: string;
  textures: Map<string, THREE.Texture>;
  decalTextures: Map<string, Promise<THREE.Texture>>;
  decalManifest: ReturnType<typeof fetchDecalManifest> | null;
  decalGeometries: Map<string, THREE.BufferGeometry | null>;
  grids: Map<string, ReturnType<typeof loadHeightGrid>>;
  reliefs: Map<string, Promise<ReturnType<typeof createReliefWallGeometry> | null>>;
}
export function clearSceneCache(cache: SceneCache) {
  for (const tex of cache.textures.values()) tex.dispose();
  cache.textures.clear();
  for (const tex of cache.decalTextures.values()) tex.then((t) => t.dispose()).catch(() => {});
  cache.decalTextures.clear();
  cache.decalManifest = null;
  for (const geo of cache.decalGeometries.values()) geo?.dispose();
  cache.decalGeometries.clear();
  cache.grids.clear();
  for (const relief of cache.reliefs.values()) {
    relief.then((r) => {
      r?.geometry.dispose();
      r?.aoMap.dispose();
    }).catch(() => {});
  }
  cache.reliefs.clear();
}

export function renderedSpecs<T extends { interaction?: Interaction }>(specs: readonly T[] | undefined): string | undefined {
  return JSON.stringify(specs?.map(({ interaction: _interaction, ...spec }) => spec));
}
