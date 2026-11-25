// Room acoustics, worked out from the map alone (no Web Audio, no DOM: tested in acoustics.test.ts). Two sources:
//
//  - the map's own sound zones (game/acousticZones.ts): the author states how a room echoes;
//  - an automatic estimate for everything else: `autoRooms` finds the rooms (the open cells that walls and doors shut
//    in) and `estimateReverb` works out how long each one rings by the Sabine formula.
//
// `zoneAt(map, x, y)` is the one answer the engine asks: the acoustics of a cell, from its zone if it has one, else from
// its room.
//
// Sabine: RT60 = 0.161 * V / A, the seconds a sound takes to die away by 60 dB in a room of volume V (m^3) and total
// absorption A (m^2 of a perfectly absorbing surface). A = sum of surface x absorption coefficient. The map is in cells;
// a cell is CELL_M metres across and a wall height (the unit of the floors and ceilings) is WALL_M metres: so a plain
// 5 x 5 cell room is 10 x 10 m and 3 m tall (V = 300 m^3). Surfaces take ALPHA_MIN..ALPHA_MAX of the sound that hits them
// (the softer the room, the more); an open door takes DOOR_ALPHA, a doorway with nothing in it and the open sky take it all.
import type { GameMap } from "../game/types";
import { PRESETS, resolveZone, runsOfCells, type Acoustics, type CellRun, type ZonePreset } from "../game/acousticZones";

export { PRESETS };
export type { Acoustics };

export const CELL_M = 2;
export const WALL_M = 3;
export const SABINE = 0.161;
// the surfaces' absorption (a hard, bare room .. a soft, furnished one); the room's softness (0..1) moves between them
export const ALPHA_MIN = 0.15;
export const ALPHA_MAX = 0.3;
// a door: part way between a wall and an opening
export const DOOR_ALPHA = 0.5;
// the softness an automatic room is taken to have
export const AUTO_SOFTNESS = 0.4;
// an echo is never shorter or longer than this (seconds)
export const RT_MIN = 0.15;
export const RT_MAX = 6;
// a room whose ceiling is mostly sky, or that is mostly doorway, has no echo at all
export const OUTDOOR_SKY = 0.5;
export const OUTDOOR_OPEN = 0.75;

export type AcousticMap = Pick<GameMap, "width" | "height" | "cells" | "floorHeights" | "ceilingHeights" | "acoustics" | "ceilingTextureAt" | "textures">;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// ---- the numbers of a room

export interface RoomMetrics {
  // the open cells it takes
  cells: number;
  // m^3: the cells' floor area times their height
  volume: number;
  // the heights of its cells on average, in wall heights
  meanHeight: number;
  // m^2 of: floor and ceiling not under sky, walls (all "hard": they take ALPHA)
  hard: number;
  // m^2 of doors in its walls
  doors: number;
  // m^2 that is open: the sky above it and gaps to cells that are not in it (a selection that cuts a room)
  open: number;
  // the sky's share of its ceiling, 0..1
  skyShare: number;
  // the share of its boundary that is not wall (doors and gaps), 0..1
  openness: number;
}

export const isSky = (map: Pick<AcousticMap, "ceilingTextureAt" | "textures">, x: number, y: number) => (map.ceilingTextureAt?.(x, y) ?? map.textures?.ceiling) === "sky";
const isOpenCell = (map: AcousticMap, x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.cells[y][x] !== "wall";

const SIDES: readonly [number, number][] = [
  [-1, 0],
  [0, -1],
  [1, 0],
  [0, 1],
];

// The metrics of any set of cells ([x, y]). What borders the set decides its surfaces: a wall (or the map's edge) is a
// wall, a door a door, any other open cell is a gap.
export function measureCells(map: AcousticMap, cells: readonly (readonly [number, number])[]): RoomMetrics {
  const inside = new Set(cells.map(([x, y]) => `${x},${y}`));
  let volume = 0;
  let heights = 0;
  let hard = 0;
  let doors = 0;
  let open = 0;
  let skyCells = 0;
  let walls = 0;
  let doorEdges = 0;
  let gapEdges = 0;
  const flat = CELL_M * CELL_M;
  for (const [x, y] of cells) {
    const h = Math.max(0.25, (map.ceilingHeights[y]?.[x] ?? 1) - (map.floorHeights[y]?.[x] ?? 0));
    volume += flat * h * WALL_M;
    heights += h;
    // (the floor is hard; the ceiling is hard too, unless there is sky above)
    hard += flat;
    if (isSky(map, x, y)) {
      skyCells++;
      open += flat;
    } else hard += flat;
    for (const [dx, dy] of SIDES) {
      const nx = x + dx;
      const ny = y + dy;
      if (inside.has(`${nx},${ny}`)) continue;
      const side = CELL_M * h * WALL_M;
      if (!isOpenCell(map, nx, ny)) {
        hard += side;
        walls++;
      } else if (map.cells[ny][nx] === "door") {
        doors += CELL_M * Math.min(h, 1) * WALL_M;
        hard += CELL_M * Math.max(0, h - 1) * WALL_M;
        doorEdges++;
      } else {
        open += side;
        gapEdges++;
      }
    }
  }
  const n = Math.max(1, cells.length);
  const boundary = walls + doorEdges + gapEdges;
  return {
    cells: cells.length,
    volume,
    meanHeight: heights / n,
    hard,
    doors,
    open,
    skyShare: skyCells / n,
    openness: boundary ? (doorEdges + gapEdges) / boundary : 0,
  };
}

// ---- the echo of a room

// RT60 (seconds) by Sabine's formula: the volume (m^3) and the total absorption (m^2)
export const rt60 = (volume: number, absorption: number) => (absorption > 0 ? (SABINE * volume) / absorption : RT_MAX);

// the surfaces' absorption coefficient for a softness 0..1
export const alphaOf = (softness: number) => ALPHA_MIN + (ALPHA_MAX - ALPHA_MIN) * clamp(softness, 0, 1);

export const isOutdoor = (m: RoomMetrics) => m.skyShare >= OUTDOOR_SKY || m.openness >= OUTDOOR_OPEN;

// the wet level an automatic room gets for its decay: a mild echo (the author's zones say more)
export const autoReverbAmount = (decay: number) => clamp(0.12 + 0.1 * decay, 0.12, 0.45);

export interface RoomEstimate {
  acoustics: Acoustics;
  // no echo at all: open sky or a room that is mostly doorway
  outdoor: boolean;
  // the Sabine value before it was limited to RT_MIN..RT_MAX
  raw: number;
}

// The echo of a room: its decay by Sabine over its surfaces (limited to 0.15..6 s) and a mild wet level; none for the
// open air. `softness` (0..1) is how much its surfaces soak up.
export function estimateReverb(room: RoomMetrics, softness = AUTO_SOFTNESS): RoomEstimate {
  const alpha = alphaOf(softness);
  const absorption = room.hard * alpha + room.doors * DOOR_ALPHA + room.open;
  const raw = rt60(room.volume, absorption);
  if (isOutdoor(room)) return { acoustics: { reverb: 0, decay: PRESETS.outdoor.decay, softness, insulation: 0 }, outdoor: true, raw };
  const decay = Math.round(clamp(raw, RT_MIN, RT_MAX) * 100) / 100;
  // (a room with a lot of door in it echoes less of what is in it)
  const reverb = Math.round(autoReverbAmount(decay) * (1 - 0.5 * room.openness) * 1000) / 1000;
  return { acoustics: { reverb, decay, softness, insulation: 0 }, outdoor: false, raw };
}

// ---- finding the rooms

export interface Room extends RoomMetrics {
  id: number;
  estimate: RoomEstimate;
}

export interface RoomMap {
  rooms: Room[];
  // per cell (y * width + x): the room's id, or -1 for a wall and a door
  roomAt: Int32Array;
}

const roomCache = new WeakMap<AcousticMap, RoomMap>();

// The rooms of a map: the connected areas of open cells (four neighbours) that walls and doors bound. A door cell is the
// border between two rooms and belongs to neither (see zoneAt for the room a sound in a doorway is given). Cached for
// the map object.
export function autoRooms(map: AcousticMap): RoomMap {
  const cached = roomCache.get(map);
  if (cached) return cached;
  const { width, height } = map;
  const roomAt = new Int32Array(width * height).fill(-1);
  const seen = new Uint8Array(width * height);
  const rooms: Room[] = [];
  const plain = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && map.cells[y][x] === "floor";
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (seen[y * width + x] || !plain(x, y)) continue;
      const cells: [number, number][] = [[x, y]];
      seen[y * width + x] = 1;
      for (let i = 0; i < cells.length; i++) {
        const [cx, cy] = cells[i];
        for (const [dx, dy] of SIDES) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!plain(nx, ny) || seen[ny * width + nx]) continue;
          seen[ny * width + nx] = 1;
          cells.push([nx, ny]);
        }
      }
      const id = rooms.length;
      for (const [cx, cy] of cells) roomAt[cy * width + cx] = id;
      const metrics = measureCells(map, cells);
      rooms.push({ id, ...metrics, estimate: estimateReverb(metrics) });
    }
  }
  const result = { rooms, roomAt };
  roomCache.set(map, result);
  return result;
}

// ---- the acoustics of a cell

export interface Place {
  acoustics: Acoustics;
  // where it came from: the map's zone, the automatic estimate of the room, or nowhere (a wall)
  source: "zone" | "auto" | "none";
  // tells two places apart (the engine does not change over for a place that is the same)
  key: string;
  name?: string;
  // a zone's preset, or "auto"
  preset?: ZonePreset | "auto";
  // the zone's index in the map's list
  zone?: number;
  room?: number;
}

export const NO_PLACE: Place = { acoustics: { reverb: 0, decay: RT_MIN, softness: 0, insulation: 0 }, source: "none", key: "none" };

const zoneCache = new WeakMap<AcousticMap, Int16Array>();

// per cell: the index + 1 of the zone that has it (the last one wins), or 0
export function zoneIndex(map: AcousticMap): Int16Array {
  let index = zoneCache.get(map);
  if (!index) {
    index = new Int16Array(map.width * map.height);
    (map.acoustics ?? []).forEach((zone, i) => {
      for (const [y, x0, x1] of zone.cells) {
        if (y < 0 || y >= map.height) continue;
        for (let x = Math.max(0, x0); x <= Math.min(map.width - 1, x1); x++) index![y * map.width + x] = i + 1;
      }
    });
    zoneCache.set(map, index);
  }
  return index;
}

// The acoustics of the cell (x, y): the zone it is in, else its room's estimate. A door's cell with no zone of its own
// takes the first neighbour (west, north, east, south) that is a room.
export function zoneAt(map: AcousticMap, x: number, y: number, depth = 0): Place {
  if (!isOpenCell(map, x, y)) return NO_PLACE;
  const zi = zoneIndex(map)[y * map.width + x];
  if (zi > 0) {
    const zone = map.acoustics![zi - 1];
    return { acoustics: resolveZone(zone), source: "zone", key: `zone:${zi - 1}`, name: zone.name, preset: zone.preset ?? "room", zone: zi - 1 };
  }
  if (map.cells[y][x] === "door") {
    if (depth > 0) return NO_PLACE;
    for (const [dx, dy] of SIDES) {
      const around = zoneAt(map, x + dx, y + dy, 1);
      if (around.source !== "none" && map.cells[y + dy][x + dx] !== "door") return around;
    }
    return NO_PLACE;
  }
  const { rooms, roomAt } = autoRooms(map);
  const id = roomAt[y * map.width + x];
  if (id < 0) return NO_PLACE;
  return { acoustics: rooms[id].estimate.acoustics, source: "auto", key: `room:${id}`, preset: "auto", room: id };
}

// ---- what the editor shows of a selection

export interface AreaEstimate {
  cells: number;
  volume: number;
  acoustics: Acoustics;
  outdoor: boolean;
}

// the automatic estimate of any area (the editor's "Automatic value" line)
export function estimateArea(map: AcousticMap, runs: readonly CellRun[], softness = AUTO_SOFTNESS): AreaEstimate {
  const cells: [number, number][] = [];
  for (const [y, x0, x1] of runs) for (let x = x0; x <= x1; x++) if (isOpenCell(map, x, y) && map.cells[y][x] !== "door") cells.push([x, y]);
  const metrics = measureCells(map, cells);
  const estimate = estimateReverb(metrics, softness);
  return { cells: cells.length, volume: Math.round(metrics.volume), acoustics: estimate.acoustics, outdoor: estimate.outdoor };
}

// The area the cell (x, y) is in, as the rooms are found: its connected open cells (doors and walls bound it), as runs.
// Empty for a wall or a door.
export function connectedArea(map: AcousticMap, x: number, y: number): CellRun[] {
  const { roomAt } = autoRooms(map);
  if (!isOpenCell(map, x, y)) return [];
  const id = roomAt[y * map.width + x];
  if (id < 0) return [];
  const cells: [number, number][] = [];
  for (let cy = 0; cy < map.height; cy++) for (let cx = 0; cx < map.width; cx++) if (roomAt[cy * map.width + cx] === id) cells.push([cx, cy]);
  return runsOfCells(cells);
}
