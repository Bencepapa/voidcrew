import { Vector3, type MeshStandardMaterial, type Object3D, type Scene, type WebGLRenderer, type WebGLRenderTarget } from "three";
import { captureEnvironment } from "../render/viewport/reflectionCapture";

export function createAssetRoomReflection(renderer: WebGLRenderer, scene: Scene, asset: Object3D, onError: (error: unknown) => void) {
  const materials = new Set<MeshStandardMaterial>();
  const subjects = [asset];
  let capture: WebGLRenderTarget | undefined;
  let lastLights: number | undefined;

  function apply(material: MeshStandardMaterial) {
    const texture = capture?.texture ?? null;
    if (material.envMap === texture) return;
    material.envMap = texture;
    material.needsUpdate = true;
  }

  function clear() {
    lastLights = undefined;
    if (!capture) return;
    capture.dispose();
    capture = undefined;
    materials.forEach(apply);
  }

  return {
    add(material: MeshStandardMaterial) {
      materials.add(material);
      apply(material);
    },
    exclude(subject: Object3D) { subjects.push(subject); },
    update(enabled: boolean, loading: boolean, lights: number) {
      if (!enabled) return clear();
      if (loading || !materials.size || lastLights === lights) return;
      lastLights = lights;
      const visible = subjects.filter(subject => subject.visible);
      try {
        for (const subject of visible) subject.visible = false;
        const next = captureEnvironment(renderer, scene, new Vector3(0, 0.5, 0), 64).target;
        capture?.dispose();
        capture = next;
        materials.forEach(apply);
      } catch (error) {
        onError(error);
      } finally {
        for (const subject of visible) subject.visible = true;
      }
    },
    invalidate() { lastLights = undefined; },
    dispose: clear,
  };
}
