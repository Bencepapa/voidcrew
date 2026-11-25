import * as THREE from "three";
import { type WallFacePart } from "../../game/mapGeometry";
import type { TextureSetId } from "../textureSets";

import { lerp } from "./poses";

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
export function createBeveledWallGeometry(
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
export const LIGHT_PANEL_INTENSITY = 1.6;

// floor used where the map doesn't specify one
export const DEFAULT_FLOOR: TextureSetId = "floor1";

// A wall panel is a whole texture tall, or - where a wall's height isn't a
// whole number of panels - a band of the texture: its top ("t") or bottom
// ("b") rows, this fraction of it high.
export type PanelVariant = "full" | `t${number}` | `b${number}`;

export function variantRows(variant: PanelVariant): [number, number] | undefined {
  if (variant === "full") return undefined;
  const fraction = Number(variant.slice(1));
  return variant[0] === "t" ? [0, fraction] : [1 - fraction, 1];
}

export function variantHeight(variant: PanelVariant): number {
  return variant === "full" ? 1 : Number(variant.slice(1));
}

// Splits the vertical span of a wall (in wall heights) into panels: whole
// ones stacked from the anchored end, plus a band for the rest. A wall
// standing on a floor continues upward into its texture's top rows; a step
// face (a riser) shorter than a panel shows the bottom rows, like the foot
// of a wall; a strip hanging from a ceiling (a header) the top rows.
export function wallPanels(bottom: number, top: number, anchor: "bottom" | "top"): { bottom: number; variant: PanelVariant }[] {
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
export function createBandPlane(height: number, [top, bottom]: [number, number]): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(1, height);
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - bottom + uv.getY(i) * (bottom - top));
  return geo;
}

export interface WallSlot {
  x: number;
  z: number;
  // world height of the panel's center (walls) or plane (floors, ceilings)
  y: number;
  rotY: number;
  // walls only
  variant?: PanelVariant;
  part?: WallFacePart;
  // ceiling tile under a ceiling light: use the kit's glowing material
  lit?: boolean;
  // surfaceKey of the panel, for decals to find it
  key: string;
}

// Everything the walls (or floors, ceilings) of one texture set need: its own
// materials and, in relief mode, its own geometry (built from that set's
// depth map).
export interface WallKit {
  // its texture folder: the key of its tuning (see textureTuning.ts)
  id: string;
  depthUrl: string;
  // see TextureSetPaths
  grateLevels?: number;
  // its relief is built smooth (slopes) whatever the viewer's relief mode: a continuous depth map (see TextureSetFiles.smooth)
  smooth?: boolean;
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
export function kitMaterials(kit: WallKit): THREE.MeshStandardMaterial[] {
  return kit.litMat ? [kit.wallMat, kit.sideMat, kit.litMat] : [kit.wallMat, kit.sideMat];
}

export function wallVariantRoll(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 2), 374761393) ^ Math.imul(Math.round(z * 2), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// the relief depth a floor texture is tuned against in the Asset Manager (its default)
export const FLOOR_BASE_DEPTH = 0.04;

// Walls, floors and ceilings farther than this (world units) switch to a
// relief built from a height grid LOD_FACTOR times coarser: a few times
// fewer triangles, and at that distance, in the fog, it looks the same.
export const LOD_DISTANCE = 2.2;
export const LOD_FACTOR = 4;
// Smooth relief resamples its height grid to the wall detail setting, so a
// coarser grid alone wouldn't thin it out: its distant versions take fewer
// cells instead - a half as many each way (a quarter of the triangles) past
// LOD_DISTANCE, a quarter past SMOOTH_LODS' second distance - never below
// SMOOTH_LOD_MIN_CELLS along a whole panel's long side.
export const SMOOTH_LODS: { distance: number; divisor: number }[] = [
  { distance: LOD_DISTANCE, divisor: 2 },
  { distance: 3.6, divisor: 4 },
];
export const SMOOTH_LOD_MIN_CELLS = 8;
// Relief wall panels run their relief right up to their side edges and are
// joined to their neighbors by thin strips built from both edges (see
// cornerJoins.ts) - stones meeting stones round a corner. Off: every panel
// eases to the flat base along its sides instead, the old way (also from
// the console, dev only: __voidcrewNoJoins = true, then rebuild the scene).
export const CORNER_JOINS = true;
// a surface's distant version, and from how far it's shown
export interface FarLevel {
  geometry: THREE.BufferGeometry;
  distance: number;
}
