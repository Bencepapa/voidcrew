// Sound zones: areas of a map (a room, a corridor, a hall) that a map author gives one acoustics - how much it echoes, how
// long the echo rings, how soft its surfaces are and how well its walls shut sound in or out. The game plays every sound
// with the acoustics of the zone the listener stands in (src/audio/acoustics.ts, engine.ts). A map with no zones still
// gets an automatic estimate from the size of each room (see audio/acoustics.ts `autoRooms`).
//
// A map file lists them as `acoustics`; the file's values are read here (readZones): numbers are limited, cells off the
// map or in a wall are dropped, a cell in two zones belongs to the later one. Pure: no React, no Web Audio.
import type { CellType } from "./types";

export const ZONE_PRESETS = ["corridor", "room", "hall", "cave", "outdoor", "custom"] as const;
export type ZonePreset = (typeof ZONE_PRESETS)[number];

// What the engine uses for a place: all four 0..1 except the decay (seconds).
export interface Acoustics {
  // how much of every sound comes back as echo (the wet level), 0..1
  reverb: number;
  // seconds the echo takes to die away (RT60: -60 dB)
  decay: number;
  // how much the highs are soaked up, 0..1 (0: bright and hard, 1: dark and soft)
  softness: number;
  // how well the zone's walls dull a sound that comes from outside it (or goes out of it), 0..1
  insulation: number;
}

export const ZONE_LIMITS = {
  reverb: { min: 0, max: 1 },
  decay: { min: 0.1, max: 8 },
  softness: { min: 0, max: 1 },
  insulation: { min: 0, max: 1 },
} as const;

// the presets' values; `custom` starts from the room's
export const PRESETS: Record<Exclude<ZonePreset, "custom">, Acoustics> = {
  corridor: { reverb: 0.35, decay: 0.6, softness: 0.3, insulation: 0.2 },
  room: { reverb: 0.3, decay: 0.5, softness: 0.5, insulation: 0.3 },
  hall: { reverb: 0.6, decay: 2.2, softness: 0.3, insulation: 0.2 },
  cave: { reverb: 0.7, decay: 3.5, softness: 0.75, insulation: 0.1 },
  outdoor: { reverb: 0, decay: 0.1, softness: 0, insulation: 0 },
};

// A row of cells: [y, x0, x1] (x0..x1 inclusive). A zone's cells are a list of them, sorted by row then column.
export type CellRun = [y: number, x0: number, x1: number];

export interface AcousticZone {
  name?: string;
  cells: CellRun[];
  // the preset the values below came from (a value that is not written follows it; none: the room's)
  preset?: ZonePreset;
  reverb?: number;
  decay?: number;
  softness?: number;
  insulation?: number;
  // (runtime only, set by readZones, never written to a file) how many of the file's cells were dropped: off the map or in a wall
  lost?: number;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const limit = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const round = (v: number, digits = 3) => Math.round(v * 10 ** digits) / 10 ** digits;
const ZONE_NAME_MAX = 60;

// ---- cells

export const cellKey = (x: number, y: number) => `${x},${y}`;

// the cells of runs, as [x, y] pairs
export function cellsOfRuns(runs: readonly CellRun[]): [number, number][] {
  const out: [number, number][] = [];
  for (const [y, x0, x1] of runs) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

export function countRunCells(runs: readonly CellRun[]): number {
  let n = 0;
  for (const [, x0, x1] of runs) n += x1 - x0 + 1;
  return n;
}

// Cells ([x, y]) as runs: duplicates gone, sorted by row then column, touching cells joined.
export function runsOfCells(cells: Iterable<readonly [number, number]>): CellRun[] {
  const rows = new Map<number, Set<number>>();
  for (const [x, y] of cells) {
    let row = rows.get(y);
    if (!row) rows.set(y, (row = new Set()));
    row.add(x);
  }
  const runs: CellRun[] = [];
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = [...rows.get(y)!].sort((a, b) => a - b);
    let start = xs[0];
    let prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === prev + 1) {
        prev = xs[i];
        continue;
      }
      runs.push([y, start, prev]);
      start = prev = xs[i];
    }
  }
  return runs;
}

// the "x,y" keys of a zone's cells
export function runKeys(runs: readonly CellRun[]): Set<string> {
  const keys = new Set<string>();
  for (const [x, y] of cellsOfRuns(runs)) keys.add(cellKey(x, y));
  return keys;
}

export function runsOfKeys(keys: Iterable<string>): CellRun[] {
  const cells: [number, number][] = [];
  for (const key of keys) {
    const [x, y] = key.split(",").map(Number);
    cells.push([x, y]);
  }
  return runsOfCells(cells);
}

// ---- reading

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

// A zone as a map file gives it, cleaned, over the cells of a map (`open(x, y)`: a cell on the map that is not a wall).
// A zone that is no object, or has no cells, comes out empty (so the zones keep their places in the list: the editor
// addresses them by index). Every number is limited; a value that is not a number is not kept; `lost` counts the cells
// that were dropped.
export function readZone(raw: unknown, open: (x: number, y: number) => boolean): AcousticZone {
  const empty: AcousticZone = { cells: [] };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const z = raw as Record<string, unknown>;
  const kept: [number, number][] = [];
  let lost = 0;
  if (Array.isArray(z.cells)) {
    for (const run of z.cells) {
      if (!Array.isArray(run) || run.length !== 3 || !run.every(isInt)) continue;
      const [y, a, b] = run as number[];
      const x0 = Math.min(a, b);
      const x1 = Math.max(a, b);
      // (a damaged file can say a run a million cells long)
      if (x1 - x0 > 4096) continue;
      for (let x = x0; x <= x1; x++) {
        if (open(x, y)) kept.push([x, y]);
        else lost++;
      }
    }
  }
  const out: AcousticZone = { cells: runsOfCells(kept) };
  if (typeof z.name === "string" && z.name.trim()) out.name = z.name.trim().slice(0, ZONE_NAME_MAX);
  if ((ZONE_PRESETS as readonly unknown[]).includes(z.preset)) out.preset = z.preset as ZonePreset;
  for (const key of ["reverb", "decay", "softness", "insulation"] as const) {
    const value = z[key];
    if (finite(value)) out[key] = round(limit(value, ZONE_LIMITS[key].min, ZONE_LIMITS[key].max));
  }
  if (lost) out.lost = lost;
  return out;
}

// The whole list of a map file: every zone cleaned, and a cell that two zones both name belongs to the later one only.
export function readZones(raw: unknown, cells: readonly (readonly CellType[])[]): AcousticZone[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const open = (x: number, y: number) => cells[y]?.[x] !== undefined && cells[y][x] !== "wall";
  const zones = raw.map((entry) => readZone(entry, open));
  // (the last one wins: walk backwards and take away what a later zone already has)
  const taken = new Set<string>();
  for (let i = zones.length - 1; i >= 0; i--) {
    const mine: [number, number][] = [];
    for (const [x, y] of cellsOfRuns(zones[i].cells)) {
      const key = cellKey(x, y);
      if (!taken.has(key)) {
        taken.add(key);
        mine.push([x, y]);
      }
    }
    zones[i] = { ...zones[i], cells: runsOfCells(mine) };
  }
  return zones;
}

// ---- values

// What a zone gives its cells: its preset's values (`custom` or none: the room's) with the ones it states itself over them.
export function resolveZone(zone: Pick<AcousticZone, "preset" | "reverb" | "decay" | "softness" | "insulation">): Acoustics {
  const base = PRESETS[zone.preset && zone.preset !== "custom" ? zone.preset : "room"];
  return {
    reverb: zone.reverb ?? base.reverb,
    decay: zone.decay ?? base.decay,
    softness: zone.softness ?? base.softness,
    insulation: zone.insulation ?? base.insulation,
  };
}

// ---- what the editor says of them (see editor/validate.ts)

export interface ZoneProblem {
  code: "zoneEmpty" | "zoneWalls";
  // the first cell of the zone, if it has one
  cell?: { x: number; y: number };
  index: number;
  count?: number;
}

export function zoneProblems(zones: readonly AcousticZone[] | undefined): ZoneProblem[] {
  const out: ZoneProblem[] = [];
  (zones ?? []).forEach((zone, index) => {
    const first = zone.cells[0];
    const cell = first ? { x: first[1], y: first[0] } : undefined;
    if (!zone.cells.length) out.push({ code: "zoneEmpty", index });
    if (zone.lost) out.push({ code: "zoneWalls", index, cell, count: zone.lost });
  });
  return out;
}
