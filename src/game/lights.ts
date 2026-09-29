import { cellAt, ceilingHeight, floorHeight } from "./map";
import { DIR_VECTOR, rightOf } from "./movement";
import type { Direction, GameMap, MapLight } from "./types";

// a hand-placed free-standing light is a "point" (see MapLight.pos)
export type LightKind = "ceiling" | "point" | "floorGlow" | "wallGlow";

export interface LightSpec {
  kind: LightKind;
  // world position in grid units (x = column, z = row, cell centers on integers)
  x: number;
  z: number;
  // height in wall heights (the map's floor/ceiling units)
  y: number;
  color: number;
  intensity: number;
  // light range in world units (three.js PointLight `distance`)
  range: number;
  // the wall a floor/wall glow sits against
  wall?: Direction;
  // a faint one: ranks lower for the viewport's light pool
  minor?: boolean;
  // a hand-placed one: its index in the map's lights
  source?: number;
  // a free-standing one whose bulb shows in the game (see MapLight.bulb)
  bulb?: boolean;
}

// "#rrggbb" as a number (undefined if it isn't one)
export function parseColor(hex: string | undefined): number | undefined {
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  return parseInt(hex.replace("#", ""), 16);
}

const DIRECTIONS = Object.keys(DIR_VECTOR) as Direction[];
const LIFT_LIGHT_INTENSITY = 0.8;
const DEFAULT_LAMP_COLOR = 0xfff4e0;

// the color of a map's ceiling lights (and their glowing panels)
export function lampColor(map: GameMap): number {
  return map.lightColor ? parseInt(map.lightColor.replace("#", ""), 16) : DEFAULT_LAMP_COLOR;
}

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
// - top-left 6x6 area and tall rooms: white ceiling lights on every second
//   walkable cell
// - right side (x > 5): a couple of red glows low against a wall
// - bottom-left (x < 6, y > 4): a few faint blue glows on the wall, mid-height
// The cells the generated mood lighting puts a ceiling light in (unless the
// map's lightsOff switches it off): every second walkable cell in the top
// left 6x6 area and in tall rooms.
export function autoLightCells(map: GameMap): { x: number; y: number }[] {
  if (map.autoLights === false) return [];
  const tall = (x: number, y: number) => ceilingHeight(map, x, y) - floorHeight(map, x, y) >= 1.5;
  return floorCells(map, (x, y) => ((x <= 5 && y <= 5) || tall(x, y)) && x % 2 === 1 && y % 2 === 1);
}

// whether a cell's ceiling has a light, as generateLights places them
export function hasCeilingLight(map: GameMap, cell: { x: number; y: number }): boolean {
  return generateLights(map).some((l) => l.kind === "ceiling" && l.x === cell.x && l.z === cell.y);
}

// the map's own ceiling lamp in a cell (its index in map.lights), or -1
export function ownCeilingLight(map: { lights?: MapLight[] }, cell: { x: number; y: number }): number {
  return (map.lights ?? []).findIndex((l) => !l.pos && l.x === cell.x && l.y === cell.y);
}

export function generateLights(map: GameMap): LightSpec[] {
  const random = seededRandom(map.name);
  const lights: LightSpec[] = [];
  const auto = map.autoLights !== false;
  const color = lampColor(map);

  // a light in a taller room reaches further, to light its floor as well
  const ceilingLight = (x: number, y: number): LightSpec => {
    const extra = ceilingHeight(map, x, y) - floorHeight(map, x, y) - 1;
    return {
      kind: "ceiling",
      x,
      z: y,
      y: ceilingHeight(map, x, y) - 0.1,
      color,
      intensity: 1.6 + extra * 0.8,
      range: 2.4 + extra * 1.2,
    };
  };
  // the map's own - a ceiling lamp, or a free-standing light - then the
  // generated ones where it has none of its own (bar those switched off)
  (map.lights ?? []).forEach((own, source) => {
    const base = ceilingLight(own.x, own.y);
    const light: LightSpec = {
      ...base,
      color: parseColor(own.color) ?? base.color,
      intensity: own.intensity ?? base.intensity,
      range: own.range ?? base.range,
      source,
      bulb: own.bulb,
    };
    if (own.pos) {
      const [dx, up, dz] = own.pos;
      Object.assign(light, { kind: "point", x: own.x + dx, z: own.y + dz, y: floorHeight(map, own.x, own.y) + up });
    } else if (lights.some((l) => l.kind === "ceiling" && l.x === own.x && l.z === own.y)) {
      return;
    }
    lights.push(light);
  });
  const off = new Set((map.lightsOff ?? []).map((c) => `${c.x},${c.y}`));
  for (const { x, y } of autoLightCells(map)) {
    if (!off.has(`${x},${y}`) && !lights.some((l) => l.kind === "ceiling" && l.x === x && l.z === y)) lights.push(ceilingLight(x, y));
  }
  // every lift cabin (the cell behind a lift door) is always lit - softly:
  // its pale plates would glare under a full-strength light
  for (const door of map.doors ?? []) {
    if (door.kind !== "lift") continue;
    const v = DIR_VECTOR[door.facing];
    const cabin = { x: door.cell.x - v.x, y: door.cell.y - v.y };
    const existing = lights.findIndex((l) => l.kind === "ceiling" && l.x === cabin.x && l.z === cabin.y);
    const light = { ...ceilingLight(cabin.x, cabin.y), intensity: LIFT_LIGHT_INTENSITY };
    if (existing >= 0) lights[existing] = light;
    else lights.push(light);
  }

  // a faint cold glow of starlight in front of each window - one per
  // window, in front of its middle, reaching along it
  for (const w of map.windows ?? []) {
    const v = DIR_VECTOR[w.wall];
    const right = DIR_VECTOR[rightOf(w.wall)];
    const cx = w.cell.x + (right.x * (w.width - 1)) / 2;
    const cy = w.cell.y + (right.y * (w.width - 1)) / 2;
    lights.push({
      kind: "wallGlow",
      x: cx + v.x * 0.15,
      z: cy + v.y * 0.15,
      y: floorHeight(map, w.cell.x, w.cell.y) + 0.6,
      color: 0x9db8ff,
      intensity: 0.5 + 0.15 * (w.width - 1),
      range: 1.6 + 0.5 * (w.width - 1),
      wall: w.wall,
      minor: true,
    });
  }

  if (!auto) return lights;

  const redCandidates = floorCells(map, (x) => x > 5).filter(({ x, y }) => adjacentWalls(map, x, y).length > 0);
  for (const { x, y } of pick(redCandidates, 2, random)) {
    const walls = adjacentWalls(map, x, y);
    const wall = walls[Math.floor(random() * walls.length)];
    const v = DIR_VECTOR[wall];
    lights.push({
      kind: "floorGlow",
      x: x + v.x * 0.36,
      z: y + v.y * 0.36,
      y: floorHeight(map, x, y) + 0.06,
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
      y: floorHeight(map, x, y) + 0.5,
      color: 0x3a6bff,
      intensity: 0.7,
      range: 1.4,
      wall,
    });
  }

  return lights;
}
