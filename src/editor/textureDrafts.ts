// Local drafts of shared textures: a new texture, or the changes to a published
// one. They live in IndexedDB (they hold Blobs) until they are published or
// discarded; this module is the in-memory store over that.

import { useSyncExternalStore } from "react";
import type { WorldId } from "../game/worlds";
import { idb } from "./idb";
import type { TextureTuning } from "../render/textureTuning";
import { defaultTransparency, type Transparency } from "./imageTools";

export type MapKey = "diffuse" | "normal" | "depth" | "gloss" | "metal" | "emissive";
export const MAP_KEYS: MapKey[] = ["diffuse", "normal", "depth", "gloss", "metal", "emissive"];
export type MapMode = "uploaded" | "auto" | "none";
export interface MapSlot { mode: MapMode; blob?: Blob }
export type SurfaceKind = "wall" | "floor" | "ceiling";

export interface TextureDraft {
  uuid: string;
  world: WorldId;
  name: string;
  kinds: SurfaceKind[];
  pixelArt: boolean;
  // relief built smooth (slopes): for a continuous depth map; undefined in older drafts = false
  smooth?: boolean;
  // the texture's own look tuning (normal strength, relief depth, roughness, metalness), published with it
  tuning?: TextureTuning;
  transparency: Transparency;
  // whether the uploaded diffuse has any alpha < 255 (found when it was chosen)
  diffuseAlpha: boolean;
  maps: Record<MapKey, MapSlot>;
  // the published revision this edits (0: a new texture)
  baseRev: number;
  updated: number;
}

// the id the texture has in TEXTURE_SETS (and in maps)
export const draftId = (d: Pick<TextureDraft, "world" | "uuid">) => d.world + "_shared_" + d.uuid;

export function emptyMaps(): Record<MapKey, MapSlot> {
  return { diffuse: { mode: "uploaded" }, normal: { mode: "auto" }, depth: { mode: "auto" }, gloss: { mode: "none" }, metal: { mode: "none" }, emissive: { mode: "none" } };
}

let drafts: TextureDraft[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
export const subscribeDrafts = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };
export const getDrafts = () => drafts;
export const useDrafts = () => useSyncExternalStore(subscribeDrafts, getDrafts);
export const draftById = (id: string) => drafts.find(d => draftId(d) === id);
export const draftCounts = (list: TextureDraft[] = drafts) => ({ added: list.filter(d => d.baseRev === 0).length, changed: list.filter(d => d.baseRev > 0).length });

// loads the saved drafts once; an unreadable store just leaves the list empty
export const draftsReady: Promise<void> = (async () => {
  try {
    const saved = await idb.all<TextureDraft>("drafts");
    const fresh = drafts.filter(d => !saved.some(s => s.uuid === d.uuid));
    drafts = [...saved.sort((a, b) => a.updated - b.updated), ...fresh];
  } catch { /* no IndexedDB: drafts are kept for this page only */ }
  loaded = true;
  emit();
})();
export const draftsLoaded = () => loaded;

// writes are serialised so a quick series of edits lands in order
let chain: Promise<unknown> = Promise.resolve();
function persist(work: () => Promise<unknown>) {
  const next = chain.then(work, work);
  chain = next.catch(() => {});
  return next;
}

// Replaces (or adds) a draft. When the browser can't store it the old state is
// put back and the error is thrown (a StorageFullError for a quota failure).
export async function saveDraft(next: TextureDraft): Promise<void> {
  const previous = drafts.find(d => d.uuid === next.uuid);
  const stamped = { ...next, updated: Date.now() };
  drafts = previous ? drafts.map(d => d.uuid === next.uuid ? stamped : d) : [...drafts, stamped];
  emit();
  try { await persist(() => idb.put("drafts", stamped)); }
  catch (error) {
    drafts = previous ? drafts.map(d => d.uuid === next.uuid ? previous : d) : drafts.filter(d => d.uuid !== next.uuid);
    emit();
    throw error;
  }
}

export async function newDraft(world: WorldId, name: string): Promise<TextureDraft> {
  const draft: TextureDraft = {
    uuid: crypto.randomUUID(), world, name, kinds: ["wall", "floor", "ceiling"], pixelArt: true, smooth: true,
    transparency: defaultTransparency(), diffuseAlpha: false, maps: emptyMaps(), baseRev: 0, updated: Date.now(),
  };
  await saveDraft(draft);
  return draft;
}

export async function discardDraft(uuid: string): Promise<void> {
  drafts = drafts.filter(d => d.uuid !== uuid);
  emit();
  try { await persist(() => idb.del("drafts", uuid)); } catch { /* the in-memory state is already gone */ }
}

export async function discardAllDrafts(): Promise<void> {
  for (const d of [...drafts]) await discardDraft(d.uuid);
}
