// What the player hears of the map's sounds, worked out from the map alone (no Web Audio here, so it is all tested
// without a browser - see soundField.test.ts). The engine (engine.ts) plays what this says.
//
// Units: cells; x east, z south (the map's column and row), y up. A cell's middle is at its integer x, z and it covers
// half a cell each way. `blocked(x, y)` says whether a cell stops sound: a wall, the edge of the map, a closed door
// (an open door does not). The same function serves the walls counted and the doorways looked for.
import type { ResolvedSound } from "../game/sounds";

export type Blocked = (x: number, y: number) => boolean;
export interface Point {
  x: number;
  z: number;
}
export interface Spot extends Point {
  y: number;
}

// At most this many emitters sound at once: the nearest ones.
export const MAX_SOURCES = 12;
// Each wall between takes a step off the highs (the cutoff of a low-pass, Hz) and 6 dB off the level; after the third it
// gets no worse.
export const MUFFLE_CUTOFFS = [20000, 1600, 800, 400] as const;
export const MAX_WALLS = 3;
// how far from the listener a sound that comes through a doorway seems to be (cells)
export const PORTAL_DISTANCE = 1;

// ---- distance

// How loud a sound is at `distance` cells (0..1): full up to a cell, then falling like the air does (1 / distance, the
// faster the bigger `rolloff`), and fading to nothing over the last quarter of its `range` - so it is gone at `range`.
export function attenuation(distance: number, range: number, rolloff = 1): number {
  if (!(distance < range)) return 0;
  const base = distance <= 1 ? 1 : 1 / (1 + rolloff * (distance - 1));
  const from = range * 0.75;
  if (distance <= from) return base;
  const t = (distance - from) / (range - from);
  return base * (1 - t * t * (3 - 2 * t));
}

// ---- walls

// The number of blocked cells the straight line from one point to the other passes through, not counting the cell it
// starts in and the one it ends in. (A line through the crack between two blocked cells that touch at a corner counts
// that as one wall: sound doesn't slip through a diagonal gap.)
export function wallsBetween(ax: number, az: number, bx: number, bz: number, blocked: Blocked): number {
  let cx = Math.round(ax);
  let cy = Math.round(az);
  const ex = Math.round(bx);
  const ey = Math.round(bz);
  if (cx === ex && cy === ey) return 0;
  const dx = bx - ax;
  const dz = bz - az;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dz);
  // (the line's position, 0..1, where it crosses the next cell border in x and in z, and the step in that between borders)
  let tX = dx === 0 ? Infinity : ((stepX > 0 ? cx + 0.5 : cx - 0.5) - ax) / dx;
  let tY = dz === 0 ? Infinity : ((stepY > 0 ? cy + 0.5 : cy - 0.5) - az) / dz;
  const dtX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const dtY = dz === 0 ? Infinity : Math.abs(1 / dz);
  const EPS = 1e-9;
  let walls = 0;
  for (let guard = Math.abs(ex - cx) + Math.abs(ey - cy) + 4; guard > 0; guard--) {
    const t = Math.min(tX, tY);
    if (t > 1 + EPS) break;
    if (Math.abs(tX - tY) < EPS) {
      // (through a corner: both borders at once)
      const nx = cx + stepX;
      const ny = cy + stepY;
      if (!blocked(nx, ny) && blocked(nx, cy) && blocked(cx, ny)) walls++;
      cx = nx;
      cy = ny;
      tX += dtX;
      tY += dtY;
    } else if (tX < tY) {
      cx += stepX;
      tX += dtX;
    } else {
      cy += stepY;
      tY += dtY;
    }
    if (cx === ex && cy === ey) break;
    if (blocked(cx, cy)) walls++;
  }
  return walls;
}

// how a number of walls dulls a sound: the low-pass's cutoff (Hz) and the level it keeps
export function muffle(walls: number): { cutoff: number; gain: number } {
  const n = Math.max(0, Math.min(MAX_WALLS, Math.round(walls)));
  return { cutoff: MUFFLE_CUTOFFS[n], gain: 0.5 ** n };
}

// ---- doorways

export interface Cell {
  x: number;
  y: number;
}
// the cells within `maxSteps` of a start, by the number of steps (four neighbours, over cells that don't block), and how
// each was first reached
export interface PathField {
  start: Cell;
  steps: Map<number, number>;
  from: Map<number, number>;
}
const OFFSET = 32768;
const keyOf = (x: number, y: number) => (y + OFFSET) * 65536 + (x + OFFSET);
const cellOf = (key: number): Cell => ({ x: (key % 65536) - OFFSET, y: Math.floor(key / 65536) - OFFSET });

export function pathField(start: Cell, blocked: Blocked, maxSteps: number): PathField {
  const first = keyOf(start.x, start.y);
  const steps = new Map<number, number>([[first, 0]]);
  const from = new Map<number, number>();
  const queue = [first];
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i];
    const n = steps.get(here)!;
    if (n >= maxSteps) continue;
    const c = cellOf(here);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = keyOf(c.x + dx, c.y + dy);
      if (steps.has(key) || blocked(c.x + dx, c.y + dy)) continue;
      steps.set(key, n + 1);
      from.set(key, here);
      queue.push(key);
    }
  }
  return { start, steps, from };
}

// The shortest way from the field's start to a cell (the start first), or null: none within the steps, or the cell
// itself is shut (a sound inside a wall can't be got to).
export function pathTo(field: PathField, target: Cell): Cell[] | null {
  let key = keyOf(target.x, target.y);
  if (!field.steps.has(key)) return null;
  const path: Cell[] = [];
  for (let k: number | undefined = key; k !== undefined; k = field.from.get(k)) path.push(cellOf(k));
  return path.reverse();
}

// Which way a sound seems to come from when it reaches the listener along `path` (the way to its cell, the listener's
// cell first): toward the farthest cell of the path in clear sight of the listener - the doorway, for a sound in the
// next room - or, when none past the first step is, toward the first step. A unit vector (x, z).
export function portalDirection(listener: Point, path: readonly Cell[], blocked: Blocked): Point {
  for (let j = path.length - 1; j >= 1; j--) {
    const dx = path[j].x - listener.x;
    const dz = path[j].y - listener.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.25) continue;
    if (wallsBetween(listener.x, listener.z, path[j].x, path[j].y, blocked) === 0) return { x: dx / length, z: dz / length };
  }
  if (path.length < 2) return { x: 0, z: -1 };
  const dx = path[1].x - path[0].x;
  const dz = path[1].y - path[0].y;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

// ---- behind the listener

// 0 in front or at the side .. 1 straight behind, on the ground plane: only the rear half counts - a sound at the side
// is not dulled, one behind is, most when it is straight back.
export function behindness(listener: Point & { fx: number; fz: number }, x: number, z: number): number {
  const dx = x - listener.x;
  const dz = z - listener.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.3) return 0;
  return Math.max(0, -(dx * listener.fx + dz * listener.fz) / length);
}

// What the ear's shadow does to a sound `behind` (0..1) the listener: the highs cut (a low-pass from 18 kHz down to
// about 700 Hz straight behind) and the level cut to half there (-6 dB) - a front / back cue that works on speakers too.
export function rearFilter(behind: number): { cutoff: number; gain: number } {
  const b = Math.max(0, Math.min(1, behind));
  return { cutoff: 18000 * Math.pow(0.04, b), gain: 1 - 0.5 * b };
}

// ---- who sounds, and how

export interface Emitter {
  // its index in the map's sounds
  id: number;
  sound: ResolvedSound;
  // where it is, in the world
  x: number;
  y: number;
  z: number;
}
export interface Listener extends Spot {
  fx: number;
  fz: number;
}

// How far a sound is from the listener (3D, in cells: the world's height unit is a wall's height, about a cell)
export const distanceTo = (l: Spot, e: Spot) => Math.hypot(e.x - l.x, e.y - l.y, e.z - l.z);

// The nearest emitters that are within their range, at most `max`. Ones that sound already (`playing`) are kept a
// little ahead (half a cell), so two at about the same distance don't swap places at every step.
export function selectPool(listener: Spot, emitters: readonly Emitter[], max = MAX_SOURCES, playing?: ReadonlySet<number>): Emitter[] {
  return emitters
    .map((e) => ({ e, d: distanceTo(listener, e) }))
    .filter(({ e, d }) => d < e.sound.range)
    .sort((a, b) => a.d - (playing?.has(a.e.id) ? 0.5 : 0) - (b.d - (playing?.has(b.e.id) ? 0.5 : 0)) || a.e.id - b.e.id)
    .slice(0, max)
    .map(({ e }) => e);
}

// What is known of a sound that stays the same while the listener walks about inside a cell: how many walls are in the
// way, and - if there are - the way round through a doorway.
export interface SourcePlan {
  id: number;
  walls: number;
  portal?: {
    // the cell after the listener's on the way, where the path's rest begins; and the cells from there to the sound's
    via: Cell;
    after: number;
    // which way it seems to come from: a unit vector
    dir: Point;
  };
}

// The plan for each emitter of the pool. Only a sound with a wall between gets a way round - found with one search
// from the listener's cell for all of them, as far as the farthest of them reaches.
export function planSources(listener: Spot, emitters: readonly Emitter[], blocked: Blocked, max = MAX_SOURCES, playing?: ReadonlySet<number>): SourcePlan[] {
  const pool = selectPool(listener, emitters, max, playing);
  const plans = pool.map((e): SourcePlan => ({ id: e.id, walls: wallsBetween(listener.x, listener.z, e.x, e.z, blocked) }));
  const shut = plans.filter((p) => p.walls > 0);
  if (!shut.length) return plans;
  const byId = new Map(pool.map((e) => [e.id, e]));
  const reach = Math.max(...shut.map((p) => Math.floor(byId.get(p.id)!.sound.range)));
  const field = pathField({ x: Math.round(listener.x), y: Math.round(listener.z) }, blocked, reach);
  for (const plan of shut) {
    const e = byId.get(plan.id)!;
    const path = pathTo(field, { x: Math.round(e.x), y: Math.round(e.z) });
    if (!path || path.length < 2 || path.length - 1 > Math.floor(e.sound.range)) continue;
    plan.portal = { via: path[1], after: path.length - 2, dir: portalDirection(listener, path, blocked) };
  }
  return plans;
}

// What one voice of a sound is doing now: where it seems to be, how loud, and how dulled.
export interface VoiceTarget {
  // the way it reaches the listener: straight (through the walls there are), or through a doorway
  role: "direct" | "portal";
  x: number;
  y: number;
  z: number;
  // 0..1
  level: number;
  // the low-pass after the walls, and the level they leave
  cutoff: number;
  wallGain: number;
}

// The voices of a sound for the listener where it is now (runs every frame: cheap). The direct voice is at the
// sound's own spot, its loudness from the straight distance, dulled by the walls. A sound that also has a way round
// gets a second voice about a cell from the listener toward the doorway, its loudness from the length of that way (not
// the straight distance), not dulled - so it is heard from both.
export function voiceTargets(listener: Spot, emitter: Emitter, plan: SourcePlan): VoiceTarget[] {
  const { sound } = emitter;
  const straight = distanceTo(listener, emitter);
  const out: VoiceTarget[] = [];
  const wall = muffle(plan.walls);
  const direct = sound.volume * attenuation(straight, sound.range, sound.rolloff);
  if (direct > 0) out.push({ role: "direct", x: emitter.x, y: emitter.y, z: emitter.z, level: direct, cutoff: wall.cutoff, wallGain: wall.gain });
  if (plan.portal) {
    // (the way's length: to the next cell, then on - never less than the straight distance)
    const way = Math.max(straight, Math.hypot(plan.portal.via.x - listener.x, plan.portal.via.y - listener.z) + plan.portal.after);
    const level = sound.volume * attenuation(way, sound.range, sound.rolloff);
    if (level > 0) {
      out.push({
        role: "portal",
        x: listener.x + plan.portal.dir.x * PORTAL_DISTANCE,
        y: listener.y,
        z: listener.z + plan.portal.dir.z * PORTAL_DISTANCE,
        level,
        cutoff: MUFFLE_CUTOFFS[0],
        wallGain: 1,
      });
    }
  }
  return out;
}
