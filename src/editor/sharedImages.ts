import { t } from "../i18n";
import type { WorldId } from "../game/worlds";
import { setSharedImages, type DecalSurfaceKind, type SharedImage, type SharedImageType } from "../render/sharedImages";
import { idb } from "./idb";
import { applyTransparency, decode, isPng, MAX_PNG_BYTES, type Transparency } from "./imageTools";
import { sharedConfigured, sharedToken, sharedUpload } from "./sharedAuth";
import { listSharedObjects, sharedAssetBase } from "./sharedTextures";

export interface ImageDraft {
  id: string;
  uuid: string;
  world: WorldId;
  type: SharedImageType;
  name: string;
  png: Blob;
  surface: DecalSurfaceKind;
  transparency: Transparency;
}

export const imageAssetId = (world: WorldId, type: SharedImageType, uuid: string) => `${world}_${type}_${uuid}`;
export const imageDrafts = () => idb.all<ImageDraft>("imageDrafts");
export const saveImageDraft = (draft: ImageDraft) => idb.put("imageDrafts", draft);
export const discardImageDraft = (id: string) => idb.del("imageDrafts", id);

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const imageLimit = (type: SharedImageType) => type === "decal" ? 512 : 4096;
const revisions = (entries: { name: string }[]) => entries
  .flatMap(({ name }) => /^r[1-9]\d*$/.test(name) ? [Number(name.slice(1))] : [])
  .filter(Number.isSafeInteger).sort((a, b) => b - a);

async function publishedImage(world: WorldId, type: SharedImageType, uuid: string): Promise<SharedImage | undefined> {
  const path = `${world}/${type}/${uuid}`;
  for (const rev of revisions(await listSharedObjects(path))) {
    const base = `${sharedAssetBase()}${path}/r${rev}/`;
    const response = await fetch(base + "meta.json");
    if (response.status === 400 || response.status === 404) continue;
    if (!response.ok) throw new Error(`Asset metadata: HTTP ${response.status}`);
    const { name, width, height, surface, type: savedType } = await response.json();
    if (savedType !== type || typeof name !== "string" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width > imageLimit(type) || height > imageLimit(type)) continue;
    return {
      id: imageAssetId(world, type, uuid), world, type, name, width, height, url: base + "diffuse.png",
      surface: type === "decal" && (surface === "floor" || surface === "ceiling" || surface === "wall") ? surface : undefined,
    };
  }
}

const loads = new Map<WorldId, number>();
export async function loadSharedImages(world: WorldId) {
  if (!sharedConfigured) return;
  const version = (loads.get(world) ?? 0) + 1;
  loads.set(world, version);
  const collections = await Promise.all((["portrait", "decal"] as const).map(async (type) => {
    const entries = await listSharedObjects(`${world}/${type}`);
    return Promise.all(entries.filter(e => uuidPattern.test(e.name)).map(e => publishedImage(world, type, e.name)));
  }));
  if (loads.get(world) === version) {
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

export async function publishImage(draft: ImageDraft) {
  if (!sharedToken()) throw new Error(t("assetManager.err.signInFirst"));
  const png = await applyTransparency(draft.png, draft.transparency) ?? draft.png;
  const { width, height } = await checkImagePng(png, draft.name, draft.type);
  const path = `${draft.world}/${draft.type}/${draft.uuid}`;
  const rev = (revisions(await listSharedObjects(path))[0] ?? 0) + 1;
  const target = `/storage/v1/object/void-textures/${path}/r${rev}/`;
  await sharedUpload(target + "diffuse.png", png, "image/png");
  await sharedUpload(target + "meta.json", JSON.stringify({
    v: 1, type: draft.type, name: draft.name, width, height, rev,
    ...(draft.type === "decal" ? { surface: draft.surface } : {}),
  }), "application/json");
  await discardImageDraft(draft.id);
  // A failed refresh does not turn a completed publication into a retry.
  void loadSharedImages(draft.world).catch(console.warn);
}
