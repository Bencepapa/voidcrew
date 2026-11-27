import type { Key } from "../i18n";
import type { WorldId } from "../game/worlds";
import { DEBUG_TARGETS } from "./debugTargets";
import { MAP_RENDER_TARGETS } from "./mapRenderTargets";
import { ASSET_TREE_TARGETS } from "./assetTreeTargets";
import { ASSET_MANAGER_TARGETS, type PropSearchField } from "./assetManagerTargets";
import type { SearchAsset } from "./assetTargets";

export type SearchTargetKind = "mapRender" | "assetTree" | "debug" | "assetManager" | SearchAsset["kind"];

export interface SearchTarget {
  id: string;
  kind: SearchTargetKind;
  titleKey: Key;
  synonyms: readonly string[];
  keywords: readonly string[];
  world?: WorldId;
  oldIds?: readonly string[];
  asset?: SearchAsset;
  propField?: PropSearchField;
}

export const SEARCH_TARGETS: readonly SearchTarget[] = [
  {
    id: "setting.sky.timeOfDay", kind: "mapRender", titleKey: "debug.timeOfDay",
    synonyms: ["napszak", "nap", "sun", "time of day", "sky preset", "égbolt"],
    keywords: ["hajnal", "dél", "alkonyat", "éjszaka", "dawn", "noon", "dusk", "night"],
  },
  {
    id: "setting.sky.sunAzimuth", kind: "mapRender", titleKey: "debug.skyLightFromCompass0North",
    synonyms: ["nap iránya", "azimut", "sun direction", "sun azimuth"],
    keywords: ["iránytű", "compass"], oldIds: ["skyLightAzimuth"],
  },
  {
    id: "setting.sky.sunElevation", kind: "mapRender", titleKey: "debug.skyLightHeightDegrees",
    synonyms: ["nap magassága", "napállás", "sun angle", "sun elevation"],
    keywords: ["szög", "horizon"], oldIds: ["skyLightElevation"],
  },
  {
    id: "setting.sky.sunColor", kind: "mapRender", titleKey: "debug.skyLightColour",
    synonyms: ["nap színe", "napfény szín", "sun color", "sun colour"],
    keywords: ["világítás", "lighting"], oldIds: ["skyLightColor"],
  },
  {
    id: "setting.sky.sunStrength", kind: "mapRender", titleKey: "debug.skyLightStrength0None",
    synonyms: ["nap erőssége", "napfényerő", "sun strength", "sun intensity", "sun brightness"],
    keywords: ["világítás", "lighting"], oldIds: ["skyLightIntensity"],
  },
  {
    id: "setting.sky.dome", kind: "mapRender", titleKey: "debug.skyDomeStrength0None",
    synonyms: ["égbolt ereje", "égkupola", "sky dome", "ambient sky light"],
    keywords: ["szórt fény", "ambient light"], oldIds: ["skyDomeIntensity"],
  },
  {
    id: "tool.roofAuto", kind: "assetTree", titleKey: "roofauto.group",
    synonyms: ["automata tető", "tetőzés", "auto roof", "roof tool", "roofing"],
    keywords: ["teljes tömb", "shift kattintás", "raised block", "shift click"],
    oldIds: ["roofauto"],
  },
  {
    id: "debug.lightProbes", kind: "debug", titleKey: "debug.showLightProbes",
    synonyms: ["fényprobe", "fényminták", "light probes", "show light probes"],
    keywords: ["sütött fény", "baked lighting", "debug"], oldIds: ["showLightProbes"],
  },
  ...MAP_RENDER_TARGETS,
  ...DEBUG_TARGETS,
  ...ASSET_TREE_TARGETS,
  ...ASSET_MANAGER_TARGETS,
];

export const findSearchTarget = (id: string) =>
  SEARCH_TARGETS.find(target => target.id === id || target.oldIds?.includes(id));
