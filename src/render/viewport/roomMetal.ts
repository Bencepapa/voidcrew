import { Mesh, NormalBlending, ShaderChunk, Vector3, type Material, type MeshStandardMaterial, type Object3D, type Texture } from "three";
import { textureTuning } from "../textureTuning";
import { BOX_PROJECT_REFLECTION, type ReflectionRoom } from "./reflectionRooms";

export function hasRoomMetal(material: Material): material is MeshStandardMaterial {
  const standard = material as MeshStandardMaterial;
  if (!standard.isMeshStandardMaterial || standard.envMap) return false;
  if (material.userData.roomWindowReflection === true) return true;
  const textureId = material.userData.roomReflectionTexture as string | undefined;
  if (!textureId || standard.metalness <= 0) return false;
  const tune = textureTuning(textureId);
  const tunedGloss = (tune?.metal !== undefined || tune?.rough !== undefined) && standard.metalness >= 0.45 && standard.roughness <= 0.35;
  return tune?.roomReflection ?? (!!standard.metalnessMap || tunedGloss);
}

export function roomMetalMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse(object => {
    const mesh = object as Mesh;
    if (mesh.isMesh && (Array.isArray(mesh.material) ? mesh.material.some(hasRoomMetal) : hasRoomMetal(mesh.material))) meshes.push(mesh);
  });
  return meshes;
}

export interface RoomMetalMaterial {
  material: MeshStandardMaterial;
  version: number;
}

function roomReflectionLightChunk(window: boolean) {
  // The light grid already lights the surface. A capture contains lit surfaces,
  // so feeding it into diffuse IBL would light the room a second time.
  const specularOnly = ShaderChunk.lights_fragment_maps.replace("iblIrradiance += getIBLIrradiance( geometryNormal );", "");
  if (window) return specularOnly;
  // Heavily blurred samples converge to the room's average color. Fade them
  // using the per-pixel roughness, including any map and geometry roughness.
  return specularOnly.replace("radiance += iblRadiance;", `
    float roomReflectionWeight = 1.0 - smoothstep(0.25, 0.65, material.roughness);
    radiance += iblRadiance * roomReflectionWeight;`);
}

const WINDOW_ROOM_REFLECTION = `
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  float facing = clamp(dot(normal, geometryViewDir), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 2.0);
  float brightness = dot(max(radiance, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722));
  float reflectionAlpha = smoothstep(0.025, 0.8, brightness) * mix(0.34, 0.9, fresnel);
  float glintAlpha = clamp(max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b)) * opacity, 0.0, 0.32);
  diffuseColor.a = max(reflectionAlpha, glintAlpha);
  outgoingLight = mix(radiance, outgoingLight, glintAlpha / max(diffuseColor.a, 0.0001));
#endif
#include <opaque_fragment>`;

export function syncRoomMetal(source: MeshStandardMaterial, envMap: Texture, room: ReflectionRoom, variants: Map<Material, RoomMetalMaterial>) {
  const window = source.userData.roomWindowReflection === true;
  let variant = variants.get(source);
  if (!variant) {
    const material = source.clone();
    const reflectionLightChunk = roomReflectionLightChunk(window);
    material.onBeforeCompile = (shader, renderer) => {
      source.onBeforeCompile.call(source, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_maps>", reflectionLightChunk);
      if (room.bounds && shader.uniforms.uLgReflectionMask) {
        shader.uniforms.uRoomMin = { value: new Vector3(...room.bounds.min) };
        shader.uniforms.uRoomMax = { value: new Vector3(...room.bounds.max) };
        shader.uniforms.uRoomCaptureOrigin = { value: new Vector3(...room.origin) };
        shader.fragmentShader = shader.fragmentShader.replace("#include <envmap_physical_pars_fragment>", `
          uniform vec3 uRoomMin, uRoomMax, uRoomCaptureOrigin;
          const bool uProjectReflection = true;
          ${BOX_PROJECT_REFLECTION}
          ${ShaderChunk.envmap_physical_pars_fragment.replace("envMapRotation * reflectVec", "envMapRotation * roomReflectionDirection(vLgWorld, reflectVec)")}`);
      }
      if (window) shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", WINDOW_ROOM_REFLECTION);
    };
    material.customProgramCacheKey = () => `${source.customProgramCacheKey()}|room-reflection:${!!room.bounds}:${window}`;
    variant = { material, version: -1 };
    variants.set(source, variant);
  }
  const { material } = variant;
  if (variant.version !== source.version) {
    material.copy(source);
    if (window) material.blending = NormalBlending;
    material.needsUpdate = true;
    variant.version = source.version;
  }
  if (material.envMap !== envMap) {
    material.envMap = envMap;
    material.needsUpdate = true;
  }
  material.color.copy(source.color);
  material.emissive.copy(source.emissive);
  material.normalScale.copy(source.normalScale);
  material.metalness = source.metalness;
  material.roughness = window ? 0.085 : source.roughness;
  material.emissiveIntensity = source.emissiveIntensity;
  material.aoMapIntensity = source.aoMapIntensity;
  material.opacity = source.opacity;
  material.depthWrite = source.depthWrite;
  return material;
}
