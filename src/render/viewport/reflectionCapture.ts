import { CubeCamera, HalfFloatType, LinearFilter, LinearSRGBColorSpace, PMREMGenerator, UnsignedByteType, WebGLCubeRenderTarget, type Vector3, type Object3D, type PointLight, type Scene, type WebGLRenderer } from "three";
import type { LightGridUniforms } from "../lightGrid";

const FACE_SIZE = 32;

export function captureReflection(
  renderer: WebGLRenderer,
  scene: Scene,
  origin: Vector3,
  surfaces: Iterable<Object3D>,
  headlamp: PointLight,
  lightGrid: LightGridUniforms,
) {
  const cube = new WebGLCubeRenderTarget(FACE_SIZE, {
    type: renderer.extensions.has("EXT_color_buffer_float") ? HalfFloatType : UnsignedByteType,
    colorSpace: LinearSRGBColorSpace,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
  });
  const camera = new CubeCamera(0.04, 24, cube);
  camera.position.copy(origin);
  const target = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const mip = renderer.getActiveMipmapLevel();
  const autoClear = renderer.autoClear;
  const xr = renderer.xr.enabled;
  const intensity = headlamp.intensity;
  const reflection = lightGrid.reflectionStrength.value;
  const visibility = new Map<Object3D, boolean>();
  let pmrem: PMREMGenerator | undefined;
  try {
    for (const surface of surfaces) {
      if (surface.visible || surface.userData.editHidden) continue;
      visibility.set(surface, false);
      surface.visible = true;
    }
    scene.traverse(object => {
      if (!object.userData.excludeFromReflectionCapture) return;
      if (!visibility.has(object)) visibility.set(object, object.visible);
      object.visible = false;
    });
    headlamp.intensity = 0;
    lightGrid.reflectionStrength.value = 0;
    renderer.autoClear = true;
    camera.update(renderer, scene);
    pmrem = new PMREMGenerator(renderer);
    return pmrem.fromCubemap(cube.texture);
  } finally {
    for (const [object, visible] of visibility) object.visible = visible;
    lightGrid.reflectionStrength.value = reflection;
    headlamp.intensity = intensity;
    renderer.autoClear = autoClear;
    renderer.xr.enabled = xr;
    renderer.setRenderTarget(target, face, mip);
    pmrem?.dispose();
    cube.dispose();
  }
}
