import { isSkyCeiling, parseColor } from "../../game/lights";
import { cellAt } from "../../game/mapGeometry";
import type { Direction, GameMap } from "../../game/types";
import { SKY_CEILING, SKY_FACE } from "../bakeOcclusion";
import type { SkyLight } from "../skySampling";
import type { ViewportSettings } from "./settings";

export type SkyBakeSettings = Pick<ViewportSettings,
  "skyLightIntensity" | "skyDomeIntensity" | "skyLightAzimuth" | "skyLightElevation" | "skyLightColor">;
export type SkyBakeMap = Pick<GameMap, "width" | "height" | "cells" | "textures" | "ceilingTextureAt" | "wallTextureAt" | "faceTextureAt">;
export type SkyWall = (x: number, z: number, direction: Direction) => boolean;
const DIRECTIONS = ["E", "W", "S", "N"] as const;
// Legacy strengths drove overlapping point lights. Calibrate the single
// directional contribution against typical outdoor ground probes.
const SUN_STRENGTH_SCALE = 3;

export function skySurfaceMask(map: SkyBakeMap, isSkyWall: SkyWall) {
  const mask = new Uint8Array(map.width * map.height);
  let hasSky = false;
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      if (cellAt(map, x, z) === "wall") continue;
      const c = z * map.width + x;
      if (isSkyCeiling(map, x, z)) {
        mask[c] = SKY_CEILING;
        hasSky = true;
      }
      for (const direction of DIRECTIONS) {
        if (isSkyWall(x, z, direction)) mask[c] |= SKY_FACE[direction];
      }
    }
  }
  return hasSky ? mask : undefined;
}

export function skyLightOf(settings: SkyBakeSettings, quick: boolean): SkyLight | undefined {
  if (settings.skyLightIntensity <= 0 && settings.skyDomeIntensity <= 0) return undefined;
  return {
    color: parseColor(settings.skyLightColor) ?? 0xa8bcff,
    intensity: settings.skyLightIntensity * SUN_STRENGTH_SCALE,
    domeIntensity: settings.skyDomeIntensity,
    azimuth: settings.skyLightAzimuth,
    elevation: settings.skyLightElevation,
    quick,
  };
}
