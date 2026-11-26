import { useSyncExternalStore } from "react";
import { isSharedPropId, PROP_TYPES, type EditableProp } from "../game/props";
import { prismInset, prismSides } from "../game/propPrism";
import { bundledDefinitions } from "../game/sharedBuiltins";
import { definitionIdOk } from "../game/sharedContent";
import { assetInWorld, assetWorld, type WorldId } from "../game/worlds";
import { t } from "../i18n";
import { isTextureSetId, TEXTURE_SETS, textureFolder } from "../render/textureSets";
import { propOwnTextureId } from "./channelEditor";
import { sharedConfigured, sharedToken } from "./sharedAuth";
import { loadDefinitions, publishDefinition } from "./sharedDefinitions";
import { textureStatus } from "./textureLibrary";
import { loadSharedTexturesById, patchSharedTexture, publishTextureRevision } from "./sharedTextures";
import { discardDraft, draftById, draftsReady, isPropTexture, newDraft } from "./textureDrafts";

export const PROP_SHAPES = ["panel", "billboard", "cross", "prism"] as const;

export interface PropDraft {
  id: string;
  world: WorldId;
  definition: EditableProp;
}

const storageKey = "voidcrew:prop-drafts";
const texturePattern = /^[a-z0-9_-]+$/i;
const bound = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

function readDefinition(raw: Partial<EditableProp> | null | undefined): EditableProp | undefined {
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
    ...(raw.kind === "prism" ? {
      sides: prismSides(raw.sides),
      inset: prismInset(raw.inset),
      textureB: typeof raw.textureB === "string" && texturePattern.test(raw.textureB) ? raw.textureB : undefined,
    } : {}),
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
const installed = new Map<WorldId, Map<string, EditableProp>>();
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

export function createPropDraft(world: WorldId, kind: EditableProp["kind"], texture = "") {
  const draft: PropDraft = {
    id: `${world}_prop_${crypto.randomUUID()}`,
    world,
    definition: { name: "", kind, texture, size: [.6, .6, .15], elevation: 0, relief: 1, wall: false, blocks: false },
  };
  savePropDraft(draft);
  return draft;
}

// Give the prop's private texture a stable ID across reloads and partial publishes.
export const propTextureId = propOwnTextureId;

export function reviseSharedProp(id: string) {
  const world = assetWorld(id);
  const definition = installed.get(world)?.get(id);
  if (definition && !drafts.some(draft => draft.id === id)) savePropDraft({ id, world, definition });
}

export async function attachPropTexture(draft: PropDraft) {
  await draftsReady;
  if (!drafts.some(row => row.id === draft.id)) return;
  const id = propTextureId(draft.id);
  if (!draftById(id) && !isTextureSetId(id)) {
    await newDraft(draft.world, draft.definition.name || t("assetManager.propDraft.ownTexture"), {
      uuid: draft.id.slice((draft.world + "_prop_").length), kinds: ["propFace"],
    });
  }
  const latest = drafts.find(row => row.id === draft.id);
  if (latest) savePropDraft({ ...latest, definition: { ...latest.definition, texture: id } });
}

export async function discardPropDraft(id: string) {
  const next = drafts.filter(row => row.id !== id);
  localStorage.setItem(storageKey, JSON.stringify(next));
  drafts = next;
  for (const listener of listeners) listener();
  await draftsReady;
  const texture = draftById(propTextureId(id));
  if (texture) await discardDraft(texture.uuid);
}

export function propTextures(world: WorldId) {
  const sets = Object.entries(TEXTURE_SETS).filter(([id, paths]) => id !== "sky" && assetInWorld(id, world) &&
    textureStatus(id) !== "new" && !(id.startsWith(world + "_shared_") && isPropTexture([paths.kind].flat())));
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

function install(world: WorldId, next: Map<string, EditableProp>) {
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

const usable = (raw: unknown) => {
  const definition = readDefinition(raw as Partial<EditableProp>);
  return definition?.name?.trim() && definition.texture ? definition : undefined;
};

// The props `npm run pull:shared` put into the release; the store's newer ones replace them by id.
function bundledProps(world: WorldId) {
  const rows = Object.entries(bundledDefinitions.prop).flatMap(([id, { definition }]) => {
    const prop = definitionIdOk(world, "prop", id) ? usable(definition) : undefined;
    return prop ? [[id, prop] as const] : [];
  });
  return new Map(rows);
}

export function installBundledProps() {
  for (const world of ["scifi", "fantasy"] as const) {
    const rows = bundledProps(world);
    if (rows.size) install(world, rows);
  }
}

export async function loadSharedProps(world: WorldId, init?: RequestInit) {
  if (!sharedConfigured) return;
  const version = (loads.get(world) ?? 0) + 1;
  loads.set(world, version);
  const definitions = await loadDefinitions(world, "prop", usable, init);
  if (init?.signal?.aborted || loads.get(world) !== version) return;
  install(world, new Map([...bundledProps(world), ...definitions]));
}

// Just these props (asset ids of one world), by their own folders: what a map references, for a guest.
// Adds to what is installed; the other props of the store stay unknown.
export async function loadSharedPropsById(world: WorldId, ids: ReadonlySet<string>, init?: RequestInit) {
  if (!sharedConfigured || !ids.size) return;
  const definitions = await loadDefinitions(world, "prop", usable, init, ids);
  if (init?.signal?.aborted) return;
  install(world, new Map([...(installed.get(world) ?? bundledProps(world)), ...definitions]));
}

export async function publishProp(draft: PropDraft) {
  const definition = readDefinition(draft.definition);
  if (!definition?.name?.trim()) throw new Error(t("assetManager.propDraft.needName"));
  if (!sharedToken()) throw new Error(t("assetManager.err.signInFirst"));
  definition.name = definition.name.trim();
  if (definition.kind === "prism" && definition.textureB && !propTextures(draft.world).has(definition.textureB)) {
    throw new Error(t("assetManager.propDraft.needTextureB"));
  }
  if (definition.texture === propTextureId(draft.id)) {
    await draftsReady;
    const texture = draftById(definition.texture);
    if (texture) {
      if (!texture.maps.diffuse.blob) throw new Error(t("assetManager.required"));
      const published = await publishTextureRevision({ ...texture, name: definition.name }, (d, theirs) =>
        window.confirm(t("assetManager.conflict", { name: definition.name!, theirs, mine: d.baseRev })));
      if (!published) return;
      patchSharedTexture(published);
      await discardDraft(texture.uuid);
    } else {
      if (!isTextureSetId(definition.texture)) await loadSharedTexturesById([definition.texture]);
      if (!isTextureSetId(definition.texture)) throw new Error(t("assetManager.propDraft.needTexture"));
    }
  } else if (!propTextures(draft.world).has(definition.texture)) {
    throw new Error(t("assetManager.propDraft.needTexture"));
  }
  await publishDefinition(draft.world, "prop", draft.id, definition);
  loads.set(draft.world, (loads.get(draft.world) ?? 0) + 1);
  const next = new Map(installed.get(draft.world));
  next.set(draft.id, definition);
  install(draft.world, next);
  await discardPropDraft(draft.id);
}
