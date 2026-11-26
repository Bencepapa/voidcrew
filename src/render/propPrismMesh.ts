import { BufferGeometry, Float32BufferAttribute } from "three";
import type { PrismSide } from "../game/propPrism";

export function propPrismGeometry(faces: readonly PrismSide[], height: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const uv: number[] = [];
  let start = 0;
  for (const material of [0, 1]) {
    for (const { from: [ax, az], to: [bx, bz], material: group } of faces) {
      if (group !== material) continue;
      positions.push(ax, 0, az, bx, 0, bz, bx, height, bz, ax, 0, az, bx, height, bz, ax, height, az);
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
    const end = positions.length / 3;
    if (end > start) geometry.addGroup(start, end - start, material);
    start = end;
  }
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
