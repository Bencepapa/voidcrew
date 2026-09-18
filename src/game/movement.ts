import type { Direction, Vec2 } from "./types";

const DIR_ORDER: Direction[] = ["N", "E", "S", "W"];

export const DIR_VECTOR: Record<Direction, Vec2> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

export function turnLeft(dir: Direction): Direction {
  const i = DIR_ORDER.indexOf(dir);
  return DIR_ORDER[(i + 3) % 4];
}

export function turnRight(dir: Direction): Direction {
  const i = DIR_ORDER.indexOf(dir);
  return DIR_ORDER[(i + 1) % 4];
}

export function stepForward(pos: Vec2, dir: Direction): Vec2 {
  const v = DIR_VECTOR[dir];
  return { x: pos.x + v.x, y: pos.y + v.y };
}

export function leftOf(dir: Direction): Direction {
  return turnLeft(dir);
}

export function rightOf(dir: Direction): Direction {
  return turnRight(dir);
}
