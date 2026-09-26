import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import { bridgeAt, cellAt, ceilingHeight, doorAt, floorHeight, ladderBetween, liftDoorOf, windowPanels } from "../game/map";
import { BRIDGE_THICKNESS, BRIDGE_WIDTH, CLIMB_MS_PER_HEIGHT, MAX_STEP } from "../game/heights";
import { rightOf } from "../game/movement";
import { DIR_VECTOR } from "../game/movement";
import type { Direction, DoorSpec, GameMap, Vec2 } from "../game/types";
import { createReliefWallGeometry, loadHeightGrid } from "../render/reliefMesh";
import { generateLights } from "../game/lights";
import { PROP_TYPES, propPlacement } from "../game/props";
import type { PropType } from "../game/props";
import { doorCellKey } from "../game/useGameState";
import { forwardOf } from "../game/freeMovement";
import type { FreePose } from "../game/freeMovement";
import type { PeekState } from "./useViewControls";
import type { LiftRide } from "../game/useGameState";
import { WALL_ROTATION, surfaceKey } from "../render/surfaces";
import { DecalLibrary } from "../render/decals";
import { WIRE_TILE, createWiredGlass, getStarfield } from "../render/space";
import { renderText, seededRandom } from "../render/pixelFont";

export type TextureSetId =
  | "wall1"
  | "wall2"
  | "wall3"
  | "wall4"
  | "wall5"
  | "floor1"
  | "floor2"
  | "door1"
  | "doorframe1"
  | "liftdoor1"
  | "ceiling1"
  | "window1"
  | "window1_left"
  | "window1_mid"
  | "window1_right"
  | "medwindow1"
  | "medwindow1_left"
  | "medwindow1_mid"
  | "medwindow1_right"
  | "crate1"
  | "crate1_top"
  | "medbed1_front"
  | "medbed1_side"
  | "medbed1_top"
  | "lift1"
  | "liftceil1"
  | "medwall1"
  | "medfloor1"
  | "medceil1"
  | "meddoor1"
  | "medliftdoor1"
  | "meddoorframe1";
export type WallProfileId = "flat" | "convex" | "concave" | "relief";

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

export interface ViewportStats {
  // triangles actually drawn last frame (after frustum culling)
  renderedTriangles: number;
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

interface TextureSetPaths {
  diffuse: string;
  normal: string;
  depth: string;
  pixelArt: boolean;
  // mask of the parts that glow when lit (a ceiling light panel)
  emissive?: string;
  // a grate floor: its lowest this many height levels are the slots, cut
  // open where it's a bridge deck (see through it)
  grateLevels?: number;
}

const TEXTURE_SETS: Record<TextureSetId, TextureSetPaths> = {
  // import.meta.env.BASE_URL matches Vite's `base` config (e.g. "/voidcrew/"
  // on GitHub Pages) - a hardcoded "/textures/..." would 404 there since the
  // app isn't served from the domain root.
  wall1: {
    diffuse: `${import.meta.env.BASE_URL}textures/wall1/diffuse.jpeg`,
    normal: `${import.meta.env.BASE_URL}textures/wall1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall1/depth.png`,
    pixelArt: false,
  },
  wall2: {
    diffuse: `${import.meta.env.BASE_URL}textures/wall2/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall2/normal.png`,
    // wall2 has no real depth map from the Sprite Lamp pass - flat/neutral
    // fallback so displacement is just a no-op instead of erroring.
    depth: `${import.meta.env.BASE_URL}textures/wall2/depth.png`,
    pixelArt: true,
  },
  wall3: {
    diffuse: `${import.meta.env.BASE_URL}textures/wall3/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall3/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall3/depth.png`,
    pixelArt: true,
  },
  // Gemini 1254px diffuse + depth run through scripts/process-texture.ts
  // (256px, 32 colors, baked height levels, normal derived from depth)
  wall4: {
    diffuse: `${import.meta.env.BASE_URL}textures/wall4/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall4/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall4/depth.png`,
    pixelArt: true,
  },
  wall5: {
    diffuse: `${import.meta.env.BASE_URL}textures/wall5/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/wall5/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/wall5/depth.png`,
    pixelArt: true,
  },
  // one floor tile per cell: a grate with recessed slots
  floor1: {
    diffuse: `${import.meta.env.BASE_URL}textures/floor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/floor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/floor1/depth.png`,
    pixelArt: true,
    grateLevels: 2,
  },
  // diamond plate with a raised frame
  floor2: {
    diffuse: `${import.meta.env.BASE_URL}textures/floor2/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/floor2/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/floor2/depth.png`,
    pixelArt: true,
  },
  // sliding door panel
  door1: {
    diffuse: `${import.meta.env.BASE_URL}textures/door1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/door1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/door1/depth.png`,
    pixelArt: true,
  },
  // door frame; its opening is transparent in both diffuse and depth
  doorframe1: {
    diffuse: `${import.meta.env.BASE_URL}textures/doorframe1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/doorframe1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/doorframe1/depth.png`,
    pixelArt: true,
  },
  // lift door panel: slides sideways; a blank field on its left takes a label
  liftdoor1: {
    diffuse: `${import.meta.env.BASE_URL}textures/liftdoor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/liftdoor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/liftdoor1/depth.png`,
    pixelArt: true,
  },
  // lift cabin wall: two plain plates
  lift1: {
    diffuse: `${import.meta.env.BASE_URL}textures/lift1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/lift1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/lift1/depth.png`,
    pixelArt: true,
  },
  // lift cabin ceiling: two light strips that glow (emissive)
  liftceil1: {
    diffuse: `${import.meta.env.BASE_URL}textures/liftceil1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/liftceil1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/liftceil1/depth.png`,
    emissive: `${import.meta.env.BASE_URL}textures/liftceil1/emissive.png`,
    pixelArt: true,
  },
  // the medical deck (generated from concept/medical_concept.png): sterile
  // light grey plates with medical-green accents
  medwall1: {
    diffuse: `${import.meta.env.BASE_URL}textures/medwall1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medwall1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medwall1/depth.png`,
    pixelArt: true,
  },
  medfloor1: {
    diffuse: `${import.meta.env.BASE_URL}textures/medfloor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medfloor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medfloor1/depth.png`,
    pixelArt: true,
  },
  medceil1: {
    diffuse: `${import.meta.env.BASE_URL}textures/medceil1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medceil1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medceil1/depth.png`,
    emissive: `${import.meta.env.BASE_URL}textures/medceil1/emissive.png`,
    pixelArt: true,
  },
  meddoor1: {
    diffuse: `${import.meta.env.BASE_URL}textures/meddoor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/meddoor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/meddoor1/depth.png`,
    pixelArt: true,
  },
  // door frame: its opening is transparent
  meddoorframe1: {
    diffuse: `${import.meta.env.BASE_URL}textures/meddoorframe1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/meddoorframe1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/meddoorframe1/depth.png`,
    pixelArt: true,
  },
  medliftdoor1: {
    diffuse: `${import.meta.env.BASE_URL}textures/medliftdoor1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medliftdoor1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medliftdoor1/depth.png`,
    pixelArt: true,
  },
  // wall panel with a window frame; its opening is transparent
  window1: {
    diffuse: `${import.meta.env.BASE_URL}textures/window1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/window1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/window1/depth.png`,
    pixelArt: true,
  },
  // the pieces of a wider window (scripts/make-window-strip.ts): its ends
  // and a middle that repeats, split by mullions on the seams
  window1_left: {
    diffuse: `${import.meta.env.BASE_URL}textures/window1_left/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/window1_left/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/window1_left/depth.png`,
    pixelArt: true,
  },
  window1_mid: {
    diffuse: `${import.meta.env.BASE_URL}textures/window1_mid/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/window1_mid/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/window1_mid/depth.png`,
    pixelArt: true,
  },
  window1_right: {
    diffuse: `${import.meta.env.BASE_URL}textures/window1_right/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/window1_right/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/window1_right/depth.png`,
    pixelArt: true,
  },
  medwindow1: {
    diffuse: `${import.meta.env.BASE_URL}textures/medwindow1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medwindow1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medwindow1/depth.png`,
    pixelArt: true,
  },
  medwindow1_left: {
    diffuse: `${import.meta.env.BASE_URL}textures/medwindow1_left/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medwindow1_left/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medwindow1_left/depth.png`,
    pixelArt: true,
  },
  medwindow1_mid: {
    diffuse: `${import.meta.env.BASE_URL}textures/medwindow1_mid/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medwindow1_mid/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medwindow1_mid/depth.png`,
    pixelArt: true,
  },
  medwindow1_right: {
    diffuse: `${import.meta.env.BASE_URL}textures/medwindow1_right/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medwindow1_right/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medwindow1_right/depth.png`,
    pixelArt: true,
  },
  // a prop crate's sides and top (see src/game/props.ts)
  crate1: {
    diffuse: `${import.meta.env.BASE_URL}textures/crate1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/crate1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/crate1/depth.png`,
    pixelArt: true,
  },
  crate1_top: {
    diffuse: `${import.meta.env.BASE_URL}textures/crate1_top/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/crate1_top/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/crate1_top/depth.png`,
    pixelArt: true,
  },
  // a prop's orthographic views (see src/game/props.ts)
  medbed1_front: {
    diffuse: `${import.meta.env.BASE_URL}textures/medbed1_front/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medbed1_front/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medbed1_front/depth.png`,
    pixelArt: true,
  },
  medbed1_side: {
    diffuse: `${import.meta.env.BASE_URL}textures/medbed1_side/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medbed1_side/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medbed1_side/depth.png`,
    pixelArt: true,
  },
  medbed1_top: {
    diffuse: `${import.meta.env.BASE_URL}textures/medbed1_top/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/medbed1_top/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/medbed1_top/depth.png`,
    pixelArt: true,
  },
  // ceiling tile; its center panel glows in cells with a ceiling light
  ceiling1: {
    diffuse: `${import.meta.env.BASE_URL}textures/ceiling1/diffuse.png`,
    normal: `${import.meta.env.BASE_URL}textures/ceiling1/normal.png`,
    depth: `${import.meta.env.BASE_URL}textures/ceiling1/depth.png`,
    emissive: `${import.meta.env.BASE_URL}textures/ceiling1/emissive.png`,
    pixelArt: true,
  },
};

// warm white of a lit ceiling panel (matches the ceiling light color)
const LIGHT_PANEL_COLOR = 0xfff4e0;
const LIGHT_PANEL_INTENSITY = 1.6;

// floor used where the map doesn't specify one
const DEFAULT_FLOOR: TextureSetId = "floor1";

function isTextureSetId(id: string | undefined): id is TextureSetId {
  return id !== undefined && id in TEXTURE_SETS;
}

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
const FOG_FAR = 5.5;

// Map lights are served by a fixed pool of point lights reassigned to the
// nearest sources every frame: three.js compiles the light count into its
// shaders, so a constant pool avoids recompiles, and the per-pixel lighting
// cost stays bounded however many lights the map has. Lights fade out with
// distance so a source dropping out of the pool doesn't pop visibly.
const LIGHT_POOL_SIZE = 6;
const LIGHT_FADE_START = 3.5;
const LIGHT_FADE_END = 5;

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
  // an interactive decal (DecalSpec.action) was clicked or tapped within
  // reach
  onTouch?: (action: string) => void;
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
  onTouch,
  onReady,
  freeTick,
  peekRef,
  settings,
  onStats,
}: GameViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let raf = 0;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, FOG_NEAR, FOG_FAR);

    // anything past the fog's end renders pure black anyway, so the far plane
    // sits just beyond it and frustum culling skips those walls entirely
    // (a big saving with relief walls' thousands of triangles each)
    const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, FOG_FAR + 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    function createWallKit(setId: TextureSetId, displace = true): WallKit {
      const paths = TEXTURE_SETS[setId];
      const diffuse = loader.load(paths.diffuse + bust);
      const normalMap = loader.load(paths.normal + bust);
      const depthMap = loader.load(paths.depth + bust);
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
        const emissiveMap = loader.load(paths.emissive + bust);
        if (paths.pixelArt) emissiveMap.magFilter = THREE.NearestFilter;
        textures.push(emissiveMap);
        litMat = new THREE.MeshStandardMaterial({
          map: diffuse,
          normalMap,
          roughness: settings.roughness,
          metalness: settings.metalness,
          emissive: LIGHT_PANEL_COLOR,
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
    const mapLights = generateLights(map);
    const litCells = new Set(
      mapLights.filter((l) => l.kind === "ceiling").map((l) => `${Math.round(l.x)},${Math.round(l.z)}`),
    );

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
    const propKits = new Map<TextureSetId, WallKit>();
    const propKitFor = (setId: TextureSetId) => {
      let kit = propKits.get(setId);
      if (!kit) {
        kit = createWallKit(setId, false);
        propKits.set(setId, kit);
      }
      return kit;
    };
    // a prop type's texture sets: a box's side and top, or its views
    const propSets = (type: PropType): string[] =>
      type.kind === "box" ? [type.side, type.top] : ["front", "side", "top"].map((v) => `${type.views}_${v}`);
    const propTypes = [...new Set((map.props ?? []).map((p) => p.prop))].filter((name) =>
      propSets(PROP_TYPES[name]).every(isTextureSetId),
    );
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
      wallHeight,
      levels: (cell) => ({ floor: floorY(cell.x, cell.y), ceiling: ceilingY(cell.x, cell.y) }),
      parent: group,
    });
    if (settings.decalsEnabled) track(decals.add(map.decals ?? []));
    // dev-only: inspect from the console
    if (import.meta.env.DEV) Object.assign(window, { __voidcrewDecals: decals });

    let reliefStats: ReliefStats | null = null;

    function placeWalls(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], slots: WallSlot[]) {
      for (const slot of slots) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(slot.x, slot.y, slot.z);
        mesh.rotation.y = slot.rotY;
        group.add(mesh);
        decals.registerSurface(slot.key, mesh);
      }
    }

    // wall-style geometry (facing +Z) laid flat, facing up
    function placeFloors(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], slots: WallSlot[]) {
      for (const slot of slots) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(slot.x, slot.y, slot.z);
        group.add(mesh);
        decals.registerSurface(slot.key, mesh);
      }
    }

    // ... and turned to face down from the ceiling; lit slots get the kit's
    // glowing front material
    function placeCeilings(geo: THREE.BufferGeometry, kit: WallKit, relief: boolean) {
      for (const slot of kit.slots) {
        const front = slot.lit && kit.litMat ? kit.litMat : kit.wallMat;
        const mesh = new THREE.Mesh(geo, relief ? [front, kit.sideMat] : front);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(slot.x, slot.y, slot.z);
        group.add(mesh);
        decals.registerSurface(slot.key, mesh);
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
    const heightGrids = new Map<string, ReturnType<typeof loadWithRetry>>();

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
      },
    ) {
      let gridPromise = heightGrids.get(kit.depthUrl);
      if (!gridPromise) {
        gridPromise = loadWithRetry(kit.depthUrl, 4);
        heightGrids.set(kit.depthUrl, gridPromise);
      }
      const grid = await gridPromise;
      if (disposed) return null;
      const relief = createReliefWallGeometry(grid, {
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
      geometries.push(relief.geometry);
      if (shape.rows) {
        relief.aoMap.dispose();
        return relief;
      }
      kit.textures.push(relief.aoMap);
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

    for (const kit of kits) {
      const byVariant = new Map<PanelVariant, WallSlot[]>();
      for (const slot of kit.slots) {
        const variant = slot.variant ?? "full";
        byVariant.set(variant, [...(byVariant.get(variant) ?? []), slot]);
      }
      for (const [variant, slots] of byVariant) {
        track(wallGeometry(kit, variant))
          .then((geo) => geo && placeWalls(geo, wallGeo ? kit.wallMat : [kit.wallMat, kit.sideMat], slots))
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
        track(buildRelief(ceilingKit, { height: 1, flushEdges: false }))
          .then((relief) => relief && placeCeilings(relief.geometry, ceilingKit, true))
          .catch((err) => console.error("Relief ceiling build failed:", err));
      } else {
        placeCeilings(floorGeo, ceilingKit, false);
      }
    }

    let floorTop = 0;
    for (const floorKit of floorKits.values()) {
      if (isRelief) {
        track(buildRelief(floorKit, { height: 1, flushEdges: false }))
          .then((relief) => {
            if (!relief) return;
            placeFloors(relief.geometry, [floorKit.wallMat, floorKit.sideMat], floorKit.slots);
            // keep the strips above the highest floor relief
            floorTop = Math.max(floorTop, relief.maxZ);
            for (const strip of floorStrips) strip.position.y = strip.userData.floorY + floorTop + 0.003;
          })
          .catch((err) => console.error("Relief floor build failed:", err));
      } else {
        placeFloors(floorGeo, floorKit.wallMat, floorKit.slots);
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
    async function buildPropTemplate(type: PropType): Promise<THREE.Group | null> {
      const [length, height, depth] = type.size;
      const relief = settings.reliefDepth * PROP_RELIEF_SCALE;
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
        const sideKit = propKitFor(type.side as TextureSetId);
        const topKit = propKitFor(type.top as TextureSetId);
        const h = height * wallHeight;
        const side = await buildRelief(sideKit, { width: length, height: h, flushEdges: false, depth: relief });
        const top = await buildRelief(topKit, { width: length, height: depth, flushEdges: false, depth: relief });
        if (!side || !top) return null;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          face(side.geometry, sideKit, [(Math.sin(a) * length) / 2, h / 2, (Math.cos(a) * depth) / 2], [0, a]);
        }
        face(top.geometry, topKit, [0, h, 0], [-Math.PI / 2, 0]);
        return template;
      }

      const [front, side, top] = propSets(type).map((id) => propKitFor(id as TextureSetId));
      // the whole views first: their builds give the kits their AO maps
      for (const [kit, w, h] of [
        [front, length, height * wallHeight],
        [side, depth, height * wallHeight],
        [top, length, depth],
      ] as const) {
        if (!(await buildRelief(kit, { width: w, height: h, flushEdges: false, depth: relief }))) return null;
      }
      const cut = (kit: WallKit, w: number, h: number, cols: [number, number], rows: [number, number]) =>
        buildRelief(kit, { width: w, height: h, flushEdges: false, depth: relief, cols, rows });
      for (const { min, max } of type.parts) {
        const [x0, y0, z0] = min;
        const [x1, y1, z1] = max;
        const cx = (x0 + x1) / 2;
        const cy = ((y0 + y1) / 2) * wallHeight;
        const cz = (z0 + z1) / 2;
        const h = (y1 - y0) * wallHeight;
        const rows: [number, number] = [(height - y1) / height, (height - y0) / height];
        const alongX: [number, number] = [(x0 + length / 2) / length, (x1 + length / 2) / length];
        const alongZ: [number, number] = [(depth / 2 - z1) / depth, (depth / 2 - z0) / depth];
        const fromTop: [number, number] = [(z0 + depth / 2) / depth, (z1 + depth / 2) / depth];
        const f = await cut(front, x1 - x0, h, alongX, rows);
        const s = await cut(side, z1 - z0, h, alongZ, rows);
        const t = await cut(top, x1 - x0, z1 - z0, alongX, fromTop);
        if (!f || !s || !t) return null;
        // the back and the -x end show their views mirrored
        face(f.geometry, front, [cx, cy, z1], [0, 0]);
        face(f.geometry, front, [cx, cy, z0], [0, Math.PI], true);
        face(s.geometry, side, [x1, cy, cz], [0, Math.PI / 2]);
        face(s.geometry, side, [x0, cy, cz], [0, -Math.PI / 2], true);
        face(t.geometry, top, [cx, y1 * wallHeight, cz], [-Math.PI / 2, 0]);
      }
      return template;
    }

    for (const name of propTypes) {
      track(async () => {
        const template = await buildPropTemplate(PROP_TYPES[name]);
        if (!template) return;
        for (const spec of map.props ?? []) {
          if (spec.prop !== name) continue;
          const { x, z, yaw } = propPlacement(spec);
          const prop = template.clone();
          prop.position.set(x, floorY(spec.cell.x, spec.cell.y), z);
          prop.rotation.y = -yaw;
          group.add(prop);
        }
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
      const tex = loader.load(url + bust, (t) => {
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

    for (const light of mapLights) {
      if (light.kind === "ceiling") {
        // a textured ceiling brings its own glowing light panel
        if (ceilingKitAt(Math.round(light.x), Math.round(light.z))?.litMat) continue;
        const panel = new THREE.Mesh(ceilingFixtureGeo, fixtureMat(light.color));
        panel.rotation.x = Math.PI / 2;
        panel.position.set(light.x, ceilingY(Math.round(light.x), Math.round(light.z)) - 0.002, light.z);
        group.add(panel);
      } else if (light.kind === "floorGlow" && light.wall) {
        // a thin strip on the floor along the foot of the wall
        const v = DIR_VECTOR[light.wall];
        const strip = new THREE.Mesh(floorFixtureGeo, fixtureMat(light.color));
        strip.rotation.set(-Math.PI / 2, 0, v.x !== 0 ? Math.PI / 2 : 0);
        strip.userData.floorY = floorY(Math.round(light.x), Math.round(light.z));
        strip.position.set(light.x + v.x * 0.1, strip.userData.floorY + floorTop + 0.003, light.z + v.y * 0.1);
        group.add(strip);
        floorStrips.push(strip);
      }
      // wall glows have no fixture - the light itself reads as a lit patch
    }

    const lightPool = Array.from({ length: LIGHT_POOL_SIZE }, () => {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      scene.add(light);
      return light;
    });

    function updateLightPool(camX: number, camY: number, camZ: number, intensityScale: number) {
      const ranked = mapLights
        .map((light) => ({ light, dist: Math.hypot(light.x - camX, light.y * wallHeight - camY, light.z - camZ) }))
        .sort((a, b) => a.dist - b.dist);
      lightPool.forEach((slot, i) => {
        const entry = ranked[i];
        if (!entry) {
          slot.intensity = 0;
          return;
        }
        slot.color.setHex(entry.light.color);
        slot.position.set(entry.light.x, entry.light.y * wallHeight, entry.light.z);
        slot.distance = entry.light.range;
        slot.intensity =
          entry.light.intensity * intensityScale * (1 - smoothstep(LIGHT_FADE_START, LIGHT_FADE_END, entry.dist));
      });
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
    const onRelease = (e: PointerEvent) => {
      const p = press;
      press = null;
      if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8 || performance.now() - p.at > 500) return;
      const rect = renderer.domElement.getBoundingClientRect();
      // pointer-locked (free mouselook): aim with the screen's center
      const ndc = document.pointerLockElement
        ? new THREE.Vector2(0, 0)
        : new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(group.children, true);
      if (!hits.length) return;
      // a decal lies on its wall: count it if it's as near as the nearest hit
      const touched = hits.find((h) => h.object.userData.action && h.distance <= hits[0].distance + 0.02);
      if (touched) onTouchRef.current?.(touched.object.userData.action);
    };
    renderer.domElement.addEventListener("pointerdown", onPress);
    window.addEventListener("pointerup", onRelease);

    const startedAt = performance.now();
    let lastFrameAt = startedAt;
    let lastStatsAt = 0;

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
      const bobY = (s.bobEnabled ? Math.sin((t * 2 * Math.PI) / 3.2) * 0.035 : 0) + shakeY;
      const bobRoll = (s.bobEnabled ? Math.cos((t * 2 * Math.PI) / 1.6) * 0.015 : 0) + shake * Math.sin(t * 29) * 0.004;

      const fwdX = cam.tx - cam.x;
      const fwdZ = cam.tz - cam.z;
      const fwdLen = Math.hypot(fwdX, fwdZ) || 1;
      const camX = cam.x - (fwdX / fwdLen) * pullback;
      const camZ = cam.z - (fwdZ / fwdLen) * pullback;

      const fov = verticalFov(s.fov, camera.aspect);
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }

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

      // dev-only: the view's actual heading, for checking turn continuity
      if (import.meta.env.DEV) Object.assign(window, { __voidcrewViewYaw: Math.atan2(lookX, -lookZ) });

      const eyeY = cam.y * wallHeight + s.eyeHeight + bobY;
      camera.position.set(camX, eyeY, camZ);
      camera.lookAt(camX + lookX, eyeY, camZ + lookZ);
      camera.rotateZ(bobRoll);

      ambient.intensity = s.ambientIntensity;
      pointLight.intensity = s.pointLightIntensity * rideDip;
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
      updateLightPool(camX, eyeY, camZ, s.mapLightIntensity * rideDip);

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

      renderer.render(scene, camera);

      if (now - lastStatsAt > 500) {
        lastStatsAt = now;
        onStatsRef.current?.({
          renderedTriangles: renderer.info.render.triangles,
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
    if (import.meta.env.DEV) Object.assign(window, { __voidcrewSnapshot: snapshot });

    return () => {
      disposed = true;
      const w = window as { __voidcrewSnapshot?: () => string };
      if (w.__voidcrewSnapshot === snapshot) delete w.__voidcrewSnapshot;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPress);
      window.removeEventListener("pointerup", onRelease);
      container.removeChild(renderer.domElement);
      for (const geo of geometries) geo.dispose();
      for (const kit of allKits) {
        kit.wallMat.dispose();
        kit.sideMat.dispose();
        kit.litMat?.dispose();
        for (const tex of kit.textures) tex.dispose();
      }
      for (const mat of ownMaterials) mat.dispose();
      floorMat.dispose();
      spaceMat.dispose();
      sheenMat.dispose();
      wiredGlass.dispose();
      paintMat.dispose();
      hazardMat.dispose();
      for (const tex of trimTextures) tex.dispose();
      bridgeMat.dispose();
      ceilMat.dispose();
      for (const mat of fixtureMats.values()) mat.dispose();
      decals.dispose();
      renderer.dispose();
    };
  }, [
    map,
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
