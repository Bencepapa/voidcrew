// The texture registry as the Assets window sees it: the built-in sets (read
// only), the published shared textures (a baseline from the store), and the
// local drafts laid over them. Everything ends up in TEXTURE_SETS, so the
// palettes, the preview room and the game read one table.

import { useSyncExternalStore } from "react";
import { TEXTURE_SETS, type TextureSetPaths } from "../render/textureSets";
import { bundledTextures } from "../game/sharedBuiltins";
import { t } from "../i18n";
import type { GameMap } from "../game/types";
import { PROP_TYPES } from "../game/props";
import type { WorldId } from "../game/worlds";
import { sharedTexturesChanged } from "../render/sharedTextureEvents";
import { setSharedTuning, textureTuning, type TextureTuning } from "../render/textureTuning";
import { autoRecipe, generateAutoMaps } from "./autoMaps";
import { idb } from "./idb";
import { applyTransparency, composeSurface, decode, encode, hasAlpha, splitSurface, type Transparency } from "./imageTools";
import { draftById, draftId, getDrafts, saveDraft, subscribeDrafts, type MapKey, type MapMode, type MapSlot, type SurfaceKind, type TextureDraft } from "./textureDrafts";

const registry = TEXTURE_SETS as Record<string, TextureSetPaths>;
const flat = { normal: `${import.meta.env.BASE_URL}textures/flat/normal.png`, depth: `${import.meta.env.BASE_URL}textures/flat/depth.png` };

// what a published revision says about itself (meta.json)
export interface SharedMeta {
  v: 1;
  type: "texture";
  name: string;
  kinds: SurfaceKind[];
  pixelArt: boolean;
  rev: number;
  transparency: Transparency;
  maps: Record<MapKey, MapMode>;
  gen?: { normal?: typeof autoRecipe; depth?: typeof autoRecipe };
  // relief built smooth (see TextureSetFiles.smooth)
  smooth?: boolean;
  // the texture's own look tuning (normal strength, relief depth, roughness, metalness)
  tuning?: TextureTuning;
}
export interface SharedInfo {
  id: string;
  world: WorldId;
  uuid: string;
  rev: number;
  // an old flat <uuid>-name.png: floor + wall, flat normal and depth, not editable
  legacy: boolean;
  meta?: SharedMeta;
  // public URL of the folder holding this revision's files (with a trailing slash)
  base: string;
  // public URL of the legacy file
  file?: string;
}

const infos = new Map<string, SharedInfo>();
const baselines = new Map<string, TextureSetPaths>();

// ---- change notification (the palettes and the Assets window follow it) ----

let version = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };
const fileKeys = new Map<string, string>();
const bump = () => {
  version++;
  for (const l of listeners) l();
  // the game builds its scene from the table once: tell it when a shared texture's files (not just its name) changed
  const changed: string[] = [];
  const now = new Set<string>();
  for (const [id, set] of Object.entries(registry)) {
    if (!id.includes("_shared_")) continue;
    now.add(id);
    const key = [set.diffuse, set.normal, set.depth, set.surface, set.emissive, set.pixelArt, set.smooth, JSON.stringify(textureTuning(id))].join("|");
    if (fileKeys.get(id) !== key) { fileKeys.set(id, key); changed.push(id); }
  }
  for (const id of [...fileKeys.keys()]) if (!now.has(id)) { fileKeys.delete(id); changed.push(id); }
  if (changed.length) sharedTexturesChanged(changed);
};
export const useTextureVersion = () => useSyncExternalStore(subscribe, () => version);

// ---- what a texture is ----

export const sharedInfo = (id: string) => infos.get(id);
export type TextureStatus = "builtin" | "legacy" | "shared" | "new" | "changed";
export function textureStatus(id: string): TextureStatus {
  if (Object.hasOwn(bundledTextures, id)) return "builtin";
  const draft = draftById(id);
  if (draft) return draft.baseRev === 0 ? "new" : "changed";
  const info = infos.get(id);
  if (info) return info.legacy ? "legacy" : "shared";
  return "builtin";
}
export const isEditable = (id: string) => ["shared", "new", "changed"].includes(textureStatus(id));

// the Auto channels a texture has (a draft's, or the published meta's)
export function autoChannels(id: string): ("normal" | "depth")[] {
  const draft = draftById(id);
  const modes = draft ? { normal: draft.maps.normal.mode, depth: draft.maps.depth.mode } : infos.get(id)?.meta?.maps;
  return (["normal", "depth"] as const).filter(k => modes?.[k] === "auto");
}

// ---- deriving: transparency and Auto maps from a diffuse ----

export interface Derived { diffuse?: Blob; normal?: Blob; depth?: Blob }
const memo = new WeakMap<Blob, Map<string, Promise<Derived>>>();

export function derive(raw: Blob, transparency: Transparency, auto: { normal: boolean; depth: boolean }, cacheKey?: string): Promise<Derived> {
  const sig = [transparency.source, transparency.colorKey, auto.normal || auto.depth ? "a" : "-"].join(":");
  let byBlob = memo.get(raw);
  if (!byBlob) memo.set(raw, byBlob = new Map());
  let found = byBlob.get(sig);
  if (!found) {
    found = (async () => {
      const processed = await applyTransparency(raw, transparency);
      const out: Derived = { diffuse: processed ?? undefined };
      if (auto.normal || auto.depth) {
        const key = cacheKey ? `${cacheKey}:${transparency.source}:${transparency.colorKey}:g${autoRecipe.version}` : undefined;
        let cached = key ? await idb.get<{ normal: Blob; depth: Blob }>("auto", key).catch(() => undefined) : undefined;
        if (!cached) {
          const maps = await generateAutoMaps(await decode(processed ?? raw));
          cached = { normal: await encode(maps.normal), depth: await encode(maps.depth) };
          if (key) void idb.put("auto", cached, key).catch(() => {});
        }
        out.normal = cached.normal;
        out.depth = cached.depth;
      }
      return out;
    })();
    byBlob.set(sig, found);
    found.catch(() => byBlob!.delete(sig));
  }
  return found;
}

// ---- object URLs of draft blobs ----

const urlOf = new WeakMap<Blob, string>();
const owned = new Map<string, Set<string>>();
function urlFor(uuid: string, blob: Blob): string {
  let url = urlOf.get(blob);
  if (!url) { url = URL.createObjectURL(blob); urlOf.set(blob, url); }
  let set = owned.get(uuid);
  if (!set) owned.set(uuid, set = new Set());
  set.add(url);
  return url;
}
function release(uuid: string) {
  const urls = owned.get(uuid);
  owned.delete(uuid);
  // (a little later: a preview may still be reading them)
  if (urls) setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 15000);
}

const ids = new WeakMap<Blob, number>();
let nextId = 1;
const blobId = (b?: Blob) => b ? (ids.get(b) ?? (ids.set(b, nextId), nextId++)) : 0;
const surfaces = new Map<string, Promise<Blob>>();
export function surfaceOf(gloss?: Blob, metal?: Blob): Promise<Blob> {
  const key = blobId(gloss) + ":" + blobId(metal);
  let found = surfaces.get(key);
  if (!found) { found = composeSurface(gloss, metal); surfaces.set(key, found); found.catch(() => surfaces.delete(key)); }
  return found;
}

// the blob a slot really provides (uploaded and present)
export const uploaded = (slot: MapSlot) => slot.mode === "uploaded" ? slot.blob : undefined;

// ---- drafts over the registry ----

const label = (name: string) => name.trim() || t("assetManager.untitled");

async function draftPaths(d: TextureDraft): Promise<TextureSetPaths | null> {
  const raw = uploaded(d.maps.diffuse);
  if (!raw) return null;
  const autoOf = (k: "normal" | "depth") => d.maps[k].mode === "auto";
  const derived = await derive(raw, d.transparency, { normal: autoOf("normal"), depth: autoOf("depth") });
  const pick = (k: "normal" | "depth") => uploaded(d.maps[k]) ?? (autoOf(k) ? derived[k] : undefined);
  const gloss = uploaded(d.maps.gloss), metal = uploaded(d.maps.metal), emissive = uploaded(d.maps.emissive);
  const surface = gloss || metal ? await surfaceOf(gloss, metal) : undefined;
  const normal = pick("normal"), depth = pick("depth");
  return {
    kind: d.kinds, label: label(d.name), pixelArt: d.pixelArt, ...(d.smooth ? { smooth: true } : {}),
    diffuse: urlFor(d.uuid, derived.diffuse ?? raw),
    normal: normal ? urlFor(d.uuid, normal) : flat.normal,
    depth: depth ? urlFor(d.uuid, depth) : flat.depth,
    ...(surface ? { surface: urlFor(d.uuid, surface) } : {}),
    ...(emissive ? { emissive: urlFor(d.uuid, emissive) } : {}),
  };
}

function restore(id: string) {
  if (Object.hasOwn(bundledTextures, id)) return;
  setSharedTuning(id, infos.get(id)?.meta?.tuning);
  const base = baselines.get(id);
  if (base) registry[id] = base; else delete registry[id];
}

const seen = new Map<string, { draft: TextureDraft; id: string }>();
const applying = new Map<string, number>();
async function applyDraft(d: TextureDraft) {
  const id = draftId(d);
  if (Object.hasOwn(bundledTextures, id)) return;
  const ticket = (applying.get(d.uuid) ?? 0) + 1;
  applying.set(d.uuid, ticket);
  try {
    const paths = await draftPaths(d);
    if (applying.get(d.uuid) !== ticket) return;
    setSharedTuning(id, d.tuning);
    if (paths) registry[id] = paths; else restoreOrHide(id);
  } catch {
    if (applying.get(d.uuid) === ticket) restoreOrHide(id);
  }
  bump();
}
// a draft with no usable diffuse has no registry entry (an empty new texture shows only in the Assets list)
function restoreOrHide(id: string) { delete registry[id]; }

function syncDrafts() {
  const now = getDrafts();
  const alive = new Set<string>();
  for (const d of now) {
    alive.add(d.uuid);
    const before = seen.get(d.uuid);
    if (before?.draft === d) continue;
    if (before && before.id !== draftId(d)) { restore(before.id); }
    seen.set(d.uuid, { draft: d, id: draftId(d) });
    void applyDraft(d);
  }
  for (const [uuid, { id }] of [...seen]) {
    if (alive.has(uuid)) continue;
    seen.delete(uuid);
    applying.set(uuid, (applying.get(uuid) ?? 0) + 1);
    release(uuid);
    restore(id);
    bump();
  }
}
subscribeDrafts(syncDrafts);

// the texture's own name (never its id)
export const catalogLabel = (id: string) => registry[id]?.label ?? draftById(id)?.name ?? "";

// ---- which textures the map being edited uses (a delete asks first) ----

let currentMap: GameMap | undefined;
export const registerMap = (map: GameMap | undefined) => { currentMap = map; };
export const mapUses = (id: string): boolean => !!currentMap && mapUsesTexture(currentMap, id);
// does this map use the texture (its defaults, painted floors / walls / ceilings, riser faces)?
export function mapUsesTexture(m: GameMap, id: string): boolean {
  if (m.textures && Object.values(m.textures).includes(id)) return true;
  if (m.props?.some(spec => {
    const type = PROP_TYPES[spec.prop];
    return spec.texture === id || (!spec.texture && type && "texture" in type && type.texture === id);
  })) return true;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    if (m.floorAt?.(x, y) === id || m.wallTextureAt?.(x, y) === id || m.ceilingTextureAt?.(x, y) === id) return true;
    if (m.faceTextureAt && (["N", "E", "S", "W"] as const).some((d) => m.faceTextureAt!(x, y, d) === id)) return true;
  }
  return false;
}

// An editable copy of an old flat shared PNG: a new draft texture (new id) with that image as its diffuse, whose
// Publish makes a rev-folder texture. Returns the draft's id.
export async function convertLegacy(id: string): Promise<string> {
  const info = infos.get(id);
  if (!info?.legacy || !info.file) throw new Error(t("assetManager.err.notEditable"));
  const res = await fetch(info.file);
  if (!res.ok) throw new Error(t("assetManager.err.fetch", { url: info.file }));
  const blob = await res.blob();
  const draft: TextureDraft = {
    uuid: crypto.randomUUID(), world: info.world, name: registry[id]?.label ?? t("assetManager.untitled"), kinds: ["wall", "floor"], pixelArt: true, smooth: true,
    transparency: { source: (await hasAlpha(blob)) ? "alpha" : "none", colorKey: "#ff00ff" }, diffuseAlpha: await hasAlpha(blob),
    maps: { diffuse: { mode: "uploaded", blob }, normal: { mode: "auto" }, depth: { mode: "auto" }, gloss: { mode: "none" }, metal: { mode: "none" }, emissive: { mode: "none" } },
    baseRev: 0, updated: Date.now(),
  };
  await saveDraft(draft);
  return draftId(draft);
}
// ---- shared textures (published) ----

function fileUrls(info: SharedInfo) {
  const m = info.meta!.maps;
  const at = (f: string) => info.base + f;
  return {
    diffuse: at("diffuse.png"),
    normal: m.normal === "uploaded" ? at("normal.png") : undefined,
    depth: m.depth === "uploaded" ? at("depth.png") : undefined,
    surface: m.gloss === "uploaded" || m.metal === "uploaded" ? at("surface.png") : undefined,
    emissive: m.emissive === "uploaded" ? at("emissive.png") : undefined,
  };
}

function sharedBaseline(info: SharedInfo): TextureSetPaths {
  if (info.legacy) {
    return { kind: ["floor", "wall"], label: info.file!.split("/").pop()!.slice(37, -4) || t("assetManager.sharedTexture"), diffuse: info.file!, normal: flat.normal, depth: flat.depth, pixelArt: true };
  }
  const meta = info.meta!, f = fileUrls(info);
  return {
    kind: meta.kinds, label: meta.name, pixelArt: meta.pixelArt, diffuse: f.diffuse, ...(meta.smooth ? { smooth: true } : {}),
    normal: f.normal ?? flat.normal, depth: f.depth ?? flat.depth,
    ...(f.surface ? { surface: f.surface } : {}), ...(f.emissive ? { emissive: f.emissive } : {}),
  };
}

// Replaces the shared textures of one world with what the store lists now.
export function setSharedTextures(world: WorldId, list: SharedInfo[]) {
  list = list.filter(({ id }) => !Object.hasOwn(bundledTextures, id));
  const prefix = world + "_shared_";
  const keep = new Set(list.map(i => i.id));
  for (const id of [...infos.keys()]) {
    if (!id.startsWith(prefix) || keep.has(id)) continue;
    infos.delete(id);
    baselines.delete(id);
    if (!draftById(id)) { delete registry[id]; setSharedTuning(id, undefined); }
  }
  for (const info of list) {
    const old = infos.get(info.id);
    infos.set(info.id, info);
    const base = sharedBaseline(info);
    baselines.set(info.id, base);
    if (!draftById(info.id)) { registry[info.id] = base; setSharedTuning(info.id, info.meta?.tuning); }
    if (!old || old.rev !== info.rev) void upgradeShared(info);
  }
  bump();
}

// the Auto maps and the transparency of a published texture are made on this side
async function upgradeShared(info: SharedInfo) {
  const meta = info.meta;
  if (info.legacy || !meta) return;
  const auto = { normal: meta.maps.normal === "auto", depth: meta.maps.depth === "auto" };
  if (!auto.normal && !auto.depth && meta.transparency.source === "alpha") return;
  try {
    const raw = await (await fetch(fileUrls(info).diffuse)).blob();
    const derived = await derive(raw, meta.transparency, auto, `${info.id}:r${info.rev}`);
    if (infos.get(info.id) !== info) return;
    const base = { ...baselines.get(info.id)! };
    const url = (b: Blob) => { const u = URL.createObjectURL(b); return u; };
    if (derived.diffuse) base.diffuse = url(derived.diffuse);
    if (auto.normal && derived.normal) base.normal = url(derived.normal);
    if (auto.depth && derived.depth) base.depth = url(derived.depth);
    baselines.set(info.id, base);
    if (!draftById(info.id)) registry[info.id] = base;
    bump();
  } catch { /* the plain files stay in place */ }
}

// A draft of a published texture: its uploaded maps fetched into Blobs. One draft per texture.
const pendingDrafts = new Map<string, Promise<TextureDraft>>();
export function ensureDraft(id: string): Promise<TextureDraft> {
  const existing = draftById(id);
  if (existing) return Promise.resolve(existing);
  const info = infos.get(id);
  if (!info || info.legacy || !info.meta) return Promise.reject(new Error(t("assetManager.err.notEditable")));
  let found = pendingDrafts.get(id);
  if (!found) {
    const meta = info.meta, f = fileUrls(info);
    found = (async () => {
      const get = async (url?: string) => { if (!url) return undefined; const r = await fetch(url); if (!r.ok) throw new Error(t("assetManager.err.fetch", { url })); return r.blob(); };
      const [diffuse, normal, depth, surface, emissive] = await Promise.all([get(f.diffuse), get(f.normal), get(f.depth), get(f.surface), get(f.emissive)]);
      const split = surface ? await splitSurface(surface) : undefined;
      const slot = (mode: MapMode, blob?: Blob): MapSlot => mode === "uploaded" && blob ? { mode, blob } : { mode: mode === "uploaded" ? "none" : mode };
      const draft: TextureDraft = {
        uuid: info.uuid, world: info.world, name: meta.name, kinds: [...meta.kinds], pixelArt: meta.pixelArt, smooth: !!meta.smooth, tuning: meta.tuning ? { ...meta.tuning } : undefined,
        transparency: { ...meta.transparency }, diffuseAlpha: diffuse ? await hasAlpha(diffuse) : false,
        maps: {
          diffuse: slot("uploaded", diffuse), normal: slot(meta.maps.normal, normal), depth: slot(meta.maps.depth, depth),
          gloss: slot(meta.maps.gloss, split?.gloss), metal: slot(meta.maps.metal, split?.metal), emissive: slot(meta.maps.emissive, emissive),
        },
        baseRev: info.rev, updated: Date.now(),
      };
      await saveDraft(draft);
      return draft;
    })().finally(() => pendingDrafts.delete(id));
    pendingDrafts.set(id, found);
  }
  return found;
}
