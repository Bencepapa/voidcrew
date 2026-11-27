import { Mesh, ShaderChunk, Vector3, type Material, type MeshStandardMaterial, type Object3D, type Texture } from "three";
import { textureTuning } from "../textureTuning";
import { BOX_PROJECT_REFLECTION, type ReflectionRoom } from "./reflectionRooms";

export function hasRoomMetal(material: Material): material is MeshStandardMaterial {
  const standard = material as MeshStandardMaterial;
  const textureId = material.userData.roomReflectionTexture as string | undefined;
  return !!textureId && standard.isMeshStandardMaterial && standard.metalness > 0 && !standard.envMap &&
    (textureTuning(textureId)?.roomReflection ?? !!standard.metalnessMap);
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

export function syncRoomMetal(source: MeshStandardMaterial, envMap: Texture, room: ReflectionRoom, variants: Map<Material, RoomMetalMaterial>) {
  let variant = variants.get(source);
  if (!variant) {
    const material = source.clone();
    material.onBeforeCompile = (shader, renderer) => {
      source.onBeforeCompile.call(source, shader, renderer);
      if (shader.uniforms.uLgReflectionMask) shader.uniforms.uLgReflectionMask = { value: 0 };
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
    };
    material.customProgramCacheKey = () => `${source.customProgramCacheKey()}|room-reflection:${!!room.bounds}`;
    variant = { material, version: -1 };
    variants.set(source, variant);
  }
  const { material } = variant;
  if (variant.version !== source.version) {
    material.copy(source);
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
  material.roughness = source.roughness;
  material.emissiveIntensity = source.emissiveIntensity;
  material.aoMapIntensity = source.aoMapIntensity;
  material.opacity = source.opacity;
  material.depthWrite = source.depthWrite;
  return material;
}
