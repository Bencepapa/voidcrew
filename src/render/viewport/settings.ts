import { defaultPostSettings, type PostProcessSettings } from "../postSettings";
import { type SmokeStyle } from "../smoke";
import { loadGraphics } from "../graphics";
import type { LightGridMode } from "../lightGrid";
import { loadPostSaved } from "../postSettingsStore";
import type { TextureSetId } from "../textureSets";
import type { ReliefMode } from "../../game/renderLook";

export type { TextureSetId };
export type WallProfileId = "flat" | "convex" | "concave" | "relief";
// debug: draw every surface with its textures, or just its polygons -
// flat-shaded faces colored by their direction, or a wireframe
// (or the normal maps / depth maps themselves, drawn as the surfaces' colour -
// what the 2D sprites show instead of flat faces and wire)
export type GeometryViewId = "textured" | "faces" | "wireframe" | "normals" | "depth";

export interface ViewportSettings extends PostProcessSettings {
  textureSet: TextureSetId;
  // a second texture set used on a share of the walls
  accentTextureSet: TextureSetId | "none";
  accentRatio: number;
  // "map" = per cell, as the map specifies (GameMap.floorAt); a set id
  // forces that floor everywhere; "none" = plain dark floor
  floorTextureSet: TextureSetId | "map" | "none";
  // "none" = plain dark ceiling
  ceilingTextureSet: TextureSetId | "none";
  // step cell by cell (true) or move freely with joysticks/held keys (false)
  gridMovement: boolean;
  // the map's decals (bullet holes, stencils...)
  decalsEnabled: boolean;
  wallProfile: WallProfileId;
  // diagnostic toggle for the black backing behind walls and inside pillars
  wallBacking: boolean;
  backingInspect: boolean;
  geometryView: GeometryViewId;
  // feature switches for looking at one thing at a time: the normal maps,
  // the metal / roughness maps and metalness, the glow and emissive maps, the
  // baked ambient occlusion
  showNormals: boolean;
  showMetal: boolean;
  showGlow: boolean;
  showAO: boolean;
  // combat: aim with the crosshair mini-game (else the hit chance is rolled)
  aimMiniGame: boolean;
  // testing: hits still take HP, but never below 1
  immortalCrew: boolean;
  // testing: walk through walls, doors, props and enemies
  noclip: boolean;
  // crew gear: a scanner outlining enemies in view, even in the dark
  enemyScanner: boolean;
  // the headlamp: a light that moves with the party (off: map lights only)
  headlamp: boolean;
  // the headlamp's colour (saved with the map)
  headlampColor: string;
  // the map's lights baked (see lightGrid.ts) - any number of them, the
  // real lights left for flashes; off: every map light a real one
  bakedLights: boolean;
  // the baked light's samples per cell, and how they keep it (see
  // lightGrid.ts)
  lightGridDensity: number;
  // the rough first bake after an edit (samples per cell; 0 or not under the real density: none), shown while the
  // real one is still being computed
  lightGridQuickDensity: number;
  lightGridMode: LightGridMode;
  // how much light the bake lets bounce round corners into the cells no
  // light sees (see lightGrid.ts bounceLight; 0: none, they stay dark)
  lightBounce: number;
  // what the smoke's puffs look like (see smoke.ts), and what they bump
  // into: the walls (and floors and ceilings), the props, the robots
  smokeStyle: SmokeStyle;
  // the ship's livery (see variation.ts accentOf): "rolled" (the ship's),
  // "painted" (none), or a hue (degrees) to try; and how saturated a
  // texture's pixel must be to count as accent
  shipAccent: "rolled" | "painted" | number;
  accentMinSat: number;
  smokeWalls: boolean;
  smokeProps: boolean;
  smokeActors: boolean;
  // how far (cells) the view reaches: the fog, the lights and what's drawn
  // (within the graphics setting's viewDistanceCap - see effectiveViewDistance)
  viewDistance: number;
  eyeHeight: number;
  wallHeight: number;
  cameraPullback: number;
  moveDurationMs: number;
  fov: number;
  pointLightIntensity: number;
  ambientIntensity: number;
  bobEnabled: boolean;
  bevelFraction: number;
  bevelAngleDeg: number;
  displacementScale: number;
  reliefDepth: number;
  reliefLevels: number;
  reliefMinIsland: number;
  // stepped levels, or a smooth height field with slopes
  reliefMode: ReliefMode;
  // EXPERIMENT: door panels and frames as a smooth hybrid relief (a smooth
  // mesh with the holes' quads left out, the pixel edge from an alpha cutout
  // on the diffuse) instead of the stepped one - see createSmoothReliefGeometry
  // the floors' own relief depth (world units) and normal strength; 0: as the walls'
  floorReliefDepth: number;
  floorNormalStrength: number;
  // the player's graphics choices (see render/graphics.ts)
  particleQuality: number;
  wallDetail: number;
  // the door parts' own detail (cells a side, the frame and leaf, which have holes): 0 follows the wall detail; set, it is
  // taken as it is (more than the wall detail too: a few doors are cheap next to the walls)
  doorDetail: number;
  pixelRatioCap: number;
  particleEvery: number;
  viewDistanceCap: number;
  lodScale: number;
  antialias: number;
  lightPool: number;
  normalMaps: number;
  mapLightIntensity: number;
  // Directional sunlight and diffuse sky illumination in the bake.
  skyLightIntensity: number;
  skyDomeIntensity: number;
  skyLightAzimuth: number;
  skyLightElevation: number;
  skyLightColor: string;
  // what the distance fades to ("#rrggbb"; black: darkness - a lit hall far
  // off still glows through it, see fogNear)
  fogColor: string;
  // the fog's start and full-thickness distance in cells (0: automatic from the view distance)
  fogStart: number;
  fogEnd: number;
  roughness: number;
  metalness: number;
  normalStrength: number;
  // ambient occlusion (relief walls only): strength on ambient light, how
  // much it also darkens direct lights, and how far it looks for occluders
  aoIntensity: number;
  aoDirect: number;
  aoRadius: number;
}

// this device's graphics choices (an Ultra one sees as far as it allows)
const DEVICE_GRAPHICS = loadGraphics();
export const DEFAULT_SETTINGS: ViewportSettings = {
  textureSet: "wall4",
  accentTextureSet: "wall5",
  accentRatio: 0.35,
  floorTextureSet: "map",
  ceilingTextureSet: "ceiling1",
  gridMovement: true,
  decalsEnabled: true,
  wallProfile: "relief",
  wallBacking: true,
  backingInspect: false,
  geometryView: "textured",
  showNormals: true,
  showMetal: true,
  showGlow: true,
  showAO: true,
  aimMiniGame: true,
  immortalCrew: false,
  noclip: false,
  enemyScanner: false,
  headlamp: false,
  headlampColor: "#fff2d9",
  bakedLights: true,
  lightGridDensity: 3,
  lightGridQuickDensity: 1,
  lightGridMode: "directional",
  lightBounce: 0.4,
  smokeStyle: "animated",
  shipAccent: "rolled",
  accentMinSat: 0.35,
  smokeWalls: true,
  smokeProps: true,
  smokeActors: true,
  // (as far as the device's setting allows: High's 9 cells, not 7 - a lit
  // hall 7 cells off was past the lights' fade and deep in the fog; Low's
  // and Medium's caps are below 7 anyway)
  viewDistance: DEVICE_GRAPHICS.viewDistanceCap,
  eyeHeight: 0.5,
  wallHeight: 1.0,
  cameraPullback: 0.3,
  moveDurationMs: 220,
  fov: 72,
  pointLightIntensity: 1.6,
  ambientIntensity: 0.35,
  bobEnabled: true,
  ...defaultPostSettings(),
  // (the dark fantasy look the browser kept, see render/postSettingsStore.ts)
  ...loadPostSaved(),
  bevelFraction: 0.2,
  bevelAngleDeg: 30,
  displacementScale: 0.03,
  reliefDepth: 0.04,
  reliefLevels: 6,
  reliefMinIsland: 3,
  reliefMode: "steps",
  floorReliefDepth: 0,
  floorNormalStrength: 0,
  ...DEVICE_GRAPHICS,
  mapLightIntensity: 1.6,
  skyLightIntensity: 0,
  skyDomeIntensity: 0.65,
  skyLightAzimuth: 200,
  skyLightElevation: 40,
  skyLightColor: "#a8bcff",
  fogColor: "#000000",
  fogStart: 0,
  fogEnd: 0,
  doorDetail: 0,
  roughness: 0.55,
  metalness: 0.45,
  normalStrength: 1,
  aoIntensity: 1,
  aoDirect: 0.6,
  aoRadius: 6,
};
