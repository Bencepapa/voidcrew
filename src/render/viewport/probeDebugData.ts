interface GridVector {
  x: number;
  y: number;
  z: number;
}

export interface ProbeGrid {
  nx: number;
  ny: number;
  nz: number;
  min: GridVector;
  size: GridVector;
  mode: "cube" | "directional";
  faces: readonly Uint16Array[];
}

export function probePosition(grid: ProbeGrid, index: number) {
  const { nx, ny, nz, min, size } = grid;
  const row = Math.floor(index / nx);
  return {
    x: min.x + (index % nx + 0.5) * size.x / nx,
    y: min.y + (Math.floor(row / nz) + 0.5) * size.y / ny,
    z: min.z + (row % nz + 0.5) * size.z / nz,
  };
}

function decodeHalf(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 31;
  const fraction = bits & 1023;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 31) return fraction === 0 ? sign * Infinity : NaN;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

export function probeColor(grid: ProbeGrid, index: number) {
  const offset = index * 4;
  const faceCount = grid.mode === "cube" ? 6 : 2;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let face = 0; face < faceCount; face++) {
    const rgba = grid.faces[face];
    r += decodeHalf(rgba[offset]);
    g += decodeHalf(rgba[offset + 1]);
    b += decodeHalf(rgba[offset + 2]);
  }
  const weight = grid.mode === "cube" ? 1 / 6 : 1;
  return { r: r * weight, g: g * weight, b: b * weight };
}

export function probeDirectionOffset(grid: ProbeGrid, index: number): GridVector {
  const offset = index * 4;
  const [, main, direction] = grid.faces;
  const x = decodeHalf(direction[offset]);
  const y = decodeHalf(direction[offset + 1]);
  const z = decodeHalf(direction[offset + 2]);
  const length = Math.hypot(x, y, z);
  const strength = Math.max(decodeHalf(main[offset]), decodeHalf(main[offset + 1]), decodeHalf(main[offset + 2]));
  const scale = length > 1e-3 ? 0.35 * Math.min(strength, 1) / length : 0;
  return { x: x * scale, y: y * scale, z: z * scale };
}
