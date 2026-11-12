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

  // Whether the segment from the viewer to (px, pz) crosses no opaque cell
  // before reaching the target cell (tx, ty). It walks the exact cells the
  // segment passes through (not points along it, which can skip the corner
  // of a wall cell, or slip between two wall cells touching at a corner -
  // the walls there meet, nothing shows through). Through exactly a corner
  // it's blocked only when both cells beside it are opaque.
  const clear = (px: number, pz: number, tx: number, ty: number) => {
    const dx = px - fromX;
    const dz = pz - fromZ;
    let x = cx;
    let y = cy;
    const sx = dx > 0 ? 1 : -1;
    const sy = dz > 0 ? 1 : -1;
    // the segment's parameter (0..1) at the next column / row boundary, and
    // per whole cell
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx1 = dx !== 0 ? (x + sx * 0.5 - fromX) / dx : Infinity;
    let ty1 = dz !== 0 ? (y + sy * 0.5 - fromZ) / dz : Infinity;
    const blocked = (bx: number, by: number) => (bx !== cx || by !== cy) && opaque(bx, by);
    for (let guard = 0; guard < 4 * (radius + 2); guard++) {
      if (x === tx && y === ty) return true;
      const t = Math.min(tx1, ty1);
      if (t > 1) return true;
      if (Math.abs(tx1 - ty1) < 1e-9) {
        // through a corner
        if (blocked(x + sx, y) && blocked(x, y + sy)) return false;
        x += sx;
        y += sy;
        tx1 += tdx;
        ty1 += tdy;
      } else if (tx1 < ty1) {
        x += sx;
        tx1 += tdx;
      } else {
        y += sy;
        ty1 += tdy;
      }
      if (x === tx && y === ty) return true;
      if (blocked(x, y)) return false;
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
