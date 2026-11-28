import { CubeCamera, HalfFloatType, LinearFilter, LinearSRGBColorSpace, PMREMGenerator, UnsignedByteType, WebGLCubeRenderTarget, type Vector3, type Object3D, type PointLight, type Scene, type WebGLRenderer } from "three";
import type { LightGridUniforms } from "../lightGrid";

export function captureEnvironment(
  renderer: WebGLRenderer,
  scene: Scene,
  origin: Vector3,
  faceSize = 32,
  keepCube = false,
) {
  const cube = new WebGLCubeRenderTarget(faceSize, {
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
  let pmrem: PMREMGenerator | undefined;
  let keep = false;
  try {
    renderer.autoClear = true;
    camera.update(renderer, scene);
    pmrem = new PMREMGenerator(renderer);
    const filtered = pmrem.fromCubemap(cube.texture);
    keep = keepCube;
    return { target: filtered, cube: keep ? cube : undefined };
  } finally {
    renderer.autoClear = autoClear;
    renderer.xr.enabled = xr;
    renderer.setRenderTarget(target, face, mip);
    pmrem?.dispose();
    if (!keep) cube.dispose();
  }
}

export function captureReflection(
  renderer: WebGLRenderer,
  scene: Scene,
  origin: Vector3,
  surfaces: Iterable<Object3D>,
  headlamp: PointLight,
  lightGrid: LightGridUniforms,
  faceSize = 32,
  keepCube = false,
) {
  const intensity = headlamp.intensity;
  const reflection = lightGrid.reflectionStrength.value;
  const visibility = new Map<Object3D, boolean>();
  try {
    for (const surface of surfaces) {
      if (surface.visible || surface.userData.editHidden) continue;
      visibility.set(surface, false);
      surface.visible = true;
    }
    scene.traverse(object => {
      const { excludeFromReflectionCapture, prop, doorCell, editHidden } = object.userData;
      if (excludeFromReflectionCapture) {
        if (!visibility.has(object)) visibility.set(object, object.visible);
        object.visible = false;
      } else if (!object.visible && !editHidden && (prop || doorCell)) {
        // The main camera's sight mask is unrelated to what the probe can see.
        if (!visibility.has(object)) visibility.set(object, false);
        object.visible = true;
      }
    });
    headlamp.intensity = 0;
    lightGrid.reflectionStrength.value = 0;
    return captureEnvironment(renderer, scene, origin, faceSize, keepCube);
  } finally {
    for (const [object, visible] of visibility) object.visible = visible;
    lightGrid.reflectionStrength.value = reflection;
    headlamp.intensity = intensity;
  }
}
