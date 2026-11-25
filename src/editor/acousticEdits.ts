// Edits on a map file's sound zones (see game/acousticZones.ts and mapStore.applyEdit): each changes the file it is given.
// A cell is in at most one zone, so what a zone takes, the others lose. A zone that has lost all its cells stays (the
// problems list says so) - the editor addresses zones by their place in the list.
import type { MapFile } from "../game/mapFormat";
import {
  PRESETS,
  ZONE_LIMITS,
  resolveZone,
  runKeys,
  runsOfCells,
  runsOfKeys,
  type AcousticZone,
  type CellRun,
  type ZonePreset,
} from "../game/acousticZones";

type ZoneValues = Pick<AcousticZone, "reverb" | "decay" | "softness" | "insulation">;
const VALUE_KEYS = ["reverb", "decay", "softness", "insulation"] as const;

const limit = (key: (typeof VALUE_KEYS)[number], v: number) => Math.round(Math.max(ZONE_LIMITS[key].min, Math.min(ZONE_LIMITS[key].max, v)) * 1000) / 1000;

// the zone list of a file, written back (no list at all when there is none)
function put(file: MapFile, zones: AcousticZone[]) {
  if (zones.length) file.acoustics = zones;
  else delete file.acoustics;
}

// what a zone loses when its cells are named elsewhere: the cells (as "x,y" keys) taken out of every zone but `except`
function takeFromOthers(file: MapFile, keys: ReadonlySet<string>, except: number) {
  (file.acoustics ?? []).forEach((zone, i) => {
    if (i === except) return;
    const mine = runKeys(zone.cells);
    let changed = false;
    for (const key of keys) changed = mine.delete(key) || changed;
    if (changed) zone.cells = runsOfKeys(mine);
  });
}

// A new zone over the cells (a preset's room unless told): the cells leave any other zone. Returns its index.
export function createZone(file: MapFile, cells: readonly CellRun[], init: Partial<AcousticZone> = {}): number {
  const zones = file.acoustics ?? [];
  const index = zones.length;
  const keys = runKeys(cells);
  takeFromOthers(file, keys, -1);
  const zone: AcousticZone = { ...init, cells: runsOfKeys(keys), preset: init.preset ?? "room" };
  delete zone.lost;
  put(file, [...(file.acoustics ?? []), zone]);
  return index;
}

export function removeZone(file: MapFile, index: number): MapFile {
  if (!file.acoustics?.[index]) return file;
  file.acoustics.splice(index, 1);
  put(file, file.acoustics);
  return file;
}

// Cells added to a zone (they leave the others), or taken off it.
export function addZoneCells(file: MapFile, index: number, cells: readonly CellRun[]): MapFile {
  const zone = file.acoustics?.[index];
  if (!zone) return file;
  const keys = runKeys(cells);
  takeFromOthers(file, keys, index);
  const mine = runKeys(zone.cells);
  for (const key of keys) mine.add(key);
  zone.cells = runsOfKeys(mine);
  return file;
}

export function removeZoneCells(file: MapFile, index: number, cells: readonly CellRun[]): MapFile {
  const zone = file.acoustics?.[index];
  if (!zone) return file;
  const mine = runKeys(zone.cells);
  for (const key of runKeys(cells)) mine.delete(key);
  zone.cells = runsOfKeys(mine);
  return file;
}

// The zone's name (empty: taken off).
export function renameZone(file: MapFile, index: number, name: string): MapFile {
  const zone = file.acoustics?.[index];
  if (!zone) return file;
  const trimmed = name.trim().slice(0, 60);
  if (trimmed) zone.name = trimmed;
  else delete zone.name;
  return file;
}

// A preset chosen: its four numbers are written to the zone (so they can be moved from there), `custom` keeps the numbers
// it has - written out too, so a hand edit of the preset table later does not move them.
export function setZonePreset(file: MapFile, index: number, preset: ZonePreset): MapFile {
  const zone = file.acoustics?.[index];
  if (!zone) return file;
  const values = preset === "custom" ? resolveZone(zone) : PRESETS[preset];
  zone.preset = preset;
  for (const key of VALUE_KEYS) zone[key] = limit(key, values[key]);
  return file;
}

// One or more numbers of a zone changed: it is a custom zone from then on (its other numbers stay as they were heard).
export function setZoneValues(file: MapFile, index: number, patch: ZoneValues): MapFile {
  const zone = file.acoustics?.[index];
  if (!zone) return file;
  const now = resolveZone(zone);
  for (const key of VALUE_KEYS) zone[key] = limit(key, patch[key] ?? now[key]);
  zone.preset = "custom";
  return file;
}

// What a change to the cells (a wall built, the area cleared) does to the zones: the cells leave them.
export function clearZoneCells(file: MapFile, cells: readonly { x: number; y: number }[]): MapFile {
  if (!file.acoustics?.length || !cells.length) return file;
  const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
  takeFromOthers(file, keys, -1);
  return file;
}

// Everything moved by (dx, dy) cells - the grid grew or shrank at its north or west edge (a cell that falls off is gone).
export function shiftZones(file: MapFile, dx: number, dy: number): MapFile {
  if (!file.acoustics?.length) return file;
  for (const zone of file.acoustics) {
    const moved: [number, number][] = [];
    for (const [y, x0, x1] of zone.cells) {
      for (let x = x0; x <= x1; x++) if (x + dx >= 0 && y + dy >= 0) moved.push([x + dx, y + dy]);
    }
    zone.cells = runsOfCells(moved);
  }
  return file;
}
