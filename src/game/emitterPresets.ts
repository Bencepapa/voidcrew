import { DIR_VECTOR } from "./movement";
import type { Direction, SmokeSpec, Vec2 } from "./types";

// Presets for the fire / smoke emitters (the editor's "Fire / Smoke type" buttons): each is a patch of the existing smoke
// fields. A key the patch sets to undefined is taken off the emitter, so choosing a preset leaves nothing of the last one.

export type EmitterPresetId = "fire" | "blueFire" | "greenFire" | "smoke" | "steam" | "poison" | "flameJet";
export const EMITTER_PRESETS: EmitterPresetId[] = ["fire", "blueFire", "greenFire", "smoke", "steam", "poison", "flameJet"];

// the settings a preset may touch (all taken off unless the preset sets them)
const CLEARED = {
  color: undefined, lightColor: undefined, lightIntensity: undefined, lightReach: undefined, blow: undefined,
  harm: undefined, decorative: undefined, density: undefined, size: undefined, opacity: undefined, opacityDark: undefined,
} satisfies Partial<Record<keyof SmokeSpec, undefined>>;

export type EmitterPatch = Partial<Record<keyof SmokeSpec, unknown>>;

export function presetPatch(id: EmitterPresetId, jetYaw = 0): EmitterPatch {
  const base = { ...CLEARED };
  switch (id) {
    case "fire": return { ...base, effect: "fire" };
    case "blueFire": return { ...base, effect: "fire", color: "#3f8cff", lightColor: "#4f9bff" };
    case "greenFire": return { ...base, effect: "fire", color: "#4dff6a", lightColor: "#5dff7a" };
    case "smoke": return { ...base, effect: "smoke" };
    case "steam": return { ...base, effect: "smoke", color: "#ffffff", density: 1.5 };
    case "poison": return { ...base, effect: "smoke", color: "#6fd23c", density: 1.5, size: 1.3, harm: { damage: 2, every: 1, reach: 1 } };
    // a short, fast burst out of a wall: fire that is no torch (its own cell does not burn) - the jet's reach is the harm
    case "flameJet": return { ...base, effect: "fire", decorative: true, size: 0.8, blow: { speed: 2.5, yaw: jetYaw, pitch: 0 }, harm: { damage: 4, every: 1, reach: 2, label: "is scorched by the flames" } };
  }
}

// The side of its cell an emitter sits against (the wall nearest it: the largest offset toward a wall neighbour), or null
// when no wall is near: `pos` is across / up / along from the cell's center.
export function wallSideOf(
  map: { cells: readonly (readonly string[])[] },
  cell: Vec2,
  pos: readonly [number, number, number],
): Direction | null {
  const sides: [Direction, number][] = [["N", -pos[2]], ["S", pos[2]], ["E", pos[0]], ["W", -pos[0]]];
  const walls = sides.filter(([dir]) => (map.cells[cell.y + DIR_VECTOR[dir].y]?.[cell.x + DIR_VECTOR[dir].x] ?? "wall") === "wall");
  if (!walls.length) return null;
  return walls.reduce((best, s) => (s[1] > best[1] ? s : best))[0];
}

const YAW: Record<Direction, number> = { N: 0, E: 90, S: 180, W: 270 };
// The heading (degrees: 0 north, 90 east) that blows away from the wall the emitter sits against; 0 when there is none
// (the editor's "Flame jet" then starts level and can be turned by hand).
export function jetYawFor(map: Parameters<typeof wallSideOf>[0], cell: Vec2, pos: readonly [number, number, number]): number {
  const side = wallSideOf(map, cell, pos);
  if (!side) return 0;
  const away: Record<Direction, Direction> = { N: "S", S: "N", E: "W", W: "E" };
  return YAW[away[side]];
}
