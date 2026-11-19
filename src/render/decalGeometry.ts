import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";

export function projectDecal(
  mesh: THREE.Mesh,
  position: THREE.Vector3,
  orientation: THREE.Euler,
  size: THREE.Vector3,
): DecalGeometry {
  const source = mesh.geometry;
  const vertices = source.getAttribute("position");
  const index = source.getIndex();
  const count = index?.count ?? vertices?.count ?? 0;
  if (count < 256 || mesh.matrixWorld.determinant() === 0) {
    return new DecalGeometry(mesh, position, orientation, size);
  }

  // The projection box in the mesh's local coordinates, conservatively
  // enclosed in an axis-aligned box. A triangle wholly outside any one
  // plane cannot contribute to the exact projection.
  const projector = new THREE.Matrix4().makeRotationFromEuler(orientation).setPosition(position);
  const toLocal = new THREE.Matrix4().copy(mesh.matrixWorld).invert().multiply(projector);
  const half = size.clone().multiplyScalar(0.5);
  const box = new THREE.Box3(half.clone().negate(), half).applyMatrix4(toLocal).expandByScalar(1e-6);
  const outside = new Uint8Array(vertices.count);
  const { min, max } = box;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const y = vertices.getY(i);
    const z = vertices.getZ(i);
    outside[i] = (x < min.x ? 1 : x > max.x ? 2 : 0)
      | (y < min.y ? 4 : y > max.y ? 8 : 0)
      | (z < min.z ? 16 : z > max.z ? 32 : 0);
  }
  const kept: number[] = [];
  for (let i = 0; i + 2 < count; i += 3) {
    const a = index ? index.getX(i) : i;
    const b = index ? index.getX(i + 1) : i + 1;
    const c = index ? index.getX(i + 2) : i + 2;
    if (!(outside[a] & outside[b] & outside[c])) kept.push(a, b, c);
  }
  if (kept.length === count) return new DecalGeometry(mesh, position, orientation, size);

  // DecalGeometry reads only positions, normals, indices and the world
  // matrix. Share the attributes and preserve triangle order and winding.
  const subset = new THREE.BufferGeometry().setAttribute("position", vertices).setIndex(kept);
  const normals = source.getAttribute("normal");
  if (normals) subset.setAttribute("normal", normals);
  const candidate = new THREE.Mesh(subset, mesh.material);
  candidate.matrixWorld.copy(mesh.matrixWorld);
  return new DecalGeometry(candidate, position, orientation, size);
}
