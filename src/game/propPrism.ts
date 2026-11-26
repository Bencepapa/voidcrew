export const PRISM_MIN_SIDES = 3;
export const PRISM_MAX_SIDES = 12;
export const PRISM_DEFAULT_SIDES = 5;
export const PRISM_MAX_INSET = 90;

export function prismSides(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(PRISM_MIN_SIDES, Math.min(PRISM_MAX_SIDES, Math.round(value))) : PRISM_DEFAULT_SIDES;
}

export function prismInset(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(PRISM_MAX_INSET, value)) : 0;
}

type Point = readonly [x: number, z: number];
export interface PrismSide {
  from: Point;
  to: Point;
  material: 0 | 1;
}

/** An open ring of upright faces. Each side gets a full copy of its texture. */
export function prismFaces(width: number, depth: number, sides: number, inset: number, alternate: boolean): PrismSide[] {
  const count = prismSides(sides);
  const pull = prismInset(inset);
  const stride = 2 * Math.PI / count;
  const inner = Math.cos(stride / 2) * (1 - pull / 100);
  const point = (angle: number, radius: number): Point =>
    [Math.sin(angle) * width * radius / 2, Math.cos(angle) * depth * radius / 2];
  const outline: Point[] = [];
  for (let i = 0; i < count; i++) {
    outline.push(point((i - 0.5) * stride, 1));
    if (pull) outline.push(point(i * stride, inner));
  }
  return outline.map((from, i) => ({
    from, to: outline[(i + 1) % outline.length], material: alternate && i % 2 ? 1 : 0,
  }));
}
