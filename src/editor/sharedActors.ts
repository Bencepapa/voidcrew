import { useSyncExternalStore } from "react";
import { ACTOR_TYPES, type ActorType } from "../game/actors";
import { ACTOR_ROW_ROLES, defaultActorView, sheetLayout, type ActorRowRole, type ActorView } from "../game/actorSheets";
import type { WorldId } from "../game/worlds";
import { setSharedActorOffsets, type ActorOffsets } from "../render/actorOffsets";
import { bundledDefinitions } from "../game/sharedBuiltins";
import { bundledActorFolder } from "../game/sharedContent";
import { t } from "../i18n";
import { idb } from "./idb";
import { applyTransparency, decode, encode, isPng, MAX_PNG_BYTES, type Transparency } from "./imageTools";
import { encodeSmallestLossless } from "./losslessImage";
import { SharedHttpError } from "./sharedAuth";
import { sharedConfigured, sharedToken } from "./sharedAuth";
import { loadDefinitions, publishDefinition } from "./sharedDefinitions";

export const MAX_ACTOR_ROWS = 32;
export const MAX_ACTOR_COLUMNS = 8;
type Offset = ActorOffsets["offsets"][number];

interface ActorDefinition {
  name: string;
  width: number;
  height: number;
  worldHeight: number;
  cols: number;
  roles: ActorRowRole[];
  directions: ActorView[];
  offsets: Offset[];
  hasNormal: boolean;
  // File name of the colour map in the revision folder; missing in old revisions = "diffuse.png".
  diffuseFile?: DiffuseFile;
}

export type DiffuseFile = "diffuse.png" | "diffuse.webp";
export const diffuseFileOf = (d: Pick<ActorDefinition, "diffuseFile">): DiffuseFile => d.diffuseFile ?? "diffuse.png";

export interface ActorDraft extends Omit<ActorDefinition, "hasNormal"> {
  id: string;
  world: WorldId;
  diffuse: Blob | null;
  normal: Blob | null;
  transparency: Transparency;
}

interface PublishedActor {
  definition: ActorDefinition;
  base: string;
}

export function actorGridValid(width: number, height: number, cols: number, rows: number) {
  return Number.isInteger(cols) && cols >= 1 && cols <= MAX_ACTOR_COLUMNS &&
    Number.isInteger(rows) && rows >= 1 && rows <= MAX_ACTOR_ROWS &&
    Number.isInteger(width) && width > 0 && width <= 2048 && width % cols === 0 &&
    Number.isInteger(height) && height > 0 && height <= 2048 && height % rows === 0;
}

function readDefinition(raw: unknown): ActorDefinition | undefined {
  if (!raw || typeof raw !== "object") return;
  const d = raw as ActorDefinition;
  if (typeof d.name !== "string" || !d.name.trim() || d.name.length > 100 ||
      !Number.isFinite(d.worldHeight) || d.worldHeight < 0.1 || d.worldHeight > 4 ||
      !Array.isArray(d.roles) || !actorGridValid(d.width, d.height, d.cols, d.roles.length) ||
      !d.roles.every(role => ACTOR_ROW_ROLES.includes(role)) ||
      d.roles.filter(role => role === "idle").length !== 1 ||
      d.roles.filter(role => role === "hit").length > 1 || d.roles.filter(role => role === "wreck").length > 1 ||
      !Array.isArray(d.directions) || d.directions.length !== 8 ||
      !d.directions.every(view => view && Number.isInteger(view.col) && view.col >= 0 && view.col < d.cols &&
        typeof view.mirror === "boolean") ||
      !Array.isArray(d.offsets) || d.offsets.length !== d.cols * d.roles.length ||
      !d.offsets.every(offset => Array.isArray(offset) && offset.length === 2 &&
        offset.every(n => Number.isInteger(n) && Math.abs(n) <= 2048)) ||
      typeof d.hasNormal !== "boolean" ||
      (d.diffuseFile !== undefined && d.diffuseFile !== "diffuse.png" && d.diffuseFile !== "diffuse.webp")) return;
  return d;
}

let drafts: ActorDraft[] = [];
let draftLoad: Promise<void> | undefined;
let version = 0;
const catalog = new Map<string, PublishedActor>();
const loads = new Map<WorldId, number>();
const draftListeners = new Set<() => void>();
const listeners = new Set<() => void>();
const changeListeners = new Set<(ids: ReadonlySet<string>, revised: ReadonlySet<string>) => void>();

const subscribeDrafts = (listener: () => void) => {
  draftListeners.add(listener);
  return () => { draftListeners.delete(listener); };
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const emitDrafts = () => { for (const listener of draftListeners) listener(); };
export const useActorDrafts = () => useSyncExternalStore(subscribeDrafts, () => drafts);
export const useSharedActorVersion = () => useSyncExternalStore(subscribe, () => version);
export function onSharedActorsChanged(listener: (ids: ReadonlySet<string>, revised: ReadonlySet<string>) => void) {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
}

export function loadActorDrafts(): Promise<void> {
  draftLoad ??= idb.all<ActorDraft>("actorDrafts").then(rows => {
    drafts = rows;
    emitDrafts();
  }).catch(error => {
    draftLoad = undefined;
    throw error;
  });
  return draftLoad;
}

export async function saveActorDraft(draft: ActorDraft) {
  await loadActorDrafts();
  await idb.put("actorDrafts", draft);
  drafts = [...drafts.filter(row => row.id !== draft.id), draft];
  emitDrafts();
}

export async function discardActorDraft(id: string) {
  await loadActorDrafts();
  await idb.del("actorDrafts", id);
  drafts = drafts.filter(row => row.id !== id);
  emitDrafts();
}

const alpha: Transparency = { source: "alpha", colorKey: "#ff00ff" };
export const defaultActorDirections = (cols: number) => Array.from({ length: 8 }, (_, sector) => defaultActorView(cols, sector));

export async function createActorDraft(world: WorldId) {
  const draft: ActorDraft = {
    id: `${world}_actor_${crypto.randomUUID()}`, world, name: "", width: 0, height: 0, worldHeight: 0.8,
    cols: 5, roles: ["idle", "walk", "walk", "attack", "hit", "die", "wreck"],
    directions: defaultActorDirections(5), offsets: [], diffuse: null, normal: null, transparency: alpha,
  };
  await saveActorDraft(draft);
  return draft;
}

export async function reviseActor(id: string, world: WorldId) {
  await loadActorDrafts();
  const existing = drafts.find(draft => draft.id === id);
  if (existing) return existing;
  const asset = catalog.get(id);
  if (!asset) throw new Error(t("assetManager.npcSheet.loadError"));
  const read = async (file: string) => {
    const response = await fetch(asset.base + file);
    if (!response.ok) throw new Error(t("assetManager.npcSheet.loadError"));
    return response.blob();
  };
  const { hasNormal, ...definition } = asset.definition;
  const [diffuse, normal] = await Promise.all([read(diffuseFileOf(asset.definition)), hasNormal ? read("normal.png") : null]);
  return { ...definition, id, world, diffuse, normal, transparency: alpha } satisfies ActorDraft;
}

export async function importActorSheet(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const webp = String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  if (file.size > MAX_PNG_BYTES || (!webp && !(await isPng(file)))) throw new Error(t("assetManager.npcSheet.fileError"));
  const pixels = await decode(file);
  if (pixels.width > 2048 || pixels.height > 2048) throw new Error(t("assetManager.npcSheet.fileError"));
  const png = webp || file.type !== "image/png" ? await encode(pixels) : file;
  if (png.size > MAX_PNG_BYTES) throw new Error(t("assetManager.npcSheet.fileError"));
  return { png, width: pixels.width, height: pixels.height };
}

export async function actorDiffuse(draft: Pick<ActorDraft, "diffuse" | "transparency">) {
  if (!draft.diffuse) return null;
  return await applyTransparency(draft.diffuse, draft.transparency) ?? draft.diffuse;
}

export function alignActorFrames(pixels: ImageData, cols: number, rows: number): Offset[] {
  const cellW = pixels.width / cols;
  const cellH = pixels.height / rows;
  return Array.from({ length: cols * rows }, (_, index) => {
    const left = (index % cols) * cellW;
    const top = Math.floor(index / cols) * cellH;
    let minX = cellW;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        if (pixels.data[((top + y) * pixels.width + left + x) * 4 + 3] < 128) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        maxY = y;
      }
    }
    return maxY < 0 ? [0, 0] : [Math.round((cellW - 1 - minX - maxX) / 2), cellH - 1 - maxY];
  });
}

function install(entries: Map<string, PublishedActor>) {
  const changed = new Set<string>();
  const revised = new Set<string>();
  for (const [id, entry] of entries) {
    if (catalog.get(id)?.base === entry.base) continue;
    if (catalog.has(id)) revised.add(id);
    const d = entry.definition;
    const layout = sheetLayout(d.cols, d.roles, d.directions);
    const cell: ActorOffsets["cell"] = [d.width / layout.cols, d.height / layout.rows];
    const source = ACTOR_TYPES.robot1;
    const type: ActorType = {
      ...source, ...layout, name: d.name, sheet: id, cellAspect: cell[0] / cell[1], height: d.worldHeight,
      sheetFiles: { diffuse: entry.base + diffuseFileOf(d), normal: d.hasNormal ? entry.base + "normal.png" : undefined },
      passive: { fleeMs: 7000, fleeSpeed: 2.2 }, body: { ...source.body, headroom: Math.min(d.worldHeight, 1) },
      eyeHeight: d.worldHeight * 0.8, loot: undefined, glow: undefined, crits: [], damage: [0, 0],
    };
    setSharedActorOffsets(id, { cell, offsets: d.offsets });
    ACTOR_TYPES[id] = type;
    catalog.set(id, entry);
    changed.add(id);
  }
  if (!changed.size) return;
  version++;
  for (const listener of listeners) listener();
  for (const listener of changeListeners) listener(changed, revised);
}

// The NPCs `npm run pull:shared` put into the release (files under public/shared-actors/<id>/).
// A network answer with another base (a newer revision) replaces them.
export function installBundledActors() {
  const entries = new Map<string, PublishedActor>();
  for (const [id, { definition: raw }] of Object.entries(bundledDefinitions.actor)) {
    const definition = readDefinition(raw);
    if (!definition || !/^(scifi|fantasy)_actor_[0-9a-f-]{36}$/.test(id)) continue;
    entries.set(id, { definition, base: import.meta.env.BASE_URL + bundledActorFolder(id) });
  }
  if (entries.size) install(entries);
}

export async function loadSharedActors(world: WorldId, init?: RequestInit) {
  if (!sharedConfigured) return;
  const request = (loads.get(world) ?? 0) + 1;
  loads.set(world, request);
  const rows = await loadDefinitions(world, "actor", (raw, base) => {
    const definition = readDefinition(raw);
    return definition ? { definition, base } : undefined;
  }, init);
  if (!init?.signal?.aborted && loads.get(world) === request) install(rows);
}

export async function publishActor(draft: ActorDraft) {
  if (!sharedToken()) throw new Error(t("assetManager.err.signInFirst"));
  const { name, cols, roles, width, height, worldHeight, directions, normal } = draft;
  const offsets = Array.from({ length: cols * roles.length }, (_, index): Offset => draft.offsets[index] ?? [0, 0]);
  const meta = { name: name.trim(), width, height, cols, roles, directions, offsets, worldHeight, hasNormal: !!normal };
  if (!readDefinition(meta) || !draft.diffuse) throw new Error(t("assetManager.npcSheet.invalid"));
  // The cut-out is applied first, so the stored map already has it.
  const diffuse = (await actorDiffuse(draft))!;
  const best = await encodeSmallestLossless(diffuse);
  if (best.blob.size > MAX_PNG_BYTES) throw new Error(t("assetManager.npcSheet.fileError"));
  const upload = (name: DiffuseFile, blob: Blob) => {
    const definition = readDefinition({ ...meta, diffuseFile: name })!;
    const files: { name: string; blob: Blob }[] = [{ name, blob }];
    if (normal) files.push({ name: "normal.png", blob: normal });
    return publishDefinition(draft.world, "actor", draft.id, definition, files).then(base => ({ definition, base }));
  };
  let published;
  let webpRefused = false;
  try {
    published = await upload(best.ext === "webp" ? "diffuse.webp" : "diffuse.png", best.blob);
  } catch (error) {
    // The bucket may not allow image/webp yet (supabase/shared-webp-mime.sql): publish the PNG instead.
    if (best.ext !== "webp" || !(error instanceof SharedHttpError) || ![400, 415, 422].includes(error.status)) throw error;
    const png = await encode(await decode(best.blob));
    if (png.size > MAX_PNG_BYTES) throw new Error(t("assetManager.npcSheet.fileError"));
    published = await upload("diffuse.png", png);
    webpRefused = true;
  }
  loads.set(draft.world, (loads.get(draft.world) ?? 0) + 1);
  install(new Map([[draft.id, published]]));
  await discardActorDraft(draft.id);
  return { webpRefused };
}
