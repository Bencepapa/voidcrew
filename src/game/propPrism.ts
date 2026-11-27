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

// how many sides one copy of the texture stretches across: 0 = a full copy on every face (the old way)
export function prismWrap(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(PRISM_MAX_SIDES, Math.round(value))) : 0;
}

type Point = readonly [x: number, z: number];
export interface PrismSide {
  from: Point;
  to: Point;
  material: 0 | 1;
  // the texture's horizontal span on this face
  u0: number;
  u1: number;
}

/**
 * An open ring of upright faces. With wrap 0 each face gets a full copy of its texture (and with an inset
 * the two halves of a side alternate). With wrap n one copy of the texture runs on across n sides - a side
 * split in two by the star inset still counts as one - in proportion to the faces' widths, so from an angle
 * the picture reads as a whole; the alternate texture then switches per copy.
 */
export function prismFaces(width: number, depth: number, sides: number, inset: number, alternate: boolean, wrap = 0): PrismSide[] {
  const count = prismSides(sides);
  const pull = prismInset(inset);
  const span = prismWrap(wrap);
  const stride = 2 * Math.PI / count;
  const inner = Math.cos(stride / 2) * (1 - pull / 100);
  const point = (angle: number, radius: number): Point =>
    [Math.sin(angle) * width * radius / 2, Math.cos(angle) * depth * radius / 2];
  const outline: Point[] = [];
  for (let i = 0; i < count; i++) {
    outline.push(point((i - 0.5) * stride, 1));
    if (pull) outline.push(point(i * stride, inner));
  }
  const edges = outline.map((from, i) => ({ from, to: outline[(i + 1) % outline.length] }));
  if (!span) {
    return edges.map((edge, i) => ({ ...edge, material: alternate && i % 2 ? 1 : 0, u0: 0, u1: 1 }));
  }
  const perSide = pull ? 2 : 1;
  const group = (i: number) => Math.floor(Math.floor(i / perSide) / span);
  const length = ({ from, to }: { from: Point; to: Point }) => Math.hypot(to[0] - from[0], to[1] - from[1]);
  const totals = new Map<number, number>();
  edges.forEach((edge, i) => totals.set(group(i), (totals.get(group(i)) ?? 0) + length(edge)));
  let run = 0;
  return edges.map((edge, i) => {
    const g = group(i);
    if (i > 0 && group(i - 1) !== g) run = 0;
    const total = totals.get(g) || 1;
    const u0 = run / total;
    run += length(edge);
    return { ...edge, material: alternate && g % 2 ? 1 : 0, u0, u1: run / total };
  });
}
