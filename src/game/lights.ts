import { cellAt } from "./map";
import { DIR_VECTOR } from "./movement";
import type { Direction, GameMap } from "./types";

export type LightKind = "ceiling" | "floorGlow" | "wallGlow";

export interface LightSpec {
  kind: LightKind;
  // world position in grid units (x = column, z = row, cell centers on integers)
  x: number;
  z: number;
  // height as a fraction of the wall height
  elevation: number;
  color: number;
  intensity: number;
  // light range in world units (three.js PointLight `distance`)
  range: number;
  // the wall a floor/wall glow sits against
  wall?: Direction;
}

const DIRECTIONS = Object.keys(DIR_VECTOR) as Direction[];

// Deterministic PRNG (mulberry32) seeded from the map name, so "random"
// placement stays the same on every load instead of reshuffling.
function seededRandom(seedText: string): () => number {
  let seed = 0;
  for (const ch of seedText) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], count: number, random: () => number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return out;
}

function adjacentWalls(map: GameMap, x: number, y: number): Direction[] {
  return DIRECTIONS.filter((d) => cellAt(map, x + DIR_VECTOR[d].x, y + DIR_VECTOR[d].y) === "wall");
}

function floorCells(map: GameMap, inRegion: (x: number, y: number) => boolean): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (inRegion(x, y) && cellAt(map, x, y) === "floor") cells.push({ x, y });
    }
  }
  return cells;
}

// Hand-tuned mood lighting for the demo deck:
// - top-left 6x6 area: white ceiling lights on every second walkable cell
// - right side (x > 5): a couple of red glows low against a wall
// - bottom-left (x < 6, y > 4): a few faint blue glows on the wall, mid-height
export function generateLights(map: GameMap): LightSpec[] {
  const random = seededRandom(map.name);
  const lights: LightSpec[] = [];

  const ceilingLight = (x: number, y: number): LightSpec => ({
    kind: "ceiling",
    x,
    z: y,
    elevation: 0.9,
    color: 0xfff4e0,
    intensity: 1.6,
    range: 2.4,
  });
  for (const { x, y } of floorCells(map, (x, y) => x <= 5 && y <= 5 && x % 2 === 1 && y % 2 === 1)) {
    lights.push(ceilingLight(x, y));
  }
  // every lift cabin (the cell behind a lift door) is always lit
  for (const door of map.doors ?? []) {
    if (door.kind !== "lift") continue;
    const v = DIR_VECTOR[door.facing];
    const cabin = { x: door.cell.x - v.x, y: door.cell.y - v.y };
    if (!lights.some((l) => l.kind === "ceiling" && l.x === cabin.x && l.z === cabin.y)) {
      lights.push(ceilingLight(cabin.x, cabin.y));
    }
  }

  const redCandidates = floorCells(map, (x) => x > 5).filter(({ x, y }) => adjacentWalls(map, x, y).length > 0);
  for (const { x, y } of pick(redCandidates, 2, random)) {
    const walls = adjacentWalls(map, x, y);
    const wall = walls[Math.floor(random() * walls.length)];
    const v = DIR_VECTOR[wall];
    lights.push({
      kind: "floorGlow",
      x: x + v.x * 0.36,
      z: y + v.y * 0.36,
      elevation: 0.06,
      color: 0xff2a14,
      intensity: 2.2,
      range: 1.8,
      wall,
    });
  }

  const blueCandidates = floorCells(map, (x, y) => x < 6 && y > 4).filter(
    ({ x, y }) => adjacentWalls(map, x, y).length > 0,
  );
  for (const { x, y } of pick(blueCandidates, 3, random)) {
    const walls = adjacentWalls(map, x, y);
    const wall = walls[Math.floor(random() * walls.length)];
    const v = DIR_VECTOR[wall];
    lights.push({
      kind: "wallGlow",
      x: x + v.x * 0.4,
      z: y + v.y * 0.4,
      elevation: 0.5,
      color: 0x3a6bff,
      intensity: 0.7,
      range: 1.4,
      wall,
    });
  }

  return lights;
}
