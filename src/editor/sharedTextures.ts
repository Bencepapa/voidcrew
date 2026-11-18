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
import { draftId, discardDraft, MAP_KEYS, type MapKey, type MapMode, type SurfaceKind, type TextureDraft } from "./textureDrafts";
import { setSharedTextures, sharedInfo, surfaceOf, uploaded, type SharedInfo, type SharedMeta } from "./textureLibrary";

const LIST = "/storage/v1/object/list/void-textures";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const publicBase = () => sharedProject + "/storage/v1/object/public/void-textures/";

async function list(prefix: string): Promise<{ name: string }[]> {
  const all: { name: string }[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await sharedRequest<{ name: string }[]>(LIST, {
      method: "POST", body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
    });
    all.push(...page);
    if (page.length < 100) return all;
  }
}

const revNumbers = (entries: { name: string }[]) => entries.map(e => /^r(\d+)$/.exec(e.name)).filter(Boolean).map(m => Number(m![1])).sort((a, b) => b - a);

// (only the four known multipliers, finite numbers)
function parseTuning(raw: unknown): SharedMeta["tuning"] {
  if (!raw || typeof raw !== "object") return undefined;
  const out: NonNullable<SharedMeta["tuning"]> = {};
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
  const kinds = (Array.isArray(m.kinds) ? m.kinds : []).filter((k): k is SurfaceKind => k === "wall" || k === "floor" || k === "ceiling");
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
async function readLatest(world: WorldId, uuid: string, revs: number[]): Promise<SharedInfo | null> {
  for (const rev of revs) {
    const base = `${publicBase()}${world}/${uuid}/r${rev}/`;
    try {
      const res = await fetch(base + "meta.json");
      if (!res.ok) continue;
      const meta = parseMeta(await res.json(), rev);
      if (meta) return { id: `${world}_shared_${uuid}`, world, uuid, rev, legacy: false, meta, base };
    } catch { /* an unreadable revision is skipped */ }
  }
  return null;
}

// Lists the world's shared textures (old flat files and revision folders) into TEXTURE_SETS.
export async function loadSharedTextures(world: WorldId): Promise<void> {
  if (!sharedConfigured) return;
  const found: SharedInfo[] = [];
  const folders: string[] = [];
  for (const { name } of await list(world)) {
    if (/^[a-z0-9-]+\.png$/.test(name)) {
      found.push({ id: `${world}_shared_${name.slice(0, -4)}`, world, uuid: name.slice(0, 36), rev: 0, legacy: true, base: "", file: `${publicBase()}${world}/${name}` });
    } else if (UUID.test(name)) folders.push(name);
  }
  const loaded = await Promise.all(folders.map(async uuid => {
    try { return await readLatest(world, uuid, revNumbers(await list(`${world}/${uuid}`))); } catch { return null; }
  }));
  for (const info of loaded) if (info) found.push(info);
  setSharedTextures(world, found);
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

// Publishes the drafts one after the other. `ask` is asked when the store has a
// newer revision than the draft started from; answering no skips that texture.
// A published draft is discarded after the store was read again.
export async function publishDrafts(list: TextureDraft[], ask: (d: TextureDraft, theirs: number) => boolean, progress?: (message: string) => void): Promise<PublishReport> {
  const report: PublishReport = { published: [], skipped: [] };
  for (const d of list) {
    const name = d.name.trim() || t("assetManager.untitled");
    progress?.(t("assetManager.publishing", { name }));
    const files = await publishFiles(d);
    const state = await revisionState(d.world, d.uuid);
    if (state.published !== d.baseRev && !ask(d, state.published)) { report.skipped.push(draftId(d)); continue; }
    const folder = `/storage/v1/object/void-textures/${d.world}/${d.uuid}/r${state.next}/`;
    try {
      for (const { file, blob } of files) await sharedUpload(folder + file, blob, "image/png");
      await sharedUpload(folder + "meta.json", JSON.stringify(metaOf(d, state.next), null, 2), "application/json");
    } catch (error) {
      if (error instanceof SharedHttpError && error.status === 415) throw new Error(t("assetManager.err.needSql"));
      throw error;
    }
    report.published.push(draftId(d));
    await loadSharedTextures(d.world);
    await discardDraft(d.uuid);
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
  await loadSharedTextures(info.world);
}
