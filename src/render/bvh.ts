import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";

// Faster raycasts (aiming, shots, cover, the map editor's picking): a mesh
// with many triangles - a relief wall has thousands - gets a bounding volume
// hierarchy (three-mesh-bvh) the first time a ray tests it, so a ray checks
// a handful of triangles instead of every one. Imported for its effect.

// below this many triangles the plain test is as quick
const BVH_MIN_TRIANGLES = 64;

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

function ensureBoundsTree(geometry: THREE.BufferGeometry) {
  if (geometry.boundsTree || !geometry.attributes.position) return;
  const triangles = (geometry.index?.count ?? geometry.attributes.position.count) / 3;
  if (triangles >= BVH_MIN_TRIANGLES) geometry.computeBoundsTree();
}

THREE.Mesh.prototype.raycast = function (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
  ensureBoundsTree(this.geometry as THREE.BufferGeometry);
  acceleratedRaycast.call(this, raycaster, intersects);
};

// Builds the hierarchies of everything under `root` up front (while a deck
// loads), so the first aim or pick doesn't stall building them.
export function prepareRaycasts(root: THREE.Object3D) {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) ensureBoundsTree((obj as THREE.Mesh).geometry as THREE.BufferGeometry);
  });
}
