import * as THREE from "three";
import { foliagePlanes } from "../../game/fenceLayers";
import type { FenceModelSpec } from "../../game/fences";
import type { FarLevel, WallKit } from "./walls";

// The model of a foliage piece (a layered or crossed fence, see game/fenceLayers.ts): the relief panels of all its
// planes, both sides of each, laid in their places and MERGED into one geometry - so a piece costs two draw calls
// (the panels' front faces and their step sides, as every relief panel has them) however many layers it has, where
// separate panels would cost two each. The panels themselves are the cached ones every fence uses (cut once per
// size and texture part); only the merged copy is the piece's own, and the pieces of a style share it through the
// model cache (a handful of jitter variants). Distant versions are merged the same way and swapped by a LOD.

export interface FacePart {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
}

const ATTRIBUTES = ["position", "normal", "uv", "uv1"] as const;

// The parts' geometries, each moved by its matrix, as one indexed geometry whose groups are the parts' material
// indices (every relief panel has group 0 - the front faces - and group 1 - the step sides). A matrix that mirrors
// (a negative determinant) gets its triangles' winding reversed, as the renderer does for a mirrored mesh, so
// the faces keep facing the way they would. null: the parts can't be merged (a missing index or position).
export function mergeFaceParts(parts: readonly FacePart[]): THREE.BufferGeometry | null {
  if (!parts.length || parts.some((p) => !p.geometry.index || !p.geometry.getAttribute("position"))) return null;
  const names = ATTRIBUTES.filter((name) => parts.every((p) => p.geometry.getAttribute(name)));
  let vertices = 0;
  for (const p of parts) vertices += p.geometry.getAttribute("position").count;
  const arrays = new Map(names.map((name) => [name, new Float32Array(vertices * (name === "uv" || name === "uv1" ? 2 : 3))]));
  const byMaterial = new Map<number, number[]>();
  const point = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let base = 0;
  for (const { geometry, matrix } of parts) {
    const count = geometry.getAttribute("position").count;
    normalMatrix.getNormalMatrix(matrix);
    for (const name of names) {
      const source = geometry.getAttribute(name);
      const out = arrays.get(name)!;
      for (let i = 0; i < count; i++) {
        if (name === "position") {
          point.fromBufferAttribute(source, i).applyMatrix4(matrix);
          out.set([point.x, point.y, point.z], (base + i) * 3);
        } else if (name === "normal") {
          point.fromBufferAttribute(source, i).applyMatrix3(normalMatrix).normalize();
          out.set([point.x, point.y, point.z], (base + i) * 3);
        } else {
          out[(base + i) * 2] = source.getX(i);
          out[(base + i) * 2 + 1] = source.getY(i);
        }
      }
    }
    const flip = matrix.determinant() < 0;
    const index = geometry.index!;
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index.count, materialIndex: 0 }];
    for (const group of groups) {
      const list = byMaterial.get(group.materialIndex ?? 0) ?? [];
      for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
        const a = index.getX(i) + base;
        const b = index.getX(i + 1) + base;
        const c = index.getX(i + 2) + base;
        if (flip) list.push(a, c, b);
        else list.push(a, b, c);
      }
      byMaterial.set(group.materialIndex ?? 0, list);
    }
    base += count;
  }
  const merged = new THREE.BufferGeometry();
  for (const name of names) merged.setAttribute(name, new THREE.BufferAttribute(arrays.get(name)!, name === "uv" || name === "uv1" ? 2 : 3));
  const indices: number[] = [];
  for (const material of [...byMaterial.keys()].sort((a, b) => a - b)) {
    const list = byMaterial.get(material)!;
    if (list.length) merged.addGroup(indices.length, list.length, material);
    for (const v of list) indices.push(v);
  }
  merged.setIndex(new THREE.BufferAttribute(vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

type Shape = { width: number; height: number; flushEdges: boolean; depth: number; coarse: number; cols?: [number, number] };

export interface FoliageContext {
  wallHeight: number;
  // the relief depth and the coarseness the fences' panels use
  relief: number;
  coarse: number;
  // the viewport's relief builders (cached by shape) and its distant versions of a panel
  panel(kit: WallKit, shape: Shape): Promise<{ geometry: THREE.BufferGeometry } | null>;
  far(kit: WallKit, shape: Shape): Promise<FarLevel[]>;
  // what the merged geometries are added to, for disposal with the scene
  geometries: THREE.BufferGeometry[];
}

// The piece's model: its planes' panels merged (see above), or null if a panel couldn't be built.
export async function buildFoliage(ctx: FoliageContext, kit: WallKit, spec: FenceModelSpec): Promise<THREE.Object3D | null> {
  const height = spec.height * ctx.wallHeight;
  const materials: THREE.Material[] = [kit.wallMat, kit.sideMat];
  const built = new Map<string, Promise<{ near: THREE.BufferGeometry; far: FarLevel[] } | null>>();
  const panelOf = (shape: Shape) => {
    const key = JSON.stringify(shape);
    let made = built.get(key);
    if (!made) {
      made = (async () => {
        const near = await ctx.panel(kit, shape);
        if (!near) return null;
        return { near: near.geometry, far: await ctx.far(kit, shape) };
      })();
      built.set(key, made);
    }
    return made;
  };
  const parts: { near: THREE.BufferGeometry; far: FarLevel[]; matrix: THREE.Matrix4 }[] = [];
  for (const plane of foliagePlanes(spec)) {
    // (a texture going round: the part of the picture from `shift` on, then the part before it, side by side;
    // otherwise the one panel - or the part of the texture a stub of a corner shows)
    const pieces: { cols?: [number, number]; width: number; at: number }[] =
      plane.shift > 0
        ? [
            { cols: [plane.shift, 1], width: plane.length * (1 - plane.shift), at: -plane.length / 2 + (plane.length * (1 - plane.shift)) / 2 },
            { cols: [0, plane.shift], width: plane.length * plane.shift, at: plane.length / 2 - (plane.length * plane.shift) / 2 },
          ]
        : plane.u0 <= 1e-6 && plane.u1 >= 1 - 1e-6
          ? [{ width: plane.length, at: 0 }]
          : [{ cols: [plane.u0, plane.u1], width: plane.length, at: 0 }];
    for (const piece of pieces) {
      const panel = await panelOf({
        width: Math.round(piece.width * 1e4) / 1e4,
        height,
        flushEdges: false,
        depth: ctx.relief,
        coarse: ctx.coarse,
        ...(piece.cols ? { cols: piece.cols } : {}),
      });
      if (!panel) return null;
      // (the panel is its front face, and the same again mirrored for a view from behind - the fences' own convention;
      // a flipped plane turns both round)
      for (const front of [true, false]) {
        const sign = (plane.flip ? -1 : 1) * (front ? 1 : -1);
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(plane.cx, (height * plane.sy) / 2, plane.cz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), front ? plane.yaw : plane.yaw + Math.PI),
          new THREE.Vector3(sign * plane.sx, plane.sy, 1),
        );
        matrix.multiply(new THREE.Matrix4().makeTranslation(piece.at, 0, 0));
        parts.push({ near: panel.near, far: panel.far, matrix });
      }
    }
  }
  const near = mergeFaceParts(parts.map((p) => ({ geometry: p.near, matrix: p.matrix })));
  if (!near) return null;
  ctx.geometries.push(near);
  const nearMesh = new THREE.Mesh(near, materials);
  // distant versions: at each distance any part has one, every part is at its coarsest version up to that distance
  const distances = [...new Set(parts.flatMap((p) => p.far.map((level) => level.distance)))].sort((a, b) => a - b);
  if (!distances.length) return nearMesh;
  const lod = new THREE.LOD();
  lod.addLevel(nearMesh, 0);
  for (const distance of distances) {
    const geometry = mergeFaceParts(
      parts.map((p) => ({ geometry: [...p.far].reverse().find((level) => level.distance <= distance)?.geometry ?? p.near, matrix: p.matrix })),
    );
    if (!geometry) continue;
    ctx.geometries.push(geometry);
    lod.addLevel(new THREE.Mesh(geometry, materials), distance);
  }
  return lod;
}
