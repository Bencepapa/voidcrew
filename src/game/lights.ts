import { ceilingHeight, floorHeight } from "./map";
import type { GameMap, MapLight } from "./types";

// A deck's lights are all placed on its map (MapLight, see the editor's
// Light tool): ceiling lamps and free-standing lights. Nothing is generated.

// a hand-placed free-standing light is a "point" (see MapLight.pos)
export type LightKind = "ceiling" | "point";

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
  // its index in the map's lights
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
  return lights;
}
