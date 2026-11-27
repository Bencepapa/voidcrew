import { Mesh, MeshStandardMaterial, SphereGeometry, type Object3D, type PointLight, type Scene, type WebGLRenderer, type WebGLRenderTarget } from "three";
import { floorHeight } from "../../game/mapGeometry";
import type { GameMap, Vec2 } from "../../game/types";
import { useLightGrid, type LightGridUniforms } from "../lightGrid";
import { captureReflection } from "./reflectionCapture";

export function addReflectionTestSphere(scene: Scene, lightGrid: LightGridUniforms, map: GameMap, cell: Vec2, wallHeight: number) {
  const requested = new URLSearchParams(location.search).get("reflectionTest") === "1";
  if (!requested && map.id !== "reflectiontest-room1") return;

  const material = new MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1 });
  const geometry = new SphereGeometry(0.35, 48, 32);
  const sphere = new Mesh(geometry, material);
  sphere.userData.excludeFromReflectionCapture = true;
  const probeMask = { value: 1 };
  useLightGrid(material, lightGrid, probeMask);
  sphere.position.set(cell.x, floorHeight(map, cell.x, cell.y) * wallHeight + 1, cell.y);
  scene.add(sphere);
  let captured: WebGLRenderTarget | undefined;
  let attempted = false;
  function clearCapture() {
    attempted = false;
    if (!captured) return;
    material.envMap = null;
    material.needsUpdate = true;
    probeMask.value = 1;
    captured.dispose();
    captured = undefined;
  }
  return {
    update(enabled: boolean, canCapture: boolean, renderer: WebGLRenderer, headlamp: PointLight, surfaces: Iterable<Object3D>, props: Iterable<Object3D>) {
      if (!enabled) {
        clearCapture();
      } else if (!attempted && canCapture) {
        attempted = true;
        try {
          captured = captureReflection(renderer, scene, sphere.position, [...surfaces, ...props], headlamp, lightGrid);
          material.envMap = captured.texture;
          material.needsUpdate = true;
          probeMask.value = 0;
        } catch (error) {
          console.warn("Test cubemap capture failed:", error);
        }
      }
    },
    dispose() {
      clearCapture();
      sphere.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
