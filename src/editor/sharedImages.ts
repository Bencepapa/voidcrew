import { useSyncExternalStore } from "react";
import { t } from "../i18n";
import type { WorldId } from "../game/worlds";
import { DEFAULT_PICKUP, isItemCategory, type PickupAppearance } from "../game/items";
import { cleanPickupValue } from "../game/pickupValue";
import { isImagePurpose, setSharedImages, type DecalSurfaceKind, type ImagePurpose, type SharedImage, type SharedImageType } from "../render/sharedImages";
import { idb } from "./idb";
import { applyTransparency, decode, isPng, MAX_PNG_BYTES, type Transparency } from "./imageTools";
import { sharedConfigured, sharedToken, sharedUpload } from "./sharedAuth";
import { listSharedObjects, sharedAssetBase } from "./sharedTextures";
import { derive } from "./textureLibrary";

export interface ImageDraft {
  id: string;
  uuid: string;
  world: WorldId;
  type: SharedImageType;
  name: string;
  png: Blob | null;
  surface: DecalSurfaceKind;
  transparency: Transparency;
  purpose?: ImagePurpose;
  pickup?: PickupAppearance;
  pickupMaps?: { depth?: Blob; normal?: Blob; aiDepth?: boolean };
}

export const imageAssetId = (world: WorldId, type: SharedImageType, uuid: string) => `${world}_${type}_${uuid}`;

const isSurface = (value: unknown): value is DecalSurfaceKind =>
  value === "wall" || value === "floor" || value === "ceiling";
const isTransparencySource = (value: unknown): value is Transparency["source"] =>
  value === "alpha" || value === "colorKey" || value === "none";

function readPickup(value?: Partial<PickupAppearance> | null): PickupAppearance {
  // (the value is optional: an old pickup, or an empty field, has none and gets its category's default when registered)
  const own = cleanPickupValue(value?.value);
  return {
    category: isItemCategory(value?.category) ? value.category : DEFAULT_PICKUP.category,
    height: typeof value?.height === "number" && Number.isFinite(value.height) ? Math.max(0.03, Math.min(2, value.height)) : DEFAULT_PICKUP.height,
    glow: typeof value?.glow === "number" && Number.isFinite(value.glow) ? Math.max(0, Math.min(2, value.glow)) : DEFAULT_PICKUP.glow,
    ...(own !== undefined ? { value: own } : {}),
  };
}

// An old draft has no purpose, and an older one may miss a field: normalize both.
function normalizeDraft(value: Partial<ImageDraft>): ImageDraft {
  const type: SharedImageType = value.type === "decal" || value.type === "item" ? value.type : "portrait";
  const world: WorldId = value.world === "scifi" ? "scifi" : "fantasy";
  const uuid = typeof value.uuid === "string" && value.uuid ? value.uuid : crypto.randomUUID();
  const transparency = value.transparency;
  return {
    id: typeof value.id === "string" && value.id ? value.id : imageAssetId(world, type, uuid),
    uuid,
    world,
    type,
    name: typeof value.name === "string" ? value.name : "",
    png: value.png instanceof Blob ? value.png : null,
    surface: isSurface(value.surface) ? value.surface : "wall",
    transparency: {
      source: isTransparencySource(transparency?.source) ? transparency.source : "alpha",
      colorKey: typeof transparency?.colorKey === "string" && /^#[0-9a-f]{6}$/i.test(transparency.colorKey) ? transparency.colorKey : "#ff00ff",
    },
    purpose: type === "portrait" && isImagePurpose(value.purpose) ? value.purpose : undefined,
    pickup: type === "item" ? readPickup(value.pickup) : undefined,
    pickupMaps: type === "item" && value.pickupMaps ? {
      depth: value.pickupMaps.depth instanceof Blob ? value.pickupMaps.depth : undefined,
      normal: value.pickupMaps.normal instanceof Blob ? value.pickupMaps.normal : undefined,
      aiDepth: value.pickupMaps.depth instanceof Blob && value.pickupMaps.aiDepth === true,
    } : undefined,
  };
}

let drafts: readonly ImageDraft[] = [];
// Drafts discarded before the initial load finished must not come back from it.
const discarded = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
export const subscribeImageDrafts = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export const getImageDrafts = () => drafts;
export const useImageDrafts = () => useSyncExternalStore(subscribeImageDrafts, getImageDrafts);

const loadReady: Promise<void> = (async () => {
  let saved: ImageDraft[] = [];
  try { saved = (await idb.all<ImageDraft>("imageDrafts")).map(normalizeDraft); }
  catch { /* no IndexedDB: drafts stay for this page only */ }
  // A draft created while loading is newer than its saved copy.
  const fresh = new Set(drafts.map(draft => draft.id));
  drafts = [...saved.filter(draft => !fresh.has(draft.id) && !discarded.has(draft.id)), ...drafts];
  emit();
})();

export async function imageDrafts(): Promise<ImageDraft[]> {
  await loadReady;
  return [...drafts];
}

export async function createImageDraft(world: WorldId, type: SharedImageType, purpose?: ImagePurpose): Promise<ImageDraft> {
  const uuid = crypto.randomUUID();
  const draft: ImageDraft = {
    id: imageAssetId(world, type, uuid),
    uuid,
    world,
    type,
    name: "",
    png: null,
    surface: "wall",
    transparency: { source: "alpha", colorKey: "#ff00ff" },
    purpose: type === "portrait" ? (isImagePurpose(purpose) ? purpose : "portrait") : undefined,
    pickup: type === "item" ? { ...DEFAULT_PICKUP } : undefined,
  };
  await saveImageDraft(draft);
  return draft;
}

// Writes are serialized so a quick series of edits lands in order.
let chain: Promise<unknown> = Promise.resolve();
function persist(work: () => Promise<unknown>) {
  const next = chain.then(work, work);
  chain = next.catch(() => {});
  return next;
}

export async function saveImageDraft(draft: ImageDraft): Promise<void> {
  const next = normalizeDraft(draft);
  discarded.delete(next.id);
  const previous = drafts.find(saved => saved.id === next.id);
  drafts = previous ? drafts.map(saved => saved.id === next.id ? next : saved) : [...drafts, next];
  emit();
  try { await persist(() => idb.put("imageDrafts", next)); }
  catch (error) {
    // A newer edit of the same draft stays; only this failed value is rolled back.
    if (drafts.find(saved => saved.id === next.id) === next) {
      drafts = previous ? drafts.map(saved => saved.id === next.id ? previous : saved) : drafts.filter(saved => saved.id !== next.id);
      emit();
    }
    throw error;
  }
}

export async function discardImageDraft(id: string): Promise<void> {
  const previous = drafts.find(draft => draft.id === id);
  discarded.add(id);
  drafts = drafts.filter(draft => draft.id !== id);
  emit();
  try { await persist(() => idb.del("imageDrafts", id)); }
  catch (error) {
    discarded.delete(id);
    if (previous && !drafts.some(draft => draft.id === id)) {
      drafts = [...drafts, previous];
      emit();
    }
    throw error;
  }
}

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const imageLimit = (type: SharedImageType) => type === "portrait" ? 4096 : 512;
const revisions = (entries: { name: string }[]) => entries
  .flatMap(({ name }) => /^r[1-9]\d*$/.test(name) ? [Number(name.slice(1))] : [])
  .filter(Number.isSafeInteger).sort((a, b) => b - a);

async function publishedImage(world: WorldId, type: SharedImageType, uuid: string, init?: RequestInit): Promise<SharedImage | undefined> {
  const path = `${world}/${type}/${uuid}`;
  for (const rev of revisions(await listSharedObjects(path, init))) {
    const base = `${sharedAssetBase()}${path}/r${rev}/`;
    const response = await fetch(base + "meta.json", init);
    if (response.status === 400 || response.status === 404) continue;
    if (!response.ok) throw new Error(`Asset metadata: HTTP ${response.status}`);
    const metadata = await response.json().catch(() => null);
    if (!metadata || typeof metadata !== "object") continue;
    const { name, width, height, surface, type: savedType, purpose, pickup } = metadata;
    if (savedType !== type || typeof name !== "string" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width > imageLimit(type) || height > imageLimit(type)) continue;
    return {
      id: imageAssetId(world, type, uuid), world, type, name, width, height, url: base + "diffuse.png",
      ...(type === "portrait" && isImagePurpose(purpose) ? { purpose } : {}),
      surface: type === "decal" && isSurface(surface) ? surface : undefined,
      pickup: type === "item" ? { ...readPickup(pickup), depthUrl: base + "depth.png", normalUrl: base + "normal.png" } : undefined,
    };
  }
}

const loads = new Map<WorldId, number>();
export async function loadSharedImages(world: WorldId, init?: RequestInit) {
  if (!sharedConfigured) return;
  const version = (loads.get(world) ?? 0) + 1;
  loads.set(world, version);
  const collections = await Promise.all((["portrait", "decal", "item"] as const).map(async (type) => {
    const entries = await listSharedObjects(`${world}/${type}`, init);
    return Promise.all(entries.filter(e => uuidPattern.test(e.name)).map(e => publishedImage(world, type, e.name, init)));
  }));
  if (!init?.signal?.aborted && loads.get(world) === version) {
    setSharedImages(world, collections.flat().filter((value): value is SharedImage => value !== undefined));
  }
}

export async function checkImagePng(file: Blob, name: string, type: SharedImageType) {
  if (file.size > MAX_PNG_BYTES) throw new Error(t("assetManager.err.tooBig", { name, mb: (file.size / 1048576).toFixed(1) }));
  if (!(await isPng(file))) throw new Error(t("assetManager.err.notPng", { name }));
  const limit = imageLimit(type);
  const header = new DataView(await file.slice(16, 24).arrayBuffer());
  if (header.byteLength === 8 && (header.getUint32(0) > limit || header.getUint32(4) > limit)) {
    throw new Error(t("assetManager.image.tooLarge", { limit }));
  }
  const image = await decode(file);
  if (image.width > limit || image.height > limit) throw new Error(t("assetManager.image.tooLarge", { limit }));
  return image;
}

export async function resolvePickupMaps(png: Blob, transparency: Transparency, depth?: Blob, normal?: Blob) {
  const auto = await derive(png, transparency, { depth: !depth, normal: !normal });
  return { diffuse: auto.diffuse ?? png, depth: depth ?? auto.depth, normal: normal ?? auto.normal };
}

export async function publishImage(draft: ImageDraft) {
  if (!draft.png) throw new Error(t("assetManager.image.needPng"));
  const name = draft.name.trim();
  if (!name) throw new Error(t("assetManager.image.needName"));
  if (!sharedToken()) throw new Error(t("assetManager.err.signInFirst"));
  const purpose = draft.type === "portrait" ? (isImagePurpose(draft.purpose) ? draft.purpose : "portrait") : undefined;
  const { width, height } = await checkImagePng(draft.png, name, draft.type);
  const maps = draft.type === "item"
    ? await resolvePickupMaps(draft.png, draft.transparency, draft.pickupMaps?.depth, draft.pickupMaps?.normal)
    : undefined;
  if (draft.type === "item" && (!maps?.normal || !maps.depth)) throw new Error(t("assetManager.heightError"));
  const png = maps ? maps.diffuse : await applyTransparency(draft.png, draft.transparency) ?? draft.png;
  const path = `${draft.world}/${draft.type}/${draft.uuid}`;
  const rev = (revisions(await listSharedObjects(path))[0] ?? 0) + 1;
  const target = `/storage/v1/object/void-textures/${path}/r${rev}/`;
  await sharedUpload(target + "diffuse.png", png, "image/png");
  if (maps?.normal && maps.depth) {
    await Promise.all([
      sharedUpload(target + "normal.png", maps.normal, "image/png"),
      sharedUpload(target + "depth.png", maps.depth, "image/png"),
    ]);
  }
  await sharedUpload(target + "meta.json", JSON.stringify({
    v: 1, type: draft.type, name, width, height, rev,
    ...(purpose ? { purpose } : {}),
    ...(draft.type === "decal" ? { surface: draft.surface } : {}),
    ...(draft.type === "item" ? { pickup: readPickup(draft.pickup) } : {}),
  }), "application/json");
  await discardImageDraft(draft.id);
  // A failed refresh does not turn a completed publication into a retry.
  void loadSharedImages(draft.world).catch(console.warn);
}
