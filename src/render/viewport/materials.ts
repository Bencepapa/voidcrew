import * as THREE from "three";

import type { GeometryViewId } from "./settings";

// three.js applies aoMap to ambient/indirect light only, so crevices facing a
// point light still light up fully. This extends the same occlusion term to
// direct light by `uCavity` (0 = physically standard, 1 = full) - a common
// stylization that makes cracks and step feet read as dark.
export function addDirectLightOcclusion(material: THREE.MeshStandardMaterial, cavity: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCavity = cavity;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uCavity;")
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
#ifdef USE_AOMAP
  reflectedLight.directDiffuse *= mix( 1.0, ambientOcclusion, uCavity );
  reflectedLight.directSpecular *= mix( 1.0, ambientOcclusion, uCavity );
#endif`,
      );
  };
}

// shared by every scene, never disposed (see GeometryViewId)
const GEOMETRY_VIEW_MATERIALS: Partial<Record<GeometryViewId, THREE.Material>> = {};
export function geometryViewMaterial(view: GeometryViewId): THREE.Material | null {
  // (the map views swap the materials' maps instead: see applyMaterialViews)
  if (view === "textured" || view === "normals" || view === "depth") return null;
  GEOMETRY_VIEW_MATERIALS[view] ??=
    view === "faces"
      ? new THREE.MeshNormalMaterial({ flatShading: true, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ color: 0x4dff88, wireframe: true, fog: true });
  return GEOMETRY_VIEW_MATERIALS[view];
}
