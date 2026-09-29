import { ceilingHeight, floorHeight } from "./map";
import type { GameMap, MapLight } from "./types";
import { DIR_VECTOR, rightOf } from "./movement";

// A deck's lights are placed on its map (MapLight, see the editor's Light
// tool): ceiling lamps and free-standing lights. Besides them only its
// windows glow (unless a window says not to).

// a hand-placed free-standing light is a "point" (see MapLight.pos); a
// window's starlight a "window"
export type LightKind = "ceiling" | "point" | "window";

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
  // its index in the map's lights (-1: a window's)
  source: number;
  // a free-standing one whose bulb shows in the game (see MapLight.bulb)
  bulb?: boolean;
}

// "#rrggbb" as a number (undefined if it isn't one)
export function parseColor(hex: string | undefined): number | undefined {
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  return parseInt(hex.replace("#", ""), 16);
}

const DEFAULT_LAMP_COLOR = 0xfff4e0;

// the color of a map's ceiling lights (and their glowing panels)
export function lampColor(map: GameMap): number {
  return map.lightColor ? parseInt(map.lightColor.replace("#", ""), 16) : DEFAULT_LAMP_COLOR;
}

// the map's ceiling lamp in a cell (its index in map.lights), or -1
export function ownCeilingLight(map: { lights?: MapLight[] }, cell: { x: number; y: number }): number {
  return (map.lights ?? []).findIndex((l) => !l.pos && l.x === cell.x && l.y === cell.y);
}

export function generateLights(map: GameMap): LightSpec[] {
  const color = lampColor(map);
  const lights: LightSpec[] = [];
  (map.lights ?? []).forEach((own, source) => {
    // a lamp in a taller room reaches further, to light its floor as well
    const extra = ceilingHeight(map, own.x, own.y) - floorHeight(map, own.x, own.y) - 1;
    const light: LightSpec = {
      kind: "ceiling",
      x: own.x,
      z: own.y,
      y: ceilingHeight(map, own.x, own.y) - 0.1,
      color: parseColor(own.color) ?? color,
      intensity: own.intensity ?? 1.6 + extra * 0.8,
      range: own.range ?? 2.4 + extra * 1.2,
      source,
      bulb: own.bulb,
    };
    if (own.pos) {
      const [dx, up, dz] = own.pos;
      Object.assign(light, { kind: "point", x: own.x + dx, z: own.y + dz, y: floorHeight(map, own.x, own.y) + up });
    } else if (lights.some((l) => l.kind === "ceiling" && l.x === own.x && l.z === own.y)) {
      // one lamp per ceiling
      return;
    }
    lights.push(light);
  });
  // A window's cold starlight: one light per panel, from just behind its
  // glass - shining in through the (shadowless) wall, it lights the room
  // without a highlight on the glass itself, which faces away from it.
  // (Baked, they cost nothing - see lightGrid.ts.)
  for (const w of map.windows ?? []) {
    if (!w.glow) continue;
    const out = DIR_VECTOR[w.wall];
    const right = DIR_VECTOR[rightOf(w.wall)];
    for (let i = 0; i < w.width; i++) {
      lights.push({
        kind: "window",
        x: w.cell.x + right.x * i + out.x * (0.5 + WINDOW_GLOW_BEHIND),
        z: w.cell.y + right.y * i + out.y * (0.5 + WINDOW_GLOW_BEHIND),
        y: floorHeight(map, w.cell.x, w.cell.y) + 0.6,
        color: WINDOW_GLOW_COLOR,
        intensity: WINDOW_GLOW_INTENSITY,
        range: WINDOW_GLOW_RANGE,
        source: -1,
      });
    }
  }
  return lights;
}

// a window panel's glow: how far behind the glass (world units) it shines
// from, its color, strength and reach
const WINDOW_GLOW_BEHIND = 0.15;
const WINDOW_GLOW_COLOR = 0x9db8ff;
const WINDOW_GLOW_INTENSITY = 1.1;
const WINDOW_GLOW_RANGE = 2.4;
