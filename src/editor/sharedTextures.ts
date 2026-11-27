// The shared texture store (Supabase Storage, bucket void-textures), append-only:
//
//   <world>/<uuid>-name.png                   old flat files (read as they always were)
//   <world>/<uuid>/r<rev>/diffuse.png ...     a published revision; meta.json goes up LAST
//
// The loader reads the highest rev folder that has a meta.json. Publishing again
// adds a new rev folder, which replaces the old one in the game; the old one
// stays in storage, never listed.

import { t } from "../i18n";
import type { WorldId } from "../game/worlds";
import { autoRecipe } from "./autoMaps";
import { MAX_PNG_BYTES, isPng } from "./imageTools";
import { SharedHttpError, sharedConfigured, sharedProject, sharedRequest, sharedToken, sharedUpload } from "./sharedAuth";
import { readSharedCache, writeSharedCache } from "./sharedCache";
import { draftId, discardDraft, MAP_KEYS, type MapKey, type MapMode, type DraftTextureKind, type TextureDraft } from "./textureDrafts";
import { installSharedTexture, setSharedTextures, sharedInfo, sharedInfos, surfaceOf, uploaded, type SharedInfo, type SharedMeta } from "./textureLibrary";
import { worldOfAssetId } from "../game/mapSharedRefs";

const LIST = "/storage/v1/object/list/void-textures";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const sharedAssetBase = () => sharedProject + "/storage/v1/object/public/void-textures/";
const publicBase = sharedAssetBase;

export async function listSharedObjects(prefix: string, init?: RequestInit): Promise<{ name: string }[]> {
  const all: { name: string }[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await sharedRequest<{ name: string }[]>(LIST, {
      method: "POST", body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }), ...init,
    });
    all.push(...page);
    if (page.length < 100) return all;
  }
}
const list = listSharedObjects;

const revNumbers = (entries: { name: string }[]) => entries.map(e => /^r(\d+)$/.exec(e.name)).filter(Boolean).map(m => Number(m![1])).sort((a, b) => b - a);

// (only the four known multipliers, finite numbers)
function parseTuning(raw: unknown): SharedMeta["tuning"] {
  if (!raw || typeof raw !== "object") return undefined;
  const out: NonNullable<SharedMeta["tuning"]> = {};
  if ("roomReflection" in raw && typeof raw.roomReflection === "boolean") out.roomReflection = raw.roomReflection;
  for (const k of ["normal", "relief", "rough", "metal"] as const) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function parseMeta(raw: unknown, rev: number): SharedMeta | null {
  const m = raw as Partial<SharedMeta> | null;
  if (!m || typeof m !== "object" || typeof m.name !== "string") return null;
  if (m.type !== undefined && m.type !== "texture") return null;
  const kinds = (Array.isArray(m.kinds) ? m.kinds : []).filter((k): k is DraftTextureKind =>
    k === "wall" || k === "floor" || k === "ceiling" || k === "propFace");
  const mode = (v: unknown, fallback: MapMode): MapMode => v === "uploaded" || v === "auto" || v === "none" ? v : fallback;
  const src = m.transparency?.source;
  return {
    v: 1, type: "texture", name: m.name, kinds: kinds.length ? kinds : ["wall", "floor"], pixelArt: m.pixelArt !== false, rev,
    smooth: m.smooth === true,
    tuning: parseTuning(m.tuning),
    transparency: { source: src === "colorKey" || src === "none" ? src : "alpha", colorKey: typeof m.transparency?.colorKey === "string" ? m.transparency.colorKey : "#ff00ff" },
    maps: Object.fromEntries(MAP_KEYS.map(k => [k, k === "diffuse" ? "uploaded" : mode(m.maps?.[k], k === "normal" || k === "depth" ? "auto" : "none")])) as Record<MapKey, MapMode>,
    gen: m.gen,
  };
}

// The highest revision of a texture that has its meta.json (null: none yet).
async function readLatest(world: WorldId, uuid: string, revs: number[], init?: RequestInit): Promise<SharedInfo | null> {
  for (const rev of revs) {
    const base = `${publicBase()}${world}/${uuid}/r${rev}/`;
    try {
      const res = await fetch(base + "meta.json", init);
      if (!res.ok) continue;
      const meta = parseMeta(await res.json(), rev);
      if (meta) return { id: `${world}_shared_${uuid}`, world, uuid, rev, legacy: false, meta, base };
    } catch { /* an unreadable revision is skipped */ }
  }
  return null;
}

const TEXTURE_CACHE = "textures";

// A cached entry is only usable when every URL it points to is a plain public
// storage URL of this world.
function cacheUsable(world: WorldId, value: unknown): value is SharedInfo[] {
  if (!Array.isArray(value)) return false;
  const prefix = world + "_shared_";
  const base = publicBase();
  return value.every(raw => {
    const info = raw as Partial<SharedInfo> | null;
    if (!info || typeof info.id !== "string" || !info.id.startsWith(prefix)) return false;
    if (info.world !== world || typeof info.uuid !== "string") return false;
    if (typeof info.rev !== "number" || !Number.isFinite(info.rev)) return false;
    if (info.legacy) return typeof info.file === "string" && info.file.startsWith(base);
    return typeof info.base === "string" && info.base.startsWith(base) && parseMeta(info.meta, info.rev) !== null;
  });
}

// The cached texture metadata, applied synchronously before the network (false: none usable).
export function applyCachedSharedTextures(world: WorldId): boolean {
  if (!sharedConfigured) return false;
  const cached = readSharedCache<unknown>(TEXTURE_CACHE, world);
  if (!cacheUsable(world, cached)) return false;
  const list = cached.map(info => info.legacy ? info : { ...info, meta: parseMeta(info.meta, info.rev)! });
  setSharedTextures(world, list);
  return list.length > 0;
}

// Lists the world's shared textures (old flat files and revision folders) into TEXTURE_SETS.
export async function loadSharedTextures(world: WorldId, init?: RequestInit): Promise<void> {
  if (!sharedConfigured) return;
  const found: SharedInfo[] = [];
  const folders: string[] = [];
  for (const { name } of await list(world, init)) {
    if (/^[a-z0-9-]+\.png$/.test(name)) {
      found.push({ id: `${world}_shared_${name.slice(0, -4)}`, world, uuid: name.slice(0, 36), rev: 0, legacy: true, base: "", file: `${publicBase()}${world}/${name}` });
    } else if (UUID.test(name)) folders.push(name);
  }
  const loaded = await Promise.all(folders.map(async uuid => {
    try { return await readLatest(world, uuid, revNumbers(await list(`${world}/${uuid}`, init)), init); } catch { return null; }
  }));
  for (const info of loaded) if (info) found.push(info);
  setSharedTextures(world, found);
  writeSharedCache(TEXTURE_CACHE, world, found);
}

// A texture just published: into the local list (and the cached one) without listing the store again.
export function patchSharedTexture(info: SharedInfo) {
  installSharedTexture(info);
  writeSharedCache(TEXTURE_CACHE, info.world, sharedInfos(info.world));
}

// Just these texture ids (`<world>_shared_<uuid>[-name]`), each by its own folder: the store is not listed. What a map
// references, for a guest. Adds to what is registered (the list of the world is not replaced); returns the ids found.
export async function loadSharedTexturesById(ids: readonly string[], init?: RequestInit): Promise<string[]> {
  if (!sharedConfigured || !ids.length) return [];
  const found = (await Promise.all(ids.map(async (id): Promise<SharedInfo | null> => {
    const world = worldOfAssetId(id);
    const rest = id.slice(`${world}_shared_`.length);
    try {
      if (UUID.test(rest)) return await readLatest(world, rest, revNumbers(await list(`${world}/${rest}`, init)), init);
      if (!/^[a-z0-9-]+$/.test(rest) || rest.length < 37) return null;
      // an old flat file: the id names it (HEAD: does it exist)
      const file = `${publicBase()}${world}/${rest}.png`;
      return (await fetch(file, { ...init, method: "HEAD" })).ok ? { id, world, uuid: rest.slice(0, 36), rev: 0, legacy: true, base: "", file } : null;
    } catch { return null; }
  }))).filter((info): info is SharedInfo => info !== null);
  if (init?.signal?.aborted) return [];
  for (const world of new Set(found.map(info => info.world))) {
    const added = found.filter(info => info.world === world);
    setSharedTextures(world, [...sharedInfos(world).filter(info => !added.some(row => row.id === info.id)), ...added]);
  }
  return found.map(info => info.id);
}

// ---- publishing ----

// the highest published revision, and the next folder number to use (an
// interrupted publish can leave a folder without meta.json: it is skipped, not reused)
async function revisionState(world: WorldId, uuid: string) {
  const revs = revNumbers(await list(`${world}/${uuid}`));
  const info = await readLatest(world, uuid, revs);
  return { published: info?.rev ?? 0, next: (revs[0] ?? 0) + 1 };
}

export function publishFiles(d: TextureDraft): Promise<{ file: string; blob: Blob }[]> {
  return (async () => {
    const files: { file: string; blob: Blob }[] = [];
    const diffuse = uploaded(d.maps.diffuse);
    if (!diffuse) throw new Error(t("assetManager.err.needDiffuse", { name: d.name || t("assetManager.untitled") }));
    files.push({ file: "diffuse.png", blob: diffuse });
    for (const [key, file] of [["normal", "normal.png"], ["depth", "depth.png"], ["emissive", "emissive.png"]] as const) {
      const blob = uploaded(d.maps[key]);
      if (blob) files.push({ file, blob });
    }
    const gloss = uploaded(d.maps.gloss), metal = uploaded(d.maps.metal);
    if (gloss || metal) files.push({ file: "surface.png", blob: await surfaceOf(gloss, metal) });
    for (const { file, blob } of files) {
      if (blob.size > MAX_PNG_BYTES) throw new Error(t("assetManager.err.tooBig", { name: file, mb: (blob.size / 1048576).toFixed(1) }));
      if (!(await isPng(blob))) throw new Error(t("assetManager.err.notPng", { name: file }));
    }
    return files;
  })();
}

function metaOf(d: TextureDraft, rev: number): SharedMeta {
  const mode = (k: MapKey): MapMode => k === "diffuse" ? "uploaded" : d.maps[k].mode === "uploaded" && !d.maps[k].blob ? "none" : d.maps[k].mode;
  const maps = Object.fromEntries(MAP_KEYS.map(k => [k, mode(k)])) as Record<MapKey, MapMode>;
  const gen: SharedMeta["gen"] = {};
  if (maps.normal === "auto") gen.normal = autoRecipe;
  if (maps.depth === "auto") gen.depth = autoRecipe;
  return { v: 1, type: "texture", name: d.name.trim() || t("assetManager.untitled"), kinds: d.kinds, pixelArt: d.pixelArt, rev, smooth: !!d.smooth, transparency: d.transparency, maps, ...(Object.keys(gen).length ? { gen } : {}), ...(d.tuning && Object.keys(d.tuning).length ? { tuning: d.tuning } : {}) };
}

export interface PublishReport { published: string[]; skipped: string[] }

export async function publishTextureRevision(draft: TextureDraft, ask: (d: TextureDraft, theirs: number) => boolean): Promise<SharedInfo | undefined> {
  const files = await publishFiles(draft);
  const state = await revisionState(draft.world, draft.uuid);
  if (state.published !== draft.baseRev && !ask(draft, state.published)) return;
  const path = `${draft.world}/${draft.uuid}/r${state.next}/`;
  const folder = "/storage/v1/object/void-textures/" + path;
  const meta = metaOf(draft, state.next);
  try {
    for (const { file, blob } of files) await sharedUpload(folder + file, blob, "image/png");
    await sharedUpload(folder + "meta.json", JSON.stringify(meta, null, 2), "application/json");
  } catch (error) {
    if (error instanceof SharedHttpError && error.status === 415) throw new Error(t("assetManager.err.needSql"));
    throw error;
  }
  return { id: draftId(draft), world: draft.world, uuid: draft.uuid, rev: state.next, legacy: false,
    meta, base: publicBase() + path };
}

// Publishes the drafts one after the other. `ask` is asked when the store has a
// newer revision than the draft started from; answering no skips that texture.
// A published draft is discarded after the store was read again.
export async function publishDrafts(list: TextureDraft[], ask: (d: TextureDraft, theirs: number) => boolean, progress?: (message: string) => void): Promise<PublishReport> {
  const report: PublishReport = { published: [], skipped: [] };
  for (const d of list) {
    const name = d.name.trim() || t("assetManager.untitled");
    progress?.(t("assetManager.publishing", { name }));
    const info = await publishTextureRevision(d, ask);
    if (info) {
      report.published.push(draftId(d));
      // (the store is not listed again: the new revision goes into the local list)
      patchSharedTexture(info);
      await discardDraft(d.uuid);
    } else report.skipped.push(draftId(d));
  }
  return report;
}

// ---- deleting (a shared texture, for everyone: needs the Storage delete policy, see shared-texture-folders.sql) ----

export async function deleteSharedTexture(id: string): Promise<void> {
  const info = sharedInfo(id);
  if (!info) throw new Error(t("assetManager.err.notEditable"));
  if (!sharedToken()) throw new Error(t("assetManager.err.signInFirst"));
  const paths: string[] = [];
  if (info.legacy) paths.push(`${info.world}/${id.slice((info.world + "_shared_").length)}.png`);
  else {
    const folder = `${info.world}/${info.uuid}`;
    for (const entry of await list(folder)) {
      // (a revision folder: its files; a stray file straight in the texture's folder too)
      if (/^r\d+$/.test(entry.name)) for (const file of await list(`${folder}/${entry.name}`)) paths.push(`${folder}/${entry.name}/${file.name}`);
      else paths.push(`${folder}/${entry.name}`);
    }
  }
  if (!paths.length) throw new Error(t("assetManager.err.nothingToDelete"));
  const removed = await sharedRequest<unknown[]>("/storage/v1/object/void-textures", { method: "DELETE", body: JSON.stringify({ prefixes: paths }) });
  // (without a delete policy the store answers 200 and removes nothing)
  if (!Array.isArray(removed) || removed.length < paths.length) throw new Error(t("assetManager.err.needDeleteSql"));
  await discardDraft(info.uuid);
  // (the store is not listed again: the texture just leaves the local list)
  setSharedTextures(info.world, sharedInfos(info.world).filter(row => row.id !== id));
  writeSharedCache(TEXTURE_CACHE, info.world, sharedInfos(info.world));
}
