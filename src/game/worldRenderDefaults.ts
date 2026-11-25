// The viewer's defaults per world: what a map of that world starts from before its own render block (MapFile.render).
// The fantasy world is darker and closer: a narrower view, a lower eye, strong ambient and headlamp, dim map lights
// (the values were tuned by hand in the Debug panel).
import type { ViewportSettings } from "../components/GameViewport";

/** The settings a world sets (the rest comes from the viewer's own defaults). */
export type WorldSettings = Partial<Pick<ViewportSettings, "fov" | "moveDurationMs" | "eyeHeight" | "cameraPullback" | "mapLightIntensity" | "pointLightIntensity" | "ambientIntensity">>;

const FANTASY: WorldSettings = {
  fov: 53,
  moveDurationMs: 360,
  eyeHeight: 0.52,
  cameraPullback: 0.31,
  mapLightIntensity: 0.45,
  pointLightIntensity: 2.7,
  ambientIntensity: 1.8,
};

export const WORLD_SETTING_KEYS = Object.keys(FANTASY) as (keyof WorldSettings)[];

export function worldSettings(world: string | undefined): WorldSettings {
  return world === "fantasy" ? FANTASY : {};
}

/** The viewer's defaults for a world: the global ones with the world's own on top. */
export function worldDefaults(world: string | undefined, defaults: ViewportSettings): ViewportSettings {
  return { ...defaults, ...worldSettings(world) };
}