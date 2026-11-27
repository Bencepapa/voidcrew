import type { PrismSide } from "./propPrism";

export function prismFacePlacement({ from, to }: PrismSide, height: number, elevation: number) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const position: [number, number, number] = [
    (from[0] + to[0]) / 2, elevation + height / 2, (from[1] + to[1]) / 2,
  ];
  return { width: Math.hypot(dx, dz), position, yaw: Math.atan2(-dz, dx) };
}
