import { bridgeAt, cellAt, ceilingHeight, floorHeight } from "./map";
import { BRIDGE_THICKNESS, BRIDGE_WIDTH } from "./heights";
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
// which also counts a cell seen when just a corner of it shows). With
// `heights` (the two ends' eye heights, in wall heights) the line also has
// to stay between each cell's floor and ceiling, and not pass through a
// bridge's deck - a robot under a bridge doesn't see (or shoot) the party
// on it.
export function lineOfSight(
  map: GameMap,
  from: { x: number; y: number },
  to: { x: number; y: number },
  isDoorOpen: (key: string) => boolean,
  heights?: { from: number; to: number },
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / STEP));
  let prevH = heights?.from ?? 0;
  for (let i = 0; i <= steps; i++) {
    const fx = from.x + (dx * i) / steps;
    const fy = from.y + (dy * i) / steps;
    const x = Math.round(fx);
    const y = Math.round(fy);
    const end = (x === from.x && y === from.y) || (x === to.x && y === to.y);
    if (!end) {
      const type = cellAt(map, x, y);
      if (type === "wall" || (type === "door" && !isDoorOpen(cellKey(x, y)))) return false;
    }
    if (!heights) continue;
    const h = heights.from + ((heights.to - heights.from) * i) / steps;
    if (h < floorHeight(map, x, y) || h > ceilingHeight(map, x, y)) return false;
    // through a bridge's deck (between this sample and the last)
    const bridge = bridgeAt(map, x, y);
    if (bridge && i > 0) {
      const across = bridge.axis === "NS" ? fx - x : fy - y;
      const top = bridge.height;
      const bottom = top - BRIDGE_THICKNESS;
      if (Math.abs(across) < BRIDGE_WIDTH / 2 && Math.min(prevH, h) <= top && Math.max(prevH, h) >= bottom) return false;
    }
    prevH = h;
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
