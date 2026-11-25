import * as THREE from "three";

export const drawnChain = (obj: THREE.Object3D | null) => {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
};

export const seeThrough = (obj: THREE.Object3D) => {
  const mat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  const first = Array.isArray(mat) ? mat[0] : mat;
  return !!first && first.transparent && !first.depthWrite;
};
export const isItemObject = (obj: THREE.Object3D) => {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (o.userData.itemIndex !== undefined) return true;
  return false;
};
export const isProp = (obj: THREE.Object3D) => {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (o.userData.prop) return true;
  return false;
};
