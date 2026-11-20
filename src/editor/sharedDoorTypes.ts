import { useSyncExternalStore } from "react";
import { DOOR_MOTIONS, isDoorTypeId, type DoorType } from "../game/doorTypes";
import { assetInWorld, type WorldId } from "../game/worlds";
import { TEXTURE_SETS } from "../render/textureSets";
import { loadHeightGrid } from "../render/reliefMesh";
import { t } from "../i18n";
import { sharedConfigured, sharedToken } from "./sharedAuth";
import { loadDefinitions, publishDefinition } from "./sharedDefinitions";
import { textureStatus } from "./textureLibrary";
import { isPropTexture } from "./textureDrafts";

export interface DoorDraft { id: string; world: WorldId; definition: DoorType }

function readDoorType(raw: unknown): DoorType | undefined {
  if (!raw || typeof raw !== "object") return;
  const value = raw as Partial<DoorType>;
  if (typeof value.name !== "string" || typeof value.leaf !== "string" || typeof value.frame !== "string" ||
      !/^[a-z0-9_-]+$/i.test(value.leaf) || !/^[a-z0-9_-]+$/i.test(value.frame) ||
      !value.motion || !DOOR_MOTIONS.includes(value.motion)) return;
  return {
    name: value.name.slice(0, 100),
    leaf: value.leaf,
    frame: value.frame,
    motion: value.motion,
    hinge: value.hinge === "right" ? "right" : "left",
    swingTo: value.swingTo === "back" ? "back" : "front",
    angle: Number.isFinite(value.angle) ? Math.max(45, Math.min(140, value.angle ?? 90)) : 90,
  };
}

const storageKey = "voidcrew:door-drafts";
function readDrafts(): DoorDraft[] {
  try {
    const rows = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as DoorDraft[];
    return rows.flatMap(row => {
      const definition = readDoorType(row?.definition);
      return definition && (row.world === "scifi" || row.world === "fantasy") &&
        typeof row.id === "string" && isDoorTypeId(row.id) && row.id.startsWith(row.world + "_")
        ? [{ id: row.id, world: row.world, definition }] : [];
    });
  } catch { return []; }
}

let drafts = readDrafts();
let catalog: readonly DoorDraft[] = [];
const installed = new Map<WorldId, Map<string, DoorType>>();
const loads = new Map<WorldId, number>();
const listeners = new Set<() => void>();
const changeListeners = new Set<(ids: ReadonlySet<string>) => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const emit = () => { for (const listener of listeners) listener(); };
export const getDoorDrafts = () => drafts;
export const useDoorDrafts = () => useSyncExternalStore(subscribe, getDoorDrafts);
export const useDoorCatalog = () => useSyncExternalStore(subscribe, () => catalog);
export const doorType = (id: string | undefined) => id ? catalog.find(entry => entry.id === id)?.definition : undefined;
export function onSharedDoorsChanged(listener: (ids: ReadonlySet<string>) => void) {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
}

function saveDrafts(next: DoorDraft[]) {
  localStorage.setItem(storageKey, JSON.stringify(next));
  drafts = next;
  emit();
}
export function saveDoorDraft(draft: DoorDraft) {
  saveDrafts(drafts.some(row => row.id === draft.id) ? drafts.map(row => row.id === draft.id ? draft : row) : [...drafts, draft]);
}
export function discardDoorDraft(id: string) {
  saveDrafts(drafts.filter(row => row.id !== id));
}
export function createDoorDraft(world: WorldId) {
  const fantasy = world === "fantasy";
  const draft: DoorDraft = {
    id: `${world}_door_${crypto.randomUUID()}`, world,
    definition: {
      name: "", leaf: fantasy ? "fantasygate1" : "door1", frame: fantasy ? "fantasydoorframe1" : "doorframe1",
      motion: fantasy ? "rise" : "slide", hinge: "left", swingTo: "front", angle: 90,
    },
  };
  saveDoorDraft(draft);
  return draft;
}

export function doorTextureOptions(world: WorldId) {
  return Object.entries(TEXTURE_SETS).filter(([id, paths]) =>
    id !== "sky" && assetInWorld(id, world) && textureStatus(id) !== "new" &&
    !(id.startsWith(world + "_shared_") && isPropTexture([paths.kind].flat())) &&
    [paths.kind].flat().some(kind => kind === "door" || kind === "wall" || kind === "propFace"));
}

function install(world: WorldId, next: Map<string, DoorType>) {
  const before = installed.get(world) ?? new Map();
  installed.set(world, next);
  const ids = new Set([...before.keys(), ...next.keys()]);
  const changed = new Set([...ids].filter(id => JSON.stringify(before.get(id)) !== JSON.stringify(next.get(id))));
  if (!changed.size) return;
  catalog = [...installed].flatMap(([world, rows]) => [...rows].map(([id, definition]) => ({ id, world, definition })));
  emit();
  for (const listener of changeListeners) listener(changed);
}

export async function loadSharedDoors(world: WorldId, init?: RequestInit) {
  if (!sharedConfigured) return;
  const version = (loads.get(world) ?? 0) + 1;
  loads.set(world, version);
  const next = await loadDefinitions(world, "door", raw => {
    const definition = readDoorType(raw);
    return definition?.name.trim() ? definition : undefined;
  }, init);
  if (!init?.signal?.aborted && loads.get(world) === version) install(world, next);
}

export async function publishDoor(draft: DoorDraft) {
  const definition = readDoorType(draft.definition);
  if (!definition?.name.trim()) throw new Error(t("assetManager.doorType.needName"));
  const textures = new Map(doorTextureOptions(draft.world));
  if (!textures.has(definition.leaf) || !textures.has(definition.frame)) throw new Error(t("assetManager.doorType.needTextures"));
  if (!sharedToken()) throw new Error(t("assetManager.err.signInFirst"));
  const frame = textures.get(definition.frame)!;
  const maps = await Promise.all([loadHeightGrid(frame.depth), loadHeightGrid(frame.diffuse)]);
  if (maps.some(map => map.solid?.[Math.floor(map.height / 2) * map.width + Math.floor(map.width / 2)] !== 0)) {
    throw new Error(t("assetManager.doorType.needOpening"));
  }
  definition.name = definition.name.trim();
  await publishDefinition(draft.world, "door", draft.id, definition);
  const next = new Map(installed.get(draft.world));
  next.set(draft.id, definition);
  loads.set(draft.world, (loads.get(draft.world) ?? 0) + 1);
  install(draft.world, next);
  discardDoorDraft(draft.id);
}
