import { BRIDGE_WIDTH, CLIMB_MS_PER_HEIGHT } from "../../game/heights";
import type { Vec2 } from "../../game/types";

import type { CamTarget } from "./camera";

// Jumping off a bridge: a step sideways off the deck (`side`, from the
// cell's center), the fall, and back under the bridge to the cell's center.
export function jumpPose(
  from: CamTarget,
  to: CamTarget,
  side: Vec2,
  elapsed: number,
  moveMs: number,
): { cam: CamTarget; done: boolean } {
  const drop = from.y - to.y;
  const off = { x: from.x + side.x * JUMP_CLEARANCE, z: from.z + side.y * JUMP_CLEARANCE };
  const fallMs = 1000 * Math.sqrt((2 * drop) / FALL_GRAVITY);
  const t1 = moveMs * 0.6;
  const t2 = t1 + fallMs;
  const t3 = t2 + moveMs;
  let x = to.x;
  let z = to.z;
  let y = to.y;
  if (elapsed < t1) {
    const e = easeInOutQuad(elapsed / t1);
    x = lerp(from.x, off.x, e);
    z = lerp(from.z, off.z, e);
    y = from.y;
  } else if (elapsed < t2) {
    const f = (elapsed - t1) / fallMs;
    x = off.x;
    z = off.z;
    y = from.y - drop * f * f;
  } else if (elapsed < t3) {
    const e = easeInOutQuad((elapsed - t2) / moveMs);
    x = lerp(off.x, to.x, e);
    z = lerp(off.z, to.z, e);
  }
  return {
    cam: { x, z, y, tx: x + (to.tx - to.x), tz: z + (to.tz - to.z) },
    done: elapsed >= t3,
  };
}

// how fast a fall off a ledge speeds up (wall heights per second squared;
// stylized - a wall is ~2.5 m, so real gravity would be ~4)
export const FALL_GRAVITY = 12;
// a fall starts this far into the step off the ledge
export const FALL_START = 0.4;
// ladder rungs are this far apart (wall heights); a climb pulls up rung by
// rung
export const RUNG_SPACING = 0.125;
// how far from a bridge's middle line a jump off it clears the deck
const JUMP_CLEARANCE = BRIDGE_WIDTH / 2 + 0.15;

// The camera along a ladder move: walk to the ladder, climb, walk off. Up:
// to the cell edge (the pulled-back eye then sits just in front of the step
// face), up, and on over the ledge. Down: out over the edge into the lower
// cell (the eye just beyond the step face), then down.
export function climbPose(from: CamTarget, to: CamTarget, elapsed: number, moveMs: number): { cam: CamTarget; done: boolean } {
  const up = to.y > from.y;
  const height = Math.abs(to.y - from.y);
  const climbMs = CLIMB_MS_PER_HEIGHT * height;
  const at = up ? { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 } : { x: to.x, z: to.z };
  const walkIn = up ? moveMs * 0.5 : moveMs;
  const walkOut = up ? moveMs * 0.5 : 0;
  const total = walkIn + climbMs + walkOut;

  let x: number;
  let z: number;
  let y: number;
  if (elapsed < walkIn) {
    const e = easeInOutQuad(elapsed / walkIn);
    x = lerp(from.x, at.x, e);
    z = lerp(from.z, at.z, e);
    y = from.y;
  } else if (elapsed < walkIn + climbMs) {
    const c = (elapsed - walkIn) / climbMs;
    // speeding up and slowing down once per rung
    const rungs = Math.max(1, Math.round(height / RUNG_SPACING));
    const p = c - (Math.sin(2 * Math.PI * c * rungs) / (2 * Math.PI * rungs)) * 0.8;
    x = at.x;
    z = at.z;
    y = lerp(from.y, to.y, p);
  } else {
    const e = walkOut ? easeOutQuad(Math.min(1, (elapsed - walkIn - climbMs) / walkOut)) : 1;
    x = lerp(at.x, to.x, e);
    z = lerp(at.z, to.z, e);
    y = to.y;
  }
  // the facing (normally unchanged by a move) blends over the whole climb
  const k = Math.min(1, elapsed / total);
  return {
    cam: { x, z, y, tx: x + lerp(from.tx - from.x, to.tx - to.x, k), tz: z + lerp(from.tz - from.z, to.tz - to.z, k) },
    done: elapsed >= total,
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
