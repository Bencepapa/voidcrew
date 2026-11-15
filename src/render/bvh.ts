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

// The same, a little at a time after the deck is shown: a slice of a few milliseconds at a time,
// between frames, so the load does not wait for it (and the game does not stall: a ray that
// comes sooner builds the hierarchy of what it tests itself, as always). Returns a way to stop.
export function prepareRaycastsGradually(root: THREE.Object3D): () => void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry && !(mesh.geometry as THREE.BufferGeometry).boundsTree) meshes.push(mesh);
  });
  let stopped = false;
  let next = 0;
  const SLICE_MS = 6;
  const step = () => {
    if (stopped) return;
    const until = performance.now() + SLICE_MS;
    while (next < meshes.length && performance.now() < until) ensureBoundsTree(meshes[next++].geometry as THREE.BufferGeometry);
    if (next < meshes.length) setTimeout(step, 0);
  };
  setTimeout(step, 0);
  return () => {
    stopped = true;
  };
}
