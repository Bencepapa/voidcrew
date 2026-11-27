import { MeshPhysicalMaterial, ShaderChunk, Vector3, type Texture } from "three";
import { BOX_PROJECT_REFLECTION, type ReflectionRoom } from "./reflectionRooms";

const BOX_REFLECTION = `
varying vec3 vPuddleWorld;
uniform float uPuddleTime;
uniform vec3 uRoomMin;
uniform vec3 uRoomMax;
uniform vec3 uRoomCaptureOrigin;
uniform bool uProjectReflection;

${BOX_PROJECT_REFLECTION}`;

const WATER_REFLECTION = `
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  // Give the small water patch a readable reflection at normal play angles.
  // A grazing view still reflects more than a view from directly overhead.
  float rippleFacing = clamp(dot(normal, geometryViewDir), 0.0, 1.0);
  float roomReflection = mix(0.30, 0.95, pow(1.0 - rippleFacing, 2.0));
  outgoingLight = mix(outgoingLight, radiance, roomReflection);
#endif
#include <opaque_fragment>`;

export function createPuddleMaterial(mask: Texture, time: { value: number }, room?: ReflectionRoom) {
  const material = new MeshPhysicalMaterial({
    color: 0x27343c, map: mask, roughness: 0.075, ior: 1.33,
    transparent: true, opacity: 0.84, alphaTest: 0.1, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uPuddleTime = time;
    shader.uniforms.uRoomMin = { value: new Vector3(...(room?.bounds?.min ?? [0, 0, 0])) };
    shader.uniforms.uRoomMax = { value: new Vector3(...(room?.bounds?.max ?? [0, 0, 0])) };
    shader.uniforms.uRoomCaptureOrigin = { value: new Vector3(...(room?.origin ?? [0, 0, 0])) };
    shader.uniforms.uProjectReflection = { value: !!room?.bounds };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPuddleWorld;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvPuddleWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${BOX_REFLECTION}`)
      .replace("#include <map_fragment>", "diffuseColor.a *= texture2D(map, vMapUv).a;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        vec2 p = vPuddleWorld.xz * 11.0;
        vec3 ripple = vec3(0.016 * sin(p.x * 1.3 + uPuddleTime * 1.2) + 0.011 * sin(p.y * 2.1 - uPuddleTime * 0.9),
          0.0, 0.016 * cos(p.y * 1.1 + uPuddleTime) + 0.011 * cos(p.x * 1.9 - uPuddleTime * 0.7));
        normal = normalize(normal + mat3(viewMatrix) * ripple);`)
      .replace("#include <envmap_physical_pars_fragment>", ShaderChunk.envmap_physical_pars_fragment.replace(
        "envMapRotation * reflectVec", "envMapRotation * roomReflectionDirection(vPuddleWorld, reflectVec)"))
      .replace("#include <opaque_fragment>", WATER_REFLECTION);
  };
  return material;
}
