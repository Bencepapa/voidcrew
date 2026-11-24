import type { MapFile } from "../game/mapFormat";
import { OPERABLE_PROPS, emittersAt, operableSources, readOperable, type OperableKind, type OperableMap, type OperableSpec, type OperableTarget } from "../game/operables";
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

// a target the source lists already (the same door cell / the same trap)
const sameTarget = (a: OperableTarget, b: OperableTarget) => a.kind === b.kind && a.x === b.x && a.y === b.y && (a.kind !== "trap" || a.side === (b as typeof a).side);

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

// one target's settings changed (a door's action, force)
export function updateTarget(file: MapFile, ref: SourceRef, index: number, patch: Partial<OperableTarget>): MapFile {
  const targets = entryOf(file, ref)?.operable?.targets;
  if (!targets?.[index]) return file;
  const next = readOperable({ targets: targets.map((t, i) => (i === index ? { ...t, ...patch } : t)) })?.targets;
  return setOperable(file, ref, { targets: next ?? [] });
}

// What a click in link mode points at, as a target: a door (its cell) or a wall trap (the prop pointed at, or any in the
// cell clicked). Nothing else is a target.
export function linkTargetFor(map: OperableMap, hit: { door?: Vec2; prop?: number; cell: Vec2 }): OperableTarget | undefined {
  const cellIs = (c: Vec2) => map.cells[c.y]?.[c.x] === "door";
  if (hit.door && cellIs(hit.door)) return { kind: "door", x: hit.door.x, y: hit.door.y };
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
}
export function operableInfo(spec: { prop: string; at: string; rotation?: number; operable?: OperableSpec }, index: number): OperableInfo | undefined {
  const type = Object.hasOwn(OPERABLE_PROPS, spec.prop) ? OPERABLE_PROPS[spec.prop] : undefined;
  return type
    ? { source: { from: "prop", index }, kind: type.kind, spec: spec.operable ?? {}, at: spec.at, rotation: spec.rotation ?? 0, ...(type.projectile ? { projectile: type.projectile } : {}) }
    : undefined;
}
// a decal that works as a lever or button (undefined: it is only a picture)
export function decalOperableInfo(spec: { operable?: OperableSpec }, index: number): OperableInfo | undefined {
  return spec.operable ? { source: { from: "decal", index }, kind: spec.operable.kind ?? "button", spec: spec.operable, at: "", rotation: 0 } : undefined;
}
