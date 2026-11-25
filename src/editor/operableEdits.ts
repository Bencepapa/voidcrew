import type { MapFile } from "../game/mapFormat";
import { indexInCell, resolveAddress, type Area } from "../game/emitters";
import {
  OPERABLE_PROPS, emittersAt, isAddressed, operableSources, readOperable,
  type OperableKind, type OperableMap, type OperableSpec, type OperableTarget, type RewardItem,
} from "../game/operables";
import type { Vec2 } from "../game/types";

// Edits on the operable props' settings and their links (see game/operables.ts): pure functions on a map file, as
// mapEdits.ts's - `applyEdit` runs them. A source is addressed by where its entry lies in the file: the props' or the
// decals' index.

export type SourceRef = { from: "prop" | "decal"; index: number };

type Entry = { operable?: OperableSpec };
const entryOf = (file: MapFile, ref: SourceRef): Entry | undefined => (ref.from === "prop" ? file.props?.[ref.index] : file.decals?.[ref.index]);

// the entry's block with a change (a setting set to undefined is dropped; an empty block goes altogether)
export function cleanSpec(spec: OperableSpec): OperableSpec | undefined {
  const next = { ...spec } as Record<string, unknown>;
  for (const key of Object.keys(next)) if (next[key] === undefined || (Array.isArray(next[key]) && !(next[key] as unknown[]).length)) delete next[key];
  return Object.keys(next).length ? (next as OperableSpec) : undefined;
}

export function setOperable(file: MapFile, ref: SourceRef, patch: Partial<OperableSpec> | null): MapFile {
  const entry = entryOf(file, ref);
  if (!entry) return file;
  const next = patch === null ? undefined : cleanSpec({ ...entry.operable, ...patch });
  if (next) entry.operable = next;
  else delete entry.operable;
  return file;
}

// a target the source lists already (the same door cell / the same trap / the same address); a reward is always new
const sameTarget = (a: OperableTarget, b: OperableTarget) => {
  if (a.kind !== b.kind) return false;
  if (a.kind === "door") return a.x === (b as typeof a).x && a.y === (b as typeof a).y;
  if (a.kind === "trap") return a.x === (b as typeof a).x && a.y === (b as typeof a).y && a.side === (b as typeof a).side;
  if (a.kind === "reward") return false;
  const o = b as typeof a;
  return a.x === o.x && a.y === o.y && a.index === o.index && a.id === o.id && JSON.stringify(a.area) === JSON.stringify(o.area);
};

export function addTarget(file: MapFile, ref: SourceRef, target: OperableTarget): MapFile {
  const entry = entryOf(file, ref);
  if (!entry) return file;
  const targets = entry.operable?.targets ?? [];
  if (targets.some((t) => sameTarget(t, target))) return file;
  return setOperable(file, ref, { targets: [...targets, target] });
}

export function removeTarget(file: MapFile, ref: SourceRef, index: number): MapFile {
  const targets = entryOf(file, ref)?.operable?.targets;
  if (!targets?.[index]) return file;
  return setOperable(file, ref, { targets: targets.filter((_, i) => i !== index) });
}

// one target's settings changed (a door's action, force, an emitter's action, a reward's credits...)
export function updateTarget(file: MapFile, ref: SourceRef, index: number, patch: Partial<OperableTarget>): MapFile {
  const targets = entryOf(file, ref)?.operable?.targets;
  if (!targets?.[index]) return file;
  const next = readOperable({ targets: targets.map((t, i) => (i === index ? { ...t, ...patch } : t)) })?.targets;
  return setOperable(file, ref, { targets: next ?? [] });
}

// An area (a block of cells picked in the zoomed minimap) as a target: all the emitters / dormant NPCs / dormant items in it.
export function areaTarget(kind: "emitter" | "spawn" | "item", area: Area): OperableTarget {
  return { kind, area: { ...area } };
}

// a reward to put in the list (the editor's "Add a reward")
export const newReward = (): OperableTarget => ({ kind: "reward", credits: 50 });

// the reward's item list changed (an item added, its quantity set, removed): `items` as the form holds them
export const rewardWith = (target: Extract<OperableTarget, { kind: "reward" }>, items: RewardItem[]): Extract<OperableTarget, { kind: "reward" }> => ({ ...target, items });

// What a click in link mode points at, as a target: a door (its cell), a wall trap (the prop pointed at, or any in the cell
// clicked), a smoke / fire emitter, a dormant NPC or a dormant item (what the view picked, by its index in the map). Nothing
// else is a target.
export interface LinkHit {
  door?: Vec2;
  prop?: number;
  cell: Vec2;
  smoke?: number;
  actor?: number;
  item?: number;
}
export function linkTargetFor(map: OperableMap, hit: LinkHit): OperableTarget | undefined {
  const cellIs = (c: Vec2) => map.cells[c.y]?.[c.x] === "door";
  if (hit.door && cellIs(hit.door)) return { kind: "door", x: hit.door.x, y: hit.door.y };
  const at = (list: { cell: Vec2; dormant?: boolean }[] | undefined, i: number | undefined, kind: "emitter" | "spawn" | "item"): OperableTarget | undefined => {
    const spec = i === undefined ? undefined : list?.[i];
    if (!spec || (kind !== "emitter" && !spec.dormant)) return undefined;
    const index = indexInCell(list, i!);
    return { kind, x: spec.cell.x, y: spec.cell.y, ...(index !== undefined ? { index } : {}) };
  };
  const picked = at(map.smokes, hit.smoke, "emitter") ?? at(map.actors, hit.actor, "spawn") ?? at(map.items, hit.item, "item");
  if (picked) return picked;
  if (hit.smoke !== undefined || hit.actor !== undefined || hit.item !== undefined) return undefined;
  if (hit.prop !== undefined) {
    const spec = map.props?.[hit.prop];
    if (spec && OPERABLE_PROPS[spec.prop]?.kind === "emitter") return { kind: "trap", x: spec.cell.x, y: spec.cell.y, ...(["N", "E", "S", "W"].includes(spec.at) ? { side: spec.at as "N" | "E" | "S" | "W" } : {}) };
    return undefined;
  }
  if (cellIs(hit.cell)) return { kind: "door", x: hit.cell.x, y: hit.cell.y };
  const traps = emittersAt(operableSources(map), { x: hit.cell.x, y: hit.cell.y });
  if (traps.length === 1) return { kind: "trap", x: hit.cell.x, y: hit.cell.y, ...(["N", "E", "S", "W"].includes(traps[0].at) ? { side: traps[0].at as "N" | "E" | "S" | "W" } : {}) };
  return undefined;
}

// ---- keeping the targets right when something they address is taken out

type Addressable = "emitter" | "spawn" | "item";
const LIST_OF = { emitter: "smokes", spawn: "actors", item: "items" } as const;

// An emitter, NPC or item is about to be removed from the file (call it BEFORE the splice): the targets that named it by
// its place in its cell (`index`) are fixed - the one that pointed at it is dropped, the ones after it move up. Targets by
// cell alone, by id or by area need nothing (what is left, if nothing, shows up as a warning).
export function fixTargetsBeforeRemove(file: MapFile, kind: Addressable, removed: number): MapFile {
  const list = file[LIST_OF[kind]] as { x: number; y: number }[] | undefined;
  const gone = list?.[removed];
  if (!list || !gone) return file;
  const ordinal = list.slice(0, removed).filter((e) => e.x === gone.x && e.y === gone.y).length;
  const sources = [...(file.props ?? []), ...(file.decals ?? [])] as Entry[];
  for (const entry of sources) {
    const targets = entry.operable?.targets;
    if (!targets?.length) continue;
    const next: OperableTarget[] = [];
    for (const t of targets) {
      if (!isAddressed(t) || t.kind !== kind || t.id || t.area || t.x !== gone.x || t.y !== gone.y || t.index === undefined) {
        next.push(t);
      } else if (t.index === ordinal) {
        continue;
      } else if (t.index > ordinal) {
        next.push({ ...t, index: t.index - 1 });
      } else {
        next.push(t);
      }
    }
    if (next.length !== targets.length || next.some((t, i) => t !== targets[i])) {
      entry.operable = cleanSpec({ ...entry.operable, targets: next });
      if (!entry.operable) delete entry.operable;
    }
  }
  return file;
}

// which of a map's targets address anything (for the panel: a hint on the ones that point nowhere)
export const targetFound = (map: OperableMap, t: OperableTarget): boolean => {
  if (t.kind === "emitter") return resolveAddress(map.smokes, t).length > 0;
  if (t.kind === "spawn") return resolveAddress(map.actors, t, (a) => a.dormant === true).length > 0;
  if (t.kind === "item") return resolveAddress(map.items, t, (it) => it.dormant === true).length > 0;
  return true;
};

// the selected source, as the panel shows it
export interface OperableInfo {
  // where its entry is in the map (the panel's link mode names it)
  source: SourceRef;
  kind: OperableKind;
  spec: OperableSpec;
  // the way a wall trap fires (its facing) is told by the panel
  at: string;
  rotation: number;
  // a wall trap's usual shot (its type's)
  projectile?: "arrow" | "spell";
  // the targets (by their place in the list) that address nothing on the map; only given when the map was
  missing?: number[];
}
// (`map`: the map the source is on, to find the targets that address nothing)
const withMissing = (info: OperableInfo, map?: OperableMap): OperableInfo => {
  const missing = map ? (info.spec.targets ?? []).flatMap((t, i) => (targetFound(map, t) ? [] : [i])) : [];
  return missing.length ? { ...info, missing } : info;
};
export function operableInfo(spec: { prop: string; at: string; rotation?: number; operable?: OperableSpec }, index: number, map?: OperableMap): OperableInfo | undefined {
  const type = Object.hasOwn(OPERABLE_PROPS, spec.prop) ? OPERABLE_PROPS[spec.prop] : undefined;
  return type
    ? withMissing({ source: { from: "prop", index }, kind: type.kind, spec: spec.operable ?? {}, at: spec.at, rotation: spec.rotation ?? 0, ...(type.projectile ? { projectile: type.projectile } : {}) }, map)
    : undefined;
}
// a decal that works as a lever or button (undefined: it is only a picture)
export function decalOperableInfo(spec: { operable?: OperableSpec }, index: number, map?: OperableMap): OperableInfo | undefined {
  return spec.operable ? withMissing({ source: { from: "decal", index }, kind: spec.operable.kind ?? "button", spec: spec.operable, at: "", rotation: 0 }, map) : undefined;
}
