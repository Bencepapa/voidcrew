import { useSyncExternalStore } from "react";
import { isSharedPropId, PROP_TYPES, type SingleTextureProp } from "../game/props";
import { assetInWorld, type WorldId } from "../game/worlds";
import { t } from "../i18n";
import { TEXTURE_SETS, textureFolder } from "../render/textureSets";
import { sharedConfigured, sharedToken, sharedUpload } from "./sharedAuth";
import { listSharedObjects, sharedAssetBase } from "./sharedTextures";
import { textureStatus } from "./textureLibrary";

export const PROP_SHAPES = ["panel", "billboard", "cross"] as const;

export interface PropDraft {
  id: string;
  world: WorldId;
  definition: SingleTextureProp;
}

const storageKey = "voidcrew:prop-drafts";
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const texturePattern = /^[a-z0-9_-]+$/i;
const bound = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

function readDefinition(raw: Partial<SingleTextureProp> | null | undefined): SingleTextureProp | undefined {
  if (!raw || !raw.kind || !PROP_SHAPES.includes(raw.kind) || !Array.isArray(raw.size) ||
      typeof raw.texture !== "string" || (raw.texture !== "" && !texturePattern.test(raw.texture))) return;
  return {
    kind: raw.kind,
    name: typeof raw.name === "string" ? raw.name.slice(0, 100) : "",
    texture: raw.texture,
    size: [bound(raw.size[0], .05, 8, .6), bound(raw.size[1], .05, 8, .6), bound(raw.size[2], .01, 8, .15)],
    elevation: bound(raw.elevation, 0, 8, 0),
    relief: bound(raw.relief, 0, 3, 1),
    blocks: raw.blocks === true,
    wall: raw.wall === true,
  };
}

function readDrafts(): PropDraft[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as PropDraft[];
    return saved.flatMap(draft => {
      const definition = readDefinition(draft?.definition);
      return definition && typeof draft.id === "string" && isSharedPropId(draft.id) &&
        (draft.world === "scifi" || draft.world === "fantasy") && draft.id.startsWith(draft.world + "_")
        ? [{ ...draft, definition }] : [];
    });
  } catch {
    return [];
  }
}

let drafts = readDrafts();
const listeners = new Set<() => void>();
const registryListeners = new Set<(ids: ReadonlySet<string>) => void>();
let catalogueVersion = 0;
const installed = new Map<WorldId, Map<string, SingleTextureProp>>();
const loads = new Map<WorldId, number>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getPropDrafts = () => drafts;
export const usePropDrafts = () => useSyncExternalStore(subscribe, getPropDrafts);
export const useSharedPropVersion = () => useSyncExternalStore(subscribe, () => catalogueVersion);

export function savePropDraft(draft: PropDraft) {
  const next = drafts.some(row => row.id === draft.id)
    ? drafts.map(row => row.id === draft.id ? draft : row)
    : [...drafts, draft];
  localStorage.setItem(storageKey, JSON.stringify(next));
  drafts = next;
  for (const listener of listeners) listener();
}

export function createPropDraft(world: WorldId, kind: SingleTextureProp["kind"], texture = "") {
  const draft: PropDraft = {
    id: `${world}_prop_${crypto.randomUUID()}`,
    world,
    definition: { name: "", kind, texture, size: [.6, .6, .15], elevation: 0, relief: 1, wall: false, blocks: false },
  };
  savePropDraft(draft);
  return draft;
}

export function discardPropDraft(id: string) {
  const next = drafts.filter(row => row.id !== id);
  localStorage.setItem(storageKey, JSON.stringify(next));
  drafts = next;
  for (const listener of listeners) listener();
}

export function propTextures(world: WorldId) {
  const sets = Object.entries(TEXTURE_SETS).filter(([id]) => id !== "sky" && assetInWorld(id, world) && textureStatus(id) !== "new");
  const options = new Map(sets.map(([id, paths]) => [id, { label: paths.label, diffuse: paths.diffuse }]));
  for (const [id, prop] of Object.entries(PROP_TYPES)) {
    if (isSharedPropId(id) || !PROP_SHAPES.some(kind => prop.kind === kind) ||
        !("texture" in prop) || !prop.texture || !assetInWorld(id, world) || options.has(prop.texture)) continue;
    options.set(prop.texture, { label: prop.texture, diffuse: textureFolder(prop.texture).diffuse });
  }
  return options;
}

export function onSharedPropsChanged(listener: (ids: ReadonlySet<string>) => void) {
  registryListeners.add(listener);
  return () => { registryListeners.delete(listener); };
}

function install(world: WorldId, next: Map<string, SingleTextureProp>) {
  const before = installed.get(world) ?? new Map();
  const changed = new Set<string>();
  for (const id of before.keys()) {
    if (next.has(id)) continue;
    delete PROP_TYPES[id];
    changed.add(id);
  }
  for (const [id, definition] of next) {
    if (JSON.stringify(before.get(id)) === JSON.stringify(definition)) continue;
    PROP_TYPES[id] = definition;
    changed.add(id);
  }
  installed.set(world, next);
  if (!changed.size) return;
  catalogueVersion++;
  for (const listener of listeners) listener();
  for (const listener of registryListeners) listener(changed);
}

const revisions = (rows: { name: string }[]) => rows.flatMap(({ name }) =>
  /^r[1-9]\d*$/.test(name) ? [Number(name.slice(1))] : []).filter(Number.isSafeInteger).sort((a, b) => b - a);

export async function loadSharedProps(world: WorldId, init?: RequestInit) {
  if (!sharedConfigured) return;
  const version = (loads.get(world) ?? 0) + 1;
  loads.set(world, version);
  const prefix = `${world}/prop`;
  const rows = await listSharedObjects(prefix, init);
  const definitions = await Promise.all(rows.filter(({ name }) => uuidPattern.test(name)).map(async ({ name }) => {
    const path = `${prefix}/${name}`;
    for (const revision of revisions(await listSharedObjects(path, init))) {
      const response = await fetch(`${sharedAssetBase()}${path}/r${revision}/meta.json`, init);
      if (response.status === 400 || response.status === 404) continue;
      if (!response.ok) throw new Error(`Prop asset: HTTP ${response.status}`);
      const metadata = await response.json().catch(() => null);
      if (metadata?.type !== "prop") continue;
      const definition = readDefinition(metadata.definition);
      if (definition?.name?.trim() && definition.texture) return [`${world}_prop_${name}`, definition] as const;
    }
  }));
  if (init?.signal?.aborted || loads.get(world) !== version) return;
  install(world, new Map(definitions.filter(row => row !== undefined)));
}

export async function publishProp(draft: PropDraft) {
  const definition = readDefinition(draft.definition);
  if (!definition?.name?.trim()) throw new Error(t("assetManager.propDraft.needName"));
  if (!propTextures(draft.world).has(definition.texture)) throw new Error(t("assetManager.propDraft.needTexture"));
  if (!sharedToken()) throw new Error(t("assetManager.err.signInFirst"));
  definition.name = definition.name.trim();
  const path = `${draft.world}/prop/${draft.id.slice(draft.world.length + "_prop_".length)}`;
  const rev = (revisions(await listSharedObjects(path))[0] ?? 0) + 1;
  await sharedUpload(`/storage/v1/object/void-textures/${path}/r${rev}/meta.json`,
    JSON.stringify({ v: 1, type: "prop", rev, definition }), "application/json");
  loads.set(draft.world, (loads.get(draft.world) ?? 0) + 1);
  const next = new Map(installed.get(draft.world));
  next.set(draft.id, definition);
  install(draft.world, next);
  discardPropDraft(draft.id);
}
