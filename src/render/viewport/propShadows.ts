import * as THREE from "three";
import { propShadowAppearance } from "../../game/propShadow";
import type { PropType } from "../../game/props";

class PropShadow extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  override raycast() {}
}

const shadowName = "propContactShadow";
export const propShadowMesh = (root: THREE.Object3D) => root.getObjectByName(shadowName) as PropShadow | undefined;

export function expandByPropModel(bounds: THREE.Box3, root: THREE.Object3D) {
  root.updateWorldMatrix(true, false);
  for (const child of root.children) {
    if (child.name !== shadowName) bounds.expandByObject(child);
  }
  return bounds;
}

export function createPropShadows() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const radius = size / 2;
  const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.85)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, allowOverride: false });

  return {
    add(root: THREE.Group, type: PropType) {
      if (!propShadowAppearance(type)) return;
      const shadow = new PropShadow(geometry, material);
      shadow.name = shadowName;
      root.add(shadow);
    },
    dispose() {
      material.dispose();
      geometry.dispose();
      texture.dispose();
    },
  };
}

export function placePropShadow(root: THREE.Object3D, type: PropType, elevation: number, floorOffset: number) {
  const shadow = propShadowMesh(root);
  if (!shadow) return;
  const appearance = propShadowAppearance(type, elevation, root.scale.y);
  shadow.visible = !!appearance;
  if (!appearance) return;
  shadow.position.y = floorOffset / root.scale.y;
  shadow.scale.set(appearance.width, 1, appearance.depth);
  shadow.material.opacity = appearance.opacity;
}
