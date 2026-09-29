import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import { prepareRaycasts } from "../render/bvh";
import { bridgeAt, cellAt, ceilingHeight, doorAt, floorHeight, ladderBetween, liftDoorOf, windowPanels } from "../game/map";
import { BRIDGE_THICKNESS, BRIDGE_WIDTH, CLIMB_MS_PER_HEIGHT, MAX_STEP } from "../game/heights";
import { rightOf } from "../game/movement";
import { DIR_VECTOR } from "../game/movement";
import type { Direction, DoorSpec, GameMap, Vec2 } from "../game/types";
import { createReliefWallGeometry, downsampleHeightGrid, loadHeightGrid } from "../render/reliefMesh";
import { generateLights, lampColor } from "../game/lights";
import type { LightSpec } from "../game/lights";
import { PROP_TYPES, propPlacement } from "../game/props";
import { ACTOR_TYPES, BODY_PARTS, critAt } from "../game/actors";
import { actorOffsets } from "../render/actorOffsets";
import type { ActorState, BodyPart } from "../game/actors";
import { gameClock } from "../game/clock";
import { weaponAccuracy } from "../game/combat";
import type { ShotResult, Weapon } from "../game/combat";
import { cellKey, visibleCells } from "../game/visibility";
import type { PropType } from "../game/props";
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

export type { TextureSetId };
export type WallProfileId = "flat" | "convex" | "concave" | "relief";
// debug: draw every surface with its textures, or just its polygons -
// flat-shaded faces colored by their direction, or a wireframe
export type GeometryViewId = "textured" | "faces" | "wireframe";

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
  geometryView: GeometryViewId;
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
  // how far (cells) the view reaches: the fog, the lights and what's drawn
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
  mapLightIntensity: number;
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
  // null unless the relief wall type is active and built
  relief: ReliefStats | null;
}

export const DEFAULT_SETTINGS: ViewportSettings = {
  textureSet: "wall4",
  accentTextureSet: "wall5",
  accentRatio: 0.35,
  floorTextureSet: "map",
  ceilingTextureSet: "ceiling1",
  gridMovement: true,
  decalsEnabled: true,
  wallProfile: "relief",
  geometryView: "textured",
  aimMiniGame: true,
  immortalCrew: false,
  noclip: false,
  enemyScanner: false,
  headlamp: false,
  viewDistance: 7,
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
  mapLightIntensity: 1.6,
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
// a source behind the camera ranks as if this much further away
const LIGHT_BEHIND_PENALTY = 0.35;
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
// a surface's pixels across one panel (as decals count them - see decals.ts)
const SURFACE_PIXELS = 256;
// an actor's glowing pixels (see glowMapOf): at least this red, no more
// than this green or blue
const GLOW_MIN_RED = 150;
const GLOW_MAX_OTHER = 90;
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
  // the tool the editor has picked: what the highlight says a click does
  editTool?: EditTool;
  onEdit?: (target: EditTarget, alt: boolean, shift: boolean) => void;
  // the Light tool's selected light (its index in the map's lights)
  selectedLight?: number | null;
  // the Prop tool's selected prop (its index in the map's props)
  selectedProp?: number | null;
  // the Decal tool's selected decal (its index in the map's decals)
  selectedDecal?: number | null;
  // the surface under the pointer whenever it changes - the editor's
  // texture palette follows it
  onEditHover?: (target: EditTarget | null) => void;
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
  if (view === "textured") return null;
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
  aimFrameRef: aimFrameRefProp,
  aimFocusRef: aimFocusRefProp,
  partyCoverRef,
  onTouch,
  editMode,
  editTool,
  onEdit,
  onEditHover,
  selectedLight,
  selectedProp,
  selectedDecal,
  onReady,
  freeTick,
  peekRef,
  settings,
  onStats,
}: GameViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // kept from one build of the scene to the next (see SceneCache)
  const cacheRef = useRef<SceneCache>({
    renderer: null,
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
  const editModeRef = useRef(!!editMode);
  editModeRef.current = !!editMode;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const selectedLightRef = useRef(selectedLight ?? null);
  selectedLightRef.current = selectedLight ?? null;
  const selectedPropRef = useRef(selectedProp ?? null);
  selectedPropRef.current = selectedProp ?? null;
  const selectedDecalRef = useRef(selectedDecal ?? null);
  selectedDecalRef.current = selectedDecal ?? null;
  const editToolRef = useRef(editTool ?? "dig");
  editToolRef.current = editTool ?? "dig";
  const onEditHoverRef = useRef(onEditHover);
  onEditHoverRef.current = onEditHover;
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
      doorAnimsRef.current.set(key, { panel, from: panel.position.clone(), start: performance.now() });
    }
  }, [openDoors]);

  // The map the scene is built from. A new version of it that differs only
  // in its lights (the editor's Light tool) keeps the scene: its lighting is
  // redone in place (applyLights) instead of rebuilding every wall.
  const sceneMapRef = useRef(map);
  if (sceneMapRef.current.id !== map.id || !map.structureKey || sceneMapRef.current.structureKey !== map.structureKey) {
    sceneMapRef.current = map;
  }
  const sceneMap = sceneMapRef.current;
  const applyLightsRef = useRef<((next: GameMap) => void) | null>(null);
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
    const fog = new THREE.Fog(0x000000, FOG_NEAR, settings.viewDistance - FOG_FAR_MARGIN);
    scene.fog = fog;

    // anything past the fog's end renders pure black anyway, so the far plane
    // sits just beyond it and frustum culling skips those walls entirely
    // (a big saving with relief walls' thousands of triangles each)
    const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, settings.viewDistance + 0.5);

    const cache = cacheRef.current;
    const renderer = cache.renderer ?? (cache.renderer = new THREE.WebGLRenderer({ antialias: true }));
    // phones (touch screens) render at most 1.5 device pixels per CSS pixel:
    // their 3x screens cost 4x the pixels of 1.5x, for no pixel-art detail
    const maxPixelRatio = window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
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
    function createWallKit(setId: string, displace = true): WallKit {
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
      const wallMat = new THREE.MeshStandardMaterial({
        map: diffuse,
        normalMap,
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

      let litMat: THREE.MeshStandardMaterial | undefined;
      if (paths.emissive) {
        const emissiveMap = kitTexture(paths.emissive + bust);
        if (paths.pixelArt) emissiveMap.magFilter = THREE.NearestFilter;
        textures.push(emissiveMap);
        litMat = new THREE.MeshStandardMaterial({
          map: diffuse,
          normalMap,
          roughness: settings.roughness,
          metalness: settings.metalness,
          emissive: lampColor(map),
          emissiveMap,
          emissiveIntensity: LIGHT_PANEL_INTENSITY,
        });
        addDirectLightOcclusion(litMat, cavity);
      }

      return { depthUrl: paths.depth + bust, grateLevels: paths.grateLevels, wallMat, sideMat, litMat, textures, slots: [] };
    }

    // most walls use the main texture set; a stable, position-based share of
    // them gets the accent set for variety
    // (a deck with its own wall set uses just that - its look is uniform)
    const deckWall = isTextureSetId(map.textures?.wall) ? map.textures.wall : undefined;
    const primarySet = deckWall ?? settings.textureSet;
    const primaryKit = createWallKit(primarySet);
    const accentKit =
      !deckWall &&
      settings.accentTextureSet !== "none" &&
      settings.accentTextureSet !== settings.textureSet &&
      settings.accentRatio > 0
        ? createWallKit(settings.accentTextureSet)
        : null;
    // wall kits by texture set: the default mix plus any the map asks for
    // (map.wallTextureAt), created on demand
    const wallKits = new Map<TextureSetId, WallKit>([[primarySet, primaryKit]]);
    if (accentKit) wallKits.set(settings.accentTextureSet as TextureSetId, accentKit);
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
    let mapLights = generateLights(map);
    const ceilingLightCells = (lights: LightSpec[]) =>
      new Set(lights.filter((l) => l.kind === "ceiling").map((l) => `${Math.round(l.x)},${Math.round(l.z)}`));
    let litCells = ceilingLightCells(mapLights);
    // the color of each lit cell's ceiling lamp
    const ceilingLightColors = (lights: LightSpec[]) =>
      new Map(lights.filter((l) => l.kind === "ceiling").map((l) => [`${Math.round(l.x)},${Math.round(l.z)}`, l.color]));
    let litColors = ceilingLightColors(mapLights);
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
    const propKitFor = (setId: string) => {
      let kit = propKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId, false);
        propKits.set(setId, kit);
      }
      return kit;
    };
    // a prop type's texture sets: a box's side and top, its views, or a
    // cutout's one
    const propSets = (type: PropType): string[] =>
      type.kind === "box"
        ? [type.side, type.top]
        : type.kind === "views"
          ? ["front", "side", "top"].map((v) => `${type.views}_${v}`)
          : type.kind === "cabin"
            ? [type.door, type.inside, `${type.views}_side`, `${type.views}_top`]
            : [type.texture];
    const propTypes = [...new Set((map.props ?? []).map((p) => p.prop))];
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
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 1 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 1 });

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
      parent: group,
    });
    if (settings.decalsEnabled) track(decals.add(map.decals ?? []));
    // dev-only: inspect from the console
    if (import.meta.env.DEV) Object.assign(window, { __voidcrewDecals: decals });

    let reliefStats: ReliefStats | null = null;

    // A surface: its mesh - or, given a distant low-detail geometry (see
    // LOD_FACTOR), a level-of-detail pair that switches to it past
    // LOD_DISTANCE - placed like the slot; decals go on the detailed one.
    function placeSurface(
      slot: WallSlot,
      geo: THREE.BufferGeometry,
      farGeo: THREE.BufferGeometry | null,
      mat: THREE.Material | THREE.Material[],
      orient: (obj: THREE.Object3D) => void,
    ) {
      const mesh = new THREE.Mesh(geo, mat);
      let obj: THREE.Object3D = mesh;
      if (farGeo) {
        const lod = new THREE.LOD();
        lod.addLevel(mesh, 0);
        lod.addLevel(new THREE.Mesh(farGeo, mat), LOD_DISTANCE);
        obj = lod;
      }
      obj.position.set(slot.x, slot.y, slot.z);
      orient(obj);
      group.add(obj);
      obj.updateMatrixWorld(true);
      decals.registerSurface(slot.key, mesh);
      return obj;
    }

    function placeWalls(
      geo: THREE.BufferGeometry,
      farGeo: THREE.BufferGeometry | null,
      mat: THREE.Material | THREE.Material[],
      slots: WallSlot[],
    ) {
      for (const slot of slots) placeSurface(slot, geo, farGeo, mat, (o) => (o.rotation.y = slot.rotY));
    }

    // wall-style geometry (facing +Z) laid flat, facing up
    function placeFloors(
      geo: THREE.BufferGeometry,
      farGeo: THREE.BufferGeometry | null,
      mat: THREE.Material | THREE.Material[],
      slots: WallSlot[],
    ) {
      for (const slot of slots) placeSurface(slot, geo, farGeo, mat, (o) => (o.rotation.x = -Math.PI / 2));
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
        byColor.set(color, mat);
        ownMaterials.push(mat);
      }
      return mat;
    };
    const ceilingMaterial = (kit: WallKit, relief: boolean, lit: boolean, color?: number) => {
      const front = (lit && litMatIn(kit, color)) || kit.wallMat;
      return relief ? [front, kit.sideMat] : front;
    };
    function placeCeilings(geo: THREE.BufferGeometry, farGeo: THREE.BufferGeometry | null, kit: WallKit, relief: boolean) {
      for (const slot of kit.slots) {
        const color = litColors.get(`${slot.x},${slot.z}`);
        const obj = placeSurface(slot, geo, farGeo, ceilingMaterial(kit, relief, !!slot.lit, color), (o) => (o.rotation.x = Math.PI / 2));
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

        const ceilingKit = ceilingKitAt(x, y);
        if (ceilingKit) {
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
          const kit = isTextureSetId(wallOverride)
            ? wallKitFor(wallOverride)
            : accentKit && wallVariantRoll(face.x, face.z) < settings.accentRatio
              ? accentKit
              : primaryKit;
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
      },
    ) {
      // built once for the same depth map, shape and relief settings (see
      // SceneCache)
      const key = [
        kit.depthUrl,
        JSON.stringify(shape),
        settings.reliefDepth,
        settings.reliefLevels,
        settings.reliefMinIsland,
        settings.aoRadius,
      ].join("|");
      let built = cache.reliefs.get(key);
      if (!built) {
        built = (async () => {
          let gridPromise = cache.grids.get(kit.depthUrl);
          if (!gridPromise) {
            gridPromise = loadWithRetry(kit.depthUrl, 4);
            cache.grids.set(kit.depthUrl, gridPromise);
          }
          let grid = await gridPromise;
          if (shape.coarse && shape.coarse > 1) {
            const coarseKey = `${kit.depthUrl}|${shape.coarse}`;
            let coarse = coarseGrids.get(coarseKey);
            if (!coarse) {
              coarse = downsampleHeightGrid(grid, shape.coarse);
              coarseGrids.set(coarseKey, coarse);
            }
            grid = coarse;
          }
          const made = createReliefWallGeometry(grid, {
            wallWidth: shape.width ?? 1,
            wallHeight: shape.height,
            depth: shape.depth ?? settings.reliefDepth,
            levels: settings.reliefLevels,
            minIsland: settings.reliefMinIsland,
            aoRadius: settings.aoRadius,
            flushEdges: shape.flushEdges,
            holeBackZ: shape.holeBackZ,
            rows: shape.rows,
            cols: shape.cols,
            holeLevels: shape.holeLevels,
          });
          // a partial panel or a far version uses its full panel's AO map
          if (shape.rows || shape.lodOnly) made.aoMap.dispose();
          return made;
        })();
        cache.reliefs.set(key, built);
        built.catch(() => cache.reliefs.delete(key));
      }
      const relief = await built;
      if (disposed || !relief) return null;
      if (shape.rows || shape.lodOnly) return relief;
      for (const mat of kitMaterials(kit)) {
        mat.aoMap = relief.aoMap;
        mat.aoMapIntensity = settingsRef.current.aoIntensity;
        mat.needsUpdate = true;
      }
      return relief;
    }

    // a kit's wall panel geometry per variant, built once
    const wallGeometries = new Map<WallKit, Map<PanelVariant, Promise<THREE.BufferGeometry | null>>>();
    function wallGeometry(kit: WallKit, variant: PanelVariant): Promise<THREE.BufferGeometry | null> {
      let byVariant = wallGeometries.get(kit);
      if (!byVariant) {
        byVariant = new Map();
        wallGeometries.set(kit, byVariant);
      }
      let geo = byVariant.get(variant);
      if (!geo) {
        const rows = variantRows(variant);
        const height = variantHeight(variant) * wallHeight;
        if (wallGeo) {
          // flat/beveled walls: partial panels are flat bands
          const band = rows ? createBandPlane(height, rows) : wallGeo;
          if (rows) geometries.push(band);
          geo = Promise.resolve(band);
        } else if (!rows) {
          geo = buildRelief(kit, { height, flushEdges: true }).then((relief) => {
            if (!relief) return null;
            if (kit === primaryKit) {
              reliefStats = { trianglesPerWall: relief.triangles, levelCount: relief.levelCount, baked: relief.baked };
            }
            return relief.geometry;
          });
        } else {
          // after the whole panel, whose AO map the band borrows
          geo = wallGeometry(kit, "full")
            .then((full) => (full ? buildRelief(kit, { height, flushEdges: true, rows }) : null))
            .then((relief) => relief?.geometry ?? null);
        }
        byVariant.set(variant, geo);
      }
      return geo;
    }
    // ... and its distant, low-detail relief (none for flat walls)
    const farWallGeometries = new Map<WallKit, Map<PanelVariant, Promise<THREE.BufferGeometry | null>>>();
    function farWallGeometry(kit: WallKit, variant: PanelVariant): Promise<THREE.BufferGeometry | null> {
      if (wallGeo) return Promise.resolve(null);
      let byVariant = farWallGeometries.get(kit);
      if (!byVariant) {
        byVariant = new Map();
        farWallGeometries.set(kit, byVariant);
      }
      let geo = byVariant.get(variant);
      if (!geo) {
        const rows = variantRows(variant);
        const height = variantHeight(variant) * wallHeight;
        geo = buildRelief(kit, { height, flushEdges: true, rows, coarse: LOD_FACTOR, lodOnly: true }).then((relief) => relief?.geometry ?? null);
        byVariant.set(variant, geo);
      }
      return geo;
    }

    for (const kit of kits) {
      const byVariant = new Map<PanelVariant, WallSlot[]>();
      for (const slot of kit.slots) {
        const variant = slot.variant ?? "full";
        byVariant.set(variant, [...(byVariant.get(variant) ?? []), slot]);
      }
      for (const [variant, slots] of byVariant) {
        track(Promise.all([wallGeometry(kit, variant), wallGeometry(kit, variant).then(() => farWallGeometry(kit, variant))]))
          .then(([geo, far]) => geo && placeWalls(geo, far, wallGeo ? kit.wallMat : [kit.wallMat, kit.sideMat], slots))
          .catch((err) => console.error("Wall build failed:", err));
      }
    }

    // every kit, for per-frame material updates and disposal
    const allKits = [
      ...kits,
      ...floorKits.values(),
      frameKit,
      ...panelKits.values(),
      ...ceilingKits.values(),
      ...windowKits.values(),
      ...propKits.values(),
    ];

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
            relief && (await buildRelief(ceilingKit, { height: 1, flushEdges: false, coarse: LOD_FACTOR, lodOnly: true })),
          ] as const),
        )
          .then(([relief, far]) => relief && placeCeilings(relief.geometry, far?.geometry ?? null, ceilingKit, true))
          .catch((err) => console.error("Relief ceiling build failed:", err));
      } else {
        placeCeilings(floorGeo, null, ceilingKit, false);
      }
    }

    let floorTop = 0;
    for (const floorKit of floorKits.values()) {
      if (isRelief) {
        track(
          buildRelief(floorKit, { height: 1, flushEdges: false }).then(async (relief) => [
            relief,
            relief && (await buildRelief(floorKit, { height: 1, flushEdges: false, coarse: LOD_FACTOR, lodOnly: true })),
          ] as const),
        )
          .then(([relief, far]) => {
            if (!relief) return;
            placeFloors(relief.geometry, far?.geometry ?? null, [floorKit.wallMat, floorKit.sideMat], floorKit.slots);
            // keep the strips above the highest floor relief
            floorTop = Math.max(floorTop, relief.maxZ);
            for (const strip of floorStrips) strip.position.y = strip.userData.floorY + floorTop + 0.003;
          })
          .catch((err) => console.error("Relief floor build failed:", err));
      } else {
        placeFloors(floorGeo, null, floorKit.wallMat, floorKit.slots);
      }
    }

    // Doors are always relief (a frame needs its cut-out opening), whatever
    // the wall type. The frame is built first: the panel is sized to fit its
    // opening.
    if (doorCells.length) {
      track(async () => {
        const frame = await buildRelief(frameKit, {
          height: wallHeight,
          flushEdges: false,
          // the opening's jambs reach back to the center plane, where they
          // meet the other half's
          holeBackZ: -DOOR_FRAME_HALF_DEPTH,
        });
        if (!frame) return;
        const hole = frame.holeBounds ?? { minX: -0.35, maxX: 0.35, minY: -wallHeight / 2, maxY: wallHeight * 0.3 };
        const panelWidth = hole.maxX - hole.minX + 2 * DOOR_PANEL_OVERLAP;
        // from the floor up behind the frame's header
        const panelHeight = wallHeight / 2 + hole.maxY + DOOR_PANEL_OVERLAP;
        const panelCenterX = (hole.minX + hole.maxX) / 2;
        // one panel geometry per door kind (each kit has its own depth map)
        const panelGeos = new Map<DoorSpec["kind"], THREE.BufferGeometry>();
        for (const [kind, kit] of panelKits) {
          const panel = await buildRelief(kit, { width: panelWidth, height: panelHeight, flushEdges: false });
          if (!panel) return;
          panelGeos.set(kind, panel.geometry);
        }

        for (const cell of doorCells) {
          const { spec } = cell;
          const door = new THREE.Group();
          door.position.set(cell.x, floorY(cell.x, cell.z), cell.z);
          // local +Z = the side the door faces
          door.rotation.y = FACING_ROTATION[spec.facing];

          // two halves back to back, each facing out of one side
          for (const side of [1, -1]) {
            const frameHalf = new THREE.Mesh(frame.geometry, [frameKit.wallMat, frameKit.sideMat]);
            frameHalf.position.set(0, wallHeight / 2, side * DOOR_FRAME_HALF_DEPTH);
            frameHalf.rotation.y = side === 1 ? 0 : Math.PI;
            door.add(frameHalf);
          }

          const kit = panelKits.get(spec.kind)!;
          const front = spec.label || spec.kind === "lift" ? await labeledPanelMaterial(spec, kit) : kit.wallMat;
          if (disposed) return;
          const slider = new THREE.Group();
          for (const side of [1, -1]) {
            const panelHalf = new THREE.Mesh(panelGeos.get(spec.kind)!, [front, kit.sideMat]);
            panelHalf.position.set(panelCenterX, panelHeight / 2, side * DOOR_PANEL_HALF_DEPTH);
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

    async function buildPropTemplate(type: PropType): Promise<THREE.Group | null> {
      const [length, height, depth] = type.size;
      const relief = settings.reliefDepth * PROP_RELIEF_SCALE * (type.relief ?? 1);
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
      for (const { min, max } of type.parts) {
        const [x0, y0, z0] = min;
        const [x1, y1, z1] = max;
        const cx = (x0 + x1) / 2;
        const cy = ((y0 + y1) / 2) * wallHeight + lift;
        const cz = (z0 + z1) / 2;
        const h = (y1 - y0) * wallHeight;
        const frontRows: [number, number] = [(frontY - y1) / frontY, (frontY - y0) / frontY];
        const sideRows: [number, number] = [(sideY - y1) / sideY, (sideY - y0) / sideY];
        const alongX: [number, number] = [(x0 + length / 2) / length, (x1 + length / 2) / length];
        // the side view runs from the front (+z) on its left to the back
        const alongZ: [number, number] = [(sideZ0 + sideZ - z1) / sideZ, (sideZ0 + sideZ - z0) / sideZ];
        const topCols: [number, number] = [(x0 + topX / 2) / topX, (x1 + topX / 2) / topX];
        const topRows: [number, number] = [(z0 - topZ0) / topZ, (z1 - topZ0) / topZ];
        const f = await cut(front, x1 - x0, h, alongX, frontRows);
        const s = await cut(side, z1 - z0, h, alongZ, sideRows);
        const t = await cut(top, x1 - x0, z1 - z0, topCols, topRows);
        if (!f || !s || !t) return null;
        // the back and the -x end show their views mirrored
        face(f.geometry, front, [cx, cy, z1], [0, 0]);
        face(f.geometry, front, [cx, cy, z0], [0, Math.PI], true);
        face(s.geometry, side, [x1, cy, cz], [0, Math.PI / 2]);
        face(s.geometry, side, [x0, cy, cz], [0, -Math.PI / 2], true);
        // a top hidden under a part above it would show that part's top
        // view (a table's foot wearing its top's wood): left out
        const covered = type.parts.some(
          (o) => o.min[1] >= y1 && o.min[0] <= x0 && o.max[0] >= x1 && o.min[2] <= z0 && o.max[2] >= z1,
        );
        if (!covered) face(t.geometry, top, [cx, y1 * wallHeight + lift, cz], [-Math.PI / 2, 0]);
      }
      return template;
    }

    // the props placed, by index in the map's props (the editor's selection)
    const propObjects = new Map<number, THREE.Object3D>();
    for (const name of propTypes) {
      track(async () => {
        const template = await buildPropTemplate(PROP_TYPES[name]);
        if (!template) return;
        (map.props ?? []).forEach((spec, index) => {
          if (spec.prop !== name) return;
          const { x, z, yaw } = propPlacement(spec);
          const prop = template.clone();
          prop.position.set(x, floorY(spec.cell.x, spec.cell.y) + (spec.elevation ?? 0) * wallHeight, z);
          prop.rotation.y = -yaw;
          prop.userData.prop = true;
          // the editor picks it by this (its index in the map's props)
          prop.userData.propIndex = index;
          propObjects.set(index, prop);
          group.add(prop);
        });
      }).catch((err) => console.error("Prop build failed:", err));
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
    function trimBox(w: number, h: number, d: number): THREE.BoxGeometry {
      const key = `${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)}`;
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
          uv.setXY(i, uv.getX(i) * su * TRIM_TEXELS, uv.getY(i) * sv * TRIM_TEXELS);
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
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.6 });
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
        const kick = new THREE.Mesh(trimBox(1, BRIDGE_KICK, LADDER_RAIL), hazardMat);
        kick.position.set(0, BRIDGE_KICK / 2 - 0.01, side * (BRIDGE_WIDTH / 2));
        bridgeGroup.add(kick);
      }
      group.add(bridgeGroup);

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
        ? buildRelief(kit, { height: BRIDGE_WIDTH, flushEdges: false, rows, holeLevels: grate }).then(
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

    const lightPool = Array.from({ length: LIGHT_POOL_SIZE }, () => {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      scene.add(light);
      // the map light it serves (index into mapLights), and how faded in
      return { light, source: -1, level: 0 };
    });
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
    // dev: __voidcrewNoCull = true in the console draws everything, to compare
    let cullingOff = false;
    function applySight(changed: boolean) {
      const off = import.meta.env.DEV && !!(window as { __voidcrewNoCull?: boolean }).__voidcrewNoCull;
      // (objects are still being added while the scene builds)
      if (!changed && group.children.length === culledCount && off === cullingOff) return;
      culledCount = group.children.length;
      cullingOff = off;
      for (const obj of group.children) {
        if (obj.userData.actor) continue;
        const key = cellOf(obj);
        obj.visible = off || key === null || sight.cells.has(key);
      }
    }
    let lightCells = mapLights.map((l) => cellKey(Math.round(l.x), Math.round(l.z)));
    // bumped whenever objects are swapped in place (see objectsAlong)
    let sceneVersion = 0;

    // The editor changed only the deck's lights: the ceiling tiles' glowing
    // panels, the fixtures and the light pool follow, the rest stays built.
    // A pool slot keeps its light if the new set still has it.
    function applyLights(next: GameMap) {
      const old = mapLights;
      sceneVersion++;
      mapLights = generateLights(next);
      litCells = ceilingLightCells(mapLights);
      litColors = ceilingLightColors(mapLights);
      lightCells = mapLights.map((l) => cellKey(Math.round(l.x), Math.round(l.z)));
      for (const tile of ceilingTiles) {
        const material = ceilingMaterial(tile.kit, tile.relief, litCells.has(tile.cell), litColors.get(tile.cell));
        tile.obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material;
        });
      }
      placeFixtures();
      // the new fixtures get culled with the rest on the next frame
      culledCount = -1;
      for (const slot of lightPool) {
        if (slot.source < 0) continue;
        const was = old[slot.source];
        slot.source = mapLights.findIndex((l) => l.kind === was.kind && l.x === was.x && l.y === was.y && l.z === was.z);
        if (slot.source < 0) slot.level = 0;
      }
    }
    applyLightsRef.current = applyLights;
    const litNear = (key: string, cells: Set<string>) => {
      if (cells.has(key)) return true;
      const [x, y] = key.split(",").map(Number);
      return cells.has(cellKey(x + 1, y)) || cells.has(cellKey(x - 1, y)) || cells.has(cellKey(x, y + 1)) || cells.has(cellKey(x, y - 1));
    };

    function updateLightPool(
      party: { x: number; z: number },
      cam: { x: number; y: number; z: number; fwdX: number; fwdZ: number },
      intensityScale: number,
      dt: number,
    ) {
      const range = settingsRef.current.viewDistance;
      const fadeEnd = range;
      const fadeStart = range - LIGHT_FADE_SPAN;
      applySight(updateSight(party, range));

      const score = (i: number) => {
        const l = mapLights[i];
        const dx = l.x - cam.x;
        const dz = l.z - cam.z;
        const dist = Math.hypot(dx, l.y * wallHeight - cam.y, dz);
        const ahead = (dx * cam.fwdX + dz * cam.fwdZ) / (Math.hypot(dx, dz) || 1);
        const rank = dist + LIGHT_BEHIND_PENALTY * Math.max(0, -ahead) * dist;
        return { dist, rank };
      };
      const current = new Set(lightPool.map((slot) => slot.source));
      const ranked = mapLights
        .map((_, i) => ({ i, ...score(i) }))
        .filter((c) => c.dist < fadeEnd && litNear(lightCells[c.i], sight.cells))
        .map((c) => ({ ...c, rank: current.has(c.i) ? c.rank * LIGHT_KEEP_BIAS : c.rank }))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, LIGHT_POOL_SIZE);
      const wanted = new Map(ranked.map((c) => [c.i, c]));

      // slots keep their source while it's wanted; freed slots fade out
      // before taking a new one
      const unassigned = ranked.filter((c) => !lightPool.some((slot) => slot.source === c.i));
      for (const slot of lightPool) {
        const keep = wanted.get(slot.source);
        if (!keep && slot.level <= 0 && unassigned.length) {
          slot.source = unassigned.shift()!.i;
        }
        const target = wanted.get(slot.source);
        slot.level = Math.min(1, Math.max(0, slot.level + (target ? 1 : -1) * LIGHT_SLOT_FADE * dt));
        if (slot.source < 0) {
          slot.light.intensity = 0;
          continue;
        }
        const l = mapLights[slot.source];
        const dist = target?.dist ?? score(slot.source).dist;
        slot.light.color.setHex(l.color);
        slot.light.position.set(l.x, l.y * wallHeight, l.z);
        slot.light.distance = l.range;
        slot.light.intensity = l.intensity * intensityScale * slot.level * (1 - smoothstep(fadeStart, fadeEnd, dist));
      }
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
      mesh: THREE.Mesh;
      material: THREE.MeshStandardMaterial;
      // the part highlight's uniforms (see highlightMaterial)
      highlight: PartHighlight;
      uvKey: string;
      col: number;
      row: number;
      mirror: boolean;
    }
    const actorMeshes = new Map<number, ActorEntry>();
    // Each actor type's glow map (see ActorType.glow): its sheet's bright
    // red pixels within the glowing weak spots of each cell, in their own
    // color, black elsewhere. Made once its sheet has loaded.
    const glowMaps = new Map<string, THREE.Texture | null>();
    const glowMapOf = (typeName: string): THREE.Texture | null => {
      if (glowMaps.has(typeName)) return glowMaps.get(typeName)!;
      const type = ACTOR_TYPES[typeName];
      const image = actorMaterial(typeName).map?.image as HTMLImageElement | undefined;
      if (!type.glow || !image?.width) return null;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const src = ctx.getImageData(0, 0, image.width, image.height);
      const out = ctx.createImageData(image.width, image.height);
      const cw = image.width / type.cols;
      const ch = image.height / type.rows;
      const glowing = type.crits.filter((c) => type.glow!.crits.includes(c.label));
      for (let row = 0; row < type.rows; row++) {
        for (let col = 0; col < type.cols; col++) {
          for (const crit of glowing) {
            for (const [x0, y0, x1, y1] of crit.zones[col] ?? []) {
              // a little past the zone: its glow's edge
              const px0 = Math.max(0, Math.floor((col + x0 - 0.02) * cw));
              const px1 = Math.min(image.width, Math.ceil((col + x1 + 0.02) * cw));
              const py0 = Math.max(0, Math.floor((row + y0 - 0.02) * ch));
              const py1 = Math.min(image.height, Math.ceil((row + y1 + 0.02) * ch));
              for (let y = py0; y < py1; y++) {
                for (let x = px0; x < px1; x++) {
                  const i = (y * image.width + x) * 4;
                  const [r, g, b, a] = [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
                  if (a < 128 || r < GLOW_MIN_RED || Math.max(g, b) > GLOW_MAX_OTHER) continue;
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
        actorMaterials.set(typeName, mat);
      }
      return mat;
    };
    for (const name of new Set((map.actors ?? []).map((a) => a.actor))) actorMaterial(name);

    function removeActorMesh(id: number) {
      const entry = actorMeshes.get(id);
      if (!entry) return;
      group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.material.dispose();
      actorMeshes.delete(id);
    }

    function updateActors(camX: number, camZ: number) {
      const now = gameClock.now();
      const current = actorsRef.current;
      for (const id of [...actorMeshes.keys()]) {
        if (!current.some((a) => a.id === id)) removeActorMesh(id);
      }
      for (const actor of current) {
        const type = ACTOR_TYPES[actor.type];
        const h = type.height * wallHeight;
        let entry = actorMeshes.get(actor.id);
        if (!entry) {
          const material = actorMaterial(actor.type).clone();
          const highlight = highlightMaterial(material);
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * type.cellAspect, h), material);
          mesh.userData.actor = true;
          mesh.userData.actorId = actor.id;
          entry = { mesh, material, highlight, uvKey: "", col: 0, row: 0, mirror: false };
          actorMeshes.set(actor.id, entry);
          group.add(mesh);
        }
        const t = Math.min(1, Math.max(0, (now - actor.moveStart) / actor.moveMs));
        const x = lerp(actor.from.x, actor.cell.x, t);
        const z = lerp(actor.from.y, actor.cell.y, t);
        const y = lerp(floorY(actor.from.x, actor.from.y), floorY(actor.cell.x, actor.cell.y), t);
        const mesh = entry.mesh;
        const dead = actor.diedAt !== null ? (now - actor.diedAt) / ACTOR_FADE_MS : 0;
        mesh.visible =
          dead < 1 &&
          (sight.cells.has(cellKey(actor.cell.x, actor.cell.y)) || sight.cells.has(cellKey(actor.from.x, actor.from.y)));
        // hit: a red flash; dead: it fades out
        const flash = Math.max(0, 1 - (now - actor.hitAt) / ACTOR_FLASH_MS);
        entry.material.emissive.setRGB(flash * 0.9, flash * 0.12, flash * 0.05);
        entry.material.transparent = dead > 0;
        entry.material.opacity = 1 - Math.min(1, dead);
        const yaw = Math.atan2(camX - x, camZ - z);
        mesh.rotation.y = yaw;

        // the angle it's seen from: 0 in front, + round to its left
        const f = DIR_VECTOR[actor.facing];
        const cx = camX - x;
        const cz = camZ - z;
        const angle = Math.atan2(cx * f.y - cz * f.x, cx * f.x + cz * f.y);
        const col = Math.min(type.cols - 1, Math.round(Math.abs(angle) / (Math.PI / 4)));
        const mirror = angle < 0 && col > 0 && col < type.cols - 1;
        const row = t < 1 ? type.walkRows[Math.floor(t * type.walkRows.length) % type.walkRows.length] : type.idleRow;
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
        mesh.position.set(x + Math.cos(yaw) * shift, y + h / 2 - dy * px, z - Math.sin(yaw) * shift);

        const uvKey = `${col},${row},${mirror}`;
        if (uvKey === entry.uvKey) continue;
        entry.uvKey = uvKey;
        let u0 = col / type.cols;
        let u1 = (col + 1) / type.cols;
        if (mirror) [u0, u1] = [u1, u0];
        const v0 = 1 - (row + 1) / type.rows;
        const v1 = 1 - row / type.rows;
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
      const geo = new THREE.BufferGeometry().setFromPoints([from, to.clone()]);
      const mat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      tracers.push({ line, born: performance.now() });
    }
    function updateTracers() {
      for (let i = tracers.length - 1; i >= 0; i--) {
        const { line, born } = tracers[i];
        const k = (performance.now() - born) / TRACER_MS;
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
    const onPress = (e: PointerEvent) => {
      press = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
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
      if (touched) onTouchRef.current?.(touched.object.userData.action);
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
    function editTargetAt(ndc: THREE.Vector2): EditTarget | null {
      editRaycaster.setFromCamera(ndc, camera);
      const lightTool = editToolRef.current === "light";
      const hits = editRaycaster
        .intersectObjects(group.children, true)
        .filter(
          (h) =>
            h.face &&
            h.object.userData.actorId === undefined &&
            (lightTool || h.object.userData.mapLight === undefined) &&
            drawnChain(h.object) &&
            !seeThrough(h.object),
        );
      const hit = hits[0];
      if (!hit?.face) return null;
      // the Decal tool: a decal lies on its surface - it counts if it's as
      // near as the nearest hit
      const decalHit =
        editToolRef.current === "decal"
          ? hits.find((h) => h.object.userData.decalIndex !== undefined && h.distance <= hit.distance + 0.02)
          : undefined;
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
      return { kind: surface, cell, spot, decal: decalIndexOf(decalHit), surfacePoint: surfacePointAt(cell, surface, p) };
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
    function updateSelectionBox() {
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
      let mode: "wall" | "plate" | "bulb" | "prop" | "decal" | null = null;
      let color = EDIT_FILL_COLOR;
      if (target) {
        if (tool === "texture") {
          mode = target.kind === "wall" ? "wall" : "plate";
          color = EDIT_PAINT_COLOR;
        } else if (tool === "decal") {
          mode = target.decal !== undefined ? "decal" : null;
          color = EDIT_LIGHT_ADD_COLOR;
        } else if (tool === "prop" && target.prop !== undefined) {
          mode = "prop";
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
      if (mode === "decal") {
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

    // aiming camera (see renderFrame): how far it's turned to the target
    // (0..1), where it looks, and its field of view there
    let aimBlend = 0;
    const aimLookAt = new THREE.Vector3();
    let aimFov = verticalFov(settings.fov, camera.aspect);
    let aimFovGoal = aimFov;
    let aimZoom = 1;

    function renderFrame() {
      const s = settingsRef.current;
      const now = performance.now();
      const t = (now - startedAt) / 1000;
      // capped so a stall (tab switch, breakpoint) doesn't teleport the
      // free-moving player through a wall
      const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
      lastFrameAt = now;

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
        const p = Math.min(1, (now - anim.start) / DOOR_OPEN_MS);
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

      const eyeY = cam.y * wallHeight + s.eyeHeight + bobY;
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
      camera.lookAt(
        camX + lookX + (aimLookAt.x - camX - lookX) * aimBlend,
        eyeY + (aimLookAt.y - eyeY) * aimBlend,
        camZ + lookZ + (aimLookAt.z - camZ - lookZ) * aimBlend,
      );
      camera.rotateZ(bobRoll * (1 - aimBlend));

      ambient.intensity = s.ambientIntensity;
      pointLight.intensity = s.headlamp ? s.pointLightIntensity * rideDip : 0;
      const fogFar = s.viewDistance - FOG_FAR_MARGIN;
      if (fog.far !== fogFar) {
        fog.far = fogFar;
        camera.far = s.viewDistance + 0.5;
        camera.updateProjectionMatrix();
      }
      for (const kit of allKits) {
        for (const mat of kitMaterials(kit)) {
          mat.roughness = s.roughness;
          mat.metalness = s.metalness;
          mat.aoMapIntensity = s.aoIntensity;
        }
        kit.wallMat.normalScale.set(s.normalStrength, s.normalStrength);
        kit.litMat?.normalScale.set(s.normalStrength, s.normalStrength);
      }
      for (const mat of ownMaterials) {
        mat.roughness = s.roughness;
        mat.metalness = s.metalness;
        mat.aoMapIntensity = s.aoIntensity;
        mat.normalScale.set(s.normalStrength, s.normalStrength);
      }
      cavity.value = s.aoDirect;
      // a headlamp-like light orbiting the camera; the small radius keeps it
      // well inside the side walls of the current cell - a light that slips
      // behind a wall plane lights the back of its front faces and only the
      // step sides of relief walls
      const camCell = { x: Math.round(camX), y: Math.round(camZ) };
      const ceilingHere = cellAt(map, camCell.x, camCell.y) === "wall" ? eyeY + 0.5 : ceilingY(camCell.x, camCell.y);
      pointLight.position.set(
        camX + Math.cos(t * 0.5) * 0.15,
        // above the eyes, but never through the ceiling
        Math.min(eyeY - bobY + 0.3, ceilingHere - 0.08),
        camZ + Math.sin(t * 0.5) * 0.15,
      );
      updateActors(camX, camZ);
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

      scene.overrideMaterial = geometryViewMaterial(s.geometryView);
      renderer.render(scene, camera);

      if (now - lastStatsAt > 500) {
        lastStatsAt = now;
        onStatsRef.current?.({
          renderedTriangles: renderer.info.render.triangles,
          drawCalls: renderer.info.render.calls,
          visibleCells: sight.cells.size,
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
    if (import.meta.env.DEV) Object.assign(window, { __voidcrewSnapshot: snapshot, __voidcrewRenderInfo: renderInfo, __voidcrewScene: group });

    return () => {
      disposed = true;
      if (applyLightsRef.current === applyLights) applyLightsRef.current = null;
      const w = window as { __voidcrewSnapshot?: () => string };
      if (w.__voidcrewSnapshot === snapshot) delete w.__voidcrewSnapshot;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPress);
      window.removeEventListener("pointerup", onRelease);
      renderer.domElement.removeEventListener("pointermove", onHover);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      container.removeChild(renderer.domElement);
      for (const geo of geometries) geo.dispose();
      // (their textures and relief stay cached for the next build)
      for (const kit of allKits) {
        kit.wallMat.dispose();
        kit.sideMat.dispose();
        kit.litMat?.dispose();
      }
      for (const mat of ownMaterials) mat.dispose();
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
    settings.aoRadius,
    textureVersion,
  ]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      <LoadingScreen loading={loading} inLift={!!ride} />
    </div>
  );
}

// Shown over the view while a map's scene loads: the deck's name and a
// progress bar, fading out once it's all built.
function LoadingScreen({ loading, inLift }: { loading: { title: string; progress: number } | null; inLift: boolean }) {
  // keep the last title while fading out
  const [shown, setShown] = useState(loading);
  useEffect(() => {
    if (loading) setShown(loading);
  }, [loading]);
  return (
    <div
      className={`absolute inset-0 bg-black flex flex-col items-center justify-center gap-3 font-mono transition-opacity duration-500 ${loading ? "opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      <div className="text-[10px] tracking-[0.3em] text-green-700">{inLift ? "LIFT IN TRANSIT" : "USV HORIZON"}</div>
      <div className="text-sm tracking-[0.2em] text-green-400 uppercase">{shown?.title}</div>
      <div className="w-48 h-1 bg-green-950 overflow-hidden">
        <div className="h-full bg-green-500 transition-[width] duration-200" style={{ width: `${Math.round((shown?.progress ?? 1) * 100)}%` }} />
      </div>
    </div>
  );
}