import type { LightSpec } from "../../game/lights";
import type { PropType } from "../../game/props";
import type { GameMap } from "../../game/types";
import { bakeCacheKey } from "../lightBakeCache";
import type { ViewportSettings } from "./settings";
import { skyLightOf, skySurfaceMask, type SkyBakeMap, type SkyBakeSettings, type SkyWall } from "./skyBakeInputs";

const LIGHT_BAKE_VERSION = 1;

type BakeSettings = SkyBakeSettings & Pick<ViewportSettings, "lightGridDensity" | "lightGridQuickDensity" | "lightGridMode" | "lightBounce" | "bakedLights" | "probeReflections" | "probeReflectionDensity">;
type BakeMap = SkyBakeMap & Pick<GameMap, "floorHeights" | "ceilingHeights" | "props" | "bridges" | "lightGridDensity" | "lightGridAmbient">;

const finalDensity = (m: Pick<BakeMap, "lightGridDensity">, settings: Pick<BakeSettings, "lightGridDensity">) =>
  m.lightGridDensity ?? settings.lightGridDensity;

export function shouldBakeQuickFirst(quickDensity: number, m: Pick<BakeMap, "lightGridDensity">, settings: Pick<BakeSettings, "lightGridDensity">) {
  return quickDensity >= 1 && quickDensity < finalDensity(m, settings);
}

export function bakeInputs(
  m: BakeMap,
  quick: boolean,
  preview: boolean,
  settings: BakeSettings,
  lights: LightSpec[],
  wallHeight: number,
  propTypes: Readonly<Record<string, PropType>>,
  isSharedPropId: (id: string) => boolean,
  isSkyWall: SkyWall,
) {
  const sky = skyLightOf(settings, quick || preview);
  const skySurfaces = sky && skySurfaceMask(m, isSkyWall);
  const options = {
    // (a rough bake while the quick preview of an edit shows - see applyStructure - or the first, quick one after an
    // edit, see bakeLatest)
    perCell: preview ? 1 : quick ? Math.max(1, settings.lightGridQuickDensity) : finalDensity(m, settings),
    mode: settings.lightGridMode,
    bounce: settings.lightBounce,
    ...(skySurfaces && { sky }),
  };
  const ambientDensity =
    !quick && options.mode === "directional" && !preview && m.lightGridAmbient && m.lightGridAmbient !== options.perCell
      ? m.lightGridAmbient
      : undefined;
  const reflectionDensity = !quick && !preview && options.mode === "directional" && settings.bakedLights && settings.probeReflections
    ? settings.probeReflectionDensity : undefined;
  const sharedPropTypes = Object.fromEntries((m.props ?? [])
    .filter(({ prop }) => isSharedPropId(prop) && propTypes[prop])
    .map(({ prop }) => [prop, propTypes[prop]]));
  const cacheKey = bakeCacheKey({
    width: m.width, height: m.height, cells: m.cells, floorHeights: m.floorHeights, ceilingHeights: m.ceilingHeights, skySurfaces,
    props: m.props, bridges: m.bridges, sharedPropTypes, lights, wallHeight, options, ambientDensity, reflectionDensity,
  });
  return {
      options,
      ambientDensity,
      reflectionDensity,
      lights,
      sharedPropTypes,
      skySurfaces,
      cacheKey: `${LIGHT_BAKE_VERSION}:${cacheKey}`
  };
}
