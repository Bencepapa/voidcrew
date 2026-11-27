export interface PackedReflectionProbe {
  nx: number;
  nz: number;
  ny: number;
  min: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  faces: Uint16Array[];
}

// Each 3D texture stacks three axes along its vertical dimension. Keeping the
// signs separate lets directional lighting reuse the cube's spare samplers.
export function packReflectionProbe(grid: PackedReflectionProbe): PackedReflectionProbe {
  const layerLength = grid.nx * grid.nz * grid.ny * 4;
  const faces = [new Uint16Array(layerLength * 3), new Uint16Array(layerLength * 3)];
  grid.faces.forEach((face, index) => faces[index % 2].set(face, Math.floor(index / 2) * layerLength));
  return { ...grid, ny: grid.ny * 3, faces };
}

export const REFLECTION_PROBE_GLSL = `
uniform vec3 uLgReflectionMin;
uniform vec3 uLgReflectionSize;
uniform float uLgReflectionStrength;

vec3 lgReflection(vec3 direction, vec3 position, float roughness) {
  vec3 local = (position - uLgReflectionMin) / uLgReflectionSize;
  // Keep trilinear filtering within each axis's slice of the atlas.
  float edge = 1.5 / float(textureSize(uLgFace4, 0).z);
  float layer = clamp(local.y, edge, 1.0 - edge) / 3.0;
  vec3 x = vec3(local.xz, layer);
  vec3 y = vec3(local.xz, layer + 1.0 / 3.0);
  vec3 z = vec3(local.xz, layer + 2.0 / 3.0);
  float blur = roughness * roughness;
  vec3 axes = abs(direction);
  // Sharpen the blend without losing radiance between axes. Dividing by
  // the dominant component before exponentiation keeps one weight at 1.
  vec3 weights = pow(axes / max(max(axes.x, axes.y), axes.z), vec3(mix(32.0, 8.0, blur)));
  weights *= mix(1.0, 0.25, blur) / (weights.x + weights.y + weights.z);
  return weights.x * (direction.x >= 0.0 ? texture(uLgFace4, x).rgb : texture(uLgFace5, x).rgb) +
    weights.y * (direction.y >= 0.0 ? texture(uLgFace4, y).rgb : texture(uLgFace5, y).rgb) +
    weights.z * (direction.z >= 0.0 ? texture(uLgFace4, z).rgb : texture(uLgFace5, z).rgb);
}`;
