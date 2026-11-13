import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import { prepareRaycasts } from "../render/bvh";
import { createSmoke, type SmokeBody, type SmokeEmitter, type SmokeStyle, type SmokeWorld } from "../render/smoke";
import { createPetals, type PetalEmitter } from "../render/petals";
import { effectiveViewDistance, loadGraphics } from "../render/graphics";
import { ACCENT_UNIFORMS, ownAccentUniforms, type AccentUniforms } from "../render/accent";
import { propEdit } from "../editor/propEditState";
import { ITEM_TYPES, itemSpot } from "../game/items";
import type { LootSpill } from "../game/items";
import { lightLevel } from "../game/lightEffects";
import {
  bakeLightGrid,
  createLightGridUniforms,
  createLightReach,
  disposeLightGrid,
  POOL_DECAY,
  POOL_DECAY_TAG,
  setLightGrid,
  useLightGrid,
} from "../render/lightGrid";
import type { LightGridMode } from "../render/lightGrid";
import { DOOR_EDGE_OFFSET, bridgeAt, cellAt, ceilingHeight, doorAt, doorFacingAt, doorFits, floorHeight, ladderBetween, liftDoorOf, windowPanels } from "../game/map";
import { BRIDGE_THICKNESS, BRIDGE_WIDTH, CLIMB_MS_PER_HEIGHT, MAX_STEP } from "../game/heights";
import { rightOf } from "../game/movement";
import { DIR_VECTOR } from "../game/movement";
import type { Direction, DoorSpec, GameMap, PropSpec, Vec2 } from "../game/types";
import { createReliefWallGeometry, downsampleHeightGrid, loadHeightGrid, type EdgeSegment } from "../render/reliefMesh";
import { buildCornerJoins, edgeModes, mergeCornerJoins, type JoinedStrips, type JoinPanel } from "../render/cornerJoins";
import { generateLights, isSkyCeiling, lampColor, ownCeilingLight, parseColor } from "../game/lights";
import { WORLDS } from "../game/worlds";
import type { LightSpec } from "../game/lights";
import { PROP_TYPES, propPlacement, propHeight } from "../game/props";
import { ACTOR_TYPES, BODY_PARTS, critAt } from "../game/actors";
import { actorOffsets } from "../render/actorOffsets";
import { onTextureTuningSaved, textureTuning } from "../render/textureTuning";
import type { ActorState, BodyPart } from "../game/actors";
import { gameClock } from "../game/clock";
import { weaponAccuracy } from "../game/combat";
import type { ShotResult, Weapon } from "../game/combat";
import { cellKey, visibleCells } from "../game/visibility";
import type { PropFace, PropPart, PropType, PropView } from "../game/props";
import { doorCellKey } from "../game/useGameState";
import { forwardOf } from "../game/freeMovement";
import type { FreePose } from "../game/freeMovement";
import type { PeekState } from "./useViewControls";
import type { LiftRide } from "../game/useGameState";
import { WALL_ROTATION, surfaceFrame, surfaceKey } from "../render/surfaces";
import { DecalLibrary, fetchDecalManifest } from "../render/decals";
import { WIRE_TILE, createWiredGlass, getStarfield } from "../render/space";
import { renderText, seededRandom } from "../render/pixelFont";
import { TEXTURE_SETS, isTextureSetId, textureFolder } from "../render/textureSets";
import type { TextureSetFiles, TextureSetId } from "../render/textureSets";
import type { EditTool } from "../editor/mapEdits";

import type { ReliefMode } from "../game/renderLook";

export type { TextureSetId };
export type WallProfileId = "flat" | "convex" | "concave" | "relief";
// debug: draw every surface with its textures, or just its polygons -
// flat-shaded faces colored by their direction, or a wireframe
// (or the normal maps / depth maps themselves, drawn as the surfaces' colour -
// what the 2D sprites show instead of flat faces and wire)
export type GeometryViewId = "textured" | "faces" | "wireframe" | "normals" | "depth";

export interface ViewportSettings {
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
  // the map's lights baked (see lightGrid.ts) - any number of them, the
  // real lights left for flashes; off: every map light a real one
  bakedLights: boolean;
  // the baked light's samples per cell, and how they keep it (see
  // lightGrid.ts)
  lightGridDensity: number;
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
  // the floors' own relief depth (world units) and normal strength; 0: as the walls'
  floorReliefDepth: number;
  floorNormalStrength: number;
  // the player's graphics choices (see render/graphics.ts)
  particleQuality: number;
  wallDetail: number;
  pixelRatioCap: number;
  particleEvery: number;
  viewDistanceCap: number;
  lodScale: number;
  antialias: number;
  lightPool: number;
  normalMaps: number;
  mapLightIntensity: number;
  // the sky's light on the cells under an open ceiling (see lights.ts SkyLight)
  skyLightIntensity: number;
  skyLightAzimuth: number;
  skyLightElevation: number;
  skyLightColor: string;
  // what the distance fades to ("#rrggbb"; black: darkness - a lit hall far
  // off still glows through it, see fogNear)
  fogColor: string;
  roughness: number;
  metalness: number;
  normalStrength: number;
  // ambient occlusion (relief walls only): strength on ambient light, how
  // much it also darkens direct lights, and how far it looks for occluders
  aoIntensity: number;
  aoDirect: number;
  aoRadius: number;
}

export interface ReliefStats {
  trianglesPerWall: number;
  levelCount: number;
  // levels came straight from the map's distinct grays
  baked: boolean;
}

// What the aiming overlay gets each frame: the enemies in reach, nearest
// first, with their body parts' rectangles (view pixels) and hit chances;
// and a way to shoot at a point of the view.
export interface AimTarget {
  id: number;
  name: string;
  distance: number;
  parts: { part: BodyPart; label: string; rect: [number, number, number, number]; chance: number }[];
}
export interface AimFrame {
  targets: AimTarget[];
  width: number;
  height: number;
  // the view's current magnification (1 = the normal field of view): a
  // weapon's sway, an angle, spans this many times more pixels
  zoom: number;
  shoot: (x: number, y: number) => ShotResult;
}

// What the aiming overlay has picked, for the camera: it turns to the
// target - framing it while a part is picked, then at the weapon's zoom
// (Weapon.aimZoom) for the mini-game.
export interface AimFocus {
  target: number | null;
  // the picked body part: its pixels light up on the sprite
  part: BodyPart | null;
  phase: "pick" | "aim";
}

// The kinds of thing the editor drags, and one step of a drag: what (its
// index in the map's list - a door by its cell), whether Ctrl copies it, the
// drag's first step, the drag (one undo step each), and for those that slide
// on a level (props on a floor, lights, robots, doors) where the spot they
// were grabbed by is taken to (world x, z); `drop`: a door let go of.
export type EditDragKind = "prop" | "decal" | "item" | "smoke" | "light" | "actor" | "door";
export interface EditDrag {
  kind: EditDragKind;
  index: number;
  door?: Vec2;
  copy: boolean;
  first: boolean;
  id: number;
  at?: [number, number];
  drop?: boolean;
  // a door slid inside its cell, let go of: where it stands there now
  offset?: number;
}

// The map editor (see EDITOR.md): what the pointer is on - a wall to dig
// out (with the open cell it's dug from, whose face was pointed at), or the
// floor / ceiling of a cell to fill, paint or hang a light in.
export interface EditTarget {
  kind: "wall" | "floor" | "ceiling";
  cell: Vec2;
  from?: Vec2;
  // the Light tool: a hand-placed light pointed at (its index in the map's
  // lights - a free-standing one's bulb)
  light?: number;
  // where a free-standing light would go: just off the surface pointed at -
  // its cell and its MapLight.pos there
  spot?: { cell: Vec2; pos: [number, number, number] };
  // the Prop tool: the prop pointed at (its index in the map's props)
  prop?: number;
  // the Decal tool: the decal pointed at (its index in the map's decals)
  decal?: number;
  // the Door tool: the door pointed at (its cell)
  door?: Vec2;
  // the Robot tool: the actor pointed at (its index in the map's actors)
  actor?: number;
  // the Item tool: the loose item pointed at (its index in the map's items)
  item?: number;
  // the Smoke tool: the emitter pointed at (its index in the map's smokes)
  smoke?: number;
  // the point hit, exactly: its cell, and across, up (wall heights above
  // the cell's floor) and along from the cell's center - where an item goes
  point?: { cell: Vec2; pos: [number, number, number] };
  // the surface pointed at as a decal sees it (see DecalSpec): its cell and
  // side, and the point on it in surface pixels (0..255 across a panel;
  // from its top left, a wall's first panel)
  surfacePoint?: { cell: Vec2; surface: Direction | "floor" | "ceiling"; u: number; v: number };
}

export interface ViewportStats {
  // triangles actually drawn last frame (after culling), and draw calls
  renderedTriangles: number;
  drawCalls: number;
  // cells in sight (see updateSight)
  visibleCells: number;
  // frames per second, and the milliseconds a frame takes on average (over half a second)
  fps: number;
  frameMs: number;
  // null unless the relief wall type is active and built
  relief: ReliefStats | null;
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
  bakedLights: true,
  lightGridDensity: 3,
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
  skyLightAzimuth: 200,
  skyLightElevation: 40,
  skyLightColor: "#a8bcff",
  fogColor: "#000000",
  roughness: 0.55,
  metalness: 0.45,
  normalStrength: 1,
  aoIntensity: 1,
  aoDirect: 0.6,
  aoRadius: 6,
};

// three.js applies aoMap to ambient/indirect light only, so crevices facing a
// point light still light up fully. This extends the same occlusion term to
// direct light by `uCavity` (0 = physically standard, 1 = full) - a common
// stylization that makes cracks and step feet read as dark.
function addDirectLightOcclusion(material: THREE.MeshStandardMaterial, cavity: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCavity = cavity;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uCavity;")
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
#ifdef USE_AOMAP
  reflectedLight.directDiffuse *= mix( 1.0, ambientOcclusion, uCavity );
  reflectedLight.directSpecular *= mix( 1.0, ambientOcclusion, uCavity );
#endif`,
      );
  };
}

// A flat wall panel with the top/bottom edges beveled, like the classic
// sci-fi corridor look: floor and ceiling stay flush with the grid boundary,
// but the middle band bulges toward the room (convex, sign=+1) or recedes
// away from it (concave, sign=-1) via two angled bevels.
//
// Each wall face is built independently, so a naive width-uniform bevel
// doesn't meet correctly where two perpendicular walls share a corner: convex
// leaves a gap (both edges pull away from the true corner line in different
// directions) and concave overlaps (both edges push past it). The fix is to
// taper the bevel amount back to zero within a small margin of each side
// edge, so every panel is flush (z=0) exactly at the corner regardless of
// direction, and only bulges/recedes in its own middle stretch.
// `subdivisions` splits each coarse height-band/width-column into a fine
// grid - a displacementMap needs enough vertices to read as smooth relief
// instead of a handful of blocky quads.
function createBeveledWallGeometry(
  width: number,
  height: number,
  bevelFraction: number,
  bevelAngleDeg: number,
  sign: 1 | -1,
  subdivisions = 10,
): THREE.BufferGeometry {
  const bevelH = height * bevelFraction;
  // bevelAngleDeg is measured from horizontal (the floor/ceiling plane), not
  // from vertical - so recess = adjacent/opposite = bevelH / tan(angle).
  // Lower angle -> closer to flat/horizontal -> more dramatic recess.
  const recess = (bevelH / Math.tan((bevelAngleDeg * Math.PI) / 180)) * sign;
  const halfH = height / 2;
  const halfW = width / 2;
  const margin = Math.min(0.15, width * 0.2);

  // profile points (y, zBase) centered on the origin to match
  // THREE.PlaneGeometry's local coordinate convention (both are positioned
  // by the same `mesh.position.y = wallHeight / 2` call)
  const yProfile: [number, number][] = [
    [-halfH, 0],
    [-halfH + bevelH, recess],
    [halfH - bevelH, recess],
    [halfH, 0],
  ];

  // width columns: flush at the true edges, full effect inside the margin
  const xCols = [-halfW, -halfW + margin, halfW - margin, halfW];
  const taper = [0, 1, 1, 0];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (let yi = 0; yi < yProfile.length - 1; yi++) {
    const [y0, z0base] = yProfile[yi];
    const [y1, z1base] = yProfile[yi + 1];

    // flat per-row normal from the height-direction slope only (the small
    // extra slope introduced by the width taper near corners is ignored -
    // an acceptable approximation given how narrow that margin is)
    const dy = y1 - y0;
    const dz = z1base - z0base;
    let ny = -dz;
    let nz = dy;
    const len = Math.hypot(ny, nz) || 1;
    ny /= len;
    nz /= len;
    if (nz < 0) {
      ny = -ny;
      nz = -nz;
    }

    for (let xi = 0; xi < xCols.length - 1; xi++) {
      const x0 = xCols[xi];
      const x1 = xCols[xi + 1];
      const t0 = taper[xi];
      const t1 = taper[xi + 1];
      const uvBase0 = yi / (yProfile.length - 1);
      const uvBase1 = (yi + 1) / (yProfile.length - 1);

      for (let sv = 0; sv < subdivisions; sv++) {
        const fv0 = sv / subdivisions;
        const fv1 = (sv + 1) / subdivisions;
        const yA = lerp(y0, y1, fv0);
        const yB = lerp(y0, y1, fv1);
        const zBaseA = lerp(z0base, z1base, fv0);
        const zBaseB = lerp(z0base, z1base, fv1);
        const uvA = lerp(uvBase0, uvBase1, fv0);
        const uvB = lerp(uvBase0, uvBase1, fv1);

        for (let sh = 0; sh < subdivisions; sh++) {
          const fh0 = sh / subdivisions;
          const fh1 = (sh + 1) / subdivisions;
          const xA = lerp(x0, x1, fh0);
          const xB = lerp(x0, x1, fh1);
          const tA = lerp(t0, t1, fh0);
          const tB = lerp(t0, t1, fh1);
          const uA = (xA + halfW) / width;
          const uB = (xB + halfW) / width;

          const v00 = [xA, yA, zBaseA * tA];
          const v10 = [xB, yA, zBaseA * tB];
          const v11 = [xB, yB, zBaseB * tB];
          const v01 = [xA, yB, zBaseB * tA];

          positions.push(...v00, ...v10, ...v11, ...v00, ...v11, ...v01);
          for (let k = 0; k < 6; k++) normals.push(0, ny, nz);
          uvs.push(uA, uvA, uB, uvA, uB, uvB, uA, uvA, uB, uvB, uA, uvB);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

// a lit ceiling panel glows in its deck's lamp color (see lampColor)
const LIGHT_PANEL_INTENSITY = 1.6;

// floor used where the map doesn't specify one
const DEFAULT_FLOOR: TextureSetId = "floor1";

// A wall panel is a whole texture tall, or - where a wall's height isn't a
// whole number of panels - a band of the texture: its top ("t") or bottom
// ("b") rows, this fraction of it high.
type PanelVariant = "full" | `t${number}` | `b${number}`;

function variantRows(variant: PanelVariant): [number, number] | undefined {
  if (variant === "full") return undefined;
  const fraction = Number(variant.slice(1));
  return variant[0] === "t" ? [0, fraction] : [1 - fraction, 1];
}

function variantHeight(variant: PanelVariant): number {
  return variant === "full" ? 1 : Number(variant.slice(1));
}

// Splits the vertical span of a wall (in wall heights) into panels: whole
// ones stacked from the anchored end, plus a band for the rest. A wall
// standing on a floor continues upward into its texture's top rows; a step
// face (a riser) shorter than a panel shows the bottom rows, like the foot
// of a wall; a strip hanging from a ceiling (a header) the top rows.
function wallPanels(bottom: number, top: number, anchor: "bottom" | "top"): { bottom: number; variant: PanelVariant }[] {
  const length = top - bottom;
  const whole = Math.floor(length + 1e-6);
  const rest = Math.round((length - whole) * 4) / 4;
  const panels: { bottom: number; variant: PanelVariant }[] = [];
  if (anchor === "bottom") {
    for (let i = 0; i < whole; i++) panels.push({ bottom: bottom + i, variant: "full" });
    if (rest > 0) panels.push({ bottom: bottom + whole, variant: whole > 0 ? `t${rest}` : `b${rest}` });
  } else {
    for (let i = 0; i < whole; i++) panels.push({ bottom: top - 1 - i, variant: "full" });
    if (rest > 0) panels.push({ bottom, variant: whole > 0 ? `b${rest}` : `t${rest}` });
  }
  return panels;
}

// a flat panel showing only a band of its texture (see PanelVariant)
function createBandPlane(height: number, [top, bottom]: [number, number]): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(1, height);
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - bottom + uv.getY(i) * (bottom - top));
  return geo;
}

interface WallSlot {
  x: number;
  z: number;
  // world height of the panel's center (walls) or plane (floors, ceilings)
  y: number;
  rotY: number;
  // walls only
  variant?: PanelVariant;
  // ceiling tile under a ceiling light: use the kit's glowing material
  lit?: boolean;
  // surfaceKey of the panel, for decals to find it
  key: string;
}

// Everything the walls (or floors, ceilings) of one texture set need: its own
// materials and, in relief mode, its own geometry (built from that set's
// depth map).
interface WallKit {
  // its texture folder: the key of its tuning (see textureTuning.ts)
  id: string;
  depthUrl: string;
  // see TextureSetPaths
  grateLevels?: number;
  wallMat: THREE.MeshStandardMaterial;
  // relief step sides: same texture, no normal map (see reliefMesh.ts groups)
  sideMat: THREE.MeshStandardMaterial;
  // wallMat plus the set's emissive mask glowing, if it has one
  litMat?: THREE.MeshStandardMaterial;
  // disposed with the scene (incl. the relief AO map once built)
  textures: THREE.Texture[];
  slots: WallSlot[];
  // a prop's own normal strength, relative to the viewer's (PropType.normal)
  normal?: number;
  // a floor kit: it takes the floors' own normal strength
  floor?: boolean;
}

// Stable pseudo-random 0..1 per wall face, from its position (face centers
// sit on half-cell coordinates, so doubled they're integers). Keeps the
// accent texture on the same walls across reloads and setting changes.
function kitMaterials(kit: WallKit): THREE.MeshStandardMaterial[] {
  return kit.litMat ? [kit.wallMat, kit.sideMat, kit.litMat] : [kit.wallMat, kit.sideMat];
}

function wallVariantRoll(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 2), 374761393) ^ Math.imul(Math.round(z * 2), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// custom HMR event sent by the texture hot-reload plugin in vite.config.ts
const TEXTURE_CHANGED_EVENT = "voidcrew:texture-changed";

const FOG_NEAR = 1.6;
// (the fog ends this far short of the view distance)
const FOG_FAR_MARGIN = 0.5;
// The fog thickens over at most this many cells before its end: up to the
// usual 7-cell view it starts at FOG_NEAR as ever, but a farther view moves
// its start out with it - else a longer view only added more black, a lit
// hall 8 cells off fogged as dark as one past the view (the fog, not the
// lights' reach, was what hid it).
const FOG_SPAN = 5;
function fogNear(far: number): number {
  return Math.max(FOG_NEAR, far - FOG_SPAN);
}
// A dark fog is the dark, not a haze: what a lamp lights stands out of it
// as far as it's drawn. So a lit pixel (by its brightness) isn't fogged
// over the fog's whole span, only over its last LIT_FOG_SPAN cells - the
// lights fade out over about as much (LIGHT_FADE_SPAN) - and an unlit one
// as before. Without it a shorter view (High's 9 cells against Ultra's 14)
// left a torch-lit hall 7 cells off nearly black, though drawn and lit:
// the fog starts FOG_SPAN short of the view's end. A light fog (mist) is
// left alone: it hides lit things too. (Every material's fog; a few
// instructions a pixel.)
const LIT_FOG_SPAN = 1.5;
// (once: a hot reload runs this module again)
if (!THREE.ShaderChunk.fog_fragment.includes("fogLit")) THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
  "gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );",
  `#ifndef FOG_EXP2
	{
		const vec3 fogLuma = vec3( 0.3, 0.59, 0.11 );
		float fogLit = smoothstep( 0.12, 0.4, dot( gl_FragColor.rgb, fogLuma ) ) * ( 1.0 - smoothstep( 0.03, 0.2, dot( fogColor, fogLuma ) ) );
		fogFactor = mix( fogFactor, smoothstep( fogFar - ${LIT_FOG_SPAN.toFixed(2)}, fogFar, vFogDepth ), fogLit );
	}
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );`,
);

// Map lights are served by a fixed pool of point lights reassigned to the
// best sources every frame: three.js compiles the light count into its
// shaders, so a constant pool avoids recompiles, and the per-pixel lighting
// cost stays bounded however many lights the map has. Only sources in
// cells the party can see (or next to one - their light spills through
// doorways) compete, nearest first, those ahead of the camera favored.
// Lights fade out with distance, about where the fog closes, and a slot
// fades its light in and out instead of popping.
// The sight (lights and culling) reaches the view distance setting; lights
// fade out over its last LIGHT_FADE_SPAN cells.
// (the most: the graphics setting can ask for fewer - Graphics.lightPool;
// and no more than the reach texture has bits for, see lightGrid.ts)
const LIGHT_POOL_SIZE = 8;
const LIGHT_FADE_SPAN = 1.5;
// where in the party's cell the sight is taken from (offsets from its center)
const SIGHT_POINTS: [number, number][] = [
  [0, 0],
  [-0.35, -0.35],
  [0.35, -0.35],
  [-0.35, 0.35],
  [0.35, 0.35],
];
// aiming camera: how much of the view a target fills while a part is
// picked, the narrowest field of view (degrees) and how fast it eases (s)
const AIM_FRAMING = 1.6;
const AIM_MIN_FOV = 8;
const AIM_CAMERA_TAU = 0.12;
// the party's cover (see updatePartyCover): how often it's measured (ms),
// the heights sampled on its body (shares of the eye height) and how wide
// it stands
const PARTY_COVER_REFRESH_MS = 250;
const PARTY_BODY_HEIGHTS = [0.3, 0.65, 1];
const PARTY_BODY_HALF_WIDTH = 0.12;
// the hit chance samples a grid of this many spots squared over a part
const CHANCE_GRID = 6;
// actors: how long a hit flashes and a death fades (game ms)
const ACTOR_FLASH_MS = 220;
const ACTOR_FADE_MS = 900;
// an actor's firing pose, held after a shot; each of its dying frames (ms)
const ACTOR_SHOOT_POSE_MS = 350;
const ACTOR_DIE_FRAME_MS = 260;
// each of its firing rows, when it has several (ActorType.shootRows)
const ACTOR_SHOOT_FRAME_MS = 70;
// how long its hit pose shows (ActorType.hitRow)
const ACTOR_HIT_POSE_MS = 320;
// aiming: how often the hit chances are worked out again (real ms), and how
// long a shot's trace lingers
const AIM_CHANCE_REFRESH_MS = 250;
// how many body parts' chances are worked out again per frame
const AIM_CHANCE_PARTS_PER_FRAME = 1;
const TRACER_MS = 220;
// objects wider or deeper than this (cells) are never culled
const CULL_MAX_SIZE = 1.3;
// Walls, floors and ceilings farther than this (world units) switch to a
// relief built from a height grid LOD_FACTOR times coarser: a few times
// fewer triangles, and at that distance, in the fog, it looks the same.
const LOD_DISTANCE = 2.2;
const LOD_FACTOR = 4;
// Smooth relief resamples its height grid to the wall detail setting, so a
// coarser grid alone wouldn't thin it out: its distant versions take fewer
// cells instead - a half as many each way (a quarter of the triangles) past
// LOD_DISTANCE, a quarter past SMOOTH_LODS' second distance - never below
// SMOOTH_LOD_MIN_CELLS along a whole panel's long side.
const SMOOTH_LODS: { distance: number; divisor: number }[] = [
  { distance: LOD_DISTANCE, divisor: 2 },
  { distance: 3.6, divisor: 4 },
];
const SMOOTH_LOD_MIN_CELLS = 8;
// Relief wall panels run their relief right up to their side edges and are
// joined to their neighbors by thin strips built from both edges (see
// cornerJoins.ts) - stones meeting stones round a corner. Off: every panel
// eases to the flat base along its sides instead, the old way (also from
// the console, dev only: __voidcrewNoJoins = true, then rebuild the scene).
const CORNER_JOINS = true;
// a surface's distant version, and from how far it's shown
interface FarLevel {
  geometry: THREE.BufferGeometry;
  distance: number;
}
// a source behind the camera ranks as if this much further away
const LIGHT_BEHIND_PENALTY = 0.35;
// a source this much (world units) past its own reach behind the camera
// doesn't compete at all (see updateLightPool)
const LIGHT_BEHIND_SLACK = 0.5;
// a source already in the pool keeps its slot until a rival ranks this
// much nearer (a fraction of its distance), so near-ties don't flicker
const LIGHT_KEEP_BIAS = 0.85;
// how fast a slot's light fades in or out (per second, 0..1)
const LIGHT_SLOT_FADE = 4;

// settings.fov is applied to the screen's shorter side; on a portrait screen
// that makes the vertical FOV large, capped here to limit distortion
const MAX_VERTICAL_FOV = 115;

// Doors: a door cell holds one door at its center, across the passage, so
// the doorway reads as a thick bulkhead with a shallow alcove on each side.
// The frame is a two-sided slab (two relief halves back to back, their
// opening's jambs meeting at the center plane); the panel is a thinner
// two-sided slab inside it, recessed behind the frame's faces, that slides
// up into the ceiling to open.
const DOOR_FRAME_SET: TextureSetId = "doorframe1";
// Windows: the frame panel, how deep its opening recesses into the wall
// (the glass sits at the back), and the glass's slight cool tint
const WINDOW_SET: TextureSetId = "window1";
const WINDOW_DEPTH = 0.1;
// props are small: a shallower relief than the walls'
const PROP_RELIEF_SCALE = 0.6;
const NO_LAYERS: ReadonlySet<string> = new Set();

// The starry sky behind open walls and ceilings (a map's "sky" texture set): a
// night gradient with a few hundred stars, drawn once as the scene's
// background (an equirectangular image, so it turns with the view and
// stays out of the fog and the far plane). Seeded, so it's the same sky
// every time.
function makeSkyTexture(): THREE.Texture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#02030a");
  gradient.addColorStop(0.55, "#0a1230");
  gradient.addColorStop(1, "#16203f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  let seed = 20240611;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 700; i++) {
    const x = Math.floor(random() * w);
    const y = Math.floor(random() * h * 0.85);
    const bright = 0.35 + random() * 0.65;
    const size = random() < 0.08 ? 2 : 1;
    ctx.fillStyle = `rgba(${Math.round(200 + 55 * random())}, ${Math.round(210 + 45 * random())}, 255, ${bright})`;
    ctx.fillRect(x, y, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  // (the shader below writes these values as they are: no color conversion)
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

// A pane of sky: it shows the sky image in the direction the camera looks
// through it, so panes next to each other join up and the sky stays far away
// whatever the pane's distance. Not lit, not fogged.
function makeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: makeSkyTexture() } },
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        // the sky image covers the upper hemisphere: the horizon along its bottom edge, the zenith at the top
        vec2 uv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, clamp(asin(clamp(dir.y, -1.0, 1.0)) / 1.5707963, 0.0, 1.0));
        gl_FragColor = vec4(texture2D(map, uv).rgb, 1.0);
      }`,
  });
}
// loot items' sprites: how tall (world units), how far above the floor, and
// a spill's timing (ms): out of the container, lying there until, drawn in
const ITEM_HEIGHT = 0.2;
const ITEM_LIFT = 0.005;
// how much they glow (see itemTemplate)
const ITEM_GLOW = 0.1;
// how their normals are bent (see itemTemplate): how much of the relief's
// own normal is kept, and what's added - up, and a little back
const ITEM_NORMAL_KEEP = 0.6;
const ITEM_NORMAL_BEND = new THREE.Vector3(0, 1, -0.35);
const SPILL_OUT_MS = 380;
const SPILL_REST_MS = 1000;
const SPILL_IN_MS = 380;

// an exit's floor marker: a green frame with chevrons and EXIT
function makeExitMarker(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "#5dffa0";
  ctx.fillStyle = "#5dffa0";
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 112, 112);
  ctx.lineWidth = 6;
  ctx.lineJoin = "miter";
  for (const y of [34, 50]) {
    ctx.beginPath();
    ctx.moveTo(40, y + 12);
    ctx.lineTo(64, y - 6);
    ctx.lineTo(88, y + 12);
    ctx.stroke();
  }
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillText("EXIT", 64, 102);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// a chalk cross over a whole texture, a few rough strokes (the mark on an
// emptied container)
function drawChalkCross(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.lineCap = "round";
  const unit = Math.min(w, h) / 128;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 3 * unit;
  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? "rgba(250, 248, 240, 0.95)" : "rgba(235, 232, 222, 0.55)";
      ctx.lineWidth = (pass ? 4 : 8) * unit;
      ctx.beginPath();
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t + rand();
        const y = y0 + (y1 - y0) * t + rand();
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };
  stroke(w * 0.2, h * 0.18, w * 0.8, h * 0.8);
  stroke(w * 0.8, h * 0.2, w * 0.22, h * 0.82);
  ctx.restore();
}
// ... and a coarser one: their faces are small, so a full-size height grid
// packs several times the walls' triangles into them
const PROP_COARSE = 2;
const GLASS_TINT = 0xdfe8ff;
// how strongly lights glint on the glass
const GLASS_SHEEN = 0.25;

// Lift rides: the cabin lights dip this long either side of the deck swap;
// a shaft light passes every SHAFT_LIGHT_PERIOD_MS, sweeping this far above
// and below the eyes
const LIFT_DIP_MS = 350;
const SHAFT_LIGHT_COLOR = 0xffe2b0;
const SHAFT_LIGHT_INTENSITY = 3.5;
const SHAFT_LIGHT_PERIOD_MS = 700;
const SHAFT_LIGHT_SWEEP = 1.2;
// how far away an interactive decal can be touched (world units)
const TOUCH_REACH = 1.4;
// a camera's light on the crew: watching, raising the alarm
const CAMERA_WATCH_LIGHT = 0xffc23a;
const CAMERA_ALARM_LIGHT = 0xff2418;
// a fire (see fire.ts): its light (color, intensity and reach at size 1,
// how high over its flames), and the dark smoke rising off it (color, how
// high over the flames it comes from, how much and how big beside them)
const FIRE_LIGHT = 0xff7a2a;
const FIRE_LIGHT_INTENSITY = 1.8;
const FIRE_LIGHT_RANGE = 2.4;
const FIRE_LIGHT_LIFT = 0.15;
const FIRE_SMOKE_COLOR = 0x2e2a27;
const FIRE_SMOKE_LIFT = 0.3;
const FIRE_SMOKE_DENSITY = 0.8;
const FIRE_SMOKE_SIZE = 1.3;
// a fire light's flicker at `now` (ms): about 1, quickly unsteady
function fireFlicker(now: number, seed: number): number {
  return 1 + 0.22 * Math.sin(now / 47 + seed * 1.7) + 0.15 * Math.sin(now / 23 + seed * 4.1) + 0.12 * (Math.random() - 0.5);
}
// the crew down: how long the view takes to fall, the eye's height above
// the floor then, how far up it looks and how far over the head rolls
const DOWN_FALL_MS = 900;
const DOWN_EYE = 0.09;
const DOWN_LOOK_UP = 0.35;
const DOWN_ROLL = 1.25;
// the map editor: how far (world units) it picks cells, and the highlight's
// colors - a wall to dig out, a floor to fill in
const EDIT_REACH = 8;
const EDIT_DIG_COLOR = 0xffa040;
const EDIT_FILL_COLOR = 0x40d0ff;
// the Texture tool paints the surface green; the Light tool shows yellow
// where a click adds a ceiling light, blue where it takes one away
const EDIT_PAINT_COLOR = 0x60ff80;
const EDIT_LIGHT_ADD_COLOR = 0xffe040;
const EDIT_SELECT_COLOR = 0x80f0ff;
// how far off a surface a free-standing light is placed (world units)
const LIGHT_SPOT_GAP = 0.12;
// muzzle flashes (see addFlash): the party's, and an actor's (its color,
// strength, reach and length in ms)
const PARTY_FLASH_COLOR = 0xffe2a0;
const ACTOR_FLASH = { color: 0xff9a40, intensity: 3.5, range: 3, duration: 110 };
// a surface's pixels across one panel (as decals count them - see decals.ts)
const SURFACE_PIXELS = 256;
// smoke's own color where the map gives none (see SmokeSpec)
const SMOKE_COLOR = 0xb4b8bc;
// how strongly a texture set's glow map shines (see TextureSetFiles.glow)
const SURFACE_GLOW = 1.2;
// an actor's glowing pixels (see glowMapOf): at least this red, no more
// than this green or blue
const GLOW_MIN_RED = 150;
const GLOW_MAX_OTHER = 90;
// ... or, for the other colors that glow (see ActorType.glow), bright and
// clearly that color
const GLOW_COLORS: Record<"red" | "blue" | "cyan", (r: number, g: number, b: number) => boolean> = {
  red: (r, g, b) => r >= GLOW_MIN_RED && Math.max(g, b) <= GLOW_MAX_OTHER,
  blue: (r, _g, b) => b > 170 && b - r > 70,
  cyan: (r, g, b) => g > 170 && b > 170 && r < 130,
};
const EDIT_LIGHT_REMOVE_COLOR = 0x40d0ff;
const DOOR_PANEL_SETS: Record<DoorSpec["kind"], TextureSetId> = {
  standard: "door1",
  lift: "liftdoor1",
};
// door group Y rotation that turns its local +Z toward the door's facing
const FACING_ROTATION: Record<Direction, number> = {
  S: 0,
  E: Math.PI / 2,
  N: Math.PI,
  W: -Math.PI / 2,
};
// where a door's label goes on its panel texture (pixels): the blank field
// on the left of the lift door panel, minus the strip hidden behind the
// frame's jamb (the panel reaches DOOR_PANEL_OVERLAP behind the frame)
const DOOR_LABEL_AREA = { x: 14, y: 8, w: 78, h: 240 };
// label letters are at most this many texture pixels per font pixel (a 5x7
// letter at 4 = 20x28 of the panel's 256px)
const DOOR_LABEL_MAX_SCALE = 4;
// a lift door's deck number sits this far (panel pixels) above its label
const DOOR_NUMBER_GAP = 12;
// the dark red of the walls' painted stripes
const LABEL_PAINT: [number, number, number] = [156, 27, 26];
const LABEL_PAINT_DARK: [number, number, number] = [133, 22, 24];
// each frame half's base plane sits this far from the center plane (keep it
// deeper than the frame relief's deepest recess)
const DOOR_FRAME_HALF_DEPTH = 0.05;
// same for the panel: well behind the frame's faces
const DOOR_PANEL_HALF_DEPTH = 0.02;
// how far the panel reaches behind the frame around the opening
const DOOR_PANEL_OVERLAP = 0.03;
const DOOR_OPEN_MS = 400;

// trim textures cut from the decals (scripts/make-trim-textures.ts), mapped
// at the walls' density: texels per world unit
const TRIM_PAINT_URL = `${import.meta.env.BASE_URL}textures/trim_paint/diffuse.png`;
const TRIM_HAZARD_URL = `${import.meta.env.BASE_URL}textures/trim_hazard/diffuse.png`;
const TRIM_TEXELS = 256;

// Ladders (world units), in the worn yellow paint
const LADDER_HALF_WIDTH = 0.16;
const LADDER_RAIL = 0.03;
const LADDER_RUNG = 0.022;
// in front of the step face, clear of its relief
const LADDER_STANDOFF = 0.09;
// the rails reach this far above the ledge (wall heights)...
const LADDER_HANDHOLD = 0.3;
// ...and come down onto it this far back from the edge
const LADDER_NECK = 0.12;
// the low plate along a bridge deck's edges (world units): as tall as the
// hazard stripe band
const BRIDGE_KICK = 16 / TRIM_TEXELS;
// the beams along a see-through deck's edges, under it
const BRIDGE_STRINGER = 0.04;

// a peek eases back to center once its input has been idle this long...
const PEEK_IDLE_MS = 300;
// ...with this time constant (s)
const PEEK_RETURN_TAU = 0.25;

interface GameViewportProps {
  map: GameMap;
  pos: Vec2;
  dir: Direction;
  // the height stood at: the cell's floor, or a bridge (wall heights)
  elevation: number;
  // door cells ("x,y") that are open
  openDoors: ReadonlySet<string>;
  // a lift ride in progress: the cabin shakes, the shaft's lights sweep by
  ride?: LiftRide | null;
  // the deck's moving actors (drawn as sprites, see updateActors)
  actors?: readonly ActorState[];
  // a crewmate aiming this weapon: each frame fills aimFrameRef for the
  // aiming overlay
  aiming?: Weapon | null;
  // the whole crew down since (performance.now()): the view drops to the floor
  downAt?: number | null;
  // the ship's livery hue (see variation.ts accentOf; null: as painted)
  shipAccent?: number | null;
  aimFrameRef?: MutableRefObject<AimFrame | null>;
  aimFocusRef?: MutableRefObject<AimFocus | null>;
  // written here: how much of the party each hostile actor sees past cover
  partyCoverRef?: MutableRefObject<Map<number, number>>;
  // an interactive decal (DecalSpec.action) was clicked or tapped within
  // reach
  onTouch?: (action: string) => void;
  // the map editor is on: the cell under the pointer is highlighted, and a
  // click or tap edits it (`alt`: the right button)
  editMode?: boolean;
  // the editor's layers hidden from the view ("robot" for the NPCs, "smoke" for the
  // particles, "prop", "decal", "item") - drawing only, the map still has them
  hiddenLayers?: ReadonlySet<string>;
  // the tool the editor has picked: what the highlight says a click does
  editTool?: EditTool;
  onEdit?: (target: EditTarget, alt: boolean, shift: boolean) => void;
  // the Light tool's selected light (its index in the map's lights)
  selectedLight?: number | null;
  // the Prop tool's selected prop (its index in the map's props)
  selectedProp?: number | null;
  // the Decal tool's selected decal (its index in the map's decals)
  selectedDecal?: number | null;
  // the Door tool's selected door (its cell)
  selectedDoor?: Vec2 | null;
  // the Robot tool's selected actor (its index in the map's actors)
  selectedActor?: number | null;
  // the Item tool's selected item (its index in the map's items)
  selectedItem?: number | null;
  // the Smoke tool's selected emitter (its index in the map's smokes)
  selectedSmoke?: number | null;
  // the surface under the pointer whenever it changes - the editor's
  // texture palette follows it
  onEditHover?: (target: EditTarget | null) => void;
  // The editor: something dragged (see App and EditDrag). The first call may
  // copy it (Ctrl held); it returns the index of what is being dragged from
  // then on - for a door dropped, whether the map took it.
  onEditDrag?: (drag: EditDrag, target: EditTarget) => number | boolean | void;
  // The editor: the wheel (or Alt+drag) over the view raises, scales or turns the
  // selected prop or decal by a step
  onEditAdjust?: (adjust: { what: "height" | "scale" | "rotate"; delta: number }) => void;
  // a map's scene is fully built and shown (after the loading screen)
  onReady?: (mapId: string) => void;
  // free movement: called every frame with the frame time (s), returns the
  // camera pose; when absent the camera follows pos/dir on the grid
  freeTick?: (dt: number) => FreePose;
  // grid movement: glance-around yaw offset (see useViewControls); eased
  // back to 0 here once its input goes idle
  peekRef?: MutableRefObject<PeekState>;
  settings: ViewportSettings;
  onStats?: (stats: ViewportStats) => void;
  // loot (see useGameState): the containers emptied and the loose items
  // taken (indices in map.props / map.items), and the spills to show
  lootedProps?: ReadonlySet<number>;
  takenItems?: ReadonlySet<number>;
  spills?: readonly LootSpill[];
}

interface CamTarget {
  x: number;
  z: number;
  tx: number;
  tz: number;
  // height of the surface under the camera (wall heights)
  y: number;
}

function computeTarget(pos: Vec2, dir: Direction, elevation: number): CamTarget {
  const fwd = DIR_VECTOR[dir];
  return { x: pos.x, z: pos.y, tx: pos.x + fwd.x, tz: pos.y + fwd.y, y: elevation };
}

// Jumping off a bridge: a step sideways off the deck (`side`, from the
// cell's center), the fall, and back under the bridge to the cell's center.
function jumpPose(
  from: CamTarget,
  to: CamTarget,
  side: Vec2,
  elapsed: number,
  moveMs: number,
): { cam: CamTarget; done: boolean } {
  const drop = from.y - to.y;
  const off = { x: from.x + side.x * JUMP_CLEARANCE, z: from.z + side.y * JUMP_CLEARANCE };
  const fallMs = 1000 * Math.sqrt((2 * drop) / FALL_GRAVITY);
  const t1 = moveMs * 0.6;
  const t2 = t1 + fallMs;
  const t3 = t2 + moveMs;
  let x = to.x;
  let z = to.z;
  let y = to.y;
  if (elapsed < t1) {
    const e = easeInOutQuad(elapsed / t1);
    x = lerp(from.x, off.x, e);
    z = lerp(from.z, off.z, e);
    y = from.y;
  } else if (elapsed < t2) {
    const f = (elapsed - t1) / fallMs;
    x = off.x;
    z = off.z;
    y = from.y - drop * f * f;
  } else if (elapsed < t3) {
    const e = easeInOutQuad((elapsed - t2) / moveMs);
    x = lerp(off.x, to.x, e);
    z = lerp(off.z, to.z, e);
  }
  return {
    cam: { x, z, y, tx: x + (to.tx - to.x), tz: z + (to.tz - to.z) },
    done: elapsed >= t3,
  };
}

// how fast a fall off a ledge speeds up (wall heights per second squared;
// stylized - a wall is ~2.5 m, so real gravity would be ~4)
const FALL_GRAVITY = 12;
// a fall starts this far into the step off the ledge
const FALL_START = 0.4;
// ladder rungs are this far apart (wall heights); a climb pulls up rung by
// rung
const RUNG_SPACING = 0.125;
// how far from a bridge's middle line a jump off it clears the deck
const JUMP_CLEARANCE = BRIDGE_WIDTH / 2 + 0.15;

// The camera along a ladder move: walk to the ladder, climb, walk off. Up:
// to the cell edge (the pulled-back eye then sits just in front of the step
// face), up, and on over the ledge. Down: out over the edge into the lower
// cell (the eye just beyond the step face), then down.
function climbPose(from: CamTarget, to: CamTarget, elapsed: number, moveMs: number): { cam: CamTarget; done: boolean } {
  const up = to.y > from.y;
  const height = Math.abs(to.y - from.y);
  const climbMs = CLIMB_MS_PER_HEIGHT * height;
  const at = up ? { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 } : { x: to.x, z: to.z };
  const walkIn = up ? moveMs * 0.5 : moveMs;
  const walkOut = up ? moveMs * 0.5 : 0;
  const total = walkIn + climbMs + walkOut;

  let x: number;
  let z: number;
  let y: number;
  if (elapsed < walkIn) {
    const e = easeInOutQuad(elapsed / walkIn);
    x = lerp(from.x, at.x, e);
    z = lerp(from.z, at.z, e);
    y = from.y;
  } else if (elapsed < walkIn + climbMs) {
    const c = (elapsed - walkIn) / climbMs;
    // speeding up and slowing down once per rung
    const rungs = Math.max(1, Math.round(height / RUNG_SPACING));
    const p = c - (Math.sin(2 * Math.PI * c * rungs) / (2 * Math.PI * rungs)) * 0.8;
    x = at.x;
    z = at.z;
    y = lerp(from.y, to.y, p);
  } else {
    const e = walkOut ? easeOutQuad(Math.min(1, (elapsed - walkIn - climbMs) / walkOut)) : 1;
    x = lerp(at.x, to.x, e);
    z = lerp(at.z, to.z, e);
    y = to.y;
  }
  // the facing (normally unchanged by a move) blends over the whole climb
  const k = Math.min(1, elapsed / total);
  return {
    cam: { x, z, y, tx: x + lerp(from.tx - from.x, to.tx - to.x, k), tz: z + lerp(from.tz - from.z, to.tz - to.z, k) },
    done: elapsed >= total,
  };
}

// shared by every scene, never disposed (see GeometryViewId)
const GEOMETRY_VIEW_MATERIALS: Partial<Record<GeometryViewId, THREE.Material>> = {};
function geometryViewMaterial(view: GeometryViewId): THREE.Material | null {
  // (the map views swap the materials' maps instead: see applyMaterialViews)
  if (view === "textured" || view === "normals" || view === "depth") return null;
  GEOMETRY_VIEW_MATERIALS[view] ??=
    view === "faces"
      ? new THREE.MeshNormalMaterial({ flatShading: true, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ color: 0x4dff88, wireframe: true, fog: true });
  return GEOMETRY_VIEW_MATERIALS[view];
}

// Aiming: the picked body part lights up on its actor's sprite - its own
// pixels, not a box: a faint fill and a bright outline, drawn in the scene,
// so whatever covers part of it covers the highlight too. The sprite's
// material gets the four parts' zones (sheet UVs of the cell shown) and the
// picked one's index (-1: none). Its weak spots (ActorType.crits) show red
// with a yellow rim.
const MAX_CRIT_ZONES = 10;
interface PartHighlight {
  zones: { value: THREE.Vector4[] };
  // 1: outline the whole sprite (the crew's scanner, see enemyScanner)
  outline: { value: number };
  part: { value: number };
  texel: { value: THREE.Vector2 };
  // the weak spots' zones in the cell shown, their parts, and how many
  crits: { value: THREE.Vector4[] };
  critParts: { value: number[] };
  critCount: { value: number };
  // the actor's glowing parts (see ActorType.glow) and how bright they are
  glowMap: { value: THREE.Texture };
  glow: { value: number };
}
// no glow (a sampler needs some texture)
const NO_GLOW = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
NO_GLOW.needsUpdate = true;
function highlightMaterial(material: THREE.MeshStandardMaterial): PartHighlight {
  const uniforms: PartHighlight = {
    zones: { value: BODY_PARTS.map(() => new THREE.Vector4()) },
    outline: { value: 0 },
    part: { value: -1 },
    texel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    crits: { value: Array.from({ length: MAX_CRIT_ZONES }, () => new THREE.Vector4()) },
    critParts: { value: new Array(MAX_CRIT_ZONES).fill(-1) },
    critCount: { value: 0 },
    glowMap: { value: NO_GLOW },
    glow: { value: 0 },
  };
  material.customProgramCacheKey = () => "actor-part-highlight";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPartZones = uniforms.zones;
    shader.uniforms.uPart = uniforms.part;
    shader.uniforms.uOutline = uniforms.outline;
    shader.uniforms.uTexel = uniforms.texel;
    shader.uniforms.uCrits = uniforms.crits;
    shader.uniforms.uCritParts = uniforms.critParts;
    shader.uniforms.uCritCount = uniforms.critCount;
    shader.uniforms.uGlowMap = uniforms.glowMap;
    shader.uniforms.uGlow = uniforms.glow;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance += texture2D(uGlowMap, vMapUv).rgb * uGlow;`,
      )
      .replace(
        "#include <map_pars_fragment>",
        `#include <map_pars_fragment>
uniform vec4 uPartZones[${BODY_PARTS.length}];
uniform float uOutline;
uniform sampler2D uGlowMap;
uniform float uGlow;
uniform int uPart;
uniform vec2 uTexel;
uniform vec4 uCrits[${MAX_CRIT_ZONES}];
uniform float uCritParts[${MAX_CRIT_ZONES}];
uniform int uCritCount;
bool inZone(vec4 z, vec2 uv) { return uv.x >= z.x && uv.x <= z.z && uv.y <= z.y && uv.y >= z.w; }
// the weak spot zone a spot of the sheet is in (-1: none)
int critOf(vec2 uv) {
  for (int i = 0; i < ${MAX_CRIT_ZONES}; i++) {
    if (i >= uCritCount) break;
    if (inZone(uCrits[i], uv)) return i;
  }
  return -1;
}
// the part a spot of the sheet belongs to (a BODY_PARTS index): a weak
// spot's, else head, torso, legs, then the arms (they reach across the
// torso) - as hitPart() on the CPU
int partOf(vec2 uv) {
  int c = critOf(uv);
  if (c >= 0) return int(uCritParts[c] + 0.5);
  if (inZone(uPartZones[0], uv)) return 0;
  if (inZone(uPartZones[1], uv)) return 1;
  if (inZone(uPartZones[4], uv)) return 4;
  if (inZone(uPartZones[2], uv)) return 2;
  if (inZone(uPartZones[3], uv)) return 3;
  return -1;
}
bool solid(vec2 uv) { return texture2D(map, uv).a >= 0.5; }
bool onPart(vec2 uv) { return texture2D(map, uv).a >= 0.5 && partOf(uv) == uPart; }
bool onCrit(vec2 uv) { return texture2D(map, uv).a >= 0.5 && critOf(uv) >= 0 && partOf(uv) == uPart; }`,
      )
      .replace(
        "#include <fog_fragment>",
        `#include <fog_fragment>
// after the fog, so it reads at any distance: a tint over the part, and a
// two-texel outline where it meets another part or the transparent edge
if (uPart >= 0 && onPart(vMapUv)) {
  bool edge = false;
  for (int i = 1; i <= 2; i++) {
    vec2 d = uTexel * float(i);
    edge = edge || !onPart(vMapUv + vec2(d.x, 0.0)) || !onPart(vMapUv - vec2(d.x, 0.0)) ||
      !onPart(vMapUv + vec2(0.0, d.y)) || !onPart(vMapUv - vec2(0.0, d.y));
  }
  if (edge) gl_FragColor.rgb = vec3(0.5, 1.0, 0.7);
  else if (critOf(vMapUv) >= 0) {
    bool rim = !onCrit(vMapUv + vec2(uTexel.x, 0.0)) || !onCrit(vMapUv - vec2(uTexel.x, 0.0)) ||
      !onCrit(vMapUv + vec2(0.0, uTexel.y)) || !onCrit(vMapUv - vec2(0.0, uTexel.y));
    gl_FragColor.rgb = rim ? vec3(1.0, 0.85, 0.2) : mix(gl_FragColor.rgb, vec3(1.0, 0.18, 0.08), 0.55);
  } else gl_FragColor.rgb += vec3(0.04, 0.16, 0.09);
} else if (uOutline > 0.5 && uPart < 0 && solid(vMapUv)) {
  // the crew's scanner: the sprite's outline, whatever the light
  bool rim = false;
  for (int i = 1; i <= 2; i++) {
    vec2 d = uTexel * float(i);
    rim = rim || !solid(vMapUv + vec2(d.x, 0.0)) || !solid(vMapUv - vec2(d.x, 0.0)) ||
      !solid(vMapUv + vec2(0.0, d.y)) || !solid(vMapUv - vec2(0.0, d.y));
  }
  if (rim) gl_FragColor.rgb = vec3(1.0, 0.45, 0.15);
}`,
      );
  };
  return uniforms;
}

// What one build of the scene leaves for the next - an edit rebuilds the
// deck, but its walls' textures and relief don't change: the renderer (and
// the shaders it has compiled), the wall kits' textures, the depth maps and
// the relief geometry (with its AO map and raycast hierarchy), each keyed
// by everything it's made from. Emptied when the textures hot-reload
// (`version`) and when the view goes.
interface SceneCache {
  renderer: THREE.WebGLRenderer | null;
  // whether the renderer was asked for antialiasing (fixed when it's made:
  // a change of the setting makes a new one)
  antialias: boolean;
  version: string;
  textures: Map<string, THREE.Texture>;
  decalTextures: Map<string, Promise<THREE.Texture>>;
  decalManifest: ReturnType<typeof fetchDecalManifest> | null;
  decalGeometries: Map<string, THREE.BufferGeometry | null>;
  grids: Map<string, ReturnType<typeof loadHeightGrid>>;
  reliefs: Map<string, Promise<ReturnType<typeof createReliefWallGeometry> | null>>;
}
function clearSceneCache(cache: SceneCache) {
  for (const tex of cache.textures.values()) tex.dispose();
  cache.textures.clear();
  for (const tex of cache.decalTextures.values()) tex.then((t) => t.dispose()).catch(() => {});
  cache.decalTextures.clear();
  cache.decalManifest = null;
  for (const geo of cache.decalGeometries.values()) geo?.dispose();
  cache.decalGeometries.clear();
  cache.grids.clear();
  for (const relief of cache.reliefs.values()) {
    relief.then((r) => {
      r?.geometry.dispose();
      r?.aoMap.dispose();
    }).catch(() => {});
  }
  cache.reliefs.clear();
}

// a vertical field of view (degrees) magnified `zoom` times
function zoomedFov(fov: number, zoom: number): number {
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) / zoom));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

// an RGBA image turned 90 degrees clockwise (text reading top to bottom)
function turnClockwise(img: { width: number; height: number; rgba: Uint8Array }) {
  const { width: w, height: h } = img;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // (x, y) -> (h - 1 - y, x) in the w-tall, h-wide result
      const src = (y * w + x) * 4;
      const dst = (x * h + (h - 1 - y)) * 4;
      rgba.set(img.rgba.subarray(src, src + 4), dst);
    }
  }
  return { width: h, height: w, rgba };
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// vertical FOV that shows `fov` degrees across the shorter screen side
function verticalFov(fov: number, aspect: number): number {
  if (aspect >= 1) return fov;
  const v = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return Math.min(MAX_VERTICAL_FOV, v);
}

export function GameViewport({
  map,
  pos,
  dir,
  elevation,
  openDoors,
  ride,
  actors,
  aiming,
  downAt,
  shipAccent,
  aimFrameRef: aimFrameRefProp,
  aimFocusRef: aimFocusRefProp,
  partyCoverRef,
  onTouch,
  editMode,
  hiddenLayers,
  editTool,
  onEdit,
  onEditHover,
  onEditDrag,
  onEditAdjust,
  selectedLight,
  selectedProp,
  selectedItem,
  selectedSmoke,
  selectedDecal,
  selectedDoor,
  selectedActor,
  onReady,
  freeTick,
  peekRef,
  settings,
  onStats,
  lootedProps,
  takenItems,
  spills,
}: GameViewportProps) {
  const lootRef = useRef({ lootedProps, takenItems, spills });
  lootRef.current = { lootedProps, takenItems, spills };
  const containerRef = useRef<HTMLDivElement>(null);
  // kept from one build of the scene to the next (see SceneCache)
  const cacheRef = useRef<SceneCache>({
    renderer: null,
    antialias: false,
    version: "",
    textures: new Map(),
    decalTextures: new Map(),
    decalManifest: null,
    decalGeometries: new Map(),
    grids: new Map(),
    reliefs: new Map(),
  });
  useEffect(
    () => () => {
      clearSceneCache(cacheRef.current);
      cacheRef.current.renderer?.dispose();
      cacheRef.current.renderer = null;
    },
    [],
  );
  const actorsRef = useRef(actors ?? []);
  actorsRef.current = actors ?? [];
  const aimingRef = useRef(aiming ?? null);
  aimingRef.current = aiming ?? null;
  const downAtRef = useRef(downAt ?? null);
  downAtRef.current = downAt ?? null;
  const shipAccentRef = useRef(shipAccent ?? null);
  shipAccentRef.current = shipAccent ?? null;
  const ownAimFrameRef = useRef<AimFrame | null>(null);
  const aimFrameRef = aimFrameRefProp ?? ownAimFrameRef;
  const ownAimFocusRef = useRef<AimFocus | null>(null);
  const aimFocusRef = aimFocusRefProp ?? ownAimFocusRef;
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  // bumped whenever a file under public/textures changes on disk (dev only),
  // which rebuilds the scene with cache-busted texture URLs - edit a height
  // map in GIMP/Aseprite, save, and the walls update in place
  const [textureVersion, setTextureVersion] = useState(0);
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onChange = () => setTextureVersion((v) => v + 1);
    hot.on(TEXTURE_CHANGED_EVENT, onChange);
    return () => hot.off(TEXTURE_CHANGED_EVENT, onChange);
  }, []);
  // a saved per-texture tuning (Asset Manager): the relief meshes rebuilt
  useEffect(() => onTextureTuningSaved(() => setTextureVersion((v) => v + 1)), []);
  // the prop editor (see propEditState): its boxes drawn over the edited
  // type's props at once; the props rebuilt once its edits settle
  const propWiresRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let version = propEdit.get().version;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = propEdit.subscribe(() => {
      propWiresRef.current?.();
      if (propEdit.get().version === version) return;
      version = propEdit.get().version;
      clearTimeout(timer);
      timer = setTimeout(() => setTextureVersion((v) => v + 1), 600);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);
  // continuously-updated "where the camera actually is right now", read and
  // written every animation frame, whether mid-transition or settled
  const liveRef = useRef<CamTarget>(computeTarget(pos, dir, elevation));
  // `climb`: the move goes up or down a ladder; `jumpSide`: it's a jump off
  // a bridge, stepping off to that side
  const animRef = useRef<{
    from: CamTarget;
    to: CamTarget;
    start: number;
    climb?: boolean;
    jumpSide?: Vec2;
  } | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const peekRefRef = useRef(peekRef);
  peekRefRef.current = peekRef;
  const rideRef = useRef(ride);
  rideRef.current = ride;
  const onTouchRef = useRef(onTouch);
  onTouchRef.current = onTouch;
  const hiddenLayersRef = useRef<ReadonlySet<string>>(hiddenLayers ?? new Set());
  hiddenLayersRef.current = hiddenLayers ?? hiddenLayersRef.current;
  const editModeRef = useRef(!!editMode);
  editModeRef.current = !!editMode;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const selectedLightRef = useRef(selectedLight ?? null);
  selectedLightRef.current = selectedLight ?? null;
  const selectedPropRef = useRef(selectedProp ?? null);
  selectedPropRef.current = selectedProp ?? null;
  const selectedItemRef = useRef(selectedItem ?? null);
  selectedItemRef.current = selectedItem ?? null;
  const selectedSmokeRef = useRef(selectedSmoke ?? null);
  selectedSmokeRef.current = selectedSmoke ?? null;
  const selectedDecalRef = useRef(selectedDecal ?? null);
  selectedDecalRef.current = selectedDecal ?? null;
  const selectedDoorRef = useRef(selectedDoor ?? null);
  selectedDoorRef.current = selectedDoor ?? null;
  const selectedActorRef = useRef(selectedActor ?? null);
  selectedActorRef.current = selectedActor ?? null;
  const editToolRef = useRef(editTool ?? "dig");
  editToolRef.current = editTool ?? "dig";
  const onEditHoverRef = useRef(onEditHover);
  onEditHoverRef.current = onEditHover;
  const onEditDragRef = useRef(onEditDrag);
  onEditDragRef.current = onEditDrag;
  const onEditAdjustRef = useRef(onEditAdjust);
  onEditAdjustRef.current = onEditAdjust;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  // the loading screen, up while a new map's scene is built; the map last
  // shown (a rebuild of the same map - a settings change - skips it)
  const [loading, setLoading] = useState<{ title: string; progress: number } | null>({ title: map.name, progress: 0 });
  const shownMapRef = useRef<string | null>(null);
  // a new map (a lift ride's arrival) places the camera outright
  const cameraMapRef = useRef(map);

  // a layout effect: it has to take effect before the next frame is drawn,
  // or that frame would show the old facing (see pendingTurn below)
  useLayoutEffect(() => {
    const peek = peekRefRef.current?.current;
    if (peek?.pendingTurn) {
      // a released peek turned into this turn: jump the facing and take the
      // same 90 degrees off the peek in one step, so the view doesn't move
      // at all here - it just carries on easing to center from the released
      // angle instead of swinging through the whole turn again
      peek.offset -= (peek.pendingTurn * Math.PI) / 2;
      peek.pendingTurn = 0;
      animRef.current = null;
      liveRef.current = computeTarget(pos, dir, elevation);
      return;
    }
    if (cameraMapRef.current !== map) {
      // arrived on another map: no glide from wherever the old one had us
      cameraMapRef.current = map;
      animRef.current = null;
      liveRef.current = computeTarget(pos, dir, elevation);
      return;
    }
    const from = { ...liveRef.current };
    const to = computeTarget(pos, dir, elevation);
    const fromCell = { x: Math.round(from.x), y: Math.round(from.z) };
    const sameCell = fromCell.x === pos.x && fromCell.y === pos.y;
    const climb = Math.abs(to.y - from.y) > MAX_STEP + 1e-6 && !!ladderBetween(map, fromCell, pos);
    // down off a bridge in the same cell: step off its side - to the right
    // when facing along it, else straight ahead
    const bridge = bridgeAt(map, pos.x, pos.y);
    let jumpSide: Vec2 | undefined;
    if (sameCell && bridge && from.y - to.y > MAX_STEP + 1e-6) {
      const alongBridge = (bridge.axis === "NS") === (dir === "N" || dir === "S");
      jumpSide = DIR_VECTOR[alongBridge ? rightOf(dir) : dir];
    }
    animRef.current = { from, to, start: performance.now(), climb, jumpSide };
  }, [pos, dir, elevation, map]);

  const freeTickRef = useRef(freeTick);
  freeTickRef.current = freeTick;
  const freeMode = !!freeTick;
  // back to grid movement: glide from wherever free movement left the camera
  // onto the current cell and facing
  useEffect(() => {
    if (freeMode) return;
    animRef.current = { from: { ...liveRef.current }, to: computeTarget(pos, dir, elevation), start: performance.now() };
    // only on the mode switch - pos/dir changes are handled above
  }, [freeMode]);

  // door panels (the sliding part) by door cell key ("x,y"); userData holds
  // `open` and its `openPos`/`closedPos`
  const doorPanelsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const doorAnimsRef = useRef(new Map<string, { panel: THREE.Object3D; from: THREE.Vector3; start: number }>());
  const openDoorsRef = useRef(openDoors);
  openDoorsRef.current = openDoors;

  // slide every panel whose open state changed (opened, or a lift door
  // shutting) towards its new position
  useEffect(() => {
    for (const [key, panel] of doorPanelsRef.current) {
      const open = openDoors.has(key);
      if (panel.userData.open === open) continue;
      panel.userData.open = open;
      doorAnimsRef.current.set(key, { panel, from: panel.position.clone(), start: gameClock.now() });
    }
  }, [openDoors]);

  // The map the scene is built from. A new version of it that differs only
  // in its lights, smoke or robots (the editor's tools for them) keeps the
  // scene: those are redone in place instead of rebuilding every wall.
  const sceneMapRef = useRef(map);
  if (sceneMapRef.current.id !== map.id || !map.structureKey || sceneMapRef.current.structureKey !== map.structureKey) {
    sceneMapRef.current = map;
  }
  const sceneMap = sceneMapRef.current;
  const applyLightsRef = useRef<((next: GameMap) => void) | null>(null);
  const rebakeRef = useRef<(() => void) | null>(null);
  useEffect(() => rebakeRef.current?.(), [settings.lightGridDensity, settings.lightGridMode, settings.lightBounce]);
  // the map as it is now (lights included - the scene's may be older)
  const latestMapRef = useRef(map);
  latestMapRef.current = map;
  useEffect(() => {
    if (map !== sceneMap) applyLightsRef.current?.(map);
  }, [map, sceneMap]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let raf = 0;
    const buildStart = performance.now();

    const scene = new THREE.Scene();
    const fogStartFar = effectiveViewDistance(settings) - FOG_FAR_MARGIN;
    const fog = new THREE.Fog(settings.fogColor, fogNear(fogStartFar), fogStartFar);
    scene.fog = fog;
    // what's past the far plane (nothing drawn) is the fog's colour too
    const fogBackground = new THREE.Color(settings.fogColor);
    scene.background = fogBackground;
    let fogColorNow = settings.fogColor;

    // anything past the fog's end renders the fog's colour anyway, so the far plane
    // sits just beyond it and frustum culling skips those walls entirely
    // (a big saving with relief walls' thousands of triangles each)
    const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, effectiveViewDistance(settings) + 0.5);

    const cache = cacheRef.current;
    // (antialiasing is the drawing buffer's, chosen when the context is
    // made: the setting changed, the old renderer goes - its compiled
    // shaders and uploads with it; the cached textures and geometry are
    // uploaded again to the new one as they're drawn)
    const antialias = settings.antialias > 0;
    if (cache.renderer && cache.antialias !== antialias) {
      cache.renderer.dispose();
      cache.renderer.forceContextLoss();
      cache.renderer = null;
    }
    cache.antialias = antialias;
    const renderer = cache.renderer ?? (cache.renderer = new THREE.WebGLRenderer({ antialias }));
    // phones (touch screens) render at most 1.5 device pixels per CSS pixel:
    // their 3x screens cost 4x the pixels of 1.5x, for no pixel-art detail
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap));
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x445566, settings.ambientIntensity);
    scene.add(ambient);
    const pointLight = new THREE.PointLight(0xfff2d9, settings.pointLightIntensity, 8, 2);
    scene.add(pointLight);
    // a lift ride's shaft lights: sweeping past the outside of the cabin
    // (lights shine through walls here - that's what makes it read as
    // light leaking in around the door as the cabin moves)
    const shaftLight = new THREE.PointLight(SHAFT_LIGHT_COLOR, 0, 2.2, 2);
    scene.add(shaftLight);

    const bust = textureVersion ? `?v=${textureVersion}` : "";
    if (cache.version !== bust) {
      clearSceneCache(cache);
      cache.version = bust;
    }
    // a texture loaded once (see SceneCache); `onLoad` runs once it's in -
    // straight away if it already is
    const kitTexture = (url: string, onLoad?: (tex: THREE.Texture) => void) => {
      let tex = cache.textures.get(url);
      if (!tex) {
        tex = loader.load(url, onLoad);
        cache.textures.set(url, tex);
      } else if (onLoad && tex.image) onLoad(tex);
      return tex;
    };

    // Loading: every texture goes through `manager`, every geometry build
    // and decal batch through track(). Once both are idle the shaders are
    // compiled and the scene is shown - behind the loading screen until then
    // on a new map, so walls never pop in piece by piece.
    const manager = new THREE.LoadingManager();
    const loader = new THREE.TextureLoader(manager);
    let texturesLoaded = 0;
    let texturesTotal = 0;
    let buildsPending = 0;
    let buildsTotal = 0;
    let ready = false;
    const newMap = shownMapRef.current !== map.id;
    if (newMap) setLoading({ title: map.name, progress: 0 });
    const checkReady = () => {
      if (disposed || ready) return;
      const progress = (texturesLoaded + buildsTotal - buildsPending) / Math.max(1, texturesTotal + buildsTotal);
      if (newMap) setLoading({ title: map.name, progress });
      if (buildsPending > 0 || texturesLoaded < texturesTotal) return;
      // let the builds' own .then()s (placing the meshes) run first
      setTimeout(() => {
        if (disposed || ready || buildsPending > 0 || texturesLoaded < texturesTotal) return;
        ready = true;
        group.traverse((o) => {
          const mat = (o as THREE.Mesh).material;
          for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) useLightGrid(m, lightGrid);
        });
        renderer.compile(scene, camera);
        // (behind the loading screen, not on the first aim)
        prepareRaycasts(group);
        // dev: how long the build took (ms), e.g. after a map edit
        if (import.meta.env.DEV) Object.assign(window, { __voidcrewBuild: { total: performance.now() - buildStart } });
        shownMapRef.current = map.id;
        setLoading(null);
        onReadyRef.current?.(map.id);
      }, 0);
    };
    manager.onStart = manager.onProgress = (_url, loaded, total) => {
      texturesLoaded = loaded;
      texturesTotal = total;
      checkReady();
    };
    manager.onLoad = checkReady;
    function track<T>(work: Promise<T> | (() => Promise<T>)): Promise<T> {
      const promise = typeof work === "function" ? work() : work;
      buildsPending++;
      buildsTotal++;
      promise.finally(() => {
        buildsPending--;
        checkReady();
      }).catch(() => {});
      return promise;
    }
    const isRelief = settings.wallProfile === "relief";
    const wallHeight = settings.wallHeight;
    const cavity = { value: settings.aoDirect };

    // `displace`: whether flat/beveled geometry gets the depth map as
    // displacement - not for floors, whose single quad would only tilt
    // `setId`: a TEXTURE_SETS entry, or (for props) any folder under
    // public/textures/ with the usual diffuse, normal and depth maps
    // (`accent`: its materials take the ship's livery - the deck's own
    // surfaces do, props don't)
    // the texture sets with an accent of their own (see TextureSetFiles.accent)
    const ownAccents: { hue: number; range: number; uniforms: AccentUniforms }[] = [];
    // The maps the debug normal / depth views draw, by material: the 2D
    // sprites' (marked below, their strength and shine kept in userData -
    // clones copy those) and the wall kits'. A material without a depth map
    // shows mid-grey in the depth view.
    const viewMaps = new WeakMap<THREE.Material, { normal?: THREE.Texture; depth?: THREE.Texture }>();
    function markSprite(mat: THREE.MeshStandardMaterial, normalStrength: number, normalMap: THREE.Texture, depth?: THREE.Texture) {
      mat.userData.sprite = true;
      mat.userData.normalBase = normalStrength;
      mat.userData.metalBase = mat.metalness;
      viewMaps.set(mat, { normal: normalMap, depth });
    }
    function createWallKit(setId: string, displace = true, accent = true): WallKit {
      const paths: TextureSetFiles = isTextureSetId(setId) ? TEXTURE_SETS[setId] : textureFolder(setId);
      const diffuse = kitTexture(paths.diffuse + bust);
      const normalMap = kitTexture(paths.normal + bust);
      const depthMap = kitTexture(paths.depth + bust);
      diffuse.colorSpace = THREE.SRGBColorSpace;
      if (paths.pixelArt) {
        // crisp texels up close instead of bilinear blur; minification keeps
        // mipmaps so distant walls don't shimmer
        diffuse.magFilter = THREE.NearestFilter;
        normalMap.magFilter = THREE.NearestFilter;
      }
      // (the lighter graphics settings go without: a texture read and the
      // tangent frame worked out per pixel - see Graphics.normalMaps)
      const surfaceNormals = settings.normalMaps > 0 ? normalMap : null;
      const wallMat = new THREE.MeshStandardMaterial({
        map: diffuse,
        normalMap: surfaceNormals,
        // relief walls already carry the depth as real geometry
        displacementMap: isRelief || !displace ? null : depthMap,
        displacementScale: settings.displacementScale,
        roughness: settings.roughness,
        metalness: settings.metalness,
      });
      const sideMat = new THREE.MeshStandardMaterial({
        map: diffuse,
        roughness: settings.roughness,
        metalness: settings.metalness,
      });
      addDirectLightOcclusion(wallMat, cavity);
      addDirectLightOcclusion(sideMat, cavity);
      const textures = [diffuse, normalMap, depthMap];
      // the set's glow map, if it has one: always shining
      if (paths.glow) {
        const glowMap = kitTexture(paths.glow + bust);
        glowMap.colorSpace = THREE.SRGBColorSpace;
        if (paths.pixelArt) glowMap.magFilter = THREE.NearestFilter;
        wallMat.emissiveMap = glowMap;
        wallMat.emissive.setHex(0xffffff);
        wallMat.emissiveIntensity = SURFACE_GLOW;
        wallMat.userData.glow = true;
        textures.push(glowMap);
      }

      // the set's surface map, if it has one: its own shine per texel (the
      // viewer's roughness and metalness don't touch it)
      const surfaceMap = paths.surface ? kitTexture(paths.surface + bust) : null;
      if (surfaceMap) {
        if (paths.pixelArt) surfaceMap.magFilter = THREE.NearestFilter;
        textures.push(surfaceMap);
      }

      let litMat: THREE.MeshStandardMaterial | undefined;
      if (paths.emissive) {
        const emissiveMap = kitTexture(paths.emissive + bust);
        if (paths.pixelArt) emissiveMap.magFilter = THREE.NearestFilter;
        textures.push(emissiveMap);
        litMat = new THREE.MeshStandardMaterial({
          map: diffuse,
          normalMap: surfaceNormals,
          roughness: settings.roughness,
          metalness: settings.metalness,
          emissive: lampColor(map),
          emissiveMap,
          emissiveIntensity: LIGHT_PANEL_INTENSITY,
        });
        addDirectLightOcclusion(litMat, cavity);
      }

      const accentUniforms = accent && paths.accent ? ownAccentUniforms() : undefined;
      if (accentUniforms) ownAccents.push({ hue: paths.accent!.hue, range: paths.accent!.range ?? 30, uniforms: accentUniforms });
      for (const mat of [wallMat, sideMat, litMat]) {
        if (!mat) continue;
        viewMaps.set(mat, { normal: normalMap, depth: depthMap });
        mat.userData.accent = accent;
        if (accentUniforms) mat.userData.accentUniforms = accentUniforms;
        if (surfaceMap) {
          mat.roughnessMap = mat.metalnessMap = surfaceMap;
          mat.roughness = mat.metalness = 1;
          mat.userData.surface = true;
        }
      }
      // (a lamp's panel shines in its lamp's own colour: its trim takes the
      // livery, its light doesn't)
      if (litMat) litMat.userData.accentGlow = false;
      return { id: setId, depthUrl: paths.depth + bust, grateLevels: paths.grateLevels, wallMat, sideMat, litMat, textures, slots: [] };
    }

    // most walls use the main texture set; a stable, position-based share of
    // them gets the accent set for variety
    // (a deck with its own wall set uses just that - its look is uniform)
    const deckWall = isTextureSetId(map.textures?.wall) ? map.textures.wall : undefined;
    const primarySet = deckWall ?? settings.textureSet;
    const primaryKit = createWallKit(primarySet);
    // (the map's own accent set, if it names one - else, for a deck without a wall
    // set of its own, the viewer's)
    const accentSet: string = isTextureSetId(map.textures?.accent) ? map.textures.accent : !deckWall ? settings.accentTextureSet : "none";
    const accentKit =
      accentSet !== "none" && accentSet !== "sky" && accentSet !== primarySet && settings.accentRatio > 0 ? createWallKit(accentSet) : null;
    // wall kits by texture set: the default mix plus any the map asks for
    // (map.wallTextureAt), created on demand
    const wallKits = new Map<TextureSetId, WallKit>([[primarySet, primaryKit]]);
    if (accentKit) wallKits.set(accentSet as TextureSetId, accentKit);
    function wallKitFor(setId: TextureSetId): WallKit {
      let kit = wallKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId);
        wallKits.set(setId, kit);
      }
      return kit;
    }
    // floor kits are created on demand, one per floor texture actually used
    const floorKits = new Map<TextureSetId, WallKit>();
    function floorKitAt(x: number, y: number): WallKit | null {
      const choice = settings.floorTextureSet;
      if (choice === "none") return null;
      const fromMap = map.floorAt?.(x, y);
      const deckFloor = isTextureSetId(map.textures?.floor) ? map.textures.floor : DEFAULT_FLOOR;
      const setId = choice !== "map" ? choice : isTextureSetId(fromMap) ? fromMap : deckFloor;
      let kit = floorKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId, false);
        kit.floor = true;
        floorKits.set(setId, kit);
      }
      return kit;
    }

    // ceiling kits by texture set: the chosen one, or the map's for a cell
    // (a lift cabin's own), created on demand; none for a plain ceiling
    const ceilingKits = new Map<TextureSetId, WallKit>();
    function ceilingKitAt(x: number, y: number): WallKit | null {
      if (settings.ceilingTextureSet === "none") return null;
      const fromMap = map.ceilingTextureAt?.(x, y);
      const deckCeiling = isTextureSetId(map.textures?.ceiling) ? map.textures.ceiling : undefined;
      const setId = isTextureSetId(fromMap) ? fromMap : (deckCeiling ?? settings.ceilingTextureSet);
      let kit = ceilingKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId, false);
        ceilingKits.set(setId, kit);
      }
      return kit;
    }
    // cells with a ceiling light: their ceiling tile's light panel glows
    // (the sky's light, when there is one, under the open ceilings)
    const skyLightOf = (s: ViewportSettings) => ({
      color: parseColor(s.skyLightColor) ?? 0xa8bcff,
      intensity: s.skyLightIntensity,
      azimuth: s.skyLightAzimuth,
      elevation: s.skyLightElevation,
    });
    let mapLights = generateLights(map, skyLightOf(settings));
    // the walls' relief depth: the map's own, else the settings'
    const reliefDepth = map.reliefDepth ?? settings.reliefDepth;
    // the floors have a relief depth of their own (0: as the walls')
    const floorDepth = settings.floorReliefDepth > 0 ? settings.floorReliefDepth : reliefDepth;
    // props follow the wall profile: flat (or beveled) walls, flat props
    const propReliefDepth = settings.wallProfile === "relief" ? reliefDepth : 0.0005;
    // the static lights, baked (see lightGrid.ts) - every lit material reads
    // it once the scene is built
    const lightGrid = createLightGridUniforms();
    // the map's own density, else the settings'
    const bakeOptions = (m: GameMap) => ({
      perCell: m.lightGridDensity ?? settingsRef.current.lightGridDensity,
      mode: settingsRef.current.lightGridMode,
      bounce: settingsRef.current.lightBounce,
    });
    // the bake (and a coarser one for the ambient part, if the map asks)
    const bake = (m: GameMap) => {
      const options = bakeOptions(m);
      const ambient =
        options.mode === "directional" && m.lightGridAmbient && m.lightGridAmbient !== options.perCell
          ? bakeLightGrid(m, mapLights, wallHeight, { ...options, perCell: m.lightGridAmbient })
          : undefined;
      setLightGrid(lightGrid, bakeLightGrid(m, mapLights, wallHeight, options), ambient);
    };
    bake(map);
    // the bake, a moment after the last call (a slider dragged, a prop moved)
    let bakeTimer: ReturnType<typeof setTimeout> | undefined;
    const bakeSoon = (m: GameMap | (() => GameMap), delay: number) => {
      clearTimeout(bakeTimer);
      bakeTimer = setTimeout(() => {
        if (!disposed) bake(typeof m === "function" ? m() : m);
      }, delay);
    };
    // baked again when its settings change (see the effect on them)
    rebakeRef.current = () => bake(latestMapRef.current);
    const ceilingLightCells = (lights: LightSpec[]) =>
      new Set(lights.filter((l) => l.kind === "ceiling").map((l) => `${Math.round(l.x)},${Math.round(l.z)}`));
    let litCells = ceilingLightCells(mapLights);
    // the color of each lit cell's ceiling lamp
    const ceilingLightColors = (lights: LightSpec[]) =>
      new Map(lights.filter((l) => l.kind === "ceiling").map((l) => [`${Math.round(l.x)},${Math.round(l.z)}`, l.color]));
    let litColors = ceilingLightColors(mapLights);
    // the unsteady ceiling lamps (see lightEffects.ts) by cell: their index
    // in mapLights - their panels glow with their light
    const effectLampCells = (lights: LightSpec[]) =>
      new Map<string, number>(lights.flatMap((l, i) => (l.kind === "ceiling" && l.effect ? [[`${Math.round(l.x)},${Math.round(l.z)}`, i] as [string, number]] : [])));
    let effectCells = effectLampCells(mapLights);
    // each such panel's own copy of its glowing material, and its glow
    const effectPanels = new Map<string, { mat: THREE.MeshStandardMaterial; base: number; light: number }>();
    // the unsteady lights' levels this frame (by index in mapLights)
    const effectLevels = new Map<number, number>();
    const deckLampColor = lampColor(map);

    const frameKit = createWallKit(isTextureSetId(map.textures?.doorFrame) ? map.textures.doorFrame : DOOR_FRAME_SET, false);
    // window panels (see the wall loop), by their wall's surface key
    // and the frame panel each takes: a one-panel window its own, a wider
    // one a left end, middle pieces and a right end
    const windowSet: TextureSetId = isTextureSetId(map.textures?.window) ? map.textures.window : WINDOW_SET;
    const windowFaces = new Map(
      windowPanels(map).map((p) => {
        const part = p.width === 1 ? "" : p.index === 0 ? "_left" : p.index === p.width - 1 ? "_right" : "_mid";
        return [surfaceKey(p.cell, p.wall), `${windowSet}${part}` as TextureSetId] as const;
      }),
    );
    const windowKits = new Map<TextureSetId, WallKit>();
    const windowKitFor = (setId: TextureSetId) => {
      let kit = windowKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId, false);
        windowKits.set(setId, kit);
      }
      return kit;
    };
    // prop side/top kits by texture set, created on demand
    const propKits = new Map<string, WallKit>();
    const sharedPropKitFor = (setId: string) => {
      let kit = propKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId, false, false);
        propKits.set(setId, kit);
      }
      return kit;
    };
    // the loot items' sprites (all of them: a crate may spill any)
    for (const id of Object.keys(ITEM_TYPES)) sharedPropKitFor(`item_${id}`);
    // a prop type's texture sets: a box's side and top, its views, or a
    // cutout's one
    const propSets = (type: PropType): string[] =>
      type.kind === "box"
        ? [type.side, type.top]
        : type.kind === "views"
          ? ["front", "side", "top"].map((v) => `${type.views}_${v}`)
          : type.kind === "cabin"
            ? [type.door, type.inside, `${type.views}_side`, `${type.views}_top`]
            : type.kind === "pillar"
              ? [type.texture ?? primarySet]
              : type.kind === "chamfer"
                ? []
                : [type.texture];
    // door panel kits by door kind, created on demand
    // a deck's own door panels and label paint, else the defaults
    const panelSetFor = (kind: DoorSpec["kind"]): TextureSetId => {
      const own = kind === "lift" ? map.textures?.liftDoor : map.textures?.door;
      return isTextureSetId(own) ? own : DOOR_PANEL_SETS[kind];
    };
    const labelHex = /^#?([0-9a-f]{6})$/i.exec(map.labelColor ?? "")?.[1];
    const labelPaint: [number, number, number] = labelHex
      ? [0, 2, 4].map((i) => parseInt(labelHex.slice(i, i + 2), 16)) as [number, number, number]
      : LABEL_PAINT;
    const labelPaintDark: [number, number, number] = labelHex
      ? labelPaint.map((c) => Math.round(c * 0.85)) as [number, number, number]
      : LABEL_PAINT_DARK;
    const panelKits = new Map<DoorSpec["kind"], WallKit>();
    const panelKitFor = (kind: DoorSpec["kind"]) => {
      let kit = panelKits.get(kind);
      if (!kit) {
        kit = createWallKit(panelSetFor(kind), false);
        panelKits.set(kind, kit);
      }
      return kit;
    };
    const doorCells: { x: number; z: number; spec: DoorSpec; key: string }[] = [];
    // materials made beside the kits' (labeled door panels, see-through
    // bridge decks), kept in step with the material settings like theirs
    const ownMaterials: THREE.MeshStandardMaterial[] = [];
    const inspectMaterialDefaults = new WeakMap<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();
    // The debug normal / depth views draw a material's own map as its colour
    // (unlit: black base, the map as its emissive); the feature switches for
    // the sprites' normal maps and metalness (the wall kits' are set every
    // frame with the other sliders). Run when they change, and now and then
    // while one is on (sprites come and go).
    const flatNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    flatNormal.needsUpdate = true;
    const midGrey = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    midGrey.needsUpdate = true;
    const mapViewSaved = new WeakMap<
      THREE.MeshStandardMaterial,
      { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number; emissiveMap: THREE.Texture | null }
    >();
    let materialViewApplied = "";
    let materialViewTick = 0;
    function applyMaterialViews(s: ViewportSettings) {
      const mapView = s.geometryView === "normals" || s.geometryView === "depth";
      const active = mapView || !s.showNormals || !s.showMetal;
      if (!active && materialViewApplied === "") return;
      const key = `${s.geometryView}|${s.showNormals}|${s.showMetal}`;
      materialViewTick++;
      if (key === materialViewApplied && materialViewTick % 45 !== 0) return;
      materialViewApplied = active ? key : "";
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const mat = m as THREE.MeshStandardMaterial;
          if (!mat.isMeshStandardMaterial) continue;
          if (mat.userData.sprite) {
            const n = s.showNormals ? (mat.userData.normalBase as number) : 0;
            mat.normalScale.set(n, n);
            mat.metalness = s.showMetal ? (mat.userData.metalBase as number) : 0;
          }
          const saved = mapViewSaved.get(mat);
          if (mapView) {
            if (!saved) mapViewSaved.set(mat, { color: mat.color.clone(), emissive: mat.emissive.clone(), emissiveIntensity: mat.emissiveIntensity, emissiveMap: mat.emissiveMap });
            const maps = viewMaps.get(mat);
            const tex = s.geometryView === "normals" ? (maps?.normal ?? mat.normalMap ?? flatNormal) : (maps?.depth ?? midGrey);
            if (mat.emissiveMap !== tex) {
              mat.emissiveMap = tex;
              mat.needsUpdate = true;
            }
            mat.color.setHex(0x000000);
            mat.emissive.setHex(0xffffff);
            mat.emissiveIntensity = 1;
          } else if (saved) {
            mat.color.copy(saved.color);
            mat.emissive.copy(saved.emissive);
            mat.emissiveIntensity = saved.emissiveIntensity;
            mat.emissiveMap = saved.emissiveMap;
            mat.needsUpdate = true;
            mapViewSaved.delete(mat);
          }
        }
      });
    }
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 1 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 1 });
    // the open sky: walls and ceilings of the "sky" set are panes that show the
    // starry sky (looked at from the camera, as if far away) - nothing else is
    // sky, so gaps between walls and the far distance stay black
    // black backing behind every relief wall face, a little behind the deepest
    // recess: a height map that doesn't tile exactly leaves slivers between
    // panels that would show what's behind the wall (the next room, the floor)
    const backingPositions: number[] = [];
    const backingPanels: { x: number; z: number; y: number; rotY: number; width: number; height: number; floorTop: boolean }[] = [];
    const backingMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, vertexColors: true });
    backingMat.visible = settings.wallBacking;
    let backingColorSerial = 0;
    // Stable during inspection: adjacent faces get widely separated hues.
    const backingColor = () => new THREE.Color().setHSL((0.13 + backingColorSerial++ * 0.61803398875) % 1, 0.85, 0.55);
    const backingColors: number[] = [];
    let skyMat: THREE.ShaderMaterial | null = null;
    const skySurface = () => {
      if (!skyMat) {
        const material = makeSkyMaterial();
        skyMat = material;
        // the map's own sky image, when it names one (the starry sky shows till it's in)
        const name = map.textures?.sky;
        if (name) {
          loader.load(
            `${import.meta.env.BASE_URL}skies/${name}.png${bust}`,
            (tex) => {
              if (disposed) {
                tex.dispose();
                return;
              }
              tex.colorSpace = THREE.NoColorSpace;
              tex.wrapS = THREE.RepeatWrapping;
              (material.uniforms.map.value as THREE.Texture).dispose();
              material.uniforms.map.value = tex;
              decals.setWaterSky(tex);
            },
            undefined,
            () => console.warn(`Sky "${name}" not found in public/skies/`),
          );
        }
      }
      return skyMat;
    };

    const WALL_SUBDIVISIONS = 10;
    // relief geometry needs the height map's pixels, so it's built once the
    // image has loaded; flat/beveled walls are ready immediately
    const geometries: THREE.BufferGeometry[] = [];
    let wallGeo: THREE.BufferGeometry | null = null;
    if (settings.wallProfile === "flat") {
      wallGeo = new THREE.PlaneGeometry(1, wallHeight, WALL_SUBDIVISIONS * 3, WALL_SUBDIVISIONS * 3);
    } else if (settings.wallProfile === "convex" || settings.wallProfile === "concave") {
      wallGeo = createBeveledWallGeometry(
        1,
        wallHeight,
        settings.bevelFraction,
        settings.bevelAngleDeg,
        settings.wallProfile === "convex" ? 1 : -1,
        WALL_SUBDIVISIONS,
      );
    }
    if (wallGeo) geometries.push(wallGeo);
    const floorGeo = new THREE.PlaneGeometry(1, 1);
    geometries.push(floorGeo);

    const group = new THREE.Group();
    scene.add(group);
    doorPanelsRef.current.clear();

    // decals land on surface panels as they get placed (relief ones arrive
    // asynchronously)
    // world heights of a walkable cell's floor and ceiling
    const floorY = (x: number, y: number) => floorHeight(map, x, y) * wallHeight;
    const ceilingY = (x: number, y: number) => ceilingHeight(map, x, y) * wallHeight;

    const decals = new DecalLibrary({
      baseUrl: import.meta.env.BASE_URL,
      bust,
      loader,
      textureCache: cache.decalTextures,
      geometryCache: cache.decalGeometries,
      manifest: (cache.decalManifest ??= fetchDecalManifest(import.meta.env.BASE_URL, bust)),
      wallHeight,
      levels: (cell) => ({ floor: floorY(cell.x, cell.y), ceiling: ceilingY(cell.x, cell.y) }),
      // standing water lies over the floor's highest relief
      waterLift: (settings.floorReliefDepth > 0 ? settings.floorReliefDepth : (map.reliefDepth ?? settings.reliefDepth)) * 0.9 + 0.004,
      parent: group,
    });
    if (settings.decalsEnabled) track(decals.add(map.decals ?? []));
    // dev-only: inspect from the console
    if (import.meta.env.DEV) Object.assign(window, { __voidcrewDecals: decals });

    let reliefStats: ReliefStats | null = null;

    // A wall panel, floor or ceiling tile faces one open cell - the one in
    // front of it (a floor's or ceiling's own). Every sight line to its face
    // ends in that cell, so it's culled with that cell (see applySight) -
    // not with the wall cell behind it, whose other faces can be in view
    // while this one is around a corner. And it's one-sided, backed by
    // solid stuff: while the eye is behind its plane, none of it can show
    // (see cullFacing).
    const facingSurfaces: THREE.Object3D[] = [];
    function markSurface(obj: THREE.Object3D) {
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion);
      obj.userData.cullCell = cellKey(Math.round(obj.position.x + n.x * 0.5), Math.round(obj.position.z + n.z * 0.5));
      obj.userData.facing = { n, d: n.dot(obj.position) };
      facingSurfaces.push(obj);
    }

    // A surface: its mesh - or, given distant low-detail geometries (see
    // LOD_FACTOR, SMOOTH_LODS), a level-of-detail set that switches to them
    // with distance - placed like the slot; decals go on the detailed one.
    function placeSurface(
      slot: WallSlot,
      geo: THREE.BufferGeometry,
      far: FarLevel[],
      mat: THREE.Material | THREE.Material[],
      orient: (obj: THREE.Object3D) => void,
    ) {
      const mesh = new THREE.Mesh(geo, mat);
      let obj: THREE.Object3D = mesh;
      if (far.length) {
        const lod = new THREE.LOD();
        lod.addLevel(mesh, 0);
        for (const level of far) lod.addLevel(new THREE.Mesh(level.geometry, mat), level.distance);
        obj = lod;
      }
      obj.position.set(slot.x, slot.y, slot.z);
      orient(obj);
      group.add(obj);
      obj.updateMatrixWorld(true);
      markSurface(obj);
      decals.registerSurface(slot.key, mesh);
      return obj;
    }

    function placeWalls(
      geo: THREE.BufferGeometry,
      far: FarLevel[],
      mat: THREE.Material | THREE.Material[],
      slots: WallSlot[],
    ) {
      for (const slot of slots) {
        placeSurface(slot, geo, far, mat, (o) => (o.rotation.y = slot.rotY));
        if (settings.wallProfile !== "relief") continue;
        const height = variantHeight(slot.variant ?? "full") * wallHeight;
        const bottom = -height / 2;
        const nx = Math.sin(slot.rotY), nz = Math.cos(slot.rotY);
        const cellX = Math.round(slot.x + nx * 0.5);
        const cellZ = Math.round(slot.z + nz * 0.5);
        // Only the panel touching the floor, never internal stacked seams.
        if (Math.abs(slot.y + bottom - floorHeight(map, cellX, cellZ) * wallHeight) > 1e-5) continue;
        const positions = geo.getAttribute("position"), uv = geo.getAttribute("uv");
        const index = geo.index;
        const out: number[] = [], tex: number[] = [];
        // Follow the actual detailed edge, including its recessed mortar.
        // The other edge overlaps the floor below its deepest relief. This
        // closes the opening with wall texture instead of a black blocker.
        const emit = (id: number, lower: boolean) => {
          out.push(positions.getX(id), lower ? bottom - floorDepth - 0.02 : bottom, lower ? floorDepth + 0.02 : positions.getZ(id));
          const rows = variantRows(slot.variant ?? "full");
          const vScale = rows ? rows[1] - rows[0] : 1;
          tex.push(uv.getX(id), uv.getY(id) - (lower ? ((floorDepth + 0.02) / height) * vScale : 0));
        };
        const frontGroups = geo.groups.length ? geo.groups.filter((g) => !g.materialIndex) : [{ start: 0, count: index?.count ?? positions.count }];
        const seen = new Set<string>();
        for (const g of frontGroups) for (let i = g.start; i < g.start + g.count; i += 3) {
          const ids = [0, 1, 2].map((k) => index ? index.getX(i + k) : i + k);
          for (let e = 0; e < 3; e++) {
            let a = ids[e], b = ids[(e + 1) % 3];
            if (Math.abs(positions.getY(a) - bottom) > 1e-5 || Math.abs(positions.getY(b) - bottom) > 1e-5) continue;
            if (positions.getX(a) > positions.getX(b)) [a, b] = [b, a];
            if (positions.getX(b) - positions.getX(a) < 1e-8) continue;
            const key = `${positions.getX(a)},${positions.getZ(a)}|${positions.getX(b)},${positions.getZ(b)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            emit(a, false); emit(a, true); emit(b, true);
            emit(a, false); emit(b, true); emit(b, false);
          }
        }
        if (!out.length) continue;
        const apron = new THREE.BufferGeometry();
        apron.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
        apron.setAttribute("uv", new THREE.Float32BufferAttribute(tex, 2));
        apron.setAttribute("uv1", new THREE.Float32BufferAttribute(tex, 2));
        apron.computeVertexNormals();
        geometries.push(apron);
        const skirt = new THREE.Mesh(apron, Array.isArray(mat) ? mat[0] : mat);
        skirt.position.set(slot.x, slot.y, slot.z);
        skirt.rotation.y = slot.rotY;
        group.add(skirt);
        skirt.updateMatrixWorld(true);
        markSurface(skirt);
      }
    }

    // wall-style geometry (facing +Z) laid flat, facing up
    function placeFloors(
      geo: THREE.BufferGeometry,
      far: FarLevel[],
      mat: THREE.Material | THREE.Material[],
      slots: WallSlot[],
    ) {
      for (const slot of slots) placeSurface(slot, geo, far, mat, (o) => (o.rotation.x = -Math.PI / 2));
    }

    // ... and turned to face down from the ceiling; lit slots get the kit's
    // glowing front material (swapped when the lights change: ceilingTiles)
    const ceilingTiles: { cell: string; obj: THREE.Object3D; kit: WallKit; relief: boolean }[] = [];
    // a lamp of another color than the deck's glows in its own
    const coloredLitMats = new Map<WallKit, Map<number, THREE.MeshStandardMaterial>>();
    const litMatIn = (kit: WallKit, color: number | undefined) => {
      if (!kit.litMat || color === undefined || color === deckLampColor) return kit.litMat;
      let byColor = coloredLitMats.get(kit);
      if (!byColor) coloredLitMats.set(kit, (byColor = new Map()));
      let mat = byColor.get(color);
      if (!mat) {
        mat = kit.litMat.clone();
        mat.emissive.setHex(color);
        useLightGrid(mat, lightGrid);
        byColor.set(color, mat);
        ownMaterials.push(mat);
      }
      return mat;
    };
    const ceilingMaterial = (kit: WallKit, relief: boolean, lit: boolean, color?: number, cell?: string) => {
      let front = (lit && litMatIn(kit, color)) || kit.wallMat;
      const effect = cell === undefined ? undefined : effectCells.get(cell);
      if (lit && effect !== undefined && front !== kit.wallMat) {
        // an unsteady lamp's panel: its own copy, dimmed with it each frame
        const key = `${cell}|${kitId(kit)}`;
        let panel = effectPanels.get(key);
        if (!panel || panel.light !== effect) {
          const mat = (front as THREE.MeshStandardMaterial).clone();
          useLightGrid(mat, lightGrid);
          ownMaterials.push(mat);
          panel = { mat, base: mat.emissiveIntensity, light: effect };
          effectPanels.set(key, panel);
        }
        front = panel.mat;
      }
      return relief ? [front, kit.sideMat] : front;
    };
    // (kits told apart for effectPanels)
    const kitIds = new Map<WallKit, number>();
    const kitId = (kit: WallKit) => {
      if (!kitIds.has(kit)) kitIds.set(kit, kitIds.size);
      return kitIds.get(kit)!;
    };
    function placeCeilings(geo: THREE.BufferGeometry, far: FarLevel[], kit: WallKit, relief: boolean) {
      for (const slot of kit.slots) {
        const color = litColors.get(`${slot.x},${slot.z}`);
        const cell = `${slot.x},${slot.z}`;
        const obj = placeSurface(slot, geo, far, ceilingMaterial(kit, relief, !!slot.lit, color, cell), (o) => (o.rotation.x = Math.PI / 2));
        ceilingTiles.push({ cell: `${slot.x},${slot.z}`, obj, kit, relief });
      }
    }

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (cellAt(map, x, y) === "wall") continue;
        const floor = floorHeight(map, x, y);
        const ceiling = ceilingHeight(map, x, y);

        const floorKit = floorKitAt(x, y);
        if (floorKit) {
          floorKit.slots.push({ x, z: y, y: floor * wallHeight, rotY: 0, key: surfaceKey({ x, y }, "floor") });
        } else {
          const mesh = new THREE.Mesh(floorGeo, floorMat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(x, floor * wallHeight, y);
          group.add(mesh);
          decals.registerSurface(surfaceKey({ x, y }, "floor"), mesh);
        }

        const ceilingId = map.ceilingTextureAt?.(x, y) ?? map.textures?.ceiling;
        const ceilingKit = ceilingId === "sky" ? null : ceilingKitAt(x, y);
        if (ceilingId === "sky") {
          const pane = new THREE.Mesh(floorGeo, skySurface());
          pane.rotation.x = Math.PI / 2;
          pane.position.set(x, ceiling * wallHeight, y);
          group.add(pane);
        } else if (ceilingKit) {
          ceilingKit.slots.push({
            x,
            z: y,
            y: ceiling * wallHeight,
            rotY: 0,
            lit: litCells.has(`${x},${y}`),
            key: surfaceKey({ x, y }, "ceiling"),
          });
        } else {
          const mesh = new THREE.Mesh(floorGeo, ceilMat);
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(x, ceiling * wallHeight, y);
          group.add(mesh);
          decals.registerSurface(surfaceKey({ x, y }, "ceiling"), mesh);
        }

        // The walls around the cell: wherever the cell's open span (floor to
        // ceiling) isn't matched by its neighbor's. A solid neighbor walls
        // off all of it; an open one with a higher floor leaves a step face
        // (riser) below its floor, one with a lower ceiling a strip (header)
        // above it.
        const wallOverride = map.wallTextureAt?.(x, y);
        (Object.keys(DIR_VECTOR) as Direction[]).forEach((d) => {
          const v = DIR_VECTOR[d];
          const nx = x + v.x;
          const ny = y + v.y;
          const spans: { bottom: number; top: number; anchor: "bottom" | "top" }[] = [];
          if (cellAt(map, nx, ny) === "wall") {
            spans.push({ bottom: floor, top: ceiling, anchor: "bottom" });
          } else {
            const nFloor = floorHeight(map, nx, ny);
            const nCeiling = ceilingHeight(map, nx, ny);
            if (nFloor > floor) spans.push({ bottom: floor, top: Math.min(ceiling, nFloor), anchor: "bottom" });
            if (nCeiling < ceiling) spans.push({ bottom: Math.max(floor, nCeiling), top: ceiling, anchor: "top" });
          }
          if (!spans.length) return;

          const face = { x: x + v.x * 0.5, z: y + v.y * 0.5, rotY: WALL_ROTATION[d], key: surfaceKey({ x, y }, d) };
          const faceSet: string = isTextureSetId(wallOverride)
            ? wallOverride
            : accentKit && wallVariantRoll(face.x, face.z) < settings.accentRatio
              ? accentSet
              : primarySet;
          if (faceSet === "sky") {
            // an opening onto the sky
            for (const span of spans) {
              const geo = new THREE.PlaneGeometry(1, (span.top - span.bottom) * wallHeight);
              geometries.push(geo);
              const pane = new THREE.Mesh(geo, skySurface());
              pane.position.set(face.x, ((span.bottom + span.top) / 2) * wallHeight, face.z);
              pane.rotation.y = face.rotY;
              group.add(pane);
            }
            return;
          }
          if (settings.wallProfile === "relief") {
            for (const span of spans) {
              backingPanels.push({
                ...face, width: 1,
                y: ((span.bottom + span.top) / 2) * wallHeight,
                height: (span.top - span.bottom) * wallHeight,
                floorTop: cellAt(map, nx, ny) !== "wall" && span.top === floorHeight(map, nx, ny),
              });
            }
          }
          const kit = wallKitFor(faceSet as TextureSetId);
          for (const span of spans) {
            for (const panel of wallPanels(span.bottom, span.top, span.anchor)) {
              const y = (panel.bottom + variantHeight(panel.variant) / 2) * wallHeight;
              // a window takes the first whole panel above the floor
              const windowSet = panel.bottom === floor && panel.variant === "full" ? windowFaces.get(face.key) : undefined;
              (windowSet ? windowKitFor(windowSet) : kit).slots.push({ ...face, y, variant: panel.variant });
            }
          }
        });

        if (cellAt(map, x, y) === "door") {
          const spec = doorAt(map, x, y);
          panelKitFor(spec.kind);
          doorCells.push({ x, z: y, spec, key: doorCellKey({ x, y }) });
        }
      }
    }
    const kits = [...wallKits.values()];
    // standing water mirrors the open sky, when there is one
    decals.setWaterSky((skyMat as THREE.ShaderMaterial | null)?.uniforms.map.value ?? null);
    // Split at every change in wall height before finding corners. A tall
    // wall can have a straight neighbor below a step and a corner above it.
    // Insetting whole panels leaves holes at every straight seam.
    const backingCuts = [...new Set(backingPanels.flatMap((p) => [p.y - p.height / 2, p.y + p.height / 2]))].sort((a, b) => a - b);
    const backingBands = backingPanels.flatMap((panel) => {
      const bottom = panel.y - panel.height / 2;
      const top = panel.y + panel.height / 2;
      const cuts = backingCuts.filter((y) => y >= bottom - 1e-6 && y <= top + 1e-6);
      const color = backingColor();
      return cuts.slice(1).map((y, i) => ({ ...panel, y: (cuts[i] + y) / 2, height: y - cuts[i], bottom, top, color }));
    });
    const backingModes = edgeModes(backingBands);
    backingBands.forEach((panel, i) => {
      const back = reliefDepth + 0.02;
      const nx = Math.sin(panel.rotY), nz = Math.cos(panel.rotY);
      const tx = Math.cos(panel.rotY), tz = -Math.sin(panel.rotY);
      const cx = panel.x - nx * back, cz = panel.z - nz * back;
      const left = -panel.width / 2 + Math.max(0, backingModes[i][0]) * back;
      const right = panel.width / 2 - Math.max(0, backingModes[i][1]) * back;
      // Cover the recess of the lower floor instead of stopping above it.
      // A riser's top stays below the upper floor's deepest recess; an
      // ordinary wall still reaches its ceiling. Internal bands meet flush.
      const y0 = panel.y - panel.height / 2 - (Math.abs(panel.y - panel.height / 2 - panel.bottom) < 1e-6 ? floorDepth + 0.02 : 0);
      const y1 = Math.min(panel.y + panel.height / 2, panel.top - (panel.floorTop ? floorDepth + 0.02 : 0));
      if (right <= left || y1 <= y0) return;
      const lx = cx + tx * left, lz = cz + tz * left;
      const rx = cx + tx * right, rz = cz + tz * right;
      backingPositions.push(
        lx, y0, lz, rx, y0, rz, rx, y1, rz,
        lx, y0, lz, rx, y1, rz, lx, y1, lz,
      );
      const color = panel.color;
      for (let v = 0; v < 6; v++) backingColors.push(color.r, color.g, color.b);
    });
    if (backingPositions.length) {
      const backingGeo = new THREE.BufferGeometry();
      backingGeo.setAttribute("position", new THREE.Float32BufferAttribute(backingPositions, 3));
      backingGeo.setAttribute("color", new THREE.Float32BufferAttribute(backingColors, 3));
      geometries.push(backingGeo);
      group.add(new THREE.Mesh(backingGeo, backingMat));
    }

    // floor glow fixtures, lifted above the floor relief once it's built
    const floorStrips: THREE.Mesh[] = [];

    // a height map caught mid-save by an image editor (hot reload) or
    // fetched while the dev server restarts fails to decode - retry briefly
    const loadWithRetry = async (url: string, attempts: number): Promise<Awaited<ReturnType<typeof loadHeightGrid>>> => {
      try {
        return await loadHeightGrid(url);
      } catch (err) {
        if (attempts <= 1 || disposed) throw err;
        await new Promise((resolve) => setTimeout(resolve, 400));
        return loadWithRetry(url, attempts - 1);
      }
    };

    // height maps by URL, each loaded once per scene
    const coarseGrids = new Map<string, Awaited<ReturnType<typeof loadWithRetry>>>();

    // what each detailed relief panel was built from - for the props' distant
    // versions (see addPropLods)
    const reliefSources = new WeakMap<THREE.BufferGeometry, { kit: WallKit; shape: Parameters<typeof buildRelief>[1] }>();

    // builds a kit's relief geometry from its depth map and hooks up its AO
    // (a partial panel - `rows` - shares the whole panel's); resolves to null
    // if the scene was torn down meanwhile
    async function buildRelief(
      kit: WallKit,
      shape: {
        width?: number;
        height: number;
        flushEdges: boolean;
        holeBackZ?: number;
        rows?: [number, number];
        cols?: [number, number];
        holeLevels?: number;
        // relief depth (default: the settings')
        depth?: number;
        // a low-detail version: from a grid this many times coarser (see
        // LOD_FACTOR), without its own AO map (the full panel's is used)
        coarse?: number;
        // a second version of a surface whose full one set the AO map
        lodOnly?: boolean;
        // a smooth relief's distant version: this many times fewer cells each
        // way (see SMOOTH_LODS) - the grid isn't made coarser for it then
        smoothLod?: number;
        // side edges left for corner joins (ReliefOptions.joinEdges), and
        // the corners they land on (ReliefOptions.edgeModes)
        joinEdges?: number;
        floorEdges?: boolean;
        flushRows?: boolean;
        edgeModes?: [number, number];
      },
    ) {
      type Shape = typeof shape;
      // built once for the same depth map, shape and relief settings (see
      // SceneCache)
      const keyOf = (s: Shape) =>
        [
          kit.depthUrl,
          JSON.stringify(s),
          reliefDepth,
          textureTuning(kit.id)?.relief ?? 1,
          settings.reliefLevels,
          settings.reliefMinIsland,
          settings.reliefMode,
          settings.wallDetail,
          settings.aoRadius,
        ].join("|");
      const cached = (shape: Shape): Promise<ReturnType<typeof createReliefWallGeometry> | null> => {
        const key = keyOf(shape);
        let built = cache.reliefs.get(key);
        if (built) return built;
        built = (async () => {
          let gridPromise = cache.grids.get(kit.depthUrl);
          if (!gridPromise) {
            gridPromise = loadWithRetry(kit.depthUrl, 4);
            cache.grids.set(kit.depthUrl, gridPromise);
          }
          let grid = await gridPromise;
          // (a map with holes or cut-out levels is never built smooth - see
          // ReliefOptions.smooth - so its distant version gets the coarser grid)
          const smooth = settings.reliefMode === "smooth" && !grid.solid && !shape.holeLevels;
          const smoothLod = smooth ? shape.smoothLod : undefined;
          let edgeProfile: EdgeSegment[] | undefined;
          if (shape.coarse && shape.coarse > 1 && !smoothLod) {
            const coarseKey = `${kit.depthUrl}|${shape.coarse}`;
            let coarse = coarseGrids.get(coarseKey);
            if (!coarse) {
              coarse = downsampleHeightGrid(grid, shape.coarse);
              coarseGrids.set(coarseKey, coarse);
            }
            grid = coarse;
            // a stepped distant version with joined edges ends on its
            // detailed version's edge profile (its own levels differ), so the
            // join strips fit both
            if (shape.joinEdges) {
              const detailed = { ...shape };
              delete detailed.coarse;
              delete detailed.lodOnly;
              delete detailed.smoothLod;
              edgeProfile = (await cached(detailed))?.edge;
            }
          }
          const made = createReliefWallGeometry(grid, {
            wallWidth: shape.width ?? 1,
            wallHeight: shape.height,
            // (the texture's own relief tuning on top)
            depth: (shape.depth ?? reliefDepth) * (textureTuning(kit.id)?.relief ?? 1),
            levels: settings.reliefLevels,
            minIsland: settings.reliefMinIsland,
            smooth: settings.reliefMode === "smooth",
            smoothCells: settings.wallDetail,
            smoothLod,
            aoRadius: settings.aoRadius,
            flushEdges: shape.flushEdges,
            holeBackZ: shape.holeBackZ,
            rows: shape.rows,
            cols: shape.cols,
            holeLevels: shape.holeLevels,
            joinEdges: shape.joinEdges,
            floorEdges: shape.floorEdges,
            flushRows: shape.flushRows,
            edgeModes: shape.edgeModes,
            edgeProfile,
          });
          // a partial panel or a far version uses its full panel's AO map
          if (shape.rows || shape.lodOnly) made.aoMap.dispose();
          return made;
        })();
        cache.reliefs.set(key, built);
        built.catch(() => cache.reliefs.delete(key));
        return built;
      };
      const built = cached(shape);
      const relief = await built;
      if (disposed || !relief) return null;
      if (!shape.lodOnly) reliefSources.set(relief.geometry, { kit, shape });
      if (shape.rows || shape.lodOnly) return relief;
      for (const mat of kitMaterials(kit)) {
        mat.aoMap = relief.aoMap;
        mat.aoMapIntensity = settingsRef.current.aoIntensity;
        mat.needsUpdate = true;
      }
      return relief;
    }

    // how much farther than usual the distant versions take over (see
    // Graphics.lodScale; 0: never)
    const lodScale = settings.lodScale;
    // A surface's distant versions (after its full one, whose AO map they
    // use): a stepped relief's from a grid LOD_FACTOR times coarser, a
    // smooth one's with fewer cells (SMOOTH_LODS - no more levels than the
    // wall detail setting leaves room for above SMOOTH_LOD_MIN_CELLS).
    // Their distances are the graphics setting's lodScale times the usual
    // ones (0: no distant versions at all - nothing built for them either).
    async function farReliefLevels(kit: WallKit, shape: Parameters<typeof buildRelief>[1]): Promise<FarLevel[]> {
      if (!lodScale) return [];
      const levels: { distance: number; smoothLod?: number }[] = [];
      if (settings.reliefMode === "smooth") {
        const most = Math.max(1, Math.floor(settings.wallDetail / SMOOTH_LOD_MIN_CELLS));
        let last = 1;
        for (const { distance, divisor } of SMOOTH_LODS) {
          const d = Math.min(divisor, most);
          if (d > last) levels.push({ distance: distance * lodScale, smoothLod: d });
          last = Math.max(last, d);
        }
      } else {
        levels.push({ distance: LOD_DISTANCE * lodScale });
      }
      const out: FarLevel[] = [];
      let previous: THREE.BufferGeometry | null = null;
      for (const level of levels) {
        const relief = await buildRelief(kit, { ...shape, coarse: LOD_FACTOR, lodOnly: true, smoothLod: level.smoothLod });
        if (!relief) return [];
        // (a kit that can't be smooth gets the coarse grid at every level:
        // the same mesh - the first one does)
        if (previous && relief.triangles >= previous.index!.count / 3) continue;
        out.push({ geometry: relief.geometry, distance: level.distance });
        previous = relief.geometry;
        // decals painted on the detailed surface would sink into this one
        // where it bridges hollows: they're pulled over it from its distance
        decals.setFarPull([{ distance: level.distance, rise: relief.lodRise ?? 0 }]);
      }
      return out;
    }

    // A prop's relief faces get distant versions like the walls (a pillar or
    // a crate is as finely built as a wall, several faces of it): each face
    // becomes a level-of-detail set in the face's place, the same transform,
    // the same materials (cloned with the prop, see LOD.copy).
    async function addPropLods(root: THREE.Object3D) {
      const faces: THREE.Mesh[] = [];
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && reliefSources.has(mesh.geometry)) faces.push(mesh);
      });
      for (const mesh of faces) {
        const source = reliefSources.get(mesh.geometry)!;
        const far = await farReliefLevels(source.kit, source.shape);
        const parent = mesh.parent;
        if (!far.length || !parent) continue;
        const lod = new THREE.LOD();
        lod.position.copy(mesh.position);
        lod.quaternion.copy(mesh.quaternion);
        lod.scale.copy(mesh.scale);
        // (in the face's place among its siblings: a box's lid is its last)
        const index = parent.children.indexOf(mesh);
        parent.remove(mesh);
        mesh.position.set(0, 0, 0);
        mesh.quaternion.identity();
        mesh.scale.set(1, 1, 1);
        lod.addLevel(mesh, 0);
        for (const level of far) lod.addLevel(new THREE.Mesh(level.geometry, mesh.material), level.distance);
        parent.add(lod);
        parent.children.splice(parent.children.length - 1, 1);
        parent.children.splice(index, 0, lod);
      }
    }

    // Wall panels' side edges: joined to their neighbors' (CORNER_JOINS) -
    // a stepped relief's profile a step every this many cells (its distant
    // version's grid is LOD_FACTOR times coarser, so both end on the same
    // line) - or eased flush the old way.
    const joinWalls =
      CORNER_JOINS && !(import.meta.env.DEV && (window as { __voidcrewNoJoins?: boolean }).__voidcrewNoJoins);
    const joinEdgeCells = (() => {
      if (settings.reliefMode !== "smooth") return LOD_FACTOR;
      const most = Math.max(1, Math.floor(settings.wallDetail / SMOOTH_LOD_MIN_CELLS));
      return SMOOTH_LODS.reduce((d, level) => Math.max(d, Math.min(level.divisor, most)), 1);
    })();
    // (`modes`: the corners its edges were picked to land on - see edgeModes)
    const wallShape = (height: number, rows: [number, number] | undefined, modes: [number, number] = [0, 0]) =>
      joinWalls
        ? { height, flushEdges: false, joinEdges: joinEdgeCells, rows, ...(modes[0] || modes[1] ? { edgeModes: modes } : {}) }
        : { height, flushEdges: true, rows };
    // each kit's panel edge profiles per variant, for the joins
    const wallEdges = new Map<WallKit, Map<PanelVariant, EdgeSegment[]>>();

    // a kit's wall panel geometry per variant (and corner modes), built once
    const wallGeometries = new Map<WallKit, Map<string, Promise<THREE.BufferGeometry | null>>>();
    function wallGeometry(kit: WallKit, variant: PanelVariant, modes: [number, number] = [0, 0]): Promise<THREE.BufferGeometry | null> {
      let byVariant = wallGeometries.get(kit);
      if (!byVariant) {
        byVariant = new Map();
        wallGeometries.set(kit, byVariant);
      }
      let geo = byVariant.get(`${variant}|${modes}`);
      if (!geo) {
        const rows = variantRows(variant);
        const height = variantHeight(variant) * wallHeight;
        if (wallGeo) {
          // flat/beveled walls: partial panels are flat bands
          const band = rows ? createBandPlane(height, rows) : wallGeo;
          if (rows) geometries.push(band);
          geo = Promise.resolve(band);
        } else {
          const keepEdge = (relief: Awaited<ReturnType<typeof buildRelief>>) => {
            if (relief?.edge) {
              if (!wallEdges.has(kit)) wallEdges.set(kit, new Map());
              wallEdges.get(kit)!.set(variant, relief.edge);
            }
            return relief;
          };
          if (!rows) {
            geo = buildRelief(kit, wallShape(height, undefined, modes)).then((relief) => {
              if (!keepEdge(relief)) return null;
              if (kit === primaryKit && !modes[0] && !modes[1]) {
                reliefStats = { trianglesPerWall: relief!.triangles, levelCount: relief!.levelCount, baked: relief!.baked };
              }
              return relief!.geometry;
            });
          } else {
            // after the whole panel, whose AO map the band borrows
            geo = wallGeometry(kit, "full")
              .then((full) => (full ? buildRelief(kit, wallShape(height, rows, modes)) : null))
              .then((relief) => keepEdge(relief)?.geometry ?? null);
          }
        }
        byVariant.set(`${variant}|${modes}`, geo);
      }
      return geo;
    }
    // ... and its distant, low-detail relief (none for flat walls)
    const farWallGeometries = new Map<WallKit, Map<string, Promise<FarLevel[]>>>();
    function farWallGeometry(kit: WallKit, variant: PanelVariant, modes: [number, number] = [0, 0]): Promise<FarLevel[]> {
      if (wallGeo) return Promise.resolve([]);
      let byVariant = farWallGeometries.get(kit);
      if (!byVariant) {
        byVariant = new Map();
        farWallGeometries.set(kit, byVariant);
      }
      let geo = byVariant.get(`${variant}|${modes}`);
      if (!geo) {
        const rows = variantRows(variant);
        const height = variantHeight(variant) * wallHeight;
        geo = farReliefLevels(kit, wallShape(height, rows, modes));
        byVariant.set(`${variant}|${modes}`, geo);
      }
      return geo;
    }

    const joinPanels: JoinPanel[] = [];
    const wallsPlaced: Promise<unknown>[] = [];
    const joinedStrips: JoinedStrips[] = [];
    // Every wall panel's corner modes, from where the panels stand alone (so
    // each corner's two faces are built to meet on their mitre)
    const panelModes = new Map<WallSlot, [number, number]>();
    if (joinWalls && !wallGeo) {
      const all = kits.flatMap((kit) => kit.slots);
      const modes = edgeModes(all.map((slot) => ({ ...slot, width: 1, height: variantHeight(slot.variant ?? "full") * wallHeight })));
      all.forEach((slot, i) => panelModes.set(slot, modes[i]));
    }
    for (const kit of kits) {
      const byForm = new Map<string, { variant: PanelVariant; modes: [number, number]; slots: WallSlot[] }>();
      for (const slot of kit.slots) {
        const variant = slot.variant ?? "full";
        const modes = panelModes.get(slot) ?? [0, 0];
        const key = `${variant}|${modes}`;
        if (!byForm.has(key)) byForm.set(key, { variant, modes, slots: [] });
        byForm.get(key)!.slots.push(slot);
      }
      for (const { variant, modes, slots } of byForm.values()) {
        const placed = track(
          Promise.all([wallGeometry(kit, variant, modes), wallGeometry(kit, variant, modes).then(() => farWallGeometry(kit, variant, modes))]),
        )
          .then(([geo, far]) => {
            if (!geo) return;
            placeWalls(geo, far, wallGeo ? kit.wallMat : [kit.wallMat, kit.sideMat], slots);
            const edge = wallEdges.get(kit)?.get(variant);
            if (!edge) return;
            for (const slot of slots) {
              joinPanels.push({
                x: slot.x,
                z: slot.z,
                y: slot.y,
                rotY: slot.rotY,
                width: 1,
                edge,
                modes,
                material: kit.wallMat,
              });
            }
          })
          .catch((err) => console.error("Wall build failed:", err));
        wallsPlaced.push(placed);
      }
    }
    // Once every wall panel is up: the strips joining their side edges
    // (cornerJoins.ts), one merged mesh per material. A meeting point's strip
    // is drawn while any of the (up to four) cells round it is in sight (see
    // applySight) - not with its panels' facing: it turns round a corner,
    // seen from either side.
    if (joinWalls && !wallGeo) {
      track(Promise.all(wallsPlaced))
        .then(() => {
          if (disposed) return;
          const joins = buildCornerJoins(joinPanels);
          let triangles = 0;
          for (const strips of mergeCornerJoins(joins)) {
            strips.mesh.userData.joinStrips = strips;
            joinedStrips.push(strips);
            geometries.push(strips.mesh.geometry);
            group.add(strips.mesh);
            triangles += strips.triangles;
          }
          // (drawn from the next sight pass on)
          culledCount = -1;
          if (import.meta.env.DEV) Object.assign(window, { __voidcrewJoins: { points: joins.length, triangles } });
        })
        .catch((err) => console.error("Corner joins failed:", err));
    }

    // every kit, for per-frame material updates and disposal (the props'
    // made as they're built, after this)
    const deckKits = [
      ...kits,
      ...floorKits.values(),
      frameKit,
      ...panelKits.values(),
      ...ceilingKits.values(),
      ...windowKits.values(),
    ];
    const allKits = () => [...deckKits, ...propKits.values()];

    // Windows are always relief too: the frame panel with its opening cut
    // out, the opening's jambs reaching WINDOW_DEPTH back into the wall, and
    // the glass at the back of that recess. Through the glass: the starfield,
    // looked up by view direction, so it's infinitely far away from any
    // angle; the wired glass pattern darkens it, and an additive sheen
    // catches the lights' highlights.
    const wiredGlass = createWiredGlass();
    const spaceMat = new THREE.MeshBasicMaterial({
      envMap: getStarfield(),
      refractionRatio: 1,
      map: wiredGlass,
      color: GLASS_TINT,
      // stars are light sources: no fog on them
      fog: false,
    });
    const sheenMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.3,
      metalness: 0,
      transparent: true,
      // added on top, scaled down: a hint of glass, not a glare
      opacity: GLASS_SHEEN,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const [setId, windowKit] of windowKits) {
      // a wide window's pieces continue each other: no flush edge margins
      // (they'd flatten the mullions on the seams)
      track(buildRelief(windowKit, { height: wallHeight, flushEdges: setId === windowSet, holeBackZ: -WINDOW_DEPTH }))
        .then((frame) => {
          if (!frame) return;
          const hole = frame.holeBounds ?? { minX: -0.3, maxX: 0.3, minY: -0.13 * wallHeight, maxY: 0.22 * wallHeight };
          const w = hole.maxX - hole.minX;
          const h = hole.maxY - hole.minY;
          const glassGeo = new THREE.PlaneGeometry(w, h);
          // wire tiles at the walls' texel density
          const uv = glassGeo.getAttribute("uv");
          for (let i = 0; i < uv.count; i++) {
            uv.setXY(i, (uv.getX(i) * w * TRIM_TEXELS) / WIRE_TILE, (uv.getY(i) * h * TRIM_TEXELS) / WIRE_TILE);
          }
          geometries.push(glassGeo);
          for (const slot of windowKit.slots) {
            const mesh = new THREE.Mesh(frame.geometry, [windowKit.wallMat, windowKit.sideMat]);
            mesh.position.set(slot.x, slot.y, slot.z);
            mesh.rotation.y = slot.rotY;
            for (const [mat, z] of [
              [spaceMat, -WINDOW_DEPTH + 0.01],
              [sheenMat, -WINDOW_DEPTH + 0.012],
            ] as const) {
              const glass = new THREE.Mesh(glassGeo, mat);
              glass.position.set((hole.minX + hole.maxX) / 2, (hole.minY + hole.maxY) / 2, z);
              mesh.add(glass);
            }
            group.add(mesh);
            decals.registerSurface(slot.key, mesh);
          }
        })
        .catch((err) => console.error("Window build failed:", err));
    }

    for (const ceilingKit of ceilingKits.values()) {
      if (isRelief) {
        track(
          buildRelief(ceilingKit, { height: 1, flushEdges: false }).then(async (relief) => [
            relief,
            relief ? await farReliefLevels(ceilingKit, { height: 1, flushEdges: false }) : [],
          ] as const),
        )
          .then(([relief, far]) => relief && placeCeilings(relief.geometry, far, ceilingKit, true))
          .catch((err) => console.error("Relief ceiling build failed:", err));
      } else {
        placeCeilings(floorGeo, [], ceilingKit, false);
      }
    }

    let floorTop = 0;
    for (const floorKit of floorKits.values()) {
      if (isRelief) {
        track(
          buildRelief(floorKit, { height: 1, flushEdges: false, floorEdges: true, depth: floorDepth }).then(async (relief) => [
            relief,
            relief ? await farReliefLevels(floorKit, { height: 1, flushEdges: false, floorEdges: true, depth: floorDepth }) : [],
          ] as const),
        )
          .then(([relief, far]) => {
            if (!relief) return;
            placeFloors(relief.geometry, far, [floorKit.wallMat, floorKit.sideMat], floorKit.slots);
            // keep the strips above the highest floor relief
            floorTop = Math.max(floorTop, relief.maxZ);
            for (const strip of floorStrips) strip.position.y = strip.userData.floorY + floorTop + 0.003;
          })
          .catch((err) => console.error("Relief floor build failed:", err));
      } else {
        placeFloors(floorGeo, [], floorKit.wallMat, floorKit.slots);
      }
    }

    // Doors are always relief (a frame needs its cut-out opening), whatever
    // the wall type. The frame is built first: the panel is sized to fit its
    // opening.
    // A frame (and often a panel) has holes, so it's built stepped from the
    // full height grid whatever the smooth wall detail - a door cost as much
    // as several walls at any graphics setting. Its grid is made coarser
    // with the setting instead (none at the highest: 64 cells), and it gets
    // a distant version like the walls (a grid LOD_FACTOR times coarser
    // still) - the opening stays crisp: a coarser cell is a hole when most
    // of it is. (64: the highest wall detail setting)
    const doorCoarse = Math.max(1, Math.round(64 / settings.wallDetail));
    const doorFarCoarse = doorCoarse * LOD_FACTOR;
    // a door part: its mesh, or the near/far pair when it has a far version
    const doorPart = (geo: THREE.BufferGeometry, far: THREE.BufferGeometry | null, mat: THREE.Material[]) => {
      const mesh = new THREE.Mesh(geo, mat);
      if (!far) return mesh;
      const lod = new THREE.LOD();
      lod.addLevel(mesh, 0);
      lod.addLevel(new THREE.Mesh(far, mat), LOD_DISTANCE * lodScale);
      return lod;
    };
    if (doorCells.length) {
      track(async () => {
        const frameShape = {
          height: wallHeight,
          flushEdges: false,
          // the opening's jambs reach back to the center plane, where they
          // meet the other half's
          holeBackZ: -DOOR_FRAME_HALF_DEPTH,
        };
        const frame = await buildRelief(frameKit, { ...frameShape, coarse: doorCoarse });
        if (!frame) return;
        // (none when the graphics setting asks for no distant versions)
        const frameFar = lodScale ? await buildRelief(frameKit, { ...frameShape, coarse: doorFarCoarse, lodOnly: true }) : null;
        const hole = frame.holeBounds ?? { minX: -0.35, maxX: 0.35, minY: -wallHeight / 2, maxY: wallHeight * 0.3 };
        const panelWidth = hole.maxX - hole.minX + 2 * DOOR_PANEL_OVERLAP;
        // from the floor up behind the frame's header - its foot just clear
        // of the floor's relief (which rises up to half its depth: the
        // panel's own relief ledges would flicker against the floorboards)
        const panelHeight = wallHeight / 2 + hole.maxY + DOOR_PANEL_OVERLAP;
        const panelLift = reliefDepth / 2 + 0.005;
        const panelCenterX = (hole.minX + hole.maxX) / 2;
        // one panel geometry per door kind (each kit has its own depth map)
        const panelGeos = new Map<DoorSpec["kind"], { near: THREE.BufferGeometry; far: THREE.BufferGeometry | null }>();
        for (const [kind, kit] of panelKits) {
          const panelShape = { width: panelWidth, height: panelHeight - panelLift, flushEdges: false };
          const panel = await buildRelief(kit, { ...panelShape, coarse: doorCoarse });
          if (!panel) return;
          const far = lodScale ? await buildRelief(kit, { ...panelShape, coarse: doorFarCoarse, lodOnly: true }) : null;
          panelGeos.set(kind, { near: panel.geometry, far: far?.geometry ?? null });
        }

        for (const cell of doorCells) {
          const { spec } = cell;
          const door = new THREE.Group();
          door.position.set(cell.x, floorY(cell.x, cell.z), cell.z);
          // local +Z = the side the door faces; moved that way to where it
          // stands in its cell (see DoorSpec.offset)
          door.rotation.y = FACING_ROTATION[spec.facing];
          door.translateZ(spec.offset ?? 0);
          // the map editor picks it by this
          door.userData.doorCell = { x: cell.x, y: cell.z };
          doorGroups.set(cell.key, door);

          // two halves back to back, each facing out of one side
          for (const side of [1, -1]) {
            const frameHalf = doorPart(frame.geometry, frameFar?.geometry ?? null, [frameKit.wallMat, frameKit.sideMat]);
            frameHalf.position.set(0, wallHeight / 2, side * DOOR_FRAME_HALF_DEPTH);
            frameHalf.rotation.y = side === 1 ? 0 : Math.PI;
            door.add(frameHalf);
          }

          const kit = panelKits.get(spec.kind)!;
          const front = spec.label || spec.kind === "lift" ? await labeledPanelMaterial(spec, kit) : kit.wallMat;
          if (disposed) return;
          const slider = new THREE.Group();
          for (const side of [1, -1]) {
            const geos = panelGeos.get(spec.kind)!;
            const panelHalf = doorPart(geos.near, geos.far, [front, kit.sideMat]);
            panelHalf.position.set(panelCenterX, panelLift + (panelHeight - panelLift) / 2, side * DOOR_PANEL_HALF_DEPTH);
            panelHalf.rotation.y = side === 1 ? 0 : Math.PI;
            slider.add(panelHalf);
          }
          // open: a standard door slides up until its bottom clears the
          // opening; a lift door slides right (seen from the front, local +X)
          // into the wall beside the frame
          const closedPos = new THREE.Vector3();
          const openPos =
            spec.kind === "lift" ? new THREE.Vector3(panelWidth, 0, 0) : new THREE.Vector3(0, panelHeight, 0);
          const open = openDoorsRef.current.has(cell.key);
          slider.position.copy(open ? openPos : closedPos);
          slider.userData = { open, openPos, closedPos };
          door.add(slider);

          group.add(door);
          doorPanelsRef.current.set(cell.key, slider);
        }
      }).catch((err) => console.error("Door build failed:", err));
    }

    // Props are relief, whatever the wall type. A box prop: four side faces
    // and a top, each a relief panel facing out. A views prop: box parts
    // whose faces are cut out of its orthographic views' reliefs (see
    // props.ts) - a face shows the part of the view it covers. Reliefs
    // aren't flushed at the edges, so a raised rim leaves a small notch
    // along an edge - it reads as a worn edge. One template per prop type,
    // cloned per instance (sharing geometry and materials).
    // a cabin prop's glass: faintly tinted, see-through, catching the lights
    const cabinGlass = new THREE.MeshStandardMaterial({
      color: 0xd8ecff,
      transparent: true,
      opacity: 0.22,
      roughness: 0.08,
      metalness: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    ownMaterials.push(cabinGlass);

    // A pillar `h` tall (world units): its foot, shaft and head as relief
    // blocks cut from its texture (as a wall of the same height would show
    // it), the 45 degree slopes between them flat.
    async function buildPillar(type: Extract<PropType, { kind: "pillar" }>, h: number, cellSet: string): Promise<THREE.Group | null> {
      // (in a deck texture - its own, the wall's around it - it's the deck's: it
      // takes the ship's livery like the walls)
      const setId = type.texture ?? cellSet;
      const kit = isTextureSetId(setId) ? wallKitFor(setId) : sharedPropKitFor(setId);
      const relief = propReliefDepth * PROP_RELIEF_SCALE * (type.relief ?? 1);
      const foot = type.size[0];
      const shaft = type.shaft;
      const slope = (foot - shaft) / 2;
      const flare = Math.min(type.flare, Math.max(0, h / 2 - slope - 0.05));
      const group = new THREE.Group();
      // The texture covers one wall height, as on a wall, and repeats up a taller
      // pillar instead of stretching over it: a block is cut into pieces at
      // every wall height.
      const tile = wallHeight;
      // the whole panel first: it gives the kit its AO map
      if (!(await buildRelief(kit, { width: 1, height: tile, flushEdges: false, depth: relief, coarse: PROP_COARSE }))) return null;
      const block = async (w: number, y0: number, y1: number) => {
        for (let s0 = y0; s0 < y1 - 1e-6; ) {
          const k = Math.floor(s0 / tile + 1e-6);
          const s1 = Math.min(y1, (k + 1) * tile);
          // (its four faces meet at outer corners: built to land on the
          // mitre - see ReliefOptions.edgeModes - the copies of one face meet
          // vertex on vertex all the way round, no core showing between them)
          const cut = await buildRelief(kit, {
            width: w,
            height: s1 - s0,
            flushRows: true,
            flushEdges: false,
            depth: relief,
            coarse: PROP_COARSE,
            cols: [0.5 - w / 2, 0.5 + w / 2],
            rows: [1 - (s1 - k * tile) / tile, 1 - (s0 - k * tile) / tile],
            ...(CORNER_JOINS ? { joinEdges: joinEdgeCells, edgeModes: [1, 1] as [number, number] } : {}),
          });
          if (!cut) return false;
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2;
            const mesh = new THREE.Mesh(cut.geometry, [kit.wallMat, kit.sideMat]);
            mesh.position.set((Math.sin(a) * w) / 2, (s0 + s1) / 2, (Math.cos(a) * w) / 2);
            mesh.rotation.y = a;
            group.add(mesh);
          }
          s0 = s1;
        }
        return true;
      };
      const ok =
        (await block(foot, 0, flare)) &&
        (await block(shaft, flare + slope, h - flare - slope)) &&
        (await block(foot, h - flare, h));
      if (!ok) return null;
      // the slopes: a band of four quads each, from `w0` wide at `y0` to
      // `w1` at `y1`, mapped as the wall texture would be there
      const positions: number[] = [];
      const uvs: number[] = [];
      const band = (w0: number, y0: number, w1: number, y1: number) => {
        // (v continues from the tile the band's middle is in)
        const mid = (y0 + y1) / 2;
        const vOf = (y: number) => (mid / tile) % 1 + (y - mid) / tile;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          const s = Math.sin(a);
          const c = Math.cos(a);
          // (u across the face, its half width, y) to the pillar's space
          const at = (u: number, half: number, y: number) => [c * u + s * half, y, -s * u + c * half];
          const corners = [
            [...at(-w0 / 2, w0 / 2, y0), 0.5 - w0 / 2, vOf(y0)],
            [...at(w0 / 2, w0 / 2, y0), 0.5 + w0 / 2, vOf(y0)],
            [...at(w1 / 2, w1 / 2, y1), 0.5 + w1 / 2, vOf(y1)],
            [...at(-w1 / 2, w1 / 2, y1), 0.5 - w1 / 2, vOf(y1)],
          ];
          for (const k of [0, 1, 2, 0, 2, 3]) {
            positions.push(corners[k][0], corners[k][1], corners[k][2]);
            uvs.push(corners[k][3], corners[k][4]);
          }
        }
      };
      band(foot, flare, shaft, flare + slope);
      band(shaft, h - flare - slope, foot, h - flare);
      const slopes = new THREE.BufferGeometry();
      slopes.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      slopes.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      slopes.setAttribute("uv1", new THREE.Float32BufferAttribute(uvs, 2));
      slopes.computeVertexNormals();
      geometries.push(slopes);
      group.add(new THREE.Mesh(slopes, kit.wallMat));
      // A solid black core inside, a little under the relief: the pillar is made
      // of separate faces and slopes, and without a core the joins between them
      // show what's behind it (the sky, the next room).
      const inset = 2 * (relief + 0.012);
      const coreMat = backingMat;
      const core = (w: number, y0: number, y1: number) => {
        const geo = new THREE.BoxGeometry(Math.max(0.02, w - inset), y1 - y0, Math.max(0.02, w - inset));
        const colors: number[] = [];
        for (let face = 0; face < 6; face++) {
          const color = backingColor();
          for (let v = 0; v < 4; v++) colors.push(color.r, color.g, color.b);
        }
        geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geometries.push(geo);
        const mesh = new THREE.Mesh(geo, coreMat);
        mesh.position.set(0, (y0 + y1) / 2, 0);
        group.add(mesh);
      };
      // (the foot's width only where the foot is: over the slopes the pillar
      // narrows, and a wider core would stick out of them)
      core(foot, 0, flare);
      core(shaft, flare, h - flare);
      core(foot, h - flare, h);
      // a fixed-height pillar (a pedestal) gets a stone top to stand things on
      if (type.height) {
        const top = new THREE.PlaneGeometry(foot, foot);
        const uv = top.getAttribute("uv") as THREE.BufferAttribute;
        // (the middle of the texture, stretched over it)
        for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.3 + uv.getX(i) * 0.4, 0.3 + uv.getY(i) * 0.4);
        top.setAttribute("uv1", uv.clone());
        geometries.push(top);
        const cap = new THREE.Mesh(top, kit.wallMat);
        cap.rotation.x = -Math.PI / 2;
        cap.position.y = h + 0.001;
        group.add(cap);
      }
      return group;
    }

    // A chamfer `h` tall (world units) in `kit`'s texture: one relief panel,
    // cut from the middle of a wall panel as wide.
    async function buildChamfer(type: Extract<PropType, { kind: "chamfer" }>, kit: WallKit, h: number): Promise<THREE.Group | null> {
      const w = type.size[0];
      // after the walls' whole panel, whose AO map it borrows
      if (!(await wallGeometry(kit, "full"))) return null;
      const panel = await buildRelief(kit, { width: w, height: h, flushEdges: true, cols: [0.5 - w / 2, 0.5 + w / 2], rows: [0, 1] });
      if (!panel) return null;
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(panel.geometry, [kit.wallMat, kit.sideMat]);
      mesh.position.y = h / 2;
      group.add(mesh);
      return group;
    }

    // a prop type wearing another texture set (see PropSpec.texture)
    function retextured(type: PropType, texture: string | undefined): PropType {
      if (!texture) return type;
      switch (type.kind) {
        case "box":
          return { ...type, side: texture, top: isTextureSetId(`${texture}_top`) ? `${texture}_top` : texture };
        case "pillar":
        case "panel":
        case "cross":
          return { ...type, texture };
        default:
          return type;
      }
    }

    // the billboard props (trees): turned to face the camera every frame
    const billboardProps: THREE.Object3D[] = [];
    const billboardMaterials: THREE.MeshStandardMaterial[] = [];
    async function buildPropTemplate(type: PropType): Promise<THREE.Group | null> {
      const [length, height, depth] = type.size;
      // (its texture sets take its own normal strength)
      const propKitFor = (setId: string) => {
        const kit = sharedPropKitFor(setId);
        kit.normal = type.normal;
        const normal = settingsRef.current.normalStrength * (kit.normal ?? 1);
        kit.wallMat.normalScale.set(normal, normal);
        return kit;
      };
      const relief = propReliefDepth * PROP_RELIEF_SCALE * (type.relief ?? 1);
      const template = new THREE.Group();
      const face = (
        geo: THREE.BufferGeometry,
        kit: WallKit,
        pos: [number, number, number],
        rot: [number, number],
        mirror = false,
      ) => {
        const mesh = new THREE.Mesh(geo, [kit.wallMat, kit.sideMat]);
        mesh.position.set(...pos);
        mesh.rotation.set(rot[0], rot[1], 0);
        if (mirror) mesh.scale.x = -1;
        template.add(mesh);
      };

      if (type.kind === "box") {
        const sideKit = propKitFor(type.side);
        const topKit = propKitFor(type.top);
        const h = height * wallHeight;
        const side = await buildRelief(sideKit, { width: length, height: h, flushEdges: false, depth: relief, coarse: PROP_COARSE });
        const top = await buildRelief(topKit, { width: length, height: depth, flushEdges: false, depth: relief, coarse: PROP_COARSE });
        if (!side || !top) return null;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          face(side.geometry, sideKit, [(Math.sin(a) * length) / 2, h / 2, (Math.cos(a) * depth) / 2], [0, a]);
        }
        face(top.geometry, topKit, [0, h, 0], [-Math.PI / 2, 0]);
        return template;
      }

      if (type.kind === "billboard") {
        // one flat sprite, turned to the viewer every frame (see billboardProps)
        const base = `${import.meta.env.BASE_URL}textures/${type.texture}/`;
        const diffuse = kitTexture(base + "diffuse.png" + bust);
        const normalMap = kitTexture(base + "normal.png" + bust);
        diffuse.colorSpace = THREE.SRGBColorSpace;
        for (const tex of [diffuse, normalMap]) tex.magFilter = THREE.NearestFilter;
        const tune = textureTuning(type.texture);
        const mat = new THREE.MeshStandardMaterial({
          map: diffuse,
          normalMap,
          alphaTest: 0.5,
          roughness: Math.min(1, 0.85 * (tune?.rough ?? 1)),
          metalness: Math.min(1, 0.02 * (tune?.metal ?? 1)),
          side: THREE.DoubleSide,
        });
        const normal = settingsRef.current.normalStrength * (type.normal ?? 1) * (tune?.normal ?? 1);
        mat.normalScale.set(normal, normal);
        markSprite(mat, normal, normalMap);
        useLightGrid(mat, lightGrid);
        billboardMaterials.push(mat);
        const h = height * wallHeight;
        const geo = new THREE.PlaneGeometry(length, h);
        geometries.push(geo);
        const sprite = new THREE.Mesh(geo, mat);
        sprite.position.y = h / 2;
        template.add(sprite);
        return template;
      }

      if (type.kind === "panel" || type.kind === "cross") {
        // front and back (the back mirrored), crossed for a cross
        const kit = propKitFor(type.texture);
        const h = height * wallHeight;
        const panel = await buildRelief(kit, { width: length, height: h, flushEdges: false, depth: relief, coarse: PROP_COARSE });
        if (!panel) return null;
        const y = (type.kind === "panel" ? (type.elevation ?? 0) * wallHeight : 0) + h / 2;
        for (const turn of type.kind === "cross" ? [0, Math.PI / 2] : [0]) {
          face(panel.geometry, kit, [0, y, 0], [0, turn]);
          face(panel.geometry, kit, [0, y, 0], [0, turn + Math.PI], true);
        }
        return template;
      }

      if (type.kind === "cabin") {
        const [door, inside, side, top] = propSets(type).map((id) => propKitFor(id));
        const h = height * wallHeight;
        const panel = (kit: WallKit, w: number, ph: number) =>
          buildRelief(kit, { width: w, height: ph, flushEdges: false, depth: relief, coarse: PROP_COARSE });
        const d = await panel(door, length, h);
        const b = await panel(inside, length, h);
        const s = await panel(side, depth, h);
        const t = await panel(top, length, depth);
        if (!d || !b || !s || !t) return null;
        const inset = 0.006;
        // the door (and its inside), the back wall's inside
        face(d.geometry, door, [0, h / 2, depth / 2], [0, 0]);
        face(d.geometry, door, [0, h / 2, depth / 2], [0, Math.PI], true);
        face(b.geometry, inside, [0, h / 2, -depth / 2 + inset], [0, 0]);
        // the sides, outside and in; the roof, outside and in
        face(s.geometry, side, [length / 2, h / 2, 0], [0, Math.PI / 2]);
        face(s.geometry, side, [-length / 2, h / 2, 0], [0, -Math.PI / 2], true);
        face(s.geometry, side, [length / 2 - inset, h / 2, 0], [0, -Math.PI / 2], true);
        face(s.geometry, side, [-length / 2 + inset, h / 2, 0], [0, Math.PI / 2]);
        face(t.geometry, top, [0, h, 0], [-Math.PI / 2, 0]);
        face(t.geometry, top, [0, h - inset, 0], [Math.PI / 2, 0]);
        // a pane of glass just behind the door's frame
        const glassGeo = new THREE.PlaneGeometry(length, h);
        geometries.push(glassGeo);
        const glass = new THREE.Mesh(glassGeo, cabinGlass);
        glass.position.set(0, h / 2, depth / 2 - 0.012);
        template.add(glass);
        return template;
      }

      if (type.kind === "pillar" || type.kind === "chamfer") return null;
      const [front, side, top] = propSets(type).map((id) => propKitFor(id));
      // What each view covers (see PropType's px): at one pixel scale -
      // the front view's across the prop's length - standing on the floor,
      // centered, or for a wall prop starting at the wall (-z); without px,
      // the prop's own extent
      const px = type.kind === "views" ? type.px : undefined;
      const scale = px ? length / px.front[0] : 0;
      const frontY = px ? px.front[1] * scale : height;
      const sideY = px ? px.side[1] * scale : height;
      const sideZ = px ? px.side[0] * scale : depth;
      const topX = px ? px.top[0] * scale : length;
      const topZ = px ? px.top[1] * scale : depth;
      const zFrom = (extent: number) => (type.wall ? -depth / 2 : -extent / 2);
      const clampRange = ([a, b]: [number, number]): [number, number] => {
        const lo = Math.min(1, Math.max(0, a));
        return [lo, Math.max(lo + 1e-3, Math.min(1, b))];
      };
      // the whole views first: their builds give the kits their AO maps
      for (const [kit, w, h] of [
        [front, length, frontY * wallHeight],
        [side, sideZ, sideY * wallHeight],
        [top, topX, topZ],
      ] as const) {
        if (!(await buildRelief(kit, { width: w, height: h, flushEdges: false, depth: relief, coarse: PROP_COARSE }))) return null;
      }
      const cut = (kit: WallKit, w: number, h: number, cols: [number, number], rows: [number, number]) =>
        buildRelief(kit, {
          width: w,
          height: h,
          flushEdges: false,
          depth: relief,
          coarse: PROP_COARSE,
          cols: clampRange(cols),
          rows: clampRange(rows),
        });
      const lift = (type.kind === "views" ? (type.elevation ?? 0) : 0) * wallHeight;
      const sideZ0 = zFrom(sideZ);
      const topZ0 = zFrom(topZ);
      // where a point shows in each view (image 0..1, rows down) - for a
      // part whose views show it elsewhere (PropPart.src), the part's box
      // stretched onto that place
      const views = {
        front: (x: number, y: number): [number, number] => [(x + length / 2) / length, (frontY - y) / frontY],
        // (the side view runs from the front (+z) on its left to the back)
        side: (z: number, y: number): [number, number] => [(sideZ0 + sideZ - z) / sideZ, (sideY - y) / sideY],
        top: (x: number, z: number): [number, number] => [(x + topX / 2) / topX, (z - topZ0) / topZ],
      };
      for (const part of type.parts) {
        const { min, max } = part;
        const [x0, y0, z0] = min;
        const [x1, y1, z1] = max;
        const off = new Set(part.off ?? []);
        // a coordinate of the part on `axis`, moved onto its place in a view
        const inView = (view: PropView, axis: 0 | 1 | 2, v: number) => {
          const src = part.src?.[view];
          if (!src || max[axis] === min[axis]) return v;
          return src.min[axis] + ((v - min[axis]) / (max[axis] - min[axis])) * (src.max[axis] - src.min[axis]);
        };
        if (part.shape === "cylinder") {
          addCylinder(part, off, inView);
          continue;
        }
        const cx = (x0 + x1) / 2;
        const cy = ((y0 + y1) / 2) * wallHeight + lift;
        const cz = (z0 + z1) / 2;
        const h = (y1 - y0) * wallHeight;
        const span = (a: [number, number], b: [number, number]): [[number, number], [number, number]] => [
          [Math.min(a[0], b[0]), Math.max(a[0], b[0])],
          [Math.min(a[1], b[1]), Math.max(a[1], b[1])],
        ];
        const [alongX, frontRows] = span(
          views.front(inView("front", 0, x0), inView("front", 1, y0)),
          views.front(inView("front", 0, x1), inView("front", 1, y1)),
        );
        const [alongZ, sideRows] = span(
          views.side(inView("side", 2, z0), inView("side", 1, y0)),
          views.side(inView("side", 2, z1), inView("side", 1, y1)),
        );
        const [topCols, topRows] = span(
          views.top(inView("top", 0, x0), inView("top", 2, z0)),
          views.top(inView("top", 0, x1), inView("top", 2, z1)),
        );
        const f = off.has("front") && off.has("back") ? null : await cut(front, x1 - x0, h, alongX, frontRows);
        const s = off.has("right") && off.has("left") ? null : await cut(side, z1 - z0, h, alongZ, sideRows);
        const t = off.has("top") ? null : await cut(top, x1 - x0, z1 - z0, topCols, topRows);
        // the back and the -x end show their views mirrored
        if (f && !off.has("front")) face(f.geometry, front, [cx, cy, z1], [0, 0]);
        if (f && !off.has("back")) face(f.geometry, front, [cx, cy, z0], [0, Math.PI], true);
        if (s && !off.has("right")) face(s.geometry, side, [x1, cy, cz], [0, Math.PI / 2]);
        if (s && !off.has("left")) face(s.geometry, side, [x0, cy, cz], [0, -Math.PI / 2], true);
        if (!t) continue;
        // a top hidden under a part above it would show that part's top
        // view (a table's foot wearing its top's wood): left out
        const covered = type.parts.some(
          (o) => o.min[1] >= y1 && o.min[0] <= x0 && o.max[0] >= x1 && o.min[2] <= z0 && o.max[2] >= z1,
        );
        if (!covered) face(t.geometry, top, [cx, y1 * wallHeight + lift, cz], [-Math.PI / 2, 0]);
      }
      return template;

      // A round part: an upright cylinder (elliptic, filling its box) with
      // no relief, its side's every strip textured from the view that looks
      // at it - the front view on its front and back quarters, the side view
      // on its ends - and its top from the top view, all projected straight
      // through as the views were drawn
      function addCylinder(part: PropPart, off: Set<PropFace>, inView: (view: PropView, axis: 0 | 1 | 2, v: number) => number) {
        const [x0, y0, z0] = part.min;
        const [x1, y1, z1] = part.max;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const rx = (x1 - x0) / 2;
        const rz = (z1 - z0) / 2;
        const ya = y0 * wallHeight + lift;
        const yb = y1 * wallHeight + lift;
        const uv = ([u, v]: [number, number]): [number, number] => [Math.min(1, Math.max(0, u)), 1 - Math.min(1, Math.max(0, v))];
        const frontUV = (x: number, y: number) => uv(views.front(inView("front", 0, x), inView("front", 1, y)));
        const sideUV = (z: number, y: number) => uv(views.side(inView("side", 2, z), inView("side", 1, y)));
        const topUV = (x: number, z: number) => uv(views.top(inView("top", 0, x), inView("top", 2, z)));
        const strips = { front: { pos: [] as number[], uv: [] as number[] }, side: { pos: [] as number[], uv: [] as number[] } };
        const at = (a: number): [number, number] => [cx + rx * Math.sin(a), cz + rz * Math.cos(a)];
        for (let k = 0; k < CYLINDER_SEGMENTS; k++) {
          const a0 = (k / CYLINDER_SEGMENTS) * Math.PI * 2;
          const a1 = ((k + 1) / CYLINDER_SEGMENTS) * Math.PI * 2;
          const mid = (a0 + a1) / 2;
          // (which quarter it faces: +z front, -z back, +x right, -x left)
          const facing: PropFace = Math.abs(Math.cos(mid)) >= Math.abs(Math.sin(mid)) ? (Math.cos(mid) > 0 ? "front" : "back") : Math.sin(mid) > 0 ? "right" : "left";
          if (off.has(facing)) continue;
          const ends = facing === "right" || facing === "left";
          const strip = ends ? strips.side : strips.front;
          const [p0x, p0z] = at(a0);
          const [p1x, p1z] = at(a1);
          const tex = (x: number, z: number, y: number) => (ends ? sideUV(z, y / wallHeight) : frontUV(x, y / wallHeight));
          const corners: [number, number, number][] = [
            [p0x, ya - lift, p0z],
            [p1x, ya - lift, p1z],
            [p1x, yb - lift, p1z],
            [p0x, yb - lift, p0z],
          ];
          // (two triangles, counter-clockwise seen from outside)
          for (const i of [0, 1, 2, 0, 2, 3]) {
            const [x, y, z] = corners[i];
            strip.pos.push(x, y + lift, z);
            strip.uv.push(...tex(x, z, y));
          }
        }
        const mesh = (pos: number[], uvs: number[], kit: WallKit) => {
          if (!pos.length) return;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
          geo.computeVertexNormals();
          geometries.push(geo);
          template.add(new THREE.Mesh(geo, roundMaterial(kit)));
        };
        mesh(strips.front.pos, strips.front.uv, front);
        mesh(strips.side.pos, strips.side.uv, side);
        // the top: a fan round its middle (unless a part above covers it)
        const covered = type.kind === "views" && type.parts.some(
          (o) => o !== part && o.min[1] >= y1 && o.min[0] <= x0 && o.max[0] >= x1 && o.min[2] <= z0 && o.max[2] >= z1,
        );
        if (off.has("top") || covered) return;
        const pos: number[] = [];
        const uvs: number[] = [];
        for (let k = 0; k < CYLINDER_SEGMENTS; k++) {
          const [p0x, p0z] = at((k / CYLINDER_SEGMENTS) * Math.PI * 2);
          const [p1x, p1z] = at(((k + 1) / CYLINDER_SEGMENTS) * Math.PI * 2);
          for (const [x, z] of [
            [cx, cz],
            [p0x, p0z],
            [p1x, p1z],
          ] as const) {
            pos.push(x, yb, z);
            uvs.push(...topUV(x, z));
          }
        }
        mesh(pos, uvs, top);
      }
    }
    // a round part's sides: no relief, so the view's see-through pixels cut
    // it out here, and it's seen from inside too (through those)
    const CYLINDER_SEGMENTS = 24;
    const roundMaterials = new Map<WallKit, THREE.MeshStandardMaterial>();
    function roundMaterial(kit: WallKit): THREE.MeshStandardMaterial {
      let mat = roundMaterials.get(kit);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({
          map: kit.wallMat.map,
          normalMap: kit.wallMat.normalMap,
          alphaTest: 0.5,
          side: THREE.DoubleSide,
          roughness: settingsRef.current.roughness,
          metalness: settingsRef.current.metalness,
        });
        mat.userData.normal = kit.normal;
        mat.userData.tuneId = kit.id;
        const normal = settingsRef.current.normalStrength * (kit.normal ?? 1);
        mat.normalScale.set(normal, normal);
        addDirectLightOcclusion(mat, cavity);
        useLightGrid(mat, lightGrid);
        ownMaterials.push(mat);
        roundMaterials.set(kit, mat);
      }
      return mat;
    }

    // the doors, by door cell key (the editor's selection)
    const doorGroups = new Map<string, THREE.Object3D>();
    // the props placed, by index in the map's props (the editor's selection)
    const propObjects = new Map<number, THREE.Object3D>();
    const markedProps = new Set<number>();
    // (built again, in place, when the props change - see applyProps)
    let propsVersion = 0;
    // The models, built once per deck and cloned for each prop: a type in a
    // texture, and a pillar or a chamfer per height and texture set too (see
    // propBuildKey). A prop dragged in the editor gets its model from here at
    // once instead of waiting for a new build at every step.
    const propModels = new Map<string, Promise<THREE.Group | null>>();
    // what a prop's model depends on: its type and texture, and for a pillar or
    // a chamfer its height and the wall texture around it
    function propBuildKey(m: GameMap, spec: PropSpec): string {
      const texture = spec.texture ?? "";
      const type = retextured(PROP_TYPES[spec.prop], texture || undefined);
      if (type.kind !== "pillar" && type.kind !== "chamfer") return `${spec.prop}|${texture}`;
      const h = propHeight(m, spec) * wallHeight;
      // its own texture, else the wall texture painted in its cell or beside it, else the deck's
      const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => m.wallTextureAt?.(spec.cell.x + dx, spec.cell.y + dy))
        .find((id) => isTextureSetId(id));
      const own = texture || near;
      const setId = isTextureSetId(own) ? own : primarySet;
      return `${spec.prop}|${texture}|${h}|${setId}`;
    }
    function propModel(key: string): Promise<THREE.Group | null> {
      let made = propModels.get(key);
      if (made) return made;
      const [name, texture, h, setId] = key.split("|");
      const type = retextured(PROP_TYPES[name], texture || undefined);
      const build =
        type.kind === "pillar"
          ? buildPillar(type, Number(h), setId)
          : type.kind === "chamfer"
            ? buildChamfer(type, wallKitFor(setId as TextureSetId), Number(h))
            : buildPropTemplate(type);
      made = build.then(async (g) => {
        if (g) await addPropLods(g);
        return g;
      });
      propModels.set(key, made);
      return made;
    }
    // a prop's object where its spec puts it
    function placeProp(obj: THREE.Object3D, spec: PropSpec) {
      const type = PROP_TYPES[spec.prop];
      const { x, z, yaw } = propPlacement(spec);
      obj.position.set(x, floorY(spec.cell.x, spec.cell.y) + (spec.elevation ?? 0) * wallHeight, z);
      obj.rotation.y = -yaw;
      // (bigger or smaller: a pillar only wider - it still fills its room)
      const scale = spec.scale ?? 1;
      obj.scale.set(scale, type.kind === "pillar" ? 1 : scale, scale);
    }
    // the props as last applied (a build finishing late places its prop where
    // the prop is by then, not where it was when the build began)
    let propSpecs: PropSpec[] = map.props ?? [];
    let propsMap = map;
    // One prop's object, built (or cloned from the model) and put in the scene
    // in place of the one it had, if any - which stays until then, so a prop
    // being rebuilt (a pillar dragged into a taller room) never blinks out.
    function buildProp(m: GameMap, index: number) {
      const spec = m.props?.[index];
      if (!spec) return;
      const version = propsVersion;
      const key = propBuildKey(m, spec);
      track(async () => {
        const made = await propModel(key);
        if (!made || version !== propsVersion) return;
        const now = propSpecs[index];
        // (changed again meanwhile into something else: that build places it)
        if (!now || propBuildKey(propsMap, now) !== key) return;
        const prop = made.clone();
        placeProp(prop, now);
        prop.userData.prop = true;
        // the editor picks it by this (its index in the map's props)
        prop.userData.propIndex = index;
        prop.userData.propType = now.prop;
        prop.userData.propKey = key;
        const old = propObjects.get(index);
        if (old) {
          group.remove(old);
          const at = billboardProps.indexOf(old);
          if (at >= 0) billboardProps.splice(at, 1);
          markedProps.delete(index);
          // (a hidden layer stays hidden)
          prop.visible = old.visible;
        }
        if (PROP_TYPES[now.prop].kind === "billboard") billboardProps.push(prop);
        propObjects.set(index, prop);
        group.add(prop);
        refreshPropWires();
      }).catch((err) => console.error("Prop build failed:", err));
    }
    function buildProps(m: GameMap) {
      propSpecs = m.props ?? [];
      propsMap = m;
      for (let index = 0; index < propSpecs.length; index++) buildProp(m, index);
    }
    buildProps(map);
    // the props gone from the scene (before they're built anew)
    function clearProps() {
      propsVersion++;
      for (const obj of propObjects.values()) group.remove(obj);
      propObjects.clear();
      billboardProps.length = 0;
      markedProps.clear();
    }
    // The map's props changed (the editor): a prop that's still the same model
    // (moved, turned, raised, scaled - into another cell too) is just set
    // again where it is now; one whose model changed (another type, texture,
    // or a pillar in a room of another height) is built anew in its place; an
    // added one is built. Only when props were taken out (the indices shift)
    // are they all built afresh (the models are cached, so it's quick).
    function applyProps(next: GameMap, prev: GameMap) {
      const a = next.props ?? [];
      const b = prev.props ?? [];
      if (a.length < b.length) {
        clearProps();
        buildProps(next);
        return;
      }
      propSpecs = a;
      propsMap = next;
      a.forEach((spec, i) => {
        if (i < b.length && JSON.stringify(spec) === JSON.stringify(b[i])) return;
        const obj = propObjects.get(i);
        const key = propBuildKey(next, spec);
        // (meanwhile the old one - or, still building, the new one once it's
        // there - stands where the prop is now)
        if (obj) placeProp(obj, spec);
        if (obj?.userData.propKey !== key) buildProp(next, i);
      });
    }

    // the prop editor's boxes (see propEditState) over each prop of the
    // type it edits, in the prop's own space: its boxes (the picked one
    // yellow) and its whole extent, seen through everything
    const wireMats = {
      part: new THREE.LineBasicMaterial({ color: 0x3fd0ff, depthTest: false, transparent: true, opacity: 0.85 }),
      picked: new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true }),
      extent: new THREE.LineBasicMaterial({ color: 0x8a8f99, depthTest: false, transparent: true, opacity: 0.5 }),
    };
    function refreshPropWires() {
      for (const prop of propObjects.values()) {
        const old = prop.getObjectByName("propEditWires");
        if (!old) continue;
        prop.remove(old);
        old.traverse((o) => (o as THREE.LineSegments).geometry?.dispose());
      }
      const { name, part } = propEdit.get();
      const type = name ? PROP_TYPES[name] : undefined;
      if (!editModeRef.current || !type) return;
      const lift = (type.kind === "views" || type.kind === "panel" ? (type.elevation ?? 0) : 0) * wallHeight;
      const box = (min: number[], max: number[], mat: THREE.LineBasicMaterial) => {
        const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(max[0] - min[0], (max[1] - min[1]) * wallHeight, max[2] - min[2]));
        const lines = new THREE.LineSegments(geo, mat);
        lines.position.set((min[0] + max[0]) / 2, ((min[1] + max[1]) / 2) * wallHeight + lift, (min[2] + max[2]) / 2);
        lines.renderOrder = 10;
        return lines;
      };
      const [length, height, depth] = type.size;
      for (const prop of propObjects.values()) {
        if (prop.userData.propType !== name) continue;
        const wires = new THREE.Group();
        wires.name = "propEditWires";
        wires.add(box([-length / 2, 0, -depth / 2], [length / 2, height, depth / 2], wireMats.extent));
        if (type.kind === "views") type.parts.forEach((p, i) => wires.add(box(p.min, p.max, i === part ? wireMats.picked : wireMats.part)));
        prop.add(wires);
      }
    }
    propWiresRef.current = refreshPropWires;

    // ---- smoke (see smoke.ts): the map's emitters, and a marker at each for
    // the editor to pick it by (shown only while editing) ----
    const smokeMarkers = new Map<number, THREE.Mesh>();
    const smokeMarkerGeo = new THREE.OctahedronGeometry(0.04);
    geometries.push(smokeMarkerGeo);
    const smokeMarkerMat = new THREE.MeshBasicMaterial({ color: 0xb8c4cc, wireframe: true });
    // (and a line from it the way it blows)
    const smokeBlowGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    geometries.push(smokeBlowGeo);
    const smokeBlowMat = new THREE.LineBasicMaterial({ color: 0xffd060 });
    // the fires' flames (see fire.ts), made with the smoke: each a fire
    // emitter here and dark smoke rising off it among the smoke's
    let fireEmitters: SmokeEmitter[] = [];
    let petalEmitters: PetalEmitter[] = [];
    const buildSmoke = (m: GameMap) => {
      fireEmitters = [];
      petalEmitters = [];
      return createSmoke(
      (m.smokes ?? []).flatMap((spec, index): SmokeEmitter[] => {
        const at = new THREE.Vector3(
          spec.cell.x + spec.pos[0],
          (floorHeight(map, spec.cell.x, spec.cell.y) + spec.pos[1]) * wallHeight,
          spec.cell.y + spec.pos[2],
        );
        const marker = new THREE.Mesh(smokeMarkerGeo, smokeMarkerMat);
        marker.position.copy(at);
        marker.userData.smokeIndex = index;
        marker.userData.item = true;
        marker.visible = false;
        group.add(marker);
        smokeMarkers.set(index, marker);
        let blow: [number, number, number] | undefined;
        if (spec.blow?.speed) {
          const yaw = (spec.blow.yaw * Math.PI) / 180;
          const pitch = ((spec.blow.pitch ?? 0) * Math.PI) / 180;
          const way = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
          blow = [way.x * spec.blow.speed, way.y * spec.blow.speed, way.z * spec.blow.speed];
          const line = new THREE.Line(smokeBlowGeo, smokeBlowMat);
          line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), way);
          line.scale.setScalar(0.1 + 0.1 * spec.blow.speed);
          marker.add(line);
        }
        const emitter: SmokeEmitter = {
          x: at.x,
          y: at.y,
          z: at.z,
          ceiling: ceilingY(spec.cell.x, spec.cell.y),
          floor: floorY(spec.cell.x, spec.cell.y),
          blow,
          density: spec.density ?? 1,
          size: spec.size ?? 1,
          color: new THREE.Color(parseColor(spec.color) ?? SMOKE_COLOR),
          cell: cellKey(spec.cell.x, spec.cell.y),
        };
        if (spec.petals) {
          // falling petals: their own little system, no smoke from here
          petalEmitters.push({
            x: emitter.x,
            y: emitter.y,
            z: emitter.z,
            floor: emitter.floor,
            spread: 0.9,
            density: emitter.density,
            size: emitter.size,
            color: new THREE.Color(parseColor(spec.color) ?? 0xf4a6c0),
            wind: blow ? [blow[0] * 0.1, blow[2] * 0.1] : [0, 0],
          });
          return [];
        }
        if (!spec.fire) return [emitter];
        // (its color tints the flames: none, as they burn)
        fireEmitters.push({ ...emitter, color: new THREE.Color(parseColor(spec.color) ?? 0xffffff) });
        return [{
          ...emitter,
          y: Math.min(emitter.ceiling - 0.1, emitter.y + FIRE_SMOKE_LIFT * wallHeight),
          blow: undefined,
          density: emitter.density * FIRE_SMOKE_DENSITY,
          size: emitter.size * FIRE_SMOKE_SIZE,
          color: new THREE.Color(FIRE_SMOKE_COLOR),
        }];
      }),
      lightGrid,
      smokeWorld(m),
      { quality: settings.particleQuality },
    );
    };
    const buildFire = (m: GameMap) => createSmoke(fireEmitters, lightGrid, smokeWorld(m), { fire: true, quality: settings.particleQuality });
    // what the smoke bumps into: the deck's walls, floors and ceilings, and
    // its props as boxes (not the 45-degree cuts: a box would close their
    // whole corner)
    function smokeWorld(m: GameMap): SmokeWorld {
      return {
        wall: (x, z) => cellAt(m, Math.round(x), Math.round(z)) === "wall",
        floor: (x, z) => floorY(Math.round(x), Math.round(z)),
        ceiling: (x, z) => ceilingY(Math.round(x), Math.round(z)),
        boxes: (m.props ?? [])
          .filter((p) => PROP_TYPES[p.prop] && PROP_TYPES[p.prop].kind !== "chamfer")
          .map((p) => {
            const { x, z, reachX, reachZ } = propPlacement(p);
            const bottom = floorY(p.cell.x, p.cell.y) + (p.elevation ?? 0) * wallHeight;
            return {
              minX: x - reachX,
              maxX: x + reachX,
              minZ: z - reachZ,
              maxZ: z + reachZ,
              minY: bottom,
              maxY: bottom + propHeight(m, p) * wallHeight,
            };
          }),
      };
    }
    // the robots as the smoke feels them (see updateActors)
    const smokeBodies: SmokeBody[] = [];
    let smoke = buildSmoke(map);
    scene.add(smoke.mesh);
    let fire = buildFire(map);
    scene.add(fire.mesh);
    let petals = createPetals(petalEmitters, settings.particleQuality);
    scene.add(petals.mesh);
    // the editor changed only the smoke: made anew, the rest stays built
    function applySmoke(next: GameMap) {
      for (const marker of smokeMarkers.values()) group.remove(marker);
      smokeMarkers.clear();
      scene.remove(smoke.mesh, fire.mesh, petals.mesh);
      smoke.dispose();
      fire.dispose();
      petals.dispose();
      smoke = buildSmoke(next);
      scene.add(smoke.mesh);
      fire = buildFire(next);
      scene.add(fire.mesh);
      petals = createPetals(petalEmitters, settings.particleQuality);
      scene.add(petals.mesh);
    }

    // ---- exits: a glowing plate on the floor of each way off the ship ----
    const exitMat = new THREE.MeshBasicMaterial({ map: makeExitMarker(), transparent: true, depthWrite: false, fog: true });
    const exitGeo = new THREE.PlaneGeometry(0.8, 0.8);
    geometries.push(exitGeo);
    for (const exit of map.exits ?? []) {
      const plate = new THREE.Mesh(exitGeo, exitMat);
      plate.rotation.x = -Math.PI / 2;
      // (just above the floor's relief)
      plate.position.set(exit.cell.x, floorY(exit.cell.x, exit.cell.y) + reliefDepth + 0.006, exit.cell.y);
      group.add(plate);
    }

    // ---- loot ----
    // An item's sprite: an upright relief cutout of its art, standing on
    // its bottom edge, turned to the camera each frame (see updateLoot).
    const itemTemplates = new Map<string, Promise<THREE.Group | null>>();
    function itemTemplate(id: string): Promise<THREE.Group | null> {
      let made = itemTemplates.get(id);
      if (!made) {
        made = (async () => {
          const kit = sharedPropKitFor(`item_${id}`);
          let gridPromise = cache.grids.get(kit.depthUrl);
          if (!gridPromise) {
            gridPromise = loadWithRetry(kit.depthUrl, 4);
            cache.grids.set(kit.depthUrl, gridPromise);
          }
          const grid = await gridPromise;
          const h = ITEM_HEIGHT;
          const w = (h * grid.width) / grid.height;
          const relief = await buildRelief(kit, { width: w, height: h, flushEdges: false, depth: propReliefDepth * PROP_RELIEF_SCALE * 0.6 });
          if (!relief) return null;
          for (const mat of kitMaterials(kit)) useLightGrid(mat, lightGrid);
          // a faint glow of their own: loot reads even in a dark room
          kit.wallMat.emissiveMap = kit.wallMat.map;
          kit.wallMat.emissive.setHex(0xffffff);
          kit.wallMat.emissiveIntensity = ITEM_GLOW;
          kit.wallMat.needsUpdate = true;
          // Its normals bent up (and a little back): turned to the camera
          // whichever way it's seen, it would take only the light from the
          // viewer's side - bent, the lamps above and beyond it light it too.
          const geometry = relief.geometry.clone();
          const normals = geometry.getAttribute("normal") as THREE.BufferAttribute;
          const n = new THREE.Vector3();
          for (let i = 0; i < normals.count; i++) {
            n.fromBufferAttribute(normals, i).multiplyScalar(ITEM_NORMAL_KEEP).add(ITEM_NORMAL_BEND).normalize();
            normals.setXYZ(i, n.x, n.y, n.z);
          }
          normals.needsUpdate = true;
          geometries.push(geometry);
          const template = new THREE.Group();
          const mesh = new THREE.Mesh(geometry, [kit.wallMat, kit.sideMat]);
          mesh.position.y = h / 2;
          template.add(mesh);
          return template;
        })();
        itemTemplates.set(id, made);
      }
      return made;
    }
    // the loose items, by index in map.items; and what's flying (spilled
    // out of a container, or drawn in to the party's feet)
    const looseItems = new Map<number, { obj: THREE.Object3D; cell: string; taken: boolean }>();
    interface Flyer {
      obj: THREE.Object3D;
      from: THREE.Vector3;
      rest: THREE.Vector3;
      start: number;
    }
    const flyers: Flyer[] = [];
    // (built again, in place, when the map's items change - see applyLightsRef)
    let itemsVersion = 0;
    function buildItems(m: GameMap) {
    const version = ++itemsVersion;
    (m.items ?? []).forEach((spec, index) => {
      track(async () => {
        const template = await itemTemplate(spec.item);
        if (!template || disposed || version !== itemsVersion) return;
        const [dx, dz] = itemSpot(spec.offset, index);
        const obj = template.clone();
        obj.position.set(spec.cell.x + dx, floorY(spec.cell.x, spec.cell.y) + (spec.elevation ?? 0) * wallHeight + ITEM_LIFT, spec.cell.y + dz);
        obj.userData.item = true;
        // the editor picks it by this
        obj.userData.itemIndex = index;
        obj.visible = false;
        group.add(obj);
        looseItems.set(index, { obj, cell: cellKey(spec.cell.x, spec.cell.y), taken: false });
      }).catch((err) => console.error("Item build failed:", err));
    });
    }
    function clearItems() {
      itemsVersion++;
      for (const it of looseItems.values()) group.remove(it.obj);
      looseItems.clear();
    }
    buildItems(map);
    // spills already shown (before this build) aren't shown again
    let lastSpill = Math.max(0, ...(lootRef.current.spills ?? []).map((s) => s.id));
    async function spill(event: LootSpill) {
      const now = gameClock.now();
      const from = new THREE.Vector3(event.from.x, event.from.y * wallHeight, event.from.z);
      const cx = Math.round(event.from.x);
      const cz = Math.round(event.from.z);
      let n = 0;
      for (const stack of event.items) {
        const template = await itemTemplate(stack.item);
        if (!template || disposed) continue;
        for (let k = 0; k < Math.min(stack.count, 3); k++, n++) {
          const obj = template.clone();
          obj.userData.item = true;
          const a = Math.random() * Math.PI * 2;
          const r = 0.15 + Math.random() * 0.2;
          const clamp = (v: number, c: number) => Math.min(c + 0.4, Math.max(c - 0.4, v));
          const rest = new THREE.Vector3(
            clamp(from.x + Math.cos(a) * r, cx),
            event.floorY * wallHeight + ITEM_LIFT,
            clamp(from.z + Math.sin(a) * r, cz),
          );
          obj.position.copy(from);
          group.add(obj);
          // one after another, a little apart
          flyers.push({ obj, from: from.clone(), rest, start: now + n * 60 });
        }
      }
    }
    // an emptied container: its lid lifted a little and askew, a chalk
    // cross on it (or, lidless, on its front)
    // (a copy of each face material with the cross chalked into its
    // diffuse: it follows the relief, and takes the light as the paint does)
    const chalked = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    function chalkedMaterial(mat: THREE.Material): THREE.MeshStandardMaterial | null {
      const known = chalked.get(mat);
      if (known) return known;
      const kit = [...propKits.values()].find((k) => k.wallMat === mat);
      const image = kit?.wallMat.map?.image as HTMLImageElement | undefined;
      if (!kit || !image?.width) return null;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      drawChalkCross(ctx, canvas.width, canvas.height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = kit.wallMat.map!.magFilter;
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        normalMap: kit.wallMat.normalMap,
        aoMap: kit.wallMat.aoMap,
        aoMapIntensity: kit.wallMat.aoMapIntensity,
        roughness: kit.wallMat.roughness,
        metalness: kit.wallMat.metalness,
        roughnessMap: kit.wallMat.roughnessMap,
        metalnessMap: kit.wallMat.metalnessMap,
      });
      material.userData.surface = kit.wallMat.userData.surface;
      material.userData.accentUniforms = kit.wallMat.userData.accentUniforms;
      addDirectLightOcclusion(material, cavity);
      useLightGrid(material, lightGrid);
      ownMaterials.push(material);
      kit.textures.push(texture);
      chalked.set(mat, material);
      return material;
    }
    function markLooted(looted: ReadonlySet<number> | undefined) {
      for (const index of looted ?? []) {
        if (markedProps.has(index)) continue;
        const obj = propObjects.get(index);
        const spec = map.props?.[index];
        if (!obj || !spec) continue;
        // its faces' textures (not loaded yet: next frame)
        const faces: { mesh: THREE.Mesh; mats: THREE.Material[]; chalk: THREE.MeshStandardMaterial }[] = [];
        let ready = true;
        obj.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh || !Array.isArray(mesh.material)) return;
          const chalk = chalkedMaterial(mesh.material[0]);
          if (chalk) faces.push({ mesh, mats: mesh.material, chalk });
          else ready = false;
        });
        if (!ready) continue;
        markedProps.add(index);
        for (const { mesh, mats, chalk } of faces) mesh.material = [chalk, ...mats.slice(1)];
        if (PROP_TYPES[spec.prop].kind === "box") {
          // the lid (the box's last face - see buildPropTemplate) lifted a
          // little and askew
          const lid = obj.children[obj.children.length - 1];
          lid.position.y += 0.03;
          lid.position.z -= 0.02;
          lid.rotation.x += 0.12;
        }
      }
    }

    // a copy of the kit's panel material whose diffuse has the door's label
    // stenciled into the panel's label field
    async function labeledPanelMaterial(spec: DoorSpec, kit: WallKit): Promise<THREE.MeshStandardMaterial> {
      const setPaths = TEXTURE_SETS[panelSetFor(spec.kind)];
      const image = (await loader.loadAsync(setPaths.diffuse + bust)).image as HTMLImageElement;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);

      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const paint = (img: { width: number; height: number; rgba: Uint8Array }, ox: number, oy: number) => {
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4;
            if (!img.rgba[i + 3]) continue;
            const o = ((oy + y) * canvas.width + ox + x) * 4;
            pixels.data[o] = img.rgba[i];
            pixels.data[o + 1] = img.rgba[i + 1];
            pixels.data[o + 2] = img.rgba[i + 2];
          }
        }
      };

      // a lift door shows its deck's number at the top of the field, upright
      const field = { ...DOOR_LABEL_AREA };
      if (spec.kind === "lift") {
        const number = renderText(String(map.deck), DOOR_LABEL_MAX_SCALE, labelPaint, labelPaintDark, 0.06, seededRandom(String(map.deck)));
        paint(number, field.x + Math.floor((field.w - number.width) / 2), field.y);
        field.y += number.height + DOOR_NUMBER_GAP;
        field.h -= number.height + DOOR_NUMBER_GAP;
      }
      if (spec.label) {
        // the biggest stencil that fits the rest of the field, up to a
        // readable maximum (turned to run down the panel if it's vertical)
        const stencil = (scale: number) => {
          const text = renderText(spec.label!, scale, labelPaint, labelPaintDark, 0.06, seededRandom(spec.label!));
          return spec.labelVertical ? turnClockwise(text) : text;
        };
        let label = stencil(1);
        for (let scale = DOOR_LABEL_MAX_SCALE; scale >= 1; scale--) {
          label = stencil(scale);
          if (label.width <= field.w && label.height <= field.h) break;
        }
        paint(label, field.x + Math.floor((field.w - label.width) / 2), field.y + Math.floor((field.h - label.height) / 2));
      }
      ctx.putImageData(pixels, 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        normalMap: kit.wallMat.normalMap,
        aoMap: kit.wallMat.aoMap,
        roughness: settingsRef.current.roughness,
        metalness: settingsRef.current.metalness,
      });
      addDirectLightOcclusion(material, cavity);
      // (a door panel is the deck's own: it takes the ship's livery)
      material.userData.accent = true;
      ownMaterials.push(material);
      kit.textures.push(texture);
      return material;
    }

    // --- trim: worn yellow paint (ladders) and hazard stripes (bridge
    // edges), repeating at the walls' pixel density on boxes of any size ---
    function trimTexture(url: string, wrap: THREE.Wrapping): THREE.Texture {
      const tex = kitTexture(url + bust, (t) => {
        // the boxes' UVs count texels (trimBox): one repeat per image size
        const img = t.image as HTMLImageElement;
        t.repeat.set(1 / img.width, 1 / img.height);
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.wrapS = tex.wrapT = wrap;
      return tex;
    }
    const trimTextures = [
      // mirrored: a patch cut from a decal tiles without seams that way
      trimTexture(TRIM_PAINT_URL, THREE.MirroredRepeatWrapping),
      // already a whole number of stripe periods wide
      trimTexture(TRIM_HAZARD_URL, THREE.RepeatWrapping),
    ];
    const [paintMat, hazardMat] = trimTextures.map(
      (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0.3 }),
    );
    // a box whose UVs run in texels (TRIM_TEXELS per world unit) on every
    // face; one per size
    const trimBoxes = new Map<string, THREE.BoxGeometry>();
    function trimBox(w: number, h: number, d: number, uvScale = TRIM_TEXELS): THREE.BoxGeometry {
      const key = `${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)},${uvScale}`;
      let geo = trimBoxes.get(key);
      if (!geo) {
        geo = new THREE.BoxGeometry(w, h, d);
        // BoxGeometry faces (+x, -x, +y, -y, +z, -z), 4 vertices each, and
        // the box dimensions their u and v run along
        const spans = [
          [d, h],
          [d, h],
          [w, d],
          [w, d],
          [w, h],
          [w, h],
        ];
        const uv = geo.getAttribute("uv");
        for (let i = 0; i < uv.count; i++) {
          const [su, sv] = spans[Math.floor(i / 4)];
          uv.setXY(i, uv.getX(i) * su * uvScale, uv.getY(i) * sv * uvScale);
        }
        trimBoxes.set(key, geo);
        geometries.push(geo);
      }
      return geo;
    }

    // --- ladders: rails and rungs standing against the step face, the rails
    // reaching above the ledge and bending over onto it as handholds ---
    const ladderBox = new THREE.BoxGeometry(1, 1, 1);
    geometries.push(ladderBox);
    for (const ladder of map.ladders ?? []) {
      const v = DIR_VECTOR[ladder.wall];
      const { x, y } = ladder.cell;
      const bottom = floorY(x, y);
      const h = floorY(x + v.x, y + v.y) - bottom;
      const reach = h + LADDER_HANDHOLD * wallHeight;
      const z = LADDER_STANDOFF;
      const ladderGroup = new THREE.Group();
      // like the wall panel it stands against: local +Z faces the foot's cell
      ladderGroup.position.set(x + v.x * 0.5, bottom, y + v.y * 0.5);
      ladderGroup.rotation.y = WALL_ROTATION[ladder.wall];
      const bar = (w: number, bh: number, d: number, px: number, py: number, pz: number) => {
        const mesh = new THREE.Mesh(trimBox(w, bh, d), paintMat);
        mesh.position.set(px, py, pz);
        ladderGroup.add(mesh);
      };
      for (const side of [-1, 1]) {
        const rx = side * LADDER_HALF_WIDTH;
        bar(LADDER_RAIL, reach, LADDER_RAIL, rx, reach / 2, z);
        // over the edge and down onto the floor above
        bar(LADDER_RAIL, LADDER_RAIL, z + LADDER_NECK, rx, reach, (z - LADDER_NECK) / 2);
        bar(LADDER_RAIL, reach - h, LADDER_RAIL, rx, h + (reach - h) / 2, -LADDER_NECK);
        // brackets holding it off the wall
        for (const by of [0.12 * wallHeight, h - 0.08 * wallHeight]) bar(LADDER_RAIL, LADDER_RAIL, z, rx, by, z / 2);
      }
      const spacing = RUNG_SPACING * wallHeight;
      for (let ry = spacing; ry <= h + 1e-6; ry += spacing) {
        bar(LADDER_HALF_WIDTH * 2, LADDER_RUNG, LADDER_RUNG, 0, ry, z);
      }
      group.add(ladderGroup);
    }

    // --- bridges: a strip of the cell's floor texture as the deck, with a
    // low hazard-striped kick plate along each edge. A grate deck has its
    // slots cut open, seen from both sides, resting on two slim stringers;
    // any other deck sits on a solid steel body. ---
    const stoneBridge = map.world === "fantasy";
    const bridgeMat = new THREE.MeshStandardMaterial(stoneBridge ? { map: primaryKit.wallMat.map, roughness: 1, metalness: 0 } : { color: 0x2a2d31, roughness: 0.5, metalness: 0.6 });
    // a see-through deck is seen from below as well
    const doubleSided = (src: THREE.MeshStandardMaterial) => {
      const mat = new THREE.MeshStandardMaterial({
        map: src.map,
        normalMap: src.normalMap,
        roughness: settings.roughness,
        metalness: settings.metalness,
        side: THREE.DoubleSide,
      });
      ownMaterials.push(mat);
      return mat;
    };
    const grateMats = new Map<WallKit, THREE.MeshStandardMaterial[]>();
    for (const bridge of map.bridges ?? []) {
      const { x, y } = bridge.cell;
      const deckY = bridge.height * wallHeight;
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(x, deckY, y);
      // built running east-west (local X)
      if (bridge.axis === "NS") bridgeGroup.rotation.y = Math.PI / 2;
      const box = (w: number, h: number, d: number, px: number, py: number, pz: number, mat: THREE.Material) => {
        const mesh = new THREE.Mesh(ladderBox, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(px, py, pz);
        bridgeGroup.add(mesh);
      };
      for (const side of [-1, 1]) {
        const kick = new THREE.Mesh(trimBox(1, BRIDGE_KICK, LADDER_RAIL, stoneBridge ? 1 : TRIM_TEXELS), stoneBridge ? bridgeMat : hazardMat);
        kick.position.set(0, BRIDGE_KICK / 2 - 0.01, side * (BRIDGE_WIDTH / 2));
        bridgeGroup.add(kick);
      }
      group.add(bridgeGroup);
      if (stoneBridge) {
        box(1, BRIDGE_THICKNESS, BRIDGE_WIDTH, 0, -BRIDGE_THICKNESS / 2, 0, bridgeMat);
        continue;
      }

      // the walking surface: the middle band of the floor tile, as wide as
      // the deck, so its texels stay square
      const kit = floorKitAt(x, y);
      const grate = isRelief && kit?.grateLevels ? kit.grateLevels : 0;
      if (grate) {
        for (const side of [-1, 1]) {
          const z = side * (BRIDGE_WIDTH / 2 - BRIDGE_STRINGER / 2);
          box(1, BRIDGE_THICKNESS, BRIDGE_STRINGER, 0, -BRIDGE_THICKNESS / 2 - 0.02, z, bridgeMat);
        }
      } else {
        box(1, BRIDGE_THICKNESS, BRIDGE_WIDTH, 0, -BRIDGE_THICKNESS / 2 - 0.002, 0, bridgeMat);
      }
      if (!kit) {
        box(1, 0.004, BRIDGE_WIDTH, 0, 0, 0, floorMat);
        continue;
      }
      const rows: [number, number] = [(1 - BRIDGE_WIDTH) / 2, (1 + BRIDGE_WIDTH) / 2];
      const deckGeometry = isRelief
        ? buildRelief(kit, { height: BRIDGE_WIDTH, flushEdges: false, depth: floorDepth, rows, holeLevels: grate }).then(
            (relief) => relief?.geometry ?? null,
          )
        : Promise.resolve(createBandPlane(BRIDGE_WIDTH, rows));
      track(deckGeometry)
        .then((geo) => {
          if (!geo) return;
          if (!isRelief) geometries.push(geo);
          let mats: THREE.Material | THREE.Material[] = isRelief ? [kit.wallMat, kit.sideMat] : kit.wallMat;
          if (grate) {
            let own = grateMats.get(kit);
            if (!own) {
              own = [doubleSided(kit.wallMat), doubleSided(kit.sideMat)];
              grateMats.set(kit, own);
            }
            mats = own;
          }
          const deck = new THREE.Mesh(geo, mats);
          // laid flat facing up; local X (the band's length) along the bridge
          deck.rotation.x = -Math.PI / 2;
          bridgeGroup.add(deck);
        })
        .catch((err) => console.error("Bridge build failed:", err));
    }

    // --- map lights: small glowing fixtures + the shared point-light pool ---
    const ceilingFixtureGeo = new THREE.PlaneGeometry(0.26, 0.26);
    const floorFixtureGeo = new THREE.PlaneGeometry(0.3, 0.05);
    const bulbGeo = new THREE.SphereGeometry(0.022, 10, 8);
    geometries.push(bulbGeo);
    geometries.push(ceilingFixtureGeo, floorFixtureGeo);
    const fixtureMats = new Map<number, THREE.MeshBasicMaterial>();
    const fixtureMat = (color: number) => {
      let mat = fixtureMats.get(color);
      if (!mat) {
        mat = new THREE.MeshBasicMaterial({ color });
        fixtureMats.set(color, mat);
      }
      return mat;
    };

    // (placed again when the lights change - see applyLights)
    const fixtures: THREE.Object3D[] = [];
    function placeFixtures() {
      for (const obj of fixtures) group.remove(obj);
      fixtures.length = 0;
      floorStrips.length = 0;
      for (const light of mapLights) {
        if (light.kind === "ceiling") {
          // a textured ceiling brings its own glowing light panel
          if (ceilingKitAt(Math.round(light.x), Math.round(light.z))?.litMat) continue;
          // (no lamp panel on an open ceiling: it's the sky there)
          if (isSkyCeiling(map, Math.round(light.x), Math.round(light.z))) continue;
          const panel = new THREE.Mesh(ceilingFixtureGeo, fixtureMat(light.color));
          panel.rotation.x = Math.PI / 2;
          panel.position.set(light.x, ceilingY(Math.round(light.x), Math.round(light.z)) - 0.002, light.z);
          if (light.source !== undefined) panel.userData.mapLight = light.source;
          group.add(panel);
          fixtures.push(panel);
        } else if (light.kind === "point") {
          // a free-standing light: a glowing bulb (the editor picks it by it)
          const bulb = new THREE.Mesh(bulbGeo, fixtureMat(light.color));
          bulb.position.set(light.x, light.y * wallHeight, light.z);
          if (light.source !== undefined) bulb.userData.mapLight = light.source;
          bulb.userData.bulb = light.bulb ? "always" : "editor";
          group.add(bulb);
          fixtures.push(bulb);
        }
        // floor and wall glows have no fixture - the light itself reads as
        // a lit patch
      }
    }
    placeFixtures();

    // (the graphics setting's size, at most LIGHT_POOL_SIZE - fixed for the
    // build: a new size is a new shader for every lit material, so it comes
    // with a rebuild rather than mid-game)
    const poolSize = Math.max(1, Math.min(LIGHT_POOL_SIZE, Math.round(settings.lightPool) || LIGHT_POOL_SIZE));
    const lightPool = Array.from({ length: poolSize }, (_, slot) => {
      // (its decay tags it as this slot's - see POOL_DECAY_TAG)
      const light = new THREE.PointLight(0xffffff, 0, 1, POOL_DECAY + (slot + 1) * POOL_DECAY_TAG);
      scene.add(light);
      // the source it serves (see poolSources), and how faded in; the reach
      // its bits in the reach texture were set for
      return { light, key: null as string | null, level: 0, reach: null as string | null };
    });
    // The pool's lights don't shine through walls: each lights only the
    // cells it can see (see lightGrid.ts, LightGridUniforms.reach) - worked
    // out once per light, place and set of open doors
    lightGrid.reach.value.dispose();
    lightGrid.reach.value = createLightReach(map.width, map.height);
    lightGrid.reachOn.value = 1;
    const reachCache = new Map<string, string[]>();
    const reachOf = (id: string, l: { x: number; z: number; range: number }, doors: ReadonlySet<string>) => {
      let cells = reachCache.get(id);
      if (!cells) {
        // (flashes come and go, each a source of its own: let it not grow)
        if (reachCache.size > 256) reachCache.clear();
        cells = [...visibleCells(map, l.x, l.z, Math.ceil(l.range), (k) => doors.has(k))];
        reachCache.set(id, cells);
      }
      return cells;
    };
    // the slots' bits redone whenever a slot's light (or its reach) changes
    function updateLightReach(sources: Map<string, { x: number; z: number; range: number }>) {
      // dev: __voidcrewNoReach = true in the console lets them through walls again, to compare
      lightGrid.reachOn.value = import.meta.env.DEV && (window as { __voidcrewNoReach?: boolean }).__voidcrewNoReach ? 0 : 1;
      const doors = openDoorsRef.current;
      const doorsKey = [...doors].sort().join(";");
      let changed = false;
      const ids = lightPool.map((slot) => {
        const l = slot.key ? sources.get(slot.key) : undefined;
        const id = l ? `${slot.key}|${Math.round(l.x * 100)},${Math.round(l.z * 100)},${l.range}|${doorsKey}` : null;
        if (id !== slot.reach) changed = true;
        return id;
      });
      if (!changed) return;
      const tex = lightGrid.reach.value;
      const bits = tex.image.data as Uint8Array;
      bits.fill(0);
      lightPool.forEach((slot, k) => {
        slot.reach = ids[k];
        const l = slot.key ? sources.get(slot.key) : undefined;
        if (!l || !ids[k]) return;
        for (const key of reachOf(ids[k]!, l, doors)) {
          const [x, y] = key.split(",").map(Number);
          if (x >= 0 && y >= 0 && x < map.width && y < map.height) bits[y * map.width + x] |= 1 << k;
        }
      });
      tex.needsUpdate = true;
    }
    // the cells seen from the party's cell, redone when it changes cell or
    // a door opens or shuts
    // The cells seen from the party's cell (see visibility.ts) - from its
    // center and near its corners, so moving about in it (free movement)
    // shows nothing new. Redone when the party changes cell or a door opens
    // or shuts; picks the lights (updateLightPool) and what gets drawn
    // (applySight).
    let sight = { key: "", cells: new Set<string>() };
    function updateSight(party: { x: number; z: number }, range: number) {
      const doors = openDoorsRef.current;
      const cx = Math.round(party.x);
      const cz = Math.round(party.z);
      const key = `${cx},${cz}|${range}|${[...doors].sort().join(";")}`;
      if (key === sight.key) return false;
      const cells = new Set<string>();
      for (const [ox, oz] of SIGHT_POINTS) {
        for (const c of visibleCells(map, cx + ox, cz + oz, Math.round(range), (k) => doors.has(k))) cells.add(c);
      }
      // a door cell seen shut: the walls on its sides still show around the
      // door (their panels may count as the wall cells beyond, which the
      // shut door hides from the sight lines)
      for (const c of [...cells]) {
        const [x, y] = c.split(",").map(Number);
        if (cellAt(map, x, y) !== "door") continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cells.add(cellKey(x + dx, y + dy));
      }
      sight = { key, cells };
      return true;
    }

    // Culling: the scene's small objects (a wall panel, a floor tile, a
    // door, a prop...) each belong to the cell their bounding box centers
    // on, and are drawn only while that cell is seen. Big or spread-out
    // ones (a ladder's group, the sky) are always drawn. Actors are culled
    // as they move (updateActors).
    const cullBox = new THREE.Box3();
    const cullCenter = new THREE.Vector3();
    const cullSize = new THREE.Vector3();
    const cullCells = new WeakMap<THREE.Object3D, string | null>();
    let culledCount = -1;
    function cellOf(obj: THREE.Object3D): string | null {
      let key = cullCells.get(obj);
      if (key === undefined && obj.userData.cullCell) key = obj.userData.cullCell as string;
      if (key === undefined) {
        obj.updateMatrixWorld(true);
        cullBox.setFromObject(obj);
        cullBox.getSize(cullSize);
        cullBox.getCenter(cullCenter);
        key =
          cullBox.isEmpty() || cullSize.x > CULL_MAX_SIZE || cullSize.z > CULL_MAX_SIZE
            ? null
            : cellKey(Math.round(cullCenter.x), Math.round(cullCenter.z));
        cullCells.set(obj, key);
      }
      return key;
    }
    // A prop bigger than a cell (a tree's crown, a tall pillar) isn't left
    // always drawn: it's seen while any cell under its footprint is (an
    // object that isn't a prop, and has no footprint, still is).
    const bigPropCells = new WeakMap<THREE.Object3D, string[] | null>();
    function bigPropSeen(obj: THREE.Object3D): boolean {
      let cells = bigPropCells.get(obj);
      if (cells === undefined) {
        cells = null;
        if (obj.userData.prop) {
          obj.updateMatrixWorld(true);
          cullBox.setFromObject(obj);
          if (!cullBox.isEmpty()) {
            const x0 = Math.round(cullBox.min.x);
            const x1 = Math.round(cullBox.max.x);
            const z0 = Math.round(cullBox.min.z);
            const z1 = Math.round(cullBox.max.z);
            // (a runaway size - a sky-high thing - stays always drawn)
            if (x1 - x0 <= 4 && z1 - z0 <= 4) {
              cells = [];
              for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) cells.push(cellKey(cx, cz));
            }
          }
        }
        bigPropCells.set(obj, cells);
      }
      return cells === null || cells.some((c) => sight.cells.has(c));
    }
    // dev: __voidcrewNoCull = true in the console draws everything, to compare
    let cullingOff = false;
    function applySight(changed: boolean) {
      const off = import.meta.env.DEV && !!(window as { __voidcrewNoCull?: boolean }).__voidcrewNoCull;
      // (objects are still being added while the scene builds)
      if (!changed && group.children.length === culledCount && off === cullingOff) return;
      culledCount = group.children.length;
      cullingOff = off;
      for (const obj of group.children) {
        // (a decal is culled with the surface it lies on - see cullFacing)
        if (obj.userData.actor || obj.userData.item || obj.userData.decalHost) continue;
        // (the corner joins: each point's strip is in sight with any of the
        // cells round it; which are drawn is picked in cullFacing)
        if (obj.userData.joinStrips) {
          for (const p of (obj.userData.joinStrips as JoinedStrips).points) {
            const { x, y } = p.point;
            p.inSight =
              off ||
              sight.cells.has(cellKey(Math.floor(x), Math.floor(y))) ||
              sight.cells.has(cellKey(Math.ceil(x), Math.floor(y))) ||
              sight.cells.has(cellKey(Math.floor(x), Math.ceil(y))) ||
              sight.cells.has(cellKey(Math.ceil(x), Math.ceil(y)));
          }
          continue;
        }
        const key = cellOf(obj);
        const seen = off || (key === null ? bigPropSeen(obj) : sight.cells.has(key));
        // (a surface's own pass decides, with its facing - every frame)
        if (obj.userData.facing) obj.userData.inSight = seen;
        else obj.visible = seen;
      }
      cullFacing();
    }
    // Surfaces seen from behind their plane are hidden - by more than a
    // margin: the relief stands out of the plane (up to its depth), and its
    // bumps could catch a grazing look from just behind it. Every frame (it
    // turns with the eye, between cells too); ~a dot product a surface.
    const FACING_MARGIN = 2 * Math.max(reliefDepth, floorDepth) + 0.02;
    const joinFrustum = new THREE.Frustum();
    const joinMatrix = new THREE.Matrix4();
    function cullFacing() {
      const eye = camera.position;
      for (const obj of facingSurfaces) {
        const { n, d } = obj.userData.facing as { n: THREE.Vector3; d: number };
        obj.visible = !!obj.userData.inSight && (cullingOff || n.dot(eye) - d > -FACING_MARGIN);
      }
      // the corner joins' strips: those in sight and in view (one merged
      // mesh can't be frustum-culled as a whole)
      if (joinedStrips.length) {
        joinFrustum.setFromProjectionMatrix(joinMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        for (const strips of joinedStrips) strips.mesh.visible = strips.show((p) => p.inSight && joinFrustum.intersectsBox(p.box));
      }
      // the decals with their surfaces, just decided (see DecalLibrary.cull)
      decals.cull(camera);
    }
    let lightCells = mapLights.map((l) => cellKey(Math.round(l.x), Math.round(l.z)));
    // bumped whenever objects are swapped in place (see objectsAlong)
    let sceneVersion = 0;

    // The editor changed only the deck's lights: the ceiling tiles' glowing
    // panels, the fixtures and the light pool follow, the rest stays built.
    // A pool slot keeps its light if the new set still has it.
    function applyLights(next: GameMap) {
      sceneVersion++;
      mapLights = generateLights(next, skyLightOf(settingsRef.current));
      litCells = ceilingLightCells(mapLights);
      litColors = ceilingLightColors(mapLights);
      effectCells = effectLampCells(mapLights);
      for (const [key, panel] of effectPanels) if (effectCells.get(key.split("|")[0]) !== panel.light) effectPanels.delete(key);
      lightCells = mapLights.map((l) => cellKey(Math.round(l.x), Math.round(l.z)));
      for (const tile of ceilingTiles) {
        const material = ceilingMaterial(tile.kit, tile.relief, litCells.has(tile.cell), litColors.get(tile.cell), tile.cell);
        tile.obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material;
        });
      }
      placeFixtures();
      // the new fixtures get culled with the rest on the next frame
      culledCount = -1;
      // and the baked light follows (a moment after the last change: a colour
      // being dragged doesn't bake at every step)
      bakeSoon(next, 250);
    }
    // A new version of the map with the same structure (see structureKey):
    // what differs in it is redone in place. Its robots need nothing here -
    // the scene draws them from the game's state.
    let applied = map;
    const lightsOf = (m: GameMap) => JSON.stringify([m.lights, m.lightGridDensity, m.lightGridAmbient]);
    applyLightsRef.current = (next: GameMap) => {
      if (lightsOf(next) !== lightsOf(applied)) applyLights(next);
      if (JSON.stringify(next.smokes) !== JSON.stringify(applied.smokes)) {
        applySmoke(next);
        sceneVersion++;
      }
      if (JSON.stringify(next.decals) !== JSON.stringify(applied.decals) && settingsRef.current.decalsEnabled) {
        // (decals: redone on the surfaces already there)
        track(decals.reset(next.decals ?? []));
      }
      if (JSON.stringify(next.items) !== JSON.stringify(applied.items)) {
        clearItems();
        buildItems(next);
      }
      if (JSON.stringify(next.props) !== JSON.stringify(applied.props)) {
        applyProps(next, applied);
        // The props shade the baked light and shape the smoke's world: seen to
        // once the work on them has stopped for a few seconds
        bakeSoon(() => latestMapRef.current, 3000);
      }
      applied = next;
    };
    const applyChanges = applyLightsRef.current;
    const litNear = (key: string, cells: Set<string>) => {
      if (cells.has(key)) return true;
      const [x, y] = key.split(",").map(Number);
      return cells.has(cellKey(x + 1, y)) || cells.has(cellKey(x - 1, y)) || cells.has(cellKey(x, y + 1)) || cells.has(cellKey(x, y - 1));
    };

    // What the pool of real lights serves: in baked mode (see lightGrid.ts)
    // only the flashes - a shot, a spark; else the map's lights too. Each by
    // a key that stays the same while it does (a light edited elsewhere keeps
    // its slot).
    interface PoolSource {
      key: string;
      x: number;
      y: number;
      z: number;
      color: number;
      intensity: number;
      range: number;
      // the cell it lights (a map light counts only near the cells in sight)
      cell?: string;
      flash?: boolean;
    }
    function poolSources(baked: boolean, now: number): PoolSource[] {
      const list: PoolSource[] = [];
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        const t = (now - f.start) / f.duration;
        if (t >= 1) {
          flashes.splice(i, 1);
          continue;
        }
        list.push({ key: `flash ${f.id}`, x: f.x, y: f.y, z: f.z, color: f.color, intensity: f.intensity * (1 - t), range: f.range, flash: true });
      }
      // a camera's light on the crew: a steady yellow while it watches, a
      // pulsing red while it raises the alarm (just below its lens)
      for (const actor of actorsRef.current) {
        const type = ACTOR_TYPES[actor.type];
        const entry = actorMeshes.get(actor.id);
        if (!type.watcher || actor.diedAt !== null || actor.dormant || !entry?.mesh.visible) continue;
        if (!actor.hostile && !actor.watching) continue;
        const alarm = actor.hostile;
        const p = entry.mesh.position;
        list.push({
          key: `camera ${actor.id}`,
          x: p.x,
          y: p.y - 0.08,
          z: p.z,
          color: alarm ? CAMERA_ALARM_LIGHT : CAMERA_WATCH_LIGHT,
          intensity: alarm ? 1.6 + 1.3 * Math.sin(now / 160) : 1.5,
          range: alarm ? 3 : 2.2,
          cell: cellKey(actor.cell.x, actor.cell.y),
        });
      }
      // the fires' flickering glow
      fireEmitters.forEach((e, i) => {
        list.push({
          key: `fire ${i}`,
          x: e.x,
          y: e.y + FIRE_LIGHT_LIFT * wallHeight,
          z: e.z,
          // (a fire with a color of its own lights in it)
          color: e.color.r > 0.99 && e.color.g > 0.99 && e.color.b > 0.99 ? FIRE_LIGHT : e.color.getHex(),
          intensity: FIRE_LIGHT_INTENSITY * Math.sqrt(e.size * e.density) * fireFlicker(now, i),
          range: FIRE_LIGHT_RANGE * Math.sqrt(e.size),
          cell: e.cell,
        });
      });
      // the map's lights (baked: only the unsteady ones), at their level now
      effectLevels.clear();
      mapLights.forEach((l, i) => {
        if (baked && !l.effect) return;
        const level = l.effect ? lightLevel(l.effect, l.source * 7.13 + i, now / 1000) : 1;
        if (l.effect) effectLevels.set(i, level);
        list.push({
          key: `${l.kind} ${l.x} ${l.y} ${l.z}`,
          x: l.x,
          y: l.y * wallHeight,
          z: l.z,
          color: l.color,
          intensity: l.intensity * level,
          range: l.range,
          cell: lightCells[i],
        });
      });
      // their panels with them
      for (const panel of effectPanels.values()) panel.mat.emissiveIntensity = panel.base * Math.min(1.3, effectLevels.get(panel.light) ?? 1);
      return list;
    }
    // a short burst of light (world position; ms), e.g. a muzzle flash
    const flashes: { id: number; x: number; y: number; z: number; color: number; intensity: number; range: number; start: number; duration: number }[] = [];
    let flashIds = 0;
    function addFlash(at: THREE.Vector3, color: number, intensity: number, range: number, duration: number) {
      flashes.push({ id: flashIds++, x: at.x, y: at.y, z: at.z, color, intensity, range, start: gameClock.now(), duration });
    }

    function updateLightPool(
      party: { x: number; z: number },
      cam: { x: number; y: number; z: number; fwdX: number; fwdZ: number },
      intensityScale: number,
      dt: number,
    ) {
      const range = effectiveViewDistance(settingsRef.current);
      const fadeEnd = range;
      const fadeStart = range - LIGHT_FADE_SPAN;
      applySight(updateSight(party, range));

      const sources = poolSources(lightGrid.scale.value > 0, gameClock.now());
      const score = (l: PoolSource) => {
        const dx = l.x - cam.x;
        const dz = l.z - cam.z;
        const dist = Math.hypot(dx, l.y - cam.y, dz);
        const along = dx * cam.fwdX + dz * cam.fwdZ;
        const ahead = along / (Math.hypot(dx, dz) || 1);
        // a flash first, whatever the rest
        const rank = l.flash ? -1 : dist + LIGHT_BEHIND_PENALTY * Math.max(0, -ahead) * dist;
        // (a light whose whole reach lies behind the eye lights nothing in
        // view: its slot goes to one ahead instead - a lit hall down the
        // corridor - with a little slack for the view tilting up or down)
        const behind = along < -(l.range + LIGHT_BEHIND_SLACK);
        return { dist, rank, behind };
      };
      const current = new Set(lightPool.map((slot) => slot.key));
      const ranked = sources
        .map((l) => ({ l, ...score(l) }))
        .filter((c) => c.dist < fadeEnd && !c.behind && (!c.l.cell || litNear(c.l.cell, sight.cells)))
        .map((c) => ({ ...c, rank: current.has(c.l.key) && !c.l.flash ? c.rank * LIGHT_KEEP_BIAS : c.rank }))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, poolSize);
      const wanted = new Map(ranked.map((c) => [c.l.key, c]));

      // slots keep their source while it's wanted; freed slots fade out
      // before taking a new one (a flash takes one at once)
      const unassigned = ranked.filter((c) => !lightPool.some((slot) => slot.key === c.l.key));
      for (const slot of lightPool) {
        const keep = wanted.get(slot.key ?? "");
        if (!keep && unassigned.length && (slot.level <= 0 || unassigned[0].l.flash)) {
          slot.key = unassigned.shift()!.l.key;
          if (wanted.get(slot.key)?.l.flash) slot.level = 1;
        }
        const target = wanted.get(slot.key ?? "");
        slot.level = Math.min(1, Math.max(0, slot.level + (target ? 1 : -1) * LIGHT_SLOT_FADE * dt));
        if (!target) {
          if (slot.level <= 0) slot.key = null;
          slot.light.intensity = slot.level > 0 ? slot.light.intensity * 0.9 : 0;
          continue;
        }
        const l = target.l;
        slot.light.color.setHex(l.color);
        slot.light.position.set(l.x, l.y, l.z);
        slot.light.distance = l.range;
        const scale = l.flash ? 1 : intensityScale;
        slot.light.intensity = l.intensity * scale * slot.level * (1 - smoothstep(fadeStart, fadeEnd, target.dist));
      }
      // (a slot fading out keeps the reach of the light it last had)
      const placed = new Map<string, PoolSource>(sources.map((l) => [l.key, l]));
      for (const slot of lightPool) {
        if (slot.key && !placed.has(slot.key)) {
          const p = slot.light.position;
          placed.set(slot.key, { key: slot.key, x: p.x, y: p.y, z: p.z, color: 0, intensity: 0, range: slot.light.distance });
        }
      }
      updateLightReach(placed);
    }

    // Actors are Doom-style sprites: an upright quad turned to face the
    // camera, showing the sheet cell for its pose (standing, or the walk
    // cycle while stepping) and for the angle it's seen from - front, 45,
    // 90 and 135 degrees round to its left, or back; seen from its right,
    // the left views mirrored. The sheet's normal map lights it like the
    // walls, so a passing lamp shades it.
    const actorMaterials = new Map<string, THREE.MeshStandardMaterial>();
    // each actor's quad, its own copy of its type's material (for the hit
    // flash and the death fade) and the sheet cell it shows
    interface ActorEntry {
      // the actor type it was made for (another one with its id: made anew)
      type: string;
      mesh: THREE.Mesh;
      material: THREE.MeshStandardMaterial;
      // its soft shadow under it (on the ceiling for one hung up there)
      shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
      // the part highlight's uniforms (see highlightMaterial)
      highlight: PartHighlight;
      uvKey: string;
      col: number;
      row: number;
      mirror: boolean;
      // when it last fired (to flash each new shot)
      lastAttack: number;
    }
    const actorMeshes = new Map<number, ActorEntry>();
    const flashAt = new THREE.Vector3();
    // Each actor type's glow map (see ActorType.glow): its sheet's bright
    // red pixels within the glowing weak spots of each cell, in their own
    // color, black elsewhere. Made once its sheet has loaded.
    // Its sheet's own emissive.png if there's one (npm run actors:emissive
    // writes it; it can be painted by hand) - else worked out here.
    const glowMaps = new Map<string, THREE.Texture | null>();
    const glowMissing = new Set<string>();
    const glowLoader = new THREE.TextureLoader();
    const glowMapOf = (typeName: string): THREE.Texture | null => {
      if (glowMaps.has(typeName)) return glowMaps.get(typeName)!;
      const type = ACTOR_TYPES[typeName];
      if (!type.glow) return null;
      if (!glowMissing.has(typeName)) {
        const baked = glowLoader.load(`${import.meta.env.BASE_URL}actors/${type.sheet}/emissive.png${bust}`, undefined, undefined, () => {
          // no such file: made from the sheet instead (below)
          baked.dispose();
          glowMissing.add(typeName);
          glowMaps.delete(typeName);
        });
        baked.colorSpace = THREE.SRGBColorSpace;
        baked.magFilter = THREE.NearestFilter;
        glowMaps.set(typeName, baked);
        return baked;
      }
      const image = actorMaterial(typeName).map?.image as HTMLImageElement | undefined;
      if (!image?.width) return null;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const src = ctx.getImageData(0, 0, image.width, image.height);
      const out = ctx.createImageData(image.width, image.height);
      const cw = image.width / type.cols;
      const ch = image.height / type.rows;
      // where it glows, per sheet column: its glowing weak spots' zones and
      // its own - or, with neither, the whole cell
      const glow = type.glow;
      const glowing = type.crits.filter((c) => glow.crits?.includes(c.label));
      const zonesOf = (col: number): [number, number, number, number][] => {
        const zones = [...glowing.flatMap((c) => c.zones[col] ?? []), ...(glow.zones?.[col] ?? [])];
        return glow.crits || glow.zones ? zones : [[0, 0, 1, 1]];
      };
      const shines = GLOW_COLORS[glow.color ?? "red"];
      for (let row = 0; row < type.rows; row++) {
        for (let col = 0; col < type.cols; col++) {
          {
            for (const [x0, y0, x1, y1] of zonesOf(col)) {
              // a little past the zone: its glow's edge
              const px0 = Math.max(0, Math.floor((col + x0 - 0.02) * cw));
              const px1 = Math.min(image.width, Math.ceil((col + x1 + 0.02) * cw));
              const py0 = Math.max(0, Math.floor((row + y0 - 0.02) * ch));
              const py1 = Math.min(image.height, Math.ceil((row + y1 + 0.02) * ch));
              for (let y = py0; y < py1; y++) {
                for (let x = px0; x < px1; x++) {
                  const i = (y * image.width + x) * 4;
                  const [r, g, b, a] = [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
                  if (a < 128 || !shines(r, g, b)) continue;
                  out.data[i] = r;
                  out.data[i + 1] = g;
                  out.data[i + 2] = b;
                  out.data[i + 3] = 255;
                }
              }
            }
          }
        }
      }
      ctx.putImageData(out, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      glowMaps.set(typeName, tex);
      return tex;
    };
    const actorMaterial = (typeName: string) => {
      let mat = actorMaterials.get(typeName);
      if (!mat) {
        const type = ACTOR_TYPES[typeName];
        const base = `${import.meta.env.BASE_URL}actors/${type.sheet}/`;
        const diffuse = kitTexture(base + "diffuse.png" + bust);
        const normalMap = kitTexture(base + "normal.png" + bust);
        diffuse.colorSpace = THREE.SRGBColorSpace;
        for (const tex of [diffuse, normalMap]) tex.magFilter = THREE.NearestFilter;
        mat = new THREE.MeshStandardMaterial({ map: diffuse, normalMap, alphaTest: 0.5, roughness: 0.6, metalness: 0.35 });
        // (its sheet's own normal strength - set in the actor editor)
        const normal = actorOffsets(type.sheet)?.normal ?? 1;
        mat.normalScale.set(normal, normal);
        markSprite(mat, normal, normalMap);
        actorMaterials.set(typeName, mat);
      }
      return mat;
    };
    for (const name of new Set((map.actors ?? []).map((a) => a.actor))) actorMaterial(name);
    // the actors' soft shadows: a dark blot fading out to its rim
    const shadowTexture = (() => {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.55, "rgba(0,0,0,0.85)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(canvas);
    })();
    const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const ACTOR_SHADOW = 0.9;

    function removeActorMesh(id: number) {
      const entry = actorMeshes.get(id);
      if (!entry) return;
      group.remove(entry.mesh);
      group.remove(entry.shadow);
      entry.mesh.geometry.dispose();
      entry.material.dispose();
      entry.shadow.material.dispose();
      actorMeshes.delete(id);
    }

    // the loot's sprites: the loose ones turned to the camera (shown while
    // in sight and not taken), new spills let out, the flyers moved
    function updateLoot(camX: number, camZ: number, feetY: number) {
      const now = gameClock.now();
      const loot = lootRef.current;
      markLooted(loot.lootedProps);
      for (const event of loot.spills ?? []) {
        if (event.id <= lastSpill) continue;
        lastSpill = event.id;
        spill(event).catch((err) => console.error("Spill failed:", err));
      }
      for (const [index, item] of looseItems) {
        if (!item.taken && loot.takenItems?.has(index)) {
          // taken: drawn in from where it lies
          item.taken = true;
          flyers.push({ obj: item.obj, from: item.obj.position.clone(), rest: item.obj.position.clone(), start: now - SPILL_REST_MS });
        }
        if (item.taken) continue;
        item.obj.visible = sight.cells.has(item.cell);
        item.obj.rotation.y = Math.atan2(camX - item.obj.position.x, camZ - item.obj.position.z);
      }
      const feet = new THREE.Vector3(camX, feetY + ITEM_LIFT, camZ);
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i];
        const t = now - f.start;
        const obj = f.obj;
        if (t < 0) {
          obj.visible = false;
          continue;
        }
        obj.visible = true;
        obj.rotation.y = Math.atan2(camX - obj.position.x, camZ - obj.position.z);
        if (t < SPILL_OUT_MS) {
          // out of the container in a little arc
          const p = t / SPILL_OUT_MS;
          obj.position.lerpVectors(f.from, f.rest, p);
          obj.position.y += Math.sin(p * Math.PI) * 0.18;
        } else if (t < SPILL_REST_MS) {
          obj.position.copy(f.rest);
        } else if (t < SPILL_REST_MS + SPILL_IN_MS) {
          // drawn in to the party's feet, shrinking
          const q = (t - SPILL_REST_MS) / SPILL_IN_MS;
          obj.position.lerpVectors(f.rest, feet, q * q);
          obj.scale.setScalar(1 - 0.7 * q);
        } else {
          obj.visible = false;
          group.remove(obj);
          flyers.splice(i, 1);
        }
      }
    }

    function updateActors(camX: number, camZ: number) {
      const now = gameClock.now();
      const current = actorsRef.current;
      smokeBodies.length = 0;
      for (const id of [...actorMeshes.keys()]) {
        if (!current.some((a) => a.id === id)) removeActorMesh(id);
      }
      for (const actor of current) {
        const type = ACTOR_TYPES[actor.type];
        const h = type.height * wallHeight;
        let entry = actorMeshes.get(actor.id);
        if (entry && entry.type !== actor.type) {
          removeActorMesh(actor.id);
          entry = undefined;
        }
        if (!entry) {
          const material = actorMaterial(actor.type).clone();
          const highlight = highlightMaterial(material);
          useLightGrid(material, lightGrid);
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * type.cellAspect, h), material);
          mesh.userData.actor = true;
          mesh.userData.actorId = actor.id;
          const shadow = new THREE.Mesh(
            shadowGeo,
            new THREE.MeshBasicMaterial({
              map: shadowTexture,
              transparent: true,
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -4,
              polygonOffsetUnits: -4,
            }),
          );
          // (nothing to aim at or hide behind)
          shadow.raycast = () => {};
          entry = { type: actor.type, mesh, material, shadow, highlight, uvKey: "", col: 0, row: 0, mirror: false, lastAttack: actor.lastAttack };
          actorMeshes.set(actor.id, entry);
          group.add(mesh, shadow);
        }
        const t = Math.min(1, Math.max(0, (now - actor.moveStart) / actor.moveMs));
        const x = lerp(actor.from.x, actor.cell.x, t);
        const z = lerp(actor.from.y, actor.cell.y, t);
        const y = lerp(actor.fromY, actor.y, t) * wallHeight;
        const mesh = entry.mesh;
        // dead: it falls (its sheet's dying rows) and its wreck stays - or,
        // without them, it fades out
        const sinceDeath = actor.diedAt !== null ? now - actor.diedAt : -1;
        const falls = type.dieRows !== undefined && type.wreckRow !== undefined;
        const dead = sinceDeath >= 0 && !falls ? sinceDeath / ACTOR_FADE_MS : 0;
        if (dead < 1) smokeBodies.push({ x, z, bottom: y, top: y + h });
        mesh.visible =
          dead < 1 &&
          !actor.inVentUntil &&
          (sight.cells.has(cellKey(actor.cell.x, actor.cell.y)) || sight.cells.has(cellKey(actor.from.x, actor.from.y)));
        // a crawler keeps to the ceiling (upside down) - but on the crew in
        // its cell it drops to the floor; dead, it falls
        const partyCell = { x: Math.round(liveRef.current.x), y: Math.round(liveRef.current.z) };
        const onCeiling =
          !!type.crawler && actor.diedAt === null && !(actor.hostile && actor.cell.x === partyCell.x && actor.cell.y === partyCell.y);
        // hit: a red flash; dead: it fades out
        const flash = Math.max(0, 1 - (now - actor.hitAt) / ACTOR_FLASH_MS);
        entry.material.emissive.setRGB(flash * 0.9, flash * 0.12, flash * 0.05);
        entry.material.transparent = dead > 0;
        entry.material.opacity = 1 - Math.min(1, dead);
        const yaw = Math.atan2(camX - x, camZ - z);
        mesh.rotation.y = yaw;

        // the angle it's seen from: 0 in front, + round to its left
        // (a fixture with the crew in its eye looks right at it)
        const look = actor.lookAt && (actor.lookAt.x !== actor.cell.x || actor.lookAt.y !== actor.cell.y) ? actor.lookAt : null;
        const lookLen = look ? Math.hypot(look.x - actor.cell.x, look.y - actor.cell.y) : 1;
        const f = look ? { x: (look.x - actor.cell.x) / lookLen, y: (look.y - actor.cell.y) / lookLen } : DIR_VECTOR[actor.facing];
        const cx = camX - x;
        const cz = camZ - z;
        const angle = Math.atan2(cx * f.y - cz * f.x, cx * f.x + cz * f.y);
        const col = Math.min(type.cols - 1, Math.round(Math.abs(angle) / (Math.PI / 4)));
        const mirror = angle < 0 && col > 0 && col < type.cols - 1;
        // (one that leaps: pushing off, in the air, landing)
        const hopRow = (k: number) => (k < 0.2 ? type.hop!.takeoffRow : k < 0.85 ? type.hop!.airRow : type.idleRow);
        let row = t < 1 ? (type.hop ? hopRow(t) : type.walkRows[Math.floor(t * type.walkRows.length) % type.walkRows.length]) : type.idleRow;
        if (sinceDeath >= 0 && falls) {
          const frame = Math.floor(sinceDeath / ACTOR_DIE_FRAME_MS);
          row = frame < type.dieRows!.length ? type.dieRows![frame] : type.wreckRow!;
        } else if (actor.playingDead && type.wreckRow !== undefined) {
          // lying still as if dead
          row = type.wreckRow;
        } else if (type.hitRow !== undefined && now - actor.hitAt < ACTOR_HIT_POSE_MS) {
          row = type.hitRow;
        } else if (type.shootRows && now - actor.lastAttack < ACTOR_SHOOT_POSE_MS) {
          // (its firing rows in turn: the chaingun spinning)
          row = type.shootRows[Math.floor(now / ACTOR_SHOOT_FRAME_MS) % type.shootRows.length];
        } else if (type.watcher && actor.diedAt === null) {
          // a camera's light: red raising the alarm, amber watching the crew
          row = actor.hostile ? type.watcher.alarmRow : actor.watching ? type.watcher.watchRow : type.idleRow;
        } else if (type.shootRow !== undefined && now - actor.lastAttack < ACTOR_SHOOT_POSE_MS) {
          row = type.shootRow;
        }
        // a new shot: its muzzle flash, at its chest - or a hung turret's
        // barrels (a camera only calls it in: no flash)
        if (actor.lastAttack !== entry.lastAttack) {
          if (actor.lastAttack > entry.lastAttack && !type.watcher && !type.melee) {
            flashAt.set(x, type.ceiling ? ceilingY(actor.cell.x, actor.cell.y) - h * 0.75 : y + h * 0.55, z);
            addFlash(flashAt, ACTOR_FLASH.color, ACTOR_FLASH.intensity, ACTOR_FLASH.range, ACTOR_FLASH.duration);
          }
          entry.lastAttack = actor.lastAttack;
        }
        entry.col = col;
        entry.row = row;
        entry.mirror = mirror;
        // the picked part's pixels light up (see highlightMaterial)
        const focus = aimFocusRef.current;
        const lit = aimingRef.current && focus?.target === actor.id && focus.part ? focus.part : null;
        entry.highlight.part.value = lit ? BODY_PARTS.indexOf(lit) : -1;
        entry.highlight.outline.value = settingsRef.current.enemyScanner && actor.diedAt === null ? 1 : 0;
        // its optics and vents glow - flickering while stunned, out once dead
        const glowMap = type.glow ? glowMapOf(actor.type) : null;
        if (glowMap && entry.highlight.glowMap.value !== glowMap) entry.highlight.glowMap.value = glowMap;
        const stunned = now < actor.stunnedUntil;
        entry.highlight.glow.value =
          !glowMap || actor.diedAt !== null ? 0 : (type.glow?.intensity ?? 0) * (stunned ? (Math.random() < 0.5 ? 0.15 : 0.8) : 1);
        const sheetImage = entry.material.map?.image as HTMLImageElement | undefined;
        if (sheetImage?.width) entry.highlight.texel.value.set(1 / sheetImage.width, 1 / sheetImage.height);
        if (lit) {
          BODY_PARTS.forEach((part, i) => {
            const [x0, y0, x1, y1] = type.parts[part].zone;
            entry!.highlight.zones.value[i].set(
              (col + x0) / type.cols,
              1 - (row + y0) / type.rows,
              (col + x1) / type.cols,
              1 - (row + y1) / type.rows,
            );
          });
          let n = 0;
          for (const crit of type.crits) {
            for (const [x0, y0, x1, y1] of crit.zones[col] ?? []) {
              if (n >= MAX_CRIT_ZONES) break;
              entry.highlight.crits.value[n].set(
                (col + x0) / type.cols,
                1 - (row + y0) / type.rows,
                (col + x1) / type.cols,
                1 - (row + y1) / type.rows,
              );
              entry.highlight.critParts.value[n++] = BODY_PARTS.indexOf(crit.part);
            }
          }
          entry.highlight.critCount.value = n;
          const image = entry.material.map?.image as HTMLImageElement | undefined;
          if (image?.width) entry.highlight.texel.value.set(1 / image.width, 1 / image.height);
        }

        // the frame's placement fix (see actorOffsets), mirrored with it
        const fix = actorOffsets(type.sheet);
        const [dx, dy] = fix?.offsets[row * type.cols + col] ?? [0, 0];
        const px = fix ? h / fix.cell[1] : 0;
        const shift = (mirror ? -dx : dx) * px;
        // (hung from the ceiling: its top against it - a crawler there too;
        // one that leaps arcs up (on the ceiling: down) on its way)
        const arc = type.hop && t < 1 && actor.diedAt === null ? Math.sin(Math.PI * t) * type.hop.height * wallHeight : 0;
        const centerY =
          type.ceiling || onCeiling ? ceilingY(actor.cell.x, actor.cell.y) - h / 2 - arc : y + h / 2 + arc;
        mesh.position.set(x + Math.cos(yaw) * shift, centerY - dy * px, z - Math.sin(yaw) * shift);
        // its shadow: on the floor under it - or on the ceiling over one up
        // there; smaller and fainter the further it leaps off; a wreck's
        // wider, flatter
        const up = type.ceiling || onCeiling;
        const shadow = entry.shadow;
        shadow.visible = mesh.visible;
        const lift = 1 - Math.min(0.7, arc / wallHeight / 0.5);
        const spread = Math.min(0.9, h * type.cellAspect * (up ? 0.6 : 0.55)) * (actor.diedAt !== null || actor.playingDead ? 1.25 : 1);
        shadow.scale.set(spread * lift, 1, spread * lift);
        shadow.rotation.x = up ? Math.PI : 0;
        // (over the floor's relief, like the exit marker)
        shadow.position.set(x, up ? ceilingY(actor.cell.x, actor.cell.y) - reliefDepth - 0.006 : y + reliefDepth + 0.006, z);
        shadow.material.opacity = ACTOR_SHADOW * lift * (1 - Math.min(1, dead));

        const uvKey = `${col},${row},${mirror},${onCeiling}`;
        if (uvKey === entry.uvKey) continue;
        entry.uvKey = uvKey;
        let u0 = col / type.cols;
        let u1 = (col + 1) / type.cols;
        if (mirror) [u0, u1] = [u1, u0];
        let v0 = 1 - (row + 1) / type.rows;
        let v1 = 1 - row / type.rows;
        // (upside down on the ceiling)
        if (onCeiling) [v0, v1] = [v1, v0];
        const uv = mesh.geometry.getAttribute("uv") as THREE.BufferAttribute;
        uv.setXY(0, u0, v1);
        uv.setXY(1, u1, v1);
        uv.setXY(2, u0, v0);
        uv.setXY(3, u1, v0);
        uv.needsUpdate = true;
      }
    }

    // --- Aiming (see combat.ts): while a crewmate aims, each frame lists
    // the enemies in reach with their body parts' screen rectangles and hit
    // chances for the aiming overlay, which shoots through `shoot` ---------
    const aimRaycaster = new THREE.Raycaster();
    const aimNdc = new THREE.Vector2();
    const aimVec = new THREE.Vector3();
    const aimDir = new THREE.Vector3();
    // each part's hit chance (by "actor:part") and when it was worked out
    const chanceCache = new Map<string, number>();
    const chanceAt = new Map<string, number>();

    // What a ray between two points can meet: the objects culled with the
    // cells along it and around (see cellOf), plus the ones never culled
    // and the actors (they move). Testing only those - not the whole deck's
    // hundreds of meshes - is what keeps aiming smooth.
    let rayCells: Map<string, THREE.Object3D[]> | null = null;
    const rayAlways: THREE.Object3D[] = [];
    let rayCellsAt = "";
    function objectsAlong(from: THREE.Vector3, to: THREE.Vector3): THREE.Object3D[] {
      const version = `${group.children.length}|${sceneVersion}`;
      if (!rayCells || rayCellsAt !== version) {
        rayCells = new Map();
        rayAlways.length = 0;
        rayCellsAt = version;
        for (const obj of group.children) {
          const key = obj.userData.actor ? null : cellOf(obj);
          if (key === null) rayAlways.push(obj);
          else {
            const list = rayCells.get(key);
            if (list) list.push(obj);
            else rayCells.set(key, [obj]);
          }
        }
      }
      const out = [...rayAlways];
      const seen = new Set<string>();
      const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.25) + 1;
      for (let i = 0; i <= steps; i++) {
        const cx = Math.round(from.x + ((to.x - from.x) * i) / steps);
        const cz = Math.round(from.z + ((to.z - from.z) * i) / steps);
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const key = cellKey(cx + dx, cz + dz);
            if (seen.has(key)) continue;
            seen.add(key);
            const list = rayCells.get(key);
            if (list) out.push(...list);
          }
        }
      }
      return out;
    }
    // each actor type's sheet alpha, to let shots through its transparent
    // pixels
    const sheetAlpha = new Map<string, { data: Uint8ClampedArray; width: number; height: number } | null>();
    function alphaAt(typeName: string, u: number, v: number): number {
      if (!sheetAlpha.has(typeName)) {
        const image = actorMaterial(typeName).map?.image as HTMLImageElement | undefined;
        if (!image?.width) return 255;
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        sheetAlpha.set(typeName, { data: ctx.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height });
      }
      const sheet = sheetAlpha.get(typeName);
      if (!sheet) return 255;
      const x = Math.min(sheet.width - 1, Math.max(0, Math.floor(u * sheet.width)));
      const y = Math.min(sheet.height - 1, Math.max(0, Math.floor((1 - v) * sheet.height)));
      return sheet.data[(y * sheet.width + x) * 4 + 3];
    }
    const drawnChain = (obj: THREE.Object3D | null) => {
      for (let o = obj; o; o = o.parent) if (!o.visible) return false;
      return true;
    };
    const seeThrough = (obj: THREE.Object3D) => {
      const mat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const first = Array.isArray(mat) ? mat[0] : mat;
      return !!first && first.transparent && !first.depthWrite;
    };
    const isItemObject = (obj: THREE.Object3D) => {
      for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (o.userData.itemIndex !== undefined) return true;
      return false;
    };
    const isProp = (obj: THREE.Object3D) => {
      for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (o.userData.prop) return true;
      return false;
    };
    // the body part at a spot of a sheet cell (fractions from its top left)
    function partAt(typeName: string, u: number, v: number): BodyPart {
      const parts = ACTOR_TYPES[typeName].parts;
      for (const part of ["head", "torso", "legs", "armL", "armR"] as BodyPart[]) {
        const [x0, y0, x1, y1] = parts[part].zone;
        if (u >= x0 && u <= x1 && v >= y0 && v <= y1) return part;
      }
      let best: BodyPart = "torso";
      let bestDist = Infinity;
      for (const part of BODY_PARTS) {
        const [x0, y0, x1, y1] = parts[part].zone;
        const d = Math.hypot((x0 + x1) / 2 - u, (y0 + y1) / 2 - v);
        if (d < bestDist) [best, bestDist] = [part, d];
      }
      return best;
    }
    // what a shot at a spot of an actor's sheet cell hits: a weak spot's
    // part, or the part there
    function hitPart(typeName: string, col: number, u: number, v: number): { part: BodyPart; crit?: string } {
      const crit = critAt(ACTOR_TYPES[typeName], col, u, v);
      return crit ? { part: crit.part, crit: crit.label } : { part: partAt(typeName, u, v) };
    }
    // a point of an actor's quad, from a spot of its sheet cell
    function actorPoint(entry: ActorEntry, typeName: string, u: number, v: number, out: THREE.Vector3) {
      const type = ACTOR_TYPES[typeName];
      const h = type.height * wallHeight;
      const w = h * type.cellAspect;
      return out.set((entry.mirror ? 0.5 - u : u - 0.5) * w, (0.5 - v) * h, 0).applyMatrix4(entry.mesh.matrixWorld);
    }
    // how much of a spot on an actor the camera sees past everything else
    function unoccluded(target: THREE.Vector3, self: THREE.Object3D): boolean {
      aimDir.copy(target).sub(camera.position);
      const dist = aimDir.length();
      aimRaycaster.set(camera.position, aimDir.normalize());
      aimRaycaster.far = dist - 0.03;
      for (const hit of aimRaycaster.intersectObjects(objectsAlong(camera.position, target), true)) {
        if (hit.object === self || !drawnChain(hit.object) || seeThrough(hit.object)) continue;
        if (hit.object.userData.actorId !== undefined) {
          const other = actorMeshes.get(hit.object.userData.actorId as number);
          const actor = actorsRef.current.find((a) => a.id === hit.object.userData.actorId);
          if (!other || !actor || !hit.uv || alphaAt(actor.type, hit.uv.x, hit.uv.y) < 128) continue;
        }
        return false;
      }
      return true;
    }
    function updateAimFrame(weapon: Weapon, camX: number, camZ: number) {
      const cw = container!.clientWidth || 1;
      const ch = container!.clientHeight || 1;
      const startedAt = performance.now();
      // chances go stale and are worked out again a few parts a frame, not
      // all at once (a new part's straight away)
      let budget = AIM_CHANCE_PARTS_PER_FRAME;
      const sway = (weapon.sway ?? 0.03) * ch * aimZoom;
      const targets: AimTarget[] = [];
      for (const actor of actorsRef.current) {
        const entry = actorMeshes.get(actor.id);
        if (actor.diedAt !== null || !entry?.mesh.visible) continue;
        const distance = Math.hypot(entry.mesh.position.x - camX, entry.mesh.position.z - camZ);
        if (distance > (weapon.range ?? 1) + 0.5) continue;
        entry.mesh.updateMatrixWorld();
        const type = ACTOR_TYPES[actor.type];
        const parts: AimTarget["parts"] = [];
        for (const part of BODY_PARTS) {
          const [u0, v0, u1, v1] = type.parts[part].zone;
          let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
          let behind = false;
          for (const [u, v] of [
            [u0, v0],
            [u1, v0],
            [u0, v1],
            [u1, v1],
          ]) {
            actorPoint(entry, actor.type, u, v, aimVec).project(camera);
            if (aimVec.z > 1) behind = true;
            const sx = ((aimVec.x + 1) / 2) * cw;
            const sy = ((1 - aimVec.y) / 2) * ch;
            [x0, y0, x1, y1] = [Math.min(x0, sx), Math.min(y0, sy), Math.max(x1, sx), Math.max(y1, sy)];
          }
          if (behind) continue;
          const key = `${actor.id}:${part}`;
          const stale = !chanceCache.has(key) || (budget > 0 && startedAt - (chanceAt.get(key) ?? 0) > AIM_CHANCE_REFRESH_MS);
          if (stale) {
            if (chanceCache.has(key)) budget--;
            chanceAt.set(key, startedAt);
            // A grid of spots over the part's zone: those on the part itself
            // (the sprite's solid pixels there, not another part's) give its
            // real size; those of them in plain view, its cover.
            let solid = 0;
            let seen = 0;
            for (let i = 0; i < CHANCE_GRID; i++) {
              for (let j = 0; j < CHANCE_GRID; j++) {
                const u = u0 + ((u1 - u0) * (i + 0.5)) / CHANCE_GRID;
                const v = v0 + ((v1 - v0) * (j + 0.5)) / CHANCE_GRID;
                const su = (entry.col + u) / type.cols;
                const sv = 1 - (entry.row + v) / type.rows;
                if (alphaAt(actor.type, su, sv) < 128 || hitPart(actor.type, entry.col, u, v).part !== part) continue;
                solid++;
                if (unoccluded(actorPoint(entry, actor.type, u, v, aimVec), entry.mesh)) seen++;
              }
            }
            // a part smaller than the weapon's sway is harder to land on
            const area = (x1 - x0) * (y1 - y0) * (solid / (CHANCE_GRID * CHANCE_GRID));
            const size = Math.min(1, Math.sqrt(area / (Math.PI * sway * sway)));
            const cover = solid ? seen / solid : 0;
            chanceCache.set(key, Math.min(0.97, cover * weaponAccuracy(weapon, distance) * size));
          }
          parts.push({ part, label: type.parts[part].label, rect: [x0, y0, x1, y1], chance: chanceCache.get(key)! });
        }
        // the two arms: named by the side of the screen they're on
        actorPoint(entry, actor.type, 0.5, 0.5, aimVec).project(camera);
        const midX = ((aimVec.x + 1) / 2) * cw;
        for (const p of parts) {
          if (p.part === "armL" || p.part === "armR") {
            p.label = `${(p.rect[0] + p.rect[2]) / 2 < midX ? "LEFT" : "RIGHT"} ${p.label}`;
          }
        }
        if (parts.length) targets.push({ id: actor.id, name: type.name, distance, parts });
      }
      targets.sort((a, b) => a.distance - b.distance);
      aimFrameRef.current = { targets, width: cw, height: ch, zoom: aimZoom, shoot };
      // dev: how long this frame's aiming took (ms), for checking it stays smooth
      if (import.meta.env.DEV) Object.assign(window, { __voidcrewAimCost: performance.now() - startedAt });
    }

    // The party's cover against each hostile actor near enough to shoot:
    // rays from its middle to points on the party's body (a column of
    // heights, a little to either side) - the share that gets through.
    let coverAt = 0;
    const coverFrom = new THREE.Vector3();
    const coverTo = new THREE.Vector3();
    function updatePartyCover(camX: number, floorY: number, camZ: number, eye: number) {
      if (!partyCoverRef || performance.now() - coverAt < PARTY_COVER_REFRESH_MS) return;
      coverAt = performance.now();
      const cover = partyCoverRef.current;
      cover.clear();
      for (const actor of actorsRef.current) {
        const entry = actorMeshes.get(actor.id);
        const type = ACTOR_TYPES[actor.type];
        if (!entry || actor.diedAt !== null || !actor.hostile) continue;
        coverFrom.copy(entry.mesh.position);
        const dx = camX - coverFrom.x;
        const dz = camZ - coverFrom.z;
        const len = Math.hypot(dx, dz);
        if (len > type.attackRange + 1.5 || len < 1e-3) continue;
        // sideways, across the line of fire
        const sx = -dz / len;
        const sz = dx / len;
        let open = 0;
        let total = 0;
        for (const h of PARTY_BODY_HEIGHTS) {
          for (const side of [-PARTY_BODY_HALF_WIDTH, PARTY_BODY_HALF_WIDTH]) {
            total++;
            coverTo.set(camX + sx * side, floorY + eye * h, camZ + sz * side);
            aimDir.copy(coverTo).sub(coverFrom);
            const dist = aimDir.length();
            aimRaycaster.set(coverFrom, aimDir.normalize());
            aimRaycaster.far = dist;
            const blocked = aimRaycaster
              .intersectObjects(objectsAlong(coverFrom, coverTo), true)
              .some((hit) => hit.object.userData.actorId === undefined && drawnChain(hit.object) && !seeThrough(hit.object));
            if (!blocked) open++;
          }
        }
        cover.set(actor.id, open / total);
      }
      if (import.meta.env.DEV) Object.assign(window, { __voidcrewPartyCover: Object.fromEntries(cover) });
    }

    // a shot through a point of the view: the first thing it meets there
    // (an actor only where its sprite isn't transparent)
    function shoot(sx: number, sy: number): ShotResult {
      const cw = container!.clientWidth || 1;
      const ch = container!.clientHeight || 1;
      aimNdc.set((sx / cw) * 2 - 1, -((sy / ch) * 2 - 1));
      aimRaycaster.setFromCamera(aimNdc, camera);
      aimRaycaster.far = 40;
      for (const hit of aimRaycaster.intersectObjects(group.children, true)) {
        if (!drawnChain(hit.object) || seeThrough(hit.object)) continue;
        const id = hit.object.userData.actorId as number | undefined;
        if (id !== undefined) {
          const actor = actorsRef.current.find((a) => a.id === id);
          const entry = actorMeshes.get(id);
          if (!actor || !entry || actor.diedAt !== null || !hit.uv) continue;
          if (alphaAt(actor.type, hit.uv.x, hit.uv.y) < 128) continue;
          const type = ACTOR_TYPES[actor.type];
          const u = hit.uv.x * type.cols - entry.col;
          const v = (1 - hit.uv.y) * type.rows - entry.row;
          addTracer(hit.point);
          return { kind: "actor", actor: id, ...hitPart(actor.type, entry.col, u, v) };
        }
        addTracer(hit.point);
        return { kind: "miss", hit: isProp(hit.object) ? "prop" : "wall" };
      }
      addTracer(aimRaycaster.ray.at(8, aimVec).clone());
      return { kind: "miss", hit: "nothing" };
    }

    // a shot's trace: a bright line from below the camera to where it hit,
    // fading out
    const tracers: { line: THREE.Line; born: number }[] = [];
    function addTracer(to: THREE.Vector3) {
      const from = new THREE.Vector3(0.12, -0.16, -0.3).applyMatrix4(camera.matrixWorld);
      // the party's muzzle flash
      addFlash(from, PARTY_FLASH_COLOR, 2.5, 2.8, 90);
      const geo = new THREE.BufferGeometry().setFromPoints([from, to.clone()]);
      const mat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      tracers.push({ line, born: gameClock.now() });
    }
    function updateTracers() {
      for (let i = tracers.length - 1; i >= 0; i--) {
        const { line, born } = tracers[i];
        const k = (gameClock.now() - born) / TRACER_MS;
        if (k < 1) {
          (line.material as THREE.LineBasicMaterial).opacity = 1 - k;
          continue;
        }
        scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        tracers.splice(i, 1);
      }
    }

    function resize() {
      const w = container!.clientWidth || 1;
      const h = container!.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = verticalFov(settingsRef.current.fov, camera.aspect);
      camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    // everything to wait for is queued by now: nothing may be pending at all
    checkReady();

    // Touching an interactive decal: a click or tap (not a drag) whose ray
    // meets one within reach, in front of whatever else it meets. The press
    // starts on the canvas; the release is heard on the window, since the
    // view controls capture the pointer.
    const raycaster = new THREE.Raycaster();
    raycaster.far = TOUCH_REACH + settings.cameraPullback;
    let press: { x: number; y: number; at: number } | null = null;
    // Something grabbed in the editor and dragged. Props, lights, robots and
    // doors slide over the level they stand on (their floor; a ceiling lamp's
    // or a hung robot's ceiling), their spot there kept where it was on the
    // screen from the pointer (`grab`): moved by as much as the pointer moves,
    // wherever on the thing it was grabbed (a pillar by its head as by its
    // foot) - not put where the pointer meets whatever surface is under it,
    // which is often the thing itself (a pillar's side put it back in its
    // cell's middle every other step). (Not the point grabbed slid on its own
    // level either: near eye height that level is seen edge on, and the
    // slightest move threw the thing far off.)
    // Decals, items, smoke and wall-hung props go over the surfaces pointed
    // at, the dragged one itself looked through. A door slides along its
    // passage inside its cell (its offset); with Shift or Ctrl (a copy) it's
    // moved to another cell.
    let dragItem: {
      kind: EditDragKind;
      index: number;
      door?: Vec2;
      copy: boolean;
      first: boolean;
      x: number;
      y: number;
      moved: boolean;
      // (one undo step per drag)
      id: number;
      // the thing's spot (world x, z) and the level it slides on; null: it
      // goes over surfaces
      anchor: [number, number] | null;
      planeY: number;
      // from the pointer to the thing's spot on the screen (view coordinates)
      grab: THREE.Vector2 | null;
      // a door: where it's shown while dragged (moved into the map on release)
      // and where it stood
      doorTo?: Vec2;
      doorAcross?: boolean;
      doorOffset?: number;
      doorHome?: { position: THREE.Vector3; rotation: number };
    } | null = null;
    let dragSerial = 0;
    const dragPlane = new THREE.Plane();
    const dragPoint = new THREE.Vector3();
    // whether a hit is on the thing being dragged (looked through while it is)
    function dragOwn(o: THREE.Object3D): boolean {
      const d = dragItem;
      if (!d) return false;
      const u = o.userData;
      switch (d.kind) {
        case "prop":
          return u.propIndex === d.index;
        case "item":
          return u.itemIndex === d.index;
        case "smoke":
          return u.smokeIndex === d.index;
        case "light":
          return u.mapLight === d.index;
        case "actor":
          return u.actorId === d.index;
        case "door":
          return !!u.doorCell && u.doorCell.x === d.door?.x && u.doorCell.y === d.door?.y;
        default:
          return false;
      }
    }
    // the spot of the thing grabbed that the drag moves (world x, z) and the
    // height of the level it slides on - null for the ones dragged over
    // surfaces
    function dragAnchor(kind: EditDragKind, index: number, door?: Vec2): [number, number, number] | null {
      if (kind === "prop") {
        const spec = latestMapRef.current.props?.[index];
        const obj = propObjects.get(index);
        return spec && obj && !PROP_TYPES[spec.prop]?.wall ? [obj.position.x, obj.position.z, floorY(spec.cell.x, spec.cell.y)] : null;
      }
      if (kind === "light") {
        const l = mapLights.find((m) => m.source === index);
        if (!l) return null;
        const cx = Math.round(l.x);
        const cz = Math.round(l.z);
        return [l.x, l.z, l.kind === "ceiling" ? ceilingY(cx, cz) : floorY(cx, cz)];
      }
      if (kind === "actor") {
        const actor = actorsRef.current.find((a) => a.id === index);
        if (!actor) return null;
        // (a turret, a camera: hung from the ceiling, above the eye)
        const mesh = actorMeshes.get(index)?.mesh;
        const hung = !!mesh && mesh.position.y > camera.position.y;
        return [actor.cell.x, actor.cell.y, hung ? ceilingY(actor.cell.x, actor.cell.y) : floorY(actor.cell.x, actor.cell.y)];
      }
      if (kind === "door" && door) {
        // (where it stands in its cell, not the cell's middle)
        const obj = doorGroups.get(`${door.x},${door.y}`);
        return [obj?.position.x ?? door.x, obj?.position.z ?? door.y, floorY(door.x, door.y)];
      }
      return null;
    }
    // where a point of the view meets a level (world height y), if it does
    // within reach
    function levelPoint(ndc: THREE.Vector2, y: number): THREE.Vector3 | null {
      editRaycaster.setFromCamera(ndc, camera);
      dragPlane.set(new THREE.Vector3(0, 1, 0), -y);
      const p = editRaycaster.ray.intersectPlane(dragPlane, dragPoint);
      return p && p.distanceTo(editRaycaster.ray.origin) <= EDIT_REACH ? p : null;
    }
    const onPress = (e: PointerEvent) => {
      press = { x: e.clientX, y: e.clientY, at: performance.now() };
      dragItem = null;
      if (!editModeRef.current || e.button !== 0) return;
      const tool = editToolRef.current;
      // each tool grabs only its own kind of thing
      const kind: EditDragKind | null =
        tool === "prop" || tool === "decal" || tool === "item" || tool === "smoke" || tool === "light" || tool === "door"
          ? tool
          : tool === "robot"
            ? "actor"
            : null;
      if (!kind) return;
      const hit = editTargetAt(viewNdc(e.clientX, e.clientY));
      if (!hit) return;
      let index: number | undefined;
      let door: Vec2 | undefined;
      if (kind === "prop") index = hit.prop;
      else if (kind === "decal") index = hit.decal;
      else if (kind === "item") index = hit.item;
      else if (kind === "smoke") index = hit.smoke;
      else if (kind === "actor") index = hit.actor;
      else if (kind === "light") {
        // a bulb or a lamp panel; or a ceiling with its lamp in it (a lit
        // ceiling texture has no panel of its own to grab)
        const own = hit.light ?? (hit.kind === "ceiling" ? ownCeilingLight(latestMapRef.current, hit.cell) : -1);
        index = own >= 0 && latestMapRef.current.lights?.[own]?.pos ? own : undefined;
      } else if (kind === "door" && hit.door) {
        door = hit.door;
        index = -1;
      }
      if (index === undefined) return;
      const anchor = dragAnchor(kind, index, door);
      const spot = anchor && new THREE.Vector3(anchor[0], anchor[2], anchor[1]).project(camera);
      const doorObj = door && doorGroups.get(`${door.x},${door.y}`);
      dragItem = {
        kind,
        index,
        door,
        copy: e.ctrlKey || e.metaKey,
        first: true,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        id: ++dragSerial,
        anchor: anchor && [anchor[0], anchor[1]],
        planeY: anchor ? anchor[2] : 0,
        doorAcross: e.shiftKey || e.ctrlKey || e.metaKey,
        grab: spot && new THREE.Vector2(spot.x, spot.y).sub(viewNdc(e.clientX, e.clientY)),
        doorHome: doorObj ? { position: doorObj.position.clone(), rotation: doorObj.rotation.y } : undefined,
      };
    };
    // (heard on the window, in the capture phase: while a drag is on, the view
    // controls underneath mustn't turn the view too)
    const onDragMove = (e: PointerEvent) => {
      const d = dragItem;
      if (!d || !editModeRef.current || !(e.buttons & 1)) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.moved = true;
      e.stopPropagation();
      if (e.altKey) {
        // Alt + drag: up and down raises or lowers
        onEditAdjustRef.current?.({ what: "height", delta: -e.movementY * 0.004 });
        return;
      }
      const ndc = viewNdc(e.clientX, e.clientY);
      // where the grabbed spot is taken to, on its level
      let at: [number, number] | undefined;
      if (d.anchor && d.grab) {
        const p = levelPoint(ndc.clone().add(d.grab), d.planeY);
        // (its spot taken over the horizon, or far off: nowhere to put it)
        if (!p) return;
        at = [p.x, p.z];
      }
      if (d.kind === "door") {
        if (at && d.doorAcross) previewDoor(d, { x: Math.round(at[0]), y: Math.round(at[1]) });
        else if (at) slideDoor(d, at);
        return;
      }
      const target = at ? { kind: "floor" as const, cell: { x: Math.round(at[0]), y: Math.round(at[1]) } } : editTargetAt(ndc);
      if (!target) return;
      const index = onEditDragRef.current?.({ kind: d.kind, index: d.index, copy: d.copy, first: d.first, id: d.id, at }, target);
      if (index === false) return;
      d.first = false;
      if (typeof index === "number") d.index = index;
    };
    // A door dragged: shown where it'd go (a cell it fits in - see doorFits -
    // facing along that passage) - the map takes it on release: it changes
    // the deck's structure, a rebuild that's too slow for every step.
    function previewDoor(d: NonNullable<typeof dragItem>, cell: Vec2) {
      const from = d.door;
      const obj = from && doorGroups.get(`${from.x},${from.y}`);
      if (!from || !obj || !d.doorHome) return;
      const m = latestMapRef.current;
      const home = cell.x === from.x && cell.y === from.y;
      if (!home && !doorFits(m, cell, d.copy ? undefined : from)) return;
      d.doorTo = home ? undefined : cell;
      const spec = doorAt(m, from.x, from.y);
      const facing = home ? spec.facing : doorFacingAt(m, cell, spec.facing);
      obj.position.set(cell.x, floorY(cell.x, cell.y), cell.y);
      obj.rotation.y = FACING_ROTATION[facing];
      obj.translateZ(spec.offset ?? 0);
    }
    // A door slid inside its cell: along its passage (the way it faces), up
    // to flush with the cell's edge (see DoorSpec.offset) - shown as it goes,
    // taken into the map on release (as a door moved to another cell).
    function slideDoor(d: NonNullable<typeof dragItem>, at: [number, number]) {
      const cell = d.door;
      const obj = cell && doorGroups.get(`${cell.x},${cell.y}`);
      if (!cell || !obj) return;
      const spec = doorAt(latestMapRef.current, cell.x, cell.y);
      const v = DIR_VECTOR[spec.facing];
      const along = (at[0] - cell.x) * v.x + (at[1] - cell.y) * v.y;
      const offset = Math.round(Math.max(-DOOR_EDGE_OFFSET, Math.min(DOOR_EDGE_OFFSET, along)) * 100) / 100;
      d.doorOffset = offset;
      obj.position.set(cell.x, floorY(cell.x, cell.y), cell.y);
      obj.rotation.y = FACING_ROTATION[spec.facing];
      obj.translateZ(offset);
    }
    window.addEventListener("pointermove", onDragMove, true);
    // the wheel over the view, while a prop, decal, item or free-standing
    // light is selected: height, Ctrl: scale, Alt: turn
    const onWheel = (e: WheelEvent) => {
      if (!editModeRef.current || !onEditAdjustRef.current) return;
      const tool = editToolRef.current;
      const pointLight = tool === "light" && selectedLightRef.current !== null && !!latestMapRef.current.lights?.[selectedLightRef.current]?.pos;
      if (tool !== "prop" && tool !== "decal" && tool !== "item" && !pointLight) return;
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      if (e.ctrlKey || e.metaKey) onEditAdjustRef.current({ what: "scale", delta: dir * 0.05 });
      else if (e.altKey) onEditAdjustRef.current({ what: "rotate", delta: dir * 15 });
      else onEditAdjustRef.current({ what: "height", delta: dir * 0.05 });
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    // a point of the view in normalized device coordinates - its center
    // while the pointer is locked (free mouselook)
    const viewNdc = (clientX: number, clientY: number) => {
      if (document.pointerLockElement) return new THREE.Vector2(0, 0);
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    };
    const onRelease = (e: PointerEvent) => {
      const p = press;
      press = null;
      // a drag just ended: not a click
      const d = dragItem;
      if (d?.moved) {
        dragItem = null;
        // a door: into the map where it was shown, if it takes it there - else
        // back where it stood (on success the deck is rebuilt around it)
        if (d.kind === "door" && d.door) {
          const drop = { kind: "door" as const, index: -1, door: d.door, copy: d.copy, first: true, id: d.id, drop: true };
          const taken = d.doorAcross
            ? d.doorTo && onEditDragRef.current?.(drop, { kind: "floor", cell: d.doorTo })
            : d.doorOffset !== undefined && onEditDragRef.current?.({ ...drop, copy: false, offset: d.doorOffset }, { kind: "floor", cell: d.door });
          const obj = doorGroups.get(`${d.door.x},${d.door.y}`);
          if ((taken !== true || d.copy) && obj && d.doorHome) {
            obj.position.copy(d.doorHome.position);
            obj.rotation.y = d.doorHome.rotation;
          }
        }
        return;
      }
      dragItem = null;
      if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8 || performance.now() - p.at > 500) return;
      const ndc = viewNdc(e.clientX, e.clientY);
      if (editModeRef.current) {
        const target = editTargetAt(ndc);
        if (target) onEditRef.current?.(target, e.button === 2, e.shiftKey);
        return;
      }
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(group.children, true);
      if (!hits.length) return;
      // a decal lies on its wall: count it if it's as near as the nearest hit
      const touched = hits.find((h) => h.object.userData.action && h.distance <= hits[0].distance + 0.02);
      if (touched) {
        onTouchRef.current?.(touched.object.userData.action);
        return;
      }
      // a container or a wreck, nearest: the same as Use (handy on a phone)
      for (let o: THREE.Object3D | null = hits[0].object; o; o = o.parent) {
        if (o.userData.propIndex !== undefined) {
          const spec = map.props?.[o.userData.propIndex as number];
          if (spec && PROP_TYPES[spec.prop]?.container) onTouchRef.current?.("use");
          return;
        }
        if (o.userData.actorId !== undefined) {
          const actor = actorsRef.current.find((a) => a.id === o.userData.actorId);
          if (actor && actor.diedAt !== null) onTouchRef.current?.("use");
          return;
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPress);
    window.addEventListener("pointerup", onRelease);

    // --- the map editor: what's under the pointer, highlighted ---
    const editRaycaster = new THREE.Raycaster();
    editRaycaster.far = EDIT_REACH;
    const editNormal = new THREE.Vector3();
    let editHover: THREE.Vector2 | null = null;
    const onHover = (e: PointerEvent) => {
      editHover = viewNdc(e.clientX, e.clientY);
    };
    // leaving the view (for the toolbar, say) keeps the last point: the
    // highlight mustn't jump to whatever is in the middle of the view
    const onLeave = () => {};
    // no context menu over the view while editing: the right button fills
    const onContextMenu = (e: Event) => {
      if (editModeRef.current) e.preventDefault();
    };
    renderer.domElement.addEventListener("pointermove", onHover);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);
    // The cell a point of the view shows: the first solid surface there - a
    // wall's face (the wall cell behind it, dug from the open cell in front),
    // else the floor or ceiling of the cell it's in: floors face up, ceiling
    // geometry is turned to face down.
    const decalIndexOf = (h: THREE.Intersection | undefined) => h?.object.userData.decalIndex as number | undefined;
    // a world point on a cell's surface in that surface's pixels (see
    // DecalSpec and surfaceFrame)
    const surfaceInverse = new THREE.Quaternion();
    const surfaceLocal = new THREE.Vector3();
    function surfacePointAt(cell: Vec2, surface: Direction | "floor" | "ceiling", point: THREE.Vector3): EditTarget["surfacePoint"] {
      const frame = surfaceFrame(cell, surface, wallHeight, { floor: floorY(cell.x, cell.y), ceiling: ceilingY(cell.x, cell.y) });
      surfaceInverse.copy(frame.quaternion).invert();
      surfaceLocal.copy(point).sub(frame.position).applyQuaternion(surfaceInverse);
      return {
        cell,
        surface,
        u: Math.round(((surfaceLocal.x + frame.width / 2) / frame.width) * SURFACE_PIXELS),
        v: Math.round(((frame.height / 2 - surfaceLocal.y) / frame.height) * SURFACE_PIXELS),
      };
    }
    const ownedByDrag = (obj: THREE.Object3D) => {
      for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (dragOwn(o)) return true;
      return false;
    };
    function editTargetAt(ndc: THREE.Vector2): EditTarget | null {
      editRaycaster.setFromCamera(ndc, camera);
      const lightTool = editToolRef.current === "light";
      const hits = editRaycaster
        .intersectObjects(group.children, true)
        .filter(
          (h) =>
            h.face &&
            (h.object.userData.actorId === undefined || editToolRef.current === "robot") &&
            (lightTool || h.object.userData.mapLight === undefined) &&
            drawnChain(h.object) &&
            // (the loose items are see-through sprites, but the Item tool can point at them)
            (!seeThrough(h.object) || (editToolRef.current === "item" && isItemObject(h.object))) &&
            // (the thing being dragged is looked through: what's behind it is
            // where it goes)
            !(dragItem?.moved && ownedByDrag(h.object)),
        );
      const hit = hits[0];
      if (!hit?.face) return null;
      // the Decal tool: a decal lies on its surface - it counts if it's as
      // near as the nearest hit
      const decalHit =
        editToolRef.current === "decal"
          ? hits.find((h) => h.object.userData.decalIndex !== undefined && h.distance <= hit.distance + 0.02)
          : undefined;
      // the Robot tool: an actor pointed at
      const actorId = hit.object.userData.actorId as number | undefined;
      if (actorId !== undefined) {
        const actor = actorsRef.current.find((a) => a.id === actorId);
        return actor ? { kind: "floor", cell: { ...actor.cell }, actor: actorId } : null;
      }
      // the Door tool: a door pointed at (any part of it)
      if (editToolRef.current === "door") {
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
          const at = o.userData.doorCell as Vec2 | undefined;
          if (at) return { kind: "floor", cell: { ...at }, door: { ...at } };
        }
      }
      // the Smoke tool: an emitter's marker pointed at
      if (editToolRef.current === "smoke") {
        const at = hits.find((h) => h.object.userData.smokeIndex !== undefined);
        const spec = at && latestMapRef.current.smokes?.[at.object.userData.smokeIndex as number];
        if (at && spec) return { kind: "floor", cell: { ...spec.cell }, smoke: at.object.userData.smokeIndex as number };
      }
      // the Item tool: an item pointed at
      if (editToolRef.current === "item") {
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
          if (o.userData.itemIndex === undefined) continue;
          const spec = latestMapRef.current.items?.[o.userData.itemIndex as number];
          if (spec) return { kind: "floor", cell: { ...spec.cell }, item: o.userData.itemIndex as number };
        }
      }
      // the Prop tool: a prop pointed at (any part of it)
      if (editToolRef.current === "prop") {
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
          if (o.userData.propIndex === undefined) continue;
          const spec = latestMapRef.current.props?.[o.userData.propIndex as number];
          if (spec) return { kind: "floor", cell: { ...spec.cell }, prop: o.userData.propIndex as number };
        }
      }
      const lightIndex = hit.object.userData.mapLight as number | undefined;
      const own = lightIndex === undefined ? undefined : latestMapRef.current.lights?.[lightIndex];
      if (lightIndex !== undefined && own) {
        return { kind: "floor", cell: { x: own.x, y: own.y }, light: lightIndex };
      }
      editNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      const p = hit.point;
      // a free-standing light's spot: just off the surface, in its cell
      const sx0 = p.x + editNormal.x * LIGHT_SPOT_GAP;
      const sy0 = p.y + editNormal.y * LIGHT_SPOT_GAP;
      const sz0 = p.z + editNormal.z * LIGHT_SPOT_GAP;
      const spotCell = { x: Math.round(sx0), y: Math.round(sz0) };
      const round2 = (v: number) => Math.round(v * 100) / 100;
      const spot: EditTarget["spot"] =
        cellAt(map, spotCell.x, spotCell.y) === "wall"
          ? undefined
          : {
              cell: spotCell,
              pos: [round2(sx0 - spotCell.x), round2(sy0 / wallHeight - floorHeight(map, spotCell.x, spotCell.y)), round2(sz0 - spotCell.y)],
            };
      const flat = Math.abs(editNormal.y) >= Math.max(Math.abs(editNormal.x), Math.abs(editNormal.z));
      if (!flat) {
        // the side it faces, on the grid
        const sx = Math.abs(editNormal.x) > Math.abs(editNormal.z) ? Math.sign(editNormal.x) : 0;
        const sz = sx ? 0 : Math.sign(editNormal.z);
        const behind = { x: Math.round(p.x - sx * 0.05), y: Math.round(p.z - sz * 0.05) };
        if (cellAt(map, behind.x, behind.y) === "wall") {
          const from = { x: behind.x + sx, y: behind.y + sz };
          const side: Direction = sx > 0 ? "W" : sx < 0 ? "E" : sz > 0 ? "N" : "S";
          return { kind: "wall", cell: behind, from, spot, decal: decalIndexOf(decalHit), surfacePoint: surfacePointAt(from, side, p) };
        }
      }
      const cell = { x: Math.round(p.x), y: Math.round(p.z) };
      if (cellAt(map, cell.x, cell.y) === "wall") return null;
      // floor or ceiling by which the hit is nearer to (a relief's step
      // sides face sideways, so the normal can't tell)
      const nearCeiling = ceilingY(cell.x, cell.y) - p.y < p.y - floorY(cell.x, cell.y);
      const surface = nearCeiling ? "ceiling" : "floor";
      // an upward face (a floor, a table's top): the point itself
      const point: EditTarget["point"] =
        editNormal.y > 0.7 ? { cell, pos: [round2(p.x - cell.x), round2((p.y - floorY(cell.x, cell.y)) / wallHeight), round2(p.z - cell.y)] } : undefined;
      return { kind: surface, cell, spot, point, decal: decalIndexOf(decalHit), surfacePoint: surfacePointAt(cell, surface, p) };
    }
    const editBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: EDIT_DIG_COLOR, depthTest: false, transparent: true }),
    );
    editBox.renderOrder = 10;
    editBox.visible = false;
    scene.add(editBox);
    geometries.push(editBox.geometry);
    // the surface under the pointer, to the editor (the palette follows it):
    // only when it changes, not every frame, and only once it settles - a
    // sweep across the view on the way to the toolbar mustn't swap the
    // palette away from the surface it was picked for
    let lastHover = "";
    let hoverKey = "";
    let hoverSince = 0;
    const HOVER_SETTLE_MS = 150;
    function reportHover(target: EditTarget | null) {
      const key = target ? `${target.kind} ${target.cell.x},${target.cell.y} ${target.from?.x},${target.from?.y}` : "";
      if (key === lastHover) return;
      if (key !== hoverKey) {
        hoverKey = key;
        hoverSince = performance.now();
      }
      if (performance.now() - hoverSince < HOVER_SETTLE_MS) return;
      lastHover = key;
      onEditHoverRef.current?.(target);
    }
    // Marks what a click with the tool in hand would do: the wall block Dig
    // takes out, or the surface Fill paints over / the Texture tool paints /
    // the Light tool hangs a light in.
    // the Light tool's selected light, framed
    const selectBox = new THREE.LineSegments(
      editBox.geometry,
      new THREE.LineBasicMaterial({ color: EDIT_SELECT_COLOR, depthTest: false, transparent: true }),
    );
    selectBox.renderOrder = 11;
    selectBox.visible = false;
    scene.add(selectBox);
    const selectBounds = new THREE.Box3();
    const selectCenter = new THREE.Vector3();
    const selectSize = new THREE.Vector3();
    const frameObject = (box: THREE.LineSegments, obj: THREE.Object3D, pad: number) => {
      selectBounds.setFromObject(obj);
      selectBounds.getCenter(selectCenter);
      selectBounds.getSize(selectSize);
      box.position.copy(selectCenter);
      box.scale.set(selectSize.x + pad, selectSize.y + pad, selectSize.z + pad);
    };
    function updateSelectionBox() {
      // a selected actor: framed around its sprite
      const actorIndex = editModeRef.current ? selectedActorRef.current : null;
      const actorEntry = actorIndex === null ? undefined : actorMeshes.get(actorIndex);
      if (actorEntry) {
        frameObject(selectBox, actorEntry.mesh, 0.04);
        selectBox.visible = true;
        return;
      }
      // a selected door: framed around it
      const doorCell = editModeRef.current ? selectedDoorRef.current : null;
      const doorObj = doorCell && doorGroups.get(`${doorCell.x},${doorCell.y}`);
      if (doorObj) {
        frameObject(selectBox, doorObj, 0.04);
        selectBox.visible = true;
        return;
      }
      // a selected decal: framed around its pieces
      const decalIndex = editModeRef.current ? selectedDecalRef.current : null;
      if (decalIndex !== null) {
        selectBounds.makeEmpty();
        for (const obj of group.children) {
          if (obj.userData.decalIndex === decalIndex) selectBounds.expandByObject(obj);
        }
        if (!selectBounds.isEmpty()) {
          selectBounds.getCenter(selectCenter);
          selectBounds.getSize(selectSize);
          selectBox.position.copy(selectCenter);
          selectBox.scale.set(selectSize.x + 0.03, selectSize.y + 0.03, selectSize.z + 0.03);
          selectBox.visible = true;
          return;
        }
      }
      // a selected smoke emitter: framed around its marker
      const smokeIndex = editModeRef.current ? selectedSmokeRef.current : null;
      const smokeMarker = smokeIndex === null ? undefined : smokeMarkers.get(smokeIndex);
      if (smokeMarker) {
        frameObject(selectBox, smokeMarker, 0.05);
        selectBox.visible = true;
        return;
      }
      // a selected item: framed around its sprite
      const itemIndex = editModeRef.current ? selectedItemRef.current : null;
      const itemObj = itemIndex === null ? undefined : looseItems.get(itemIndex)?.obj;
      if (itemObj) {
        frameObject(selectBox, itemObj, 0.03);
        selectBox.visible = true;
        return;
      }
      // a selected prop: framed around its bounds
      const propIndex = editModeRef.current ? selectedPropRef.current : null;
      const prop = propIndex === null ? undefined : propObjects.get(propIndex);
      if (prop) {
        selectBounds.setFromObject(prop);
        selectBounds.getCenter(selectCenter);
        selectBounds.getSize(selectSize);
        selectBox.position.copy(selectCenter);
        selectBox.scale.set(selectSize.x + 0.04, selectSize.y + 0.04, selectSize.z + 0.04);
        selectBox.visible = true;
        return;
      }
      const selected = editModeRef.current ? selectedLightRef.current : null;
      const l = selected === null ? undefined : mapLights.find((m) => m.source === selected);
      selectBox.visible = !!l;
      if (!l) return;
      if (l.kind === "point") {
        selectBox.position.set(l.x, l.y * wallHeight, l.z);
        selectBox.scale.setScalar(0.14);
      } else {
        selectBox.position.set(l.x, ceilingY(Math.round(l.x), Math.round(l.z)) - 0.03, l.z);
        selectBox.scale.set(0.5, 0.05, 0.5);
      }
    }
    function updateEditHighlight() {
      const target = editModeRef.current ? editTargetAt(editHover ?? new THREE.Vector2(0, 0)) : null;
      reportHover(target);
      // dev: what's under the pointer, for the console and tests
      if (import.meta.env.DEV) Object.assign(window, { __voidcrewEditTarget: target });
      const tool = editToolRef.current;
      let mode: "wall" | "plate" | "bulb" | "prop" | "decal" | "door" | "actor" | "item" | "smoke" | null = null;
      let color = EDIT_FILL_COLOR;
      if (target) {
        if (tool === "texture") {
          mode = target.kind === "wall" ? "wall" : "plate";
          color = EDIT_PAINT_COLOR;
        } else if (tool === "robot" && target.actor !== undefined) {
          mode = "actor";
          color = EDIT_LIGHT_ADD_COLOR;
        } else if (tool === "door" && target.door) {
          mode = "door";
          color = EDIT_LIGHT_ADD_COLOR;
        } else if (tool === "decal") {
          mode = target.decal !== undefined ? "decal" : null;
          color = EDIT_LIGHT_ADD_COLOR;
        } else if (tool === "prop" && target.prop !== undefined) {
          mode = "prop";
          color = EDIT_LIGHT_ADD_COLOR;
        } else if (tool === "item") {
          mode = target.item !== undefined ? "item" : null;
          color = EDIT_LIGHT_ADD_COLOR;
        } else if (tool === "smoke") {
          mode = target.smoke !== undefined ? "smoke" : null;
          color = EDIT_LIGHT_ADD_COLOR;
        } else if (tool === "light") {
          // a light hangs in the cell's ceiling, so either surface of it works
          if (target.light !== undefined) {
            mode = "bulb";
            color = EDIT_LIGHT_ADD_COLOR;
          } else if (target.kind !== "wall") {
            mode = "plate";
            const lit = litCells.has(`${target.cell.x},${target.cell.y}`);
            color = lit ? EDIT_LIGHT_REMOVE_COLOR : EDIT_LIGHT_ADD_COLOR;
          }
        } else if (target.kind === "wall") {
          // only Dig works on a wall (Fill's right button needs a floor)
          if (tool === "dig") {
            mode = "wall";
            color = EDIT_DIG_COLOR;
          }
        } else {
          mode = "plate";
          color = EDIT_FILL_COLOR;
        }
      }
      updateSelectionBox();
      editBox.visible = mode !== null;
      if (!target || !mode) return;
      const mat = editBox.material as THREE.LineBasicMaterial;
      if (mode === "actor") {
        const entry = actorMeshes.get(target.actor!);
        if (entry) frameObject(editBox, entry.mesh, 0.02);
      } else if (mode === "door") {
        const obj = doorGroups.get(`${target.door!.x},${target.door!.y}`);
        if (obj) frameObject(editBox, obj, 0.02);
      } else if (mode === "item") {
        const item = looseItems.get(target.item!);
        if (item) frameObject(editBox, item.obj, 0.02);
      } else if (mode === "smoke") {
        const marker = smokeMarkers.get(target.smoke!);
        if (marker) frameObject(editBox, marker, 0.03);
      } else if (mode === "decal") {
        selectBounds.makeEmpty();
        for (const obj of group.children) {
          if (obj.userData.decalIndex === target.decal) selectBounds.expandByObject(obj);
        }
        selectBounds.getCenter(selectCenter);
        selectBounds.getSize(selectSize);
        editBox.position.copy(selectCenter);
        editBox.scale.set(selectSize.x + 0.02, selectSize.y + 0.02, selectSize.z + 0.02);
      } else if (mode === "prop") {
        const obj = propObjects.get(target.prop!);
        if (obj) {
          selectBounds.setFromObject(obj);
          selectBounds.getCenter(selectCenter);
          selectBounds.getSize(selectSize);
          editBox.position.copy(selectCenter);
          editBox.scale.set(selectSize.x + 0.02, selectSize.y + 0.02, selectSize.z + 0.02);
        }
      } else if (mode === "bulb") {
        const l = mapLights.find((m) => m.source === target.light);
        if (l) editBox.position.set(l.x, l.y * wallHeight, l.z);
        editBox.scale.setScalar(0.1);
      } else if (mode === "wall") {
        // the wall block, as tall as the room it's dug from
        const from = target.from!;
        const bottom = floorY(from.x, from.y);
        const top = ceilingY(from.x, from.y);
        editBox.position.set(target.cell.x, (bottom + top) / 2, target.cell.y);
        editBox.scale.set(0.98, top - bottom - 0.02, 0.98);
      } else {
        // the surface the tool touches: its ceiling where the tool works on
        // one (the ceiling plate of a light's cell), else its floor
        const onCeiling = tool === "light" || ((tool === "texture" || tool === "height") && target.kind === "ceiling");
        const y = onCeiling ? ceilingY(target.cell.x, target.cell.y) - 0.02 : floorY(target.cell.x, target.cell.y) + 0.02;
        editBox.position.set(target.cell.x, y, target.cell.y);
        editBox.scale.set(0.98, 0.04, 0.98);
      }
      mat.color.setHex(color);
    }

    const startedAt = performance.now();
    let lastFrameAt = startedAt;
    let lastStatsAt = 0;
    let particleFrame = 0;
    // frames counted for the fps
    let fpsFrames = 0;
    let fpsSince = performance.now();

    // aiming camera (see renderFrame): how far it's turned to the target
    // (0..1), where it looks, and its field of view there
    let aimBlend = 0;
    const aimLookAt = new THREE.Vector3();
    let aimFov = verticalFov(settings.fov, camera.aspect);
    let aimFovGoal = aimFov;
    let aimZoom = 1;

    let waterLightsAt = -1e9;
    // (whether a layer was hidden last frame: showing it again needs one pass)
    let hiddenApplied = false;
    function renderFrame() {
      const s = settingsRef.current;
      const now = performance.now();
      const t = (now - startedAt) / 1000;
      // standing water: its ripples' clock, and the few lights nearest the eye
      // it glints with (the map's, and the fires')
      decals.waterUniforms.uTime.value = t;
      if (now - waterLightsAt > 250) {
        waterLightsAt = now;
        const eye = camera.position;
        const lights = [
          ...mapLights
            .filter((l) => l.kind !== "window")
            .map((l) => ({ x: l.x, y: l.y * wallHeight, z: l.z, color: l.color, intensity: l.intensity })),
          ...fireEmitters.map((e) => ({ x: e.x, y: e.y + FIRE_LIGHT_LIFT * wallHeight, z: e.z, color: e.color.r > 0.99 && e.color.g > 0.99 && e.color.b > 0.99 ? FIRE_LIGHT : e.color.getHex(), intensity: FIRE_LIGHT_INTENSITY * 0.5 })),
        ];
        lights.sort((a, b) => (a.x - eye.x) ** 2 + (a.z - eye.z) ** 2 - ((b.x - eye.x) ** 2 + (b.z - eye.z) ** 2));
        decals.setWaterLights(lights);
      }
      // capped so a stall (tab switch, breakpoint) doesn't teleport the
      // free-moving player through a wall
      const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
      lastFrameAt = now;
      // the world's own time (bullet time slows it - see clock.ts): what
      // moves in it - its doors, smoke, flickering lights, flashes, loot -
      // goes by this; the party's own moves and looking round by real time
      const gameNow = gameClock.now();
      const gameDt = dt * gameClock.rate();

      const anim = animRef.current;
      const freeTick = freeTickRef.current;
      let cam: CamTarget;
      // free movement puts the eye right at the pose; grid movement pulls it
      // back from the cell center
      let pullback = s.cameraPullback;
      if (freeTick) {
        const pose = freeTick(dt);
        const f = forwardOf(pose.yaw);
        cam = { x: pose.x, z: pose.z, tx: pose.x + f.x, tz: pose.z + f.z, y: pose.y };
        animRef.current = null;
        pullback = 0;
      } else if (anim?.jumpSide) {
        const { cam: jumpCam, done } = jumpPose(anim.from, anim.to, anim.jumpSide, now - anim.start, s.moveDurationMs);
        cam = jumpCam;
        if (done) animRef.current = null;
      } else if (anim?.climb) {
        const { cam: climbCam, done } = climbPose(anim.from, anim.to, now - anim.start, s.moveDurationMs);
        cam = climbCam;
        if (done) animRef.current = null;
      } else if (anim) {
        const elapsed = now - anim.start;
        const p = Math.min(1, elapsed / s.moveDurationMs);
        const e = easeOutQuad(p);
        // stepping off a ledge: walk out over the edge, then fall -
        // accelerating, so the landing reads as a drop rather than a slide
        const drop = anim.from.y - anim.to.y;
        let y = lerp(anim.from.y, anim.to.y, e);
        let done = p >= 1;
        if (drop > MAX_STEP + 1e-6) {
          const fallMs = 1000 * Math.sqrt((2 * drop) / FALL_GRAVITY);
          const f = Math.min(1, Math.max(0, (elapsed - s.moveDurationMs * FALL_START) / fallMs));
          y = anim.from.y - drop * f * f;
          done = done && f >= 1;
        }
        cam = {
          x: lerp(anim.from.x, anim.to.x, e),
          z: lerp(anim.from.z, anim.to.z, e),
          tx: lerp(anim.from.tx, anim.to.tx, e),
          tz: lerp(anim.from.tz, anim.to.tz, e),
          y,
        };
        if (done) animRef.current = null;
      } else {
        cam = liveRef.current;
      }
      liveRef.current = cam;

      for (const [key, anim] of doorAnimsRef.current) {
        const p = Math.min(1, (gameNow - anim.start) / DOOR_OPEN_MS);
        const target: THREE.Vector3 = anim.panel.userData.open ? anim.panel.userData.openPos : anim.panel.userData.closedPos;
        anim.panel.position.lerpVectors(anim.from, target, easeOutQuad(p));
        if (p >= 1) doorAnimsRef.current.delete(key);
      }

      // A lift ride: the cabin shakes (easing in and out), its lights dip
      // while the next deck is swapped in, and shaft lights sweep past
      // outside the door - downward while riding up, upward riding down.
      const ride = rideRef.current;
      let shake = 0;
      let rideDip = 1;
      let rideElapsed = 0;
      if (ride) {
        rideElapsed = now - ride.start;
        const p = rideElapsed / ride.duration;
        shake = smoothstep(0, 0.1, p) * (1 - smoothstep(0.85, 1, p));
        rideDip = 1 - 0.85 * (1 - smoothstep(0, LIFT_DIP_MS, Math.abs(rideElapsed - ride.swapAt)));
      }
      const shakeY = shake * (Math.sin(t * 37) * 0.006 + Math.sin(t * 23.3) * 0.004);
      // steady while editing: the bob sways the view enough to move what's
      // under the pointer between the floor and the ceiling - and with it
      // the surface (and the palette) a click would work on
      const bob = s.bobEnabled && !editModeRef.current ? 1 : 0;
      const bobY = bob * Math.sin((t * 2 * Math.PI) / 3.2) * 0.035 + shakeY;
      const bobRoll = bob * Math.cos((t * 2 * Math.PI) / 1.6) * 0.015 + shake * Math.sin(t * 29) * 0.004;

      const fwdX = cam.tx - cam.x;
      const fwdZ = cam.tz - cam.z;
      const fwdLen = Math.hypot(fwdX, fwdZ) || 1;

      // the normal field of view (the aiming camera narrows it, below)
      const fov = verticalFov(s.fov, camera.aspect);

      // glance-around (grid movement only): ease back to center once idle,
      // then turn the head by the offset around the eye
      const peek = peekRefRef.current?.current;
      let peekYaw = 0;
      if (peek && !freeTick) {
        if (!peek.held && now - peek.lastInputAt > PEEK_IDLE_MS) {
          peek.offset *= Math.exp(-dt / PEEK_RETURN_TAU);
          if (Math.abs(peek.offset) < 1e-3) peek.offset = 0;
        }
        peekYaw = peek.offset;
      }
      // rotating the facing clockwise (seen from above) by peekYaw
      const fx = fwdX / fwdLen;
      const fz = fwdZ / fwdLen;
      const cos = Math.cos(peekYaw);
      const sin = Math.sin(peekYaw);
      const lookX = fx * cos - fz * sin;
      const lookZ = fz * cos + fx * sin;
      // the eye pulled back from the cell center against where it looks -
      // peeking included, so a glance circles the center just as a turn
      // does, and a peek that becomes a turn doesn't move the eye
      const camX = cam.x - lookX * pullback;
      const camZ = cam.z - lookZ * pullback;

      // dev-only: the view's actual heading, for checking turn continuity
      if (import.meta.env.DEV) Object.assign(window, { __voidcrewViewYaw: Math.atan2(lookX, -lookZ) });

      // the crew down: the eye falls to the floor (faster and faster, a
      // little bounce) and the head rolls onto its side, looking up a bit
      const downAtMs = downAtRef.current;
      const down = downAtMs === null ? 0 : Math.min(1, (now - downAtMs) / DOWN_FALL_MS);
      const fall = down < 0.8 ? (down / 0.8) ** 2 : 1 - Math.sin(((down - 0.8) / 0.2) * Math.PI) * 0.08;
      const standY = cam.y * wallHeight + s.eyeHeight + bobY * (1 - down);
      const eyeY = standY + (cam.y * wallHeight + DOWN_EYE - standY) * fall;
      camera.position.set(camX, eyeY, camZ);

      // aiming: turn to the target and zoom - framing it while a part is
      // picked, at the weapon's zoom for the mini-game - easing in and out
      const focus = aimFocusRef.current;
      const aimWeapon = aimingRef.current;
      const focused = aimWeapon && focus?.target != null ? actorMeshes.get(focus.target) : undefined;
      if (focused && aimWeapon) {
        const actor = actorsRef.current.find((a) => a.id === focus!.target);
        aimLookAt.copy(focused.mesh.position);
        const dist = Math.max(0.3, aimLookAt.distanceTo(camera.position));
        const h = actor ? ACTOR_TYPES[actor.type].height * wallHeight : 0.8;
        const framing = THREE.MathUtils.radToDeg(2 * Math.atan((h * AIM_FRAMING) / 2 / dist));
        aimFovGoal =
          focus!.phase === "pick"
            ? Math.min(fov, Math.max(AIM_MIN_FOV, framing))
            : Math.max(AIM_MIN_FOV, zoomedFov(fov, aimWeapon.aimZoom ?? 1));
      }
      aimBlend += ((focused ? 1 : 0) - aimBlend) * (1 - Math.exp(-dt / AIM_CAMERA_TAU));
      aimFov += (aimFovGoal - aimFov) * (1 - Math.exp(-dt / AIM_CAMERA_TAU));
      if (!focused) aimFovGoal = fov;
      const viewFov = fov + (aimFov - fov) * aimBlend;
      if (Math.abs(camera.fov - viewFov) > 1e-3) {
        camera.fov = viewFov;
        camera.updateProjectionMatrix();
      }
      aimZoom = Math.tan(THREE.MathUtils.degToRad(fov) / 2) / Math.tan(THREE.MathUtils.degToRad(viewFov) / 2);
      // editing: the view looks up or down as dragged (the look target is a
      // unit ahead, so the lift is the pitch's tangent)
      if (peek && !editModeRef.current) peek.pitch = 0;
      const editPitchLift = peek && editModeRef.current ? Math.tan(peek.pitch) : 0;
      camera.lookAt(
        camX + lookX + (aimLookAt.x - camX - lookX) * aimBlend,
        eyeY + (aimLookAt.y - eyeY) * aimBlend + DOWN_LOOK_UP * fall + editPitchLift,
        camZ + lookZ + (aimLookAt.z - camZ - lookZ) * aimBlend,
      );
      camera.rotateZ(bobRoll * (1 - aimBlend) + DOWN_ROLL * fall);
      // the billboards (trees) face the eye, turning about the vertical only
      for (const b of billboardProps) b.rotation.y = Math.atan2(camera.position.x - b.position.x, camera.position.z - b.position.z);

      ambient.intensity = s.ambientIntensity;
      backingMat.visible = s.wallBacking || s.backingInspect;
      backingMat.color.setHex(s.backingInspect ? 0xffffff : 0x000000);
      if (backingMat.fog === s.backingInspect) {
        backingMat.fog = !s.backingInspect;
        backingMat.needsUpdate = true;
      }
      pointLight.intensity = s.headlamp ? s.pointLightIntensity * rideDip : 0;
      lightGrid.scale.value = s.bakedLights ? s.mapLightIntensity * rideDip : 0;
      const fogFar = effectiveViewDistance(s) - FOG_FAR_MARGIN;
      if (fog.far !== fogFar) {
        fog.far = fogFar;
        fog.near = fogNear(fogFar);
        camera.far = effectiveViewDistance(s) + 0.5;
        camera.updateProjectionMatrix();
      }
      if (s.fogColor !== fogColorNow) {
        fogColorNow = s.fogColor;
        fog.color.set(s.fogColor);
        fogBackground.set(s.fogColor);
      }
      const mapViewOn = s.geometryView === "normals" || s.geometryView === "depth";
      for (const kit of allKits()) {
        const tune = textureTuning(kit.id);
        for (const mat of kitMaterials(kit)) {
          const inspect = s.backingInspect && !kit.floor;
          if (!inspectMaterialDefaults.has(mat)) inspectMaterialDefaults.set(mat, { transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite });
          const original = inspectMaterialDefaults.get(mat)!;
          const transparent = inspect || original.transparent;
          if (mat.transparent !== transparent) {
            mat.transparent = transparent;
            mat.needsUpdate = true;
          }
          mat.opacity = inspect ? 0.25 : original.opacity;
          mat.depthWrite = inspect ? false : original.depthWrite;
          // (one with its own surface map keeps it; a set's own tuning
          // scales the viewer's values)
          if (!mat.userData.surface) {
            mat.roughness = Math.min(1, s.roughness * (tune?.rough ?? 1));
            mat.metalness = s.showMetal ? Math.min(1, s.metalness * (tune?.metal ?? 1)) : 0;
          } else {
            mat.metalness = s.showMetal ? 1 : 0;
          }
          mat.aoMapIntensity = s.showAO ? s.aoIntensity : 0;
        }
        const strength = kit.floor && s.floorNormalStrength > 0 ? s.floorNormalStrength : s.normalStrength;
        const normal = s.showNormals ? strength * (kit.normal ?? 1) * (tune?.normal ?? 1) : 0;
        kit.wallMat.normalScale.set(normal, normal);
        kit.litMat?.normalScale.set(normal, normal);
        if (kit.wallMat.userData.glow && !mapViewOn) kit.wallMat.emissiveIntensity = s.showGlow ? SURFACE_GLOW : 0;
      }
      for (const mat of ownMaterials) {
        const tune = mat.userData.tuneId ? textureTuning(mat.userData.tuneId as string) : undefined;
        mat.roughness = Math.min(1, s.roughness * (tune?.rough ?? 1));
        mat.metalness = s.showMetal ? Math.min(1, s.metalness * (tune?.metal ?? 1)) : 0;
        mat.aoMapIntensity = s.showAO ? s.aoIntensity : 0;
        const normal = s.showNormals ? s.normalStrength * (mat.userData.normal ?? 1) * (tune?.normal ?? 1) : 0;
        mat.normalScale.set(normal, normal);
      }
      cavity.value = s.aoDirect;
      // the deck's accent turned to the ship's livery (none: as painted)
      const deckAccent = latestMapRef.current.accent;
      const livery = s.shipAccent === "painted" ? null : s.shipAccent === "rolled" ? (shipAccentRef.current ?? null) : s.shipAccent;
      const turn = deckAccent && livery !== null ? (((livery - deckAccent.hue) % 360) + 360) % 360 : 0;
      ACCENT_UNIFORMS.uAccentShift.value = turn / 360;
      ACCENT_UNIFORMS.uAccentFrom.value = (deckAccent?.hue ?? 0) / 360;
      ACCENT_UNIFORMS.uAccentWidth.value = (deckAccent?.range ?? 30) / 360;
      ACCENT_UNIFORMS.uAccentMinSat.value = s.accentMinSat;
      // (a set with its own accent: from its own hue to the same livery)
      for (const own of ownAccents) {
        own.uniforms.uAccentShift.value = livery !== null ? (((livery - own.hue) % 360) + 360) % 360 / 360 : 0;
        own.uniforms.uAccentFrom.value = own.hue / 360;
        own.uniforms.uAccentWidth.value = own.range / 360;
        own.uniforms.uAccentMinSat.value = s.accentMinSat;
      }
      // the headlamp: just above the eyes, where they are - it used to circle
      // the camera (an early experiment), which read as a light wandering
      // about the walls; at the eye it also never slips behind a wall plane
      // (lighting the back of its front faces and only the step sides of
      // relief walls)
      const camCell = { x: Math.round(camX), y: Math.round(camZ) };
      const ceilingHere = cellAt(map, camCell.x, camCell.y) === "wall" ? eyeY + 0.5 : ceilingY(camCell.x, camCell.y);
      pointLight.position.set(
        camX,
        // above the eyes, but never through the ceiling
        Math.min(eyeY - bobY + 0.3, ceilingHere - 0.08),
        camZ,
      );
      updateActors(camX, camZ);
      updateLoot(camX, camZ, cam.y * wallHeight);
      const smokePhysics = { walls: s.smokeWalls, props: s.smokeProps, actors: s.smokeActors ? smokeBodies : null };
      // (with a lighter setting the particles are moved every 2nd or 3rd frame, by that many frames' time)
      particleFrame++;
      const every = Math.max(1, Math.round(s.particleEvery));
      if (every === 1 || particleFrame % every === 0) {
        const pdt = gameDt * every;
        smoke.update(pdt, camera, sight.cells, s.ambientIntensity, s.smokeStyle, smokePhysics);
        fire.update(pdt, camera, sight.cells, s.ambientIntensity, s.smokeStyle, smokePhysics);
        petals.update(pdt, t);
      }
      for (const marker of smokeMarkers.values()) marker.visible = editModeRef.current;
      // the exits' plates throb
      exitMat.opacity = 0.75 + 0.25 * Math.sin(gameNow / 420);
      updateTracers();
      camera.updateMatrixWorld();
      updateEditHighlight();
      updatePartyCover(camX, cam.y * wallHeight, camZ, s.eyeHeight);
      if (aimWeapon) updateAimFrame(aimWeapon, camX, camZ);
      else if (aimFrameRef.current) aimFrameRef.current = null;
      updateLightPool(
        { x: cam.x, z: cam.z },
        { x: camX, y: eyeY, z: camZ, fwdX: fwdX / fwdLen, fwdZ: fwdZ / fwdLen },
        s.mapLightIntensity * rideDip,
        dt,
      );
      cullFacing();
      // free-standing lights' bulbs: shown while editing (to pick them),
      // in the game only where the light asks for it
      for (const obj of fixtures) {
        if (obj.userData.bulb === "editor") obj.visible = editModeRef.current;
      }

      const liftDoor = ride ? liftDoorOf(map, { x: Math.round(cam.x), y: Math.round(cam.z) }) : undefined;
      if (ride && liftDoor) {
        const v = DIR_VECTOR[liftDoor.facing];
        const phase = (rideElapsed / SHAFT_LIGHT_PERIOD_MS) % 1;
        const offset = (ride.up ? 1 - 2 * phase : 2 * phase - 1) * SHAFT_LIGHT_SWEEP;
        shaftLight.position.set(liftDoor.cell.x + v.x * 0.3, eyeY + offset, liftDoor.cell.y + v.y * 0.3);
        shaftLight.intensity = SHAFT_LIGHT_INTENSITY * shake * (1 - Math.abs(offset) / SHAFT_LIGHT_SWEEP) ** 2;
      } else {
        shaftLight.intensity = 0;
      }

      // the layers the editor hides (only while editing)
      const hidden = editModeRef.current ? hiddenLayersRef.current : NO_LAYERS;
      if (hidden.size || hiddenApplied) {
        const smokeShown = !hidden.has("smoke");
        smoke.mesh.visible = smokeShown;
        fire.mesh.visible = smokeShown;
        petals.mesh.visible = smokeShown;
        const propsHidden = hidden.has("prop");
        for (const obj of propObjects.values()) obj.visible = !propsHidden;
        // (shown again: the culling pass decides afresh which are in sight)
        if (!propsHidden) culledCount = -1;
        decals.setVisible(!hidden.has("decal"));
        if (hidden.has("item")) {
          for (const item of looseItems.values()) item.obj.visible = false;
          for (const f of flyers) f.obj.visible = false;
        }
        if (hidden.has("robot")) {
          for (const entry of actorMeshes.values()) {
            entry.mesh.visible = false;
            entry.shadow.visible = false;
          }
        }
        hiddenApplied = hidden.size > 0;
      }
      applyMaterialViews(s);
      scene.overrideMaterial = geometryViewMaterial(s.geometryView);
      renderer.render(scene, camera);

      fpsFrames++;
      if (now - lastStatsAt > 500) {
        lastStatsAt = now;
        const elapsed = now - fpsSince;
        const fps = elapsed > 0 ? (fpsFrames * 1000) / elapsed : 0;
        fpsFrames = 0;
        fpsSince = now;
        onStatsRef.current?.({
          renderedTriangles: renderer.info.render.triangles,
          drawCalls: renderer.info.render.calls,
          visibleCells: sight.cells.size,
          fps,
          frameMs: fps > 0 ? 1000 / fps : 0,
          relief: reliefStats,
        });
      }

    }

    function animate() {
      if (disposed) return;
      renderFrame();
      raf = requestAnimationFrame(animate);
    }
    animate();

    // dev-only: render a frame on demand and return it as an image, for the
    // voidcrew.capture() console helper - works even when the browser has
    // paused requestAnimationFrame (hidden tab/pane)
    const snapshot = () => {
      // a hidden page lays the view out at ~0x0; render captures at a fixed
      // size then, and put the real size back afterwards
      const size = renderer.getSize(new THREE.Vector2());
      const tiny = size.x < 16 || size.y < 16;
      if (tiny) {
        renderer.setSize(800, 600, false);
        camera.aspect = 800 / 600;
        camera.updateProjectionMatrix();
      }
      renderFrame();
      const url = renderer.domElement.toDataURL("image/jpeg", 0.9);
      if (tiny) {
        renderer.setSize(size.x, size.y, false);
        camera.aspect = size.x / size.y;
        camera.updateProjectionMatrix();
      }
      return url;
    };
    // dev-only: render a frame on demand and report what it drew
    const renderInfo = () => {
      snapshot();
      return { ...renderer.info.render, cellsInSight: sight.cells.size, objects: group.children.length };
    };
    // dev-only: how long a frame takes (ms; the median of `frames`, each
    // waited out on the graphics card) at a given size, with the smoke drawn
    // and without - and how long moving its puffs takes alone
    const bench = (frames = 120, width = 1280, height = 720) => {
      const size = renderer.getSize(new THREE.Vector2());
      const ratio = renderer.getPixelRatio();
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      const run = (withSmoke: boolean) => {
        const times: number[] = [];
        smoke.mesh.visible = withSmoke;
        for (let i = 0; i < frames + 10; i++) {
          const start = performance.now();
          renderFrame();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          if (i >= 10) times.push(performance.now() - start);
        }
        smoke.mesh.visible = true;
        times.sort((a, b) => a - b);
        return times[times.length >> 1];
      };
      const withSmoke = run(true);
      const without = run(false);
      const again = run(true);
      const start = performance.now();
      for (let i = 0; i < 1000; i++) smoke.update(0, camera, sight.cells, 0.3);
      const update = (performance.now() - start) / 1000;
      const puffs = smoke.mesh.geometry instanceof THREE.InstancedBufferGeometry ? smoke.mesh.geometry.instanceCount : 0;
      renderer.setPixelRatio(ratio);
      renderer.setSize(size.x, size.y, false);
      if (size.x > 0 && size.y > 0) {
        camera.aspect = size.x / size.y;
        camera.updateProjectionMatrix();
      }
      return { withSmoke, without, again, update, puffs, calls: renderer.info.render.calls };
    };
    if (import.meta.env.DEV) {
      Object.assign(window, { __voidcrewSnapshot: snapshot, __voidcrewRenderInfo: renderInfo, __voidcrewScene: group, __voidcrewBench: bench });
    }

    return () => {
      disposed = true;
      if (applyLightsRef.current === applyChanges) applyLightsRef.current = null;
      const w = window as { __voidcrewSnapshot?: () => string };
      if (w.__voidcrewSnapshot === snapshot) delete w.__voidcrewSnapshot;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPress);
      window.removeEventListener("pointermove", onDragMove, true);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerup", onRelease);
      renderer.domElement.removeEventListener("pointermove", onHover);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      container.removeChild(renderer.domElement);
      for (const geo of geometries) geo.dispose();
      // (their textures and relief stay cached for the next build)
      for (const kit of allKits()) {
        kit.wallMat.dispose();
        kit.sideMat.dispose();
        kit.litMat?.dispose();
      }
      for (const mat of ownMaterials) mat.dispose();
      if (propWiresRef.current === refreshPropWires) propWiresRef.current = null;
      for (const prop of propObjects.values()) prop.getObjectByName("propEditWires")?.traverse((o) => (o as THREE.LineSegments).geometry?.dispose());
      for (const mat of Object.values(wireMats)) mat.dispose();
      for (const id of [...actorMeshes.keys()]) removeActorMesh(id);
      for (const { line } of tracers) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
      for (const mat of actorMaterials.values()) mat.dispose();
      for (const tex of glowMaps.values()) tex?.dispose();
      floorMat.dispose();
      spaceMat.dispose();
      sheenMat.dispose();
      wiredGlass.dispose();
      paintMat.dispose();
      hazardMat.dispose();
      bridgeMat.dispose();
      ceilMat.dispose();
      for (const mat of fixtureMats.values()) mat.dispose();
      (selectBox.material as THREE.Material).dispose();
      decals.dispose();
      disposeLightGrid(lightGrid);
      exitMat.map?.dispose();
      exitMat.dispose();
      scene.remove(smoke.mesh, fire.mesh, petals.mesh);
      petals.dispose();
      smoke.dispose();
      fire.dispose();
      smokeMarkerMat.dispose();
      smokeBlowMat.dispose();
      backingMat.dispose();
      for (const mat of billboardMaterials) mat.dispose();
      skyMat?.uniforms.map.value.dispose();
      skyMat?.dispose();
      // the renderer stays for the next build (see SceneCache)
      renderer.renderLists.dispose();
    };
  }, [
    sceneMap,
    settings.textureSet,
    settings.accentTextureSet,
    settings.accentRatio,
    settings.floorTextureSet,
    settings.ceilingTextureSet,
    settings.decalsEnabled,
    settings.wallProfile,
    settings.wallHeight,
    settings.bevelFraction,
    settings.bevelAngleDeg,
    settings.displacementScale,
    settings.reliefDepth,
    settings.reliefLevels,
    settings.reliefMinIsland,
    settings.reliefMode,
    settings.wallDetail,
    settings.lodScale,
    settings.pixelRatioCap,
    settings.antialias,
    settings.lightPool,
    settings.normalMaps,
    settings.particleQuality,
    settings.floorReliefDepth,
    settings.skyLightIntensity,
    settings.skyLightAzimuth,
    settings.skyLightElevation,
    settings.skyLightColor,
    settings.aoRadius,
    textureVersion,
  ]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      <LoadingScreen loading={loading} inLift={!!ride} title={WORLDS[map.world].loop === "ship" ? "USV HORIZON" : WORLDS[map.world].name.toUpperCase()} />
    </div>
  );
}

// Shown over the view while a map's scene loads: the deck's name and a
// progress bar, fading out once it's all built.
function LoadingScreen({ loading, inLift, title }: { loading: { title: string; progress: number } | null; inLift: boolean; title: string }) {
  // keep the last title while fading out
  const [shown, setShown] = useState(loading);
  useEffect(() => {
    if (loading) setShown(loading);
  }, [loading]);
  return (
    <div
      className={`absolute inset-0 bg-black flex flex-col items-center justify-center gap-3 font-mono transition-opacity duration-500 ${loading ? "opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      <div className="text-[10px] tracking-[0.3em] text-green-700">{inLift ? "LIFT IN TRANSIT" : title}</div>
      <div className="text-sm tracking-[0.2em] text-green-400 uppercase">{shown?.title}</div>
      <div className="w-48 h-1 bg-green-950 overflow-hidden">
        <div className="h-full bg-green-500 transition-[width] duration-200" style={{ width: `${Math.round((shown?.progress ?? 1) * 100)}%` }} />
      </div>
    </div>
  );
}
