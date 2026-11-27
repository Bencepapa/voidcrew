import type { Key } from "../i18n";
import type { SearchTarget } from "./targets";

const m = (id: string, titleKey: Key, synonyms: readonly string[], keywords: readonly string[] = []): SearchTarget =>
  ({ id, kind: "mapRender", titleKey, synonyms, keywords });

export const MAP_RENDER_TARGETS: readonly SearchTarget[] = [
  m("setting.walls.profile", "debug.wallType", ["fal típus", "wall type", "wall profile"]),
  m("setting.walls.reliefMode", "debug.reliefShapePropsFollowTheWallType", ["relief forma", "relief shape", "relief mode"]),
  m("setting.walls.reliefDepth", "debug.reliefDepthUnlessTheMapSetsIt", ["relief mélység", "relief depth"]),
  m("setting.walls.reliefMinIsland", "debug.minFeatureSizePx1Off", ["relief sziget", "min feature size"]),
  m("setting.walls.aoIntensity", "debug.aOStrengthAmbient", ["ao erő", "ao strength", "ambient occlusion"]),
  m("setting.walls.aoDirect", "debug.aOOnDirectLight", ["ao közvetlen", "ao direct light"]),
  m("setting.walls.aoRadius", "debug.aORadiusPx", ["ao sugár", "ao radius"]),
  m("setting.walls.bevelFraction", "debug.bevelFraction", ["letörés arány", "bevel fraction"]),
  m("setting.walls.bevelAngle", "debug.bevelAngleDegFromFloor", ["letörés szög", "bevel angle"]),
  m("setting.walls.displacement", "debug.depthDisplacement", ["mélység eltolás", "depth displacement"]),
  m("setting.walls.height", "debug.wallHeight", ["fal magasság", "wall height"]),

  m("setting.floors.reliefDepth", "debug.floorReliefDepth", ["padló relief", "floor relief depth"]),
  m("setting.floors.normalStrength", "debug.floorNormalStrength", ["padló normal", "floor normal strength"]),

  m("setting.material.roughness", "debug.roughness", ["érdesség", "roughness"]),
  m("setting.material.metalness", "debug.metalness", ["fémes", "metalness"]),
  m("setting.material.normalStrength", "debug.normalMapStrength", ["normal erő", "normal map strength"]),

  m("setting.light.map", "debug.mapLights", ["pálya fények", "map lights"]),
  m("setting.light.headlamp", "debug.headlamp", ["fejlámpa", "headlamp"]),
  m("setting.light.ambient", "debug.ambientLight", ["környezeti fény", "ambient light"]),
  m("setting.light.fogColor", "debug.distanceFadesToFogColourSavedWith", ["köd szín", "fog color", "fog colour"]),
  m("setting.light.fogStart", "debug.fogStart", ["köd kezdete", "fog start"]),
  m("setting.light.fogEnd", "debug.fogEnd", ["köd vége", "fog end"]),

  m("setting.gameplay.headlamp", "debug.headlampOnLSavedWithTheMap", ["fejlámpa be", "headlamp on"]),
  m("setting.gameplay.headlampColor", "debug.headlampColour", ["fejlámpa szín", "headlamp color"]),
  m("setting.gameplay.bob", "debug.idleHeadBobSavedWithTheMap", ["fej mozgás", "idle head bob"]),

  m("setting.actions.save", "debug.saveToMap", ["mentés pályára", "save to map"]),
  m("setting.actions.clear", "debug.clear", ["törlés", "clear render"]),
];
