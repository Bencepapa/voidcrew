// Per-texture fine tuning, made in the Asset Manager and saved to
// textureTuning.json, so a texture's look can be adjusted without redrawing
// its normal or depth map. Keyed by the texture folder (a TEXTURE_SETS id, or
// a prop's folder under public/textures/). Every value is a multiplier of the
// viewer's own setting (unset: 1), so the debug sliders still work on top.

import saved from "./textureTuning.json";

export interface TextureTuning {
  // its normal map's strength
  normal?: number;
  // its relief depth (walls, floors, props: the height map's real depth)
  relief?: number;
  // its roughness and metalness (not for a set with its own surface map)
  rough?: number;
  metal?: number;
}

export type TextureTuningTable = Record<string, TextureTuning>;

// what the game uses; the Asset Manager changes it live before it's saved
let table: TextureTuningTable = { ...(saved as TextureTuningTable) };

export function textureTuning(id: string): TextureTuning | undefined {
  return table[id];
}

// a value equal to the default is dropped, an empty entry with it
export function setTextureTuning(id: string, value: TextureTuning | undefined) {
  const next = { ...table };
  const clean: TextureTuning = {};
  for (const key of ["normal", "relief", "rough", "metal"] as const) {
    const v = value?.[key];
    if (typeof v === "number" && Number.isFinite(v) && v !== 1) clean[key] = v;
  }
  if (Object.keys(clean).length) next[id] = clean;
  else delete next[id];
  table = next;
}

const listeners = new Set<() => void>();
// told when the table is saved: the viewer rebuilds its relief meshes (the
// normal, roughness and metal values it reads every frame anyway)
export function onTextureTuningSaved(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

// writes the whole table (dev server only)
export async function saveTextureTuning(): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}__voidcrew/texture-tuning`, {
    method: "POST",
    body: JSON.stringify(table, null, 2) + "\n",
  });
  if (!res.ok) throw new Error(await res.text());
  for (const listener of listeners) listener();
  return res.text();
}
