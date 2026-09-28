import { cellAt } from "./map";
import type { GameMap } from "./types";

// Which cells can be seen from a point, on the map grid: walls and closed
// doors block the view (a closed door's own cell is seen, not past it).
// Heights are ignored - a cell counts as seen if a straight line reaches
// any of a few points in it. Cheap enough to redo whenever the viewer
// changes cell or a door opens or shuts.

// sample points in a cell, relative to its center: the center and four
// points near its corners
const SAMPLES: [number, number][] = [
  [0, 0],
  [-0.4, -0.4],
  [0.4, -0.4],
  [-0.4, 0.4],
  [0.4, 0.4],
];
const STEP = 0.25;

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

// Whether an actor in one cell sees into another: a straight line between
// their centers crossing no wall or closed door (stricter than visibleCells,
// which also counts a cell seen when just a corner of it shows).
export function lineOfSight(
  map: GameMap,
  from: { x: number; y: number },
  to: { x: number; y: number },
  isDoorOpen: (key: string) => boolean,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.ceil(Math.hypot(dx, dy) / STEP);
  for (let i = 1; i < steps; i++) {
    const x = Math.round(from.x + (dx * i) / steps);
    const y = Math.round(from.y + (dy * i) / steps);
    if ((x === from.x && y === from.y) || (x === to.x && y === to.y)) continue;
    const type = cellAt(map, x, y);
    if (type === "wall" || (type === "door" && !isDoorOpen(cellKey(x, y)))) return false;
  }
  return true;
}

export function visibleCells(
  map: GameMap,
  fromX: number,
  fromZ: number,
  radius: number,
  isDoorOpen: (key: string) => boolean,
): Set<string> {
  const opaque = (x: number, y: number) => {
    const type = cellAt(map, x, y);
    return type === "wall" || (type === "door" && !isDoorOpen(cellKey(x, y)));
  };
  const cx = Math.round(fromX);
  const cy = Math.round(fromZ);
  const seen = new Set<string>([cellKey(cx, cy)]);

  // whether the segment from the viewer to (tx, tz) crosses no opaque cell
  // before reaching the target cell (tx, ty)
  const clear = (px: number, pz: number, tx: number, ty: number) => {
    const dx = px - fromX;
    const dz = pz - fromZ;
    const steps = Math.ceil(Math.hypot(dx, dz) / STEP);
    for (let i = 1; i < steps; i++) {
      const x = Math.round(fromX + (dx * i) / steps);
      const y = Math.round(fromZ + (dz * i) / steps);
      if (x === tx && y === ty) return true;
      if ((x !== cx || y !== cy) && opaque(x, y)) return false;
    }
    return true;
  };

  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x === cx && y === cy) continue;
      if (Math.hypot(x - fromX, y - fromZ) > radius + 0.5) continue;
      if (SAMPLES.some(([sx, sz]) => clear(x + sx, y + sz, x, y))) seen.add(cellKey(x, y));
    }
  }
  return seen;
}
