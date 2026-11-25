import type { ActorType, BodyPart } from "../../game/actors";

// the body part at a spot of a sheet cell (fractions from its top left)
export function partAt(parts: ActorType["parts"], bodyParts: readonly BodyPart[], u: number, v: number): BodyPart {
  for (const part of ["head", "torso", "legs", "armL", "armR"] as BodyPart[]) {
    const [x0, y0, x1, y1] = parts[part].zone;
    if (u >= x0 && u <= x1 && v >= y0 && v <= y1) return part;
  }
  let best: BodyPart = "torso";
  let bestDist = Infinity;
  for (const part of bodyParts) {
    const [x0, y0, x1, y1] = parts[part].zone;
    const d = Math.hypot((x0 + x1) / 2 - u, (y0 + y1) / 2 - v);
    if (d < bestDist) [best, bestDist] = [part, d];
  }
  return best;
}
