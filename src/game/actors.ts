import { cellAt, doorCrossed, floorHeight } from "./map";
import { DIR_VECTOR, rightOf } from "./movement";
import { PROP_TYPES } from "./props";
import { passage } from "./heights";
import { lineOfSight } from "./visibility";
import type { Body } from "./heights";
import type { ActorSpec, Direction, GameMap, Vec2 } from "./types";

// Moving actors (robots, NPCs, enemies): each stands in a cell, walks cell
// to cell along its patrol route and is drawn as a Doom-style sprite that
// always faces the camera, its picture chosen by the angle it's seen from
// (see GameViewport). An actor holds its cell - and while walking, the one
// it's leaving too - so the party can't walk into it.
//
// Hostile ones fight: once one sees the party it closes in to its attack
// range and fires on its cooldown. Hits (see combat.ts) land on a body part,
// which can stun it, disarm it or slow it down.

// body parts, for aiming: where each sits in a sheet cell (a Zone)
// (the arms are two parts, the sheet's left and right: aiming at "the arms"
// would put the crosshair between them, on the body)
export type BodyPart = "head" | "torso" | "armL" | "armR" | "legs";
export const BODY_PARTS: BodyPart[] = ["head", "torso", "armL", "armR", "legs"];

export interface ActorType {
  // for the log, e.g. "A combat robot"
  name: string;
  // sprite sheet: public/actors/<sheet>/ (diffuse.png, normal.png), a grid
  // of `cols` directions x `rows` poses (see scripts/make-actor-sheet.ts)
  sheet: string;
  cols: number;
  rows: number;
  // a sheet cell's width / height
  cellAspect: number;
  // how tall a sheet cell stands (wall heights)
  height: number;
  // what it fits through (see Body): the lowest opening, the highest step;
  // its eyes are at eyeHeight above its feet (wall heights)
  body: Body;
  eyeHeight: number;
  // how long a step to the next cell takes
  moveMs: number;
  // the pause at each patrol point
  waitMs: number;
  // sheet rows: standing, and the walk cycle over one step
  idleRow: number;
  walkRows: number[];
  // and, if the sheet has them: firing (one row, or a few played in turn
  // while it fires), falling (in order) and the wreck left lying (without
  // them it fades out when it dies)
  shootRow?: number;
  shootRows?: number[];
  dieRows?: number[];
  wreckRow?: number;
  // what its wreck gives when searched (a loot table - see items.ts)
  loot?: string;
  // the sheet row shown for a moment when it's hit
  hitRow?: number;
  // a harmless one (a cleaning drone): it takes no notice of the party,
  // never fights, shares a cell with it - and when hit, flees for
  // `fleeMs`, at `fleeSpeed` times its pace. Without a route it wanders.
  passive?: { fleeMs: number; fleeSpeed: number };
  // fighting
  hp: number;
  // damage per shot at the party, and how far (cells) and how often it fires
  damage: [number, number];
  attackRange: number;
  attackCooldownMs: number;
  // its aim: the chance to hit an exposed party at point blank, and how much
  // that drops per cell (cover lowers it further, see partyHitChance)
  accuracy: number;
  falloff: number;
  // how far (cells) it notices the party - only ahead, within its field of
  // view (degrees, all of it) - and, once hunting it, how far it keeps
  // track of it, all round
  sight: number;
  fieldOfView: number;
  huntSight: number;
  // how near (cells) it hears the party, whichever way it faces
  hearing: number;
  // how long it stays alert without seeing or hearing the party (game ms)
  alertMs: number;
  // how it moves in a fight (see stepActors)
  tactics: ActorTactics;
  // parts that glow (optics, vents...): the sheet's bright pixels of a
  // color (default red) shining in their own color whatever the light -
  // within these weak spots (by label - see crits) and these zones (per
  // sheet column), or with neither anywhere on it; `intensity` scales it
  glow?: { crits?: string[]; zones?: Zone[][]; color?: "red" | "blue" | "cyan"; intensity: number };
  // its body parts' names (for the aiming overlay) and where they are
  parts: Record<BodyPart, { label: string; zone: Zone }>;
  // weak spots: a hit there counts as a hit on their part, only harder
  // (see CRIT_DAMAGE)
  crits: CritSpot[];
}

// How an actor fights around its gun's cooldown. A dumb or heavily armored
// robot (or a zombie) stands its ground: retreat [0, 0], advance false.
export interface ActorTactics {
  // how long it holds still after a shot (game ms)
  shotPauseMs: number;
  // how many cells it falls back after a shot, at least / at most
  retreat: [number, number];
  // falling back, it heads for cover: out of the party's sight, or by a prop
  // (else just away)
  seeksCover: boolean;
  // just before it's ready, it steps forward into a line of fire...
  advance: boolean;
  // ... no closer to the party than this (cells)
  minRange: number;
  // a volley: this many shots `gapMs` apart each time it fires (then its
  // cooldown)
  volley?: { shots: number; gapMs: number };
  // while its gun cools down it keeps coming at the party (down to
  // minRange) instead of standing its ground
  closesIn?: boolean;
}

// a rectangle of a sheet cell: x0, y0, x1, y1 as fractions from its top left
export type Zone = [number, number, number, number];

// A weak spot (eyes, a joint, a vent): where it is in each sheet column -
// it moves as the actor turns (none: not seen from there).
export interface CritSpot {
  part: BodyPart;
  label: string;
  zones: Zone[][];
}

// the weak spot at a spot of a sheet cell in column `col`, if any
export function critAt(type: ActorType, col: number, u: number, v: number): CritSpot | null {
  for (const crit of type.crits) {
    for (const [x0, y0, x1, y1] of crit.zones[col] ?? []) {
      if (u >= x0 && u <= x1 && v >= y0 && v <= y1) return crit;
    }
  }
  return null;
}

export const ACTOR_TYPES: Record<string, ActorType> = {
  robot1: {
    name: "A combat robot",
    sheet: "robot1",
    cols: 5,
    rows: 7,
    cellAspect: 1,
    height: 0.93,
    // fits wherever the party does
    body: { headroom: 0.75, step: 0.25 },
    eyeHeight: 0.62,
    moveMs: 900,
    waitMs: 1800,
    idleRow: 0,
    walkRows: [1, 0, 2, 0],
    shootRow: 3,
    // (its first dying frame, for a moment)
    hitRow: 4,
    dieRows: [4, 5],
    wreckRow: 6,
    loot: "robot",
    hp: 60,
    damage: [3, 6],
    attackRange: 4,
    attackCooldownMs: 2600,
    accuracy: 0.9,
    falloff: 0.12,
    sight: 5,
    fieldOfView: 120,
    huntSight: 7,
    hearing: 1,
    alertMs: 8000,
    tactics: { shotPauseMs: 250, retreat: [1, 2], seeksCover: true, advance: true, minRange: 2 },
    glow: { crits: ["OPTICS", "REACTOR VENT"], intensity: 1.4 },
    parts: {
      head: { label: "SENSOR", zone: [0.35, 0.242, 0.65, 0.4] },
      torso: { label: "CORE", zone: [0.35, 0.4, 0.665, 0.665] },
      armL: { label: "WEAPON ARM", zone: [0.155, 0.356, 0.5, 0.806] },
      armR: { label: "WEAPON ARM", zone: [0.5, 0.356, 0.845, 0.806] },
      legs: { label: "LEGS", zone: [0.275, 0.665, 0.725, 0.991] },
    },
    // columns: front, front-side, side, back-side, back
    crits: [
      {
        part: "head",
        label: "OPTICS",
        zones: [[[0.425, 0.334, 0.575, 0.391]], [[0.35, 0.338, 0.47, 0.396]], [[0.357, 0.338, 0.432, 0.396]], [], []],
      },
      {
        part: "head",
        label: "ANTENNA",
        zones: [
          [[0.598, 0.25, 0.642, 0.347]],
          [[0.59, 0.242, 0.635, 0.347]],
          [[0.59, 0.242, 0.635, 0.33]],
          [[0.372, 0.242, 0.432, 0.383]],
          [[0.372, 0.25, 0.417, 0.374]],
        ],
      },
      {
        part: "torso",
        label: "REACTOR VENT",
        zones: [
          [[0.455, 0.453, 0.552, 0.55]],
          [[0.372, 0.462, 0.448, 0.55]],
          [[0.41, 0.471, 0.53, 0.559]],
          [[0.545, 0.409, 0.605, 0.568]],
          [[0.455, 0.418, 0.53, 0.585]],
        ],
      },
      {
        part: "armL",
        label: "ELBOW JOINT",
        zones: [
          [[0.193, 0.603, 0.342, 0.665]],
          [[0.185, 0.603, 0.328, 0.665]],
          [[0.297, 0.63, 0.38, 0.7]],
          [[0.193, 0.603, 0.312, 0.665]],
          [[0.193, 0.603, 0.328, 0.665]],
        ],
      },
      {
        part: "armR",
        label: "ELBOW JOINT",
        zones: [
          [[0.665, 0.603, 0.815, 0.665]],
          [[0.665, 0.603, 0.8, 0.665]],
          [[0.56, 0.612, 0.695, 0.682]],
          [[0.605, 0.603, 0.762, 0.665]],
          [[0.672, 0.603, 0.807, 0.665]],
        ],
      },
      {
        part: "legs",
        label: "KNEE JOINT",
        zones: [
          [[0.342, 0.753, 0.477, 0.824], [0.575, 0.753, 0.695, 0.824]],
          [[0.357, 0.753, 0.485, 0.824], [0.522, 0.762, 0.665, 0.832]],
          [[0.425, 0.753, 0.575, 0.824]],
          [[0.335, 0.753, 0.47, 0.824], [0.53, 0.753, 0.665, 0.824]],
          [[0.328, 0.762, 0.448, 0.832], [0.56, 0.762, 0.68, 0.832]],
        ],
      },
    ],
  },
  // a tracked gun drone: slow and massive (it doesn't fit the low
  // corridors), it opens with a long volley from its chaingun, then grinds
  // on toward the party while it spins up again - it never falls back
  robot2: {
    name: "A siege drone",
    sheet: "robot2",
    cols: 5,
    rows: 7,
    cellAspect: 256 / 192,
    height: 0.85,
    body: { headroom: 0.75, step: 0.25 },
    eyeHeight: 0.5,
    moveMs: 1400,
    waitMs: 2200,
    idleRow: 0,
    walkRows: [0, 1],
    shootRows: [2, 3],
    hitRow: 4,
    dieRows: [4, 5],
    wreckRow: 6,
    loot: "tank",
    // its visor
    glow: { color: "blue", intensity: 1.5 },
    hp: 150,
    damage: [1, 3],
    attackRange: 5,
    attackCooldownMs: 5200,
    accuracy: 0.7,
    falloff: 0.08,
    sight: 5,
    fieldOfView: 110,
    huntSight: 8,
    hearing: 1,
    alertMs: 12000,
    tactics: {
      shotPauseMs: 300,
      retreat: [0, 0],
      seeksCover: false,
      advance: false,
      minRange: 1,
      volley: { shots: 7, gapMs: 150 },
      closesIn: true,
    },
    parts: {
      head: { label: "SENSOR", zone: [0.38, 0.22, 0.62, 0.42] },
      torso: { label: "HULL", zone: [0.3, 0.4, 0.72, 0.68] },
      armL: { label: "CHAINGUN", zone: [0.08, 0.38, 0.4, 0.62] },
      armR: { label: "ARM", zone: [0.68, 0.36, 0.9, 0.66] },
      legs: { label: "TRACKS", zone: [0.14, 0.66, 0.86, 1] },
    },
    // columns: front, front-side, side, back-side, back
    crits: [
      {
        part: "head",
        label: "OPTICS",
        zones: [[[0.43, 0.26, 0.57, 0.36]], [[0.4, 0.26, 0.54, 0.36]], [[0.38, 0.26, 0.5, 0.36]], [], []],
      },
    ],
  },
  // a floor-cleaning drone: harmless and low (it fits where the party
  // doesn't), it wanders about and takes no notice of anyone - until it's
  // hit: then it runs
  vacuum1: {
    name: "A cleaning drone",
    sheet: "vacuum1",
    cols: 5,
    rows: 3,
    cellAspect: 1.5,
    height: 0.36,
    body: { headroom: 0.25, step: 0 },
    eyeHeight: 0.12,
    moveMs: 1100,
    waitMs: 1400,
    idleRow: 0,
    walkRows: [0],
    hitRow: 1,
    dieRows: [1],
    wreckRow: 2,
    loot: "vacuum",
    // its dome and display
    glow: { color: "cyan", intensity: 1.3 },
    passive: { fleeMs: 7000, fleeSpeed: 2.2 },
    hp: 14,
    damage: [0, 0],
    attackRange: 0,
    attackCooldownMs: 1e9,
    accuracy: 0,
    falloff: 0,
    sight: 0,
    fieldOfView: 0,
    huntSight: 0,
    hearing: 0,
    alertMs: 0,
    tactics: { shotPauseMs: 0, retreat: [0, 0], seeksCover: false, advance: false, minRange: 0 },
    parts: {
      head: { label: "SENSOR DOME", zone: [0.36, 0.36, 0.64, 0.6] },
      torso: { label: "CASING", zone: [0.18, 0.55, 0.82, 0.9] },
      armL: { label: "BRUSH", zone: [0.02, 0.78, 0.3, 1] },
      armR: { label: "BRUSH", zone: [0.7, 0.78, 0.98, 1] },
      legs: { label: "WHEELS", zone: [0.3, 0.88, 0.7, 1] },
    },
    crits: [],
  },
  // a floor-cleaning drone: harmless and low (it fits where the party
  // doesn't), it wanders about and takes no notice of anyone - until it's
  // hit: then it runs
  vacuum2: {
    name: "A heavy cleaning drone",
    sheet: "vacuum2",
    cols: 5,
    rows: 3,
    cellAspect: 1.5,
    height: 0.42,
    body: { headroom: 0.25, step: 0 },
    eyeHeight: 0.12,
    moveMs: 1100,
    waitMs: 1400,
    idleRow: 0,
    walkRows: [0],
    hitRow: 1,
    dieRows: [1],
    wreckRow: 2,
    loot: "vacuum",
    // its beacon and its front and back slits (not its red paint)
    glow: {
      intensity: 1.5,
      zones: [
        [[0.67, 0.23, 0.74, 0.35], [0.38, 0.75, 0.62, 0.83]],
        [[0.69, 0.17, 0.76, 0.28], [0.24, 0.67, 0.45, 0.79]],
        [[0.74, 0.22, 0.8, 0.34]],
        [[0.39, 0.24, 0.46, 0.36]],
        [[0.47, 0.25, 0.54, 0.37], [0.42, 0.7, 0.58, 0.75]],
      ],
    },
    passive: { fleeMs: 7000, fleeSpeed: 2.2 },
    hp: 24,
    damage: [0, 0],
    attackRange: 0,
    attackCooldownMs: 1e9,
    accuracy: 0,
    falloff: 0,
    sight: 0,
    fieldOfView: 0,
    huntSight: 0,
    hearing: 0,
    alertMs: 0,
    tactics: { shotPauseMs: 0, retreat: [0, 0], seeksCover: false, advance: false, minRange: 0 },
    parts: {
      head: { label: "SENSOR DOME", zone: [0.36, 0.36, 0.64, 0.6] },
      torso: { label: "CASING", zone: [0.18, 0.55, 0.82, 0.9] },
      armL: { label: "BRUSH", zone: [0.02, 0.78, 0.3, 1] },
      armR: { label: "BRUSH", zone: [0.7, 0.78, 0.98, 1] },
      legs: { label: "WHEELS", zone: [0.3, 0.88, 0.7, 1] },
    },
    crits: [],
  },
};

export interface ActorState {
  id: number;
  type: string;
  // where it stands - or, while walking, where it's headed - and the
  // height of the surface it's on there (a floor, or a bridge's deck)
  cell: Vec2;
  y: number;
  // the cell it's walking from (and its surface's height), and when it set
  // off (performance.now())
  from: Vec2;
  fromY: number;
  moveStart: number;
  facing: Direction;
  patrol: Vec2[];
  // the patrol point it's heading for, and the way it walks the route
  // (back and forth)
  target: number;
  forward: boolean;
  // standing still until then
  waitUntil: number;
  // how long the step it's taking lasts (slowed actors walk slower)
  moveMs: number;
  // fighting: it's alert (has seen the party and hunts it)
  hp: number;
  hostile: boolean;
  // when it last saw, heard or was hit by the party, and where the party
  // was then (where it searches)
  lastSeenAt: number;
  lastSeenCell: Vec2 | null;
  // after a shot: cells still to fall back; and whether it has stepped
  // forward for the next shot yet
  retreatSteps: number;
  advanced: boolean;
  // shots still to come in the volley it's firing (see ActorTactics.volley)
  volleyLeft: number;
  lastAttack: number;
  stunnedUntil: number;
  disarmedUntil: number;
  slowedUntil: number;
  // when it was last hit (a flash) and when it died (game time)
  hitAt: number;
  diedAt: number | null;
}

// (the map loader can't check actor types: actors.ts imports the map
// module, so this does)
export function createActors(map: GameMap, now: number): ActorState[] {
  const known = (map.actors ?? []).filter((spec) => {
    if (ACTOR_TYPES[spec.actor]) return true;
    console.error(`${map.id}: unknown actor "${spec.actor}" at ${spec.cell.x},${spec.cell.y}`);
    return false;
  });
  return known.map((spec: ActorSpec, id) => ({
    id,
    type: spec.actor,
    cell: spec.cell,
    y: floorHeight(map, spec.cell.x, spec.cell.y),
    from: spec.cell,
    fromY: floorHeight(map, spec.cell.x, spec.cell.y),
    moveStart: now - 1e6,
    facing: spec.facing,
    patrol: spec.patrol.length ? spec.patrol : [spec.cell],
    target: 0,
    forward: true,
    waitUntil: now,
    moveMs: ACTOR_TYPES[spec.actor].moveMs,
    hp: ACTOR_TYPES[spec.actor].hp,
    hostile: false,
    lastSeenAt: -1e9,
    lastSeenCell: null,
    retreatSteps: 0,
    advanced: false,
    volleyLeft: 0,
    lastAttack: -1e9,
    stunnedUntil: 0,
    disarmedUntil: 0,
    slowedUntil: 0,
    hitAt: -1e9,
    diedAt: null,
  }));
}

export function actorMoving(actor: ActorState, now: number): boolean {
  return now - actor.moveStart < actor.moveMs;
}

// the (living) actor holding a cell (its own, or the one it's leaving) -
// at the surface of height `y` if given (under a bridge is room for another)
export function actorAt(actors: readonly ActorState[], cell: Vec2, now: number, y?: number): ActorState | undefined {
  const level = (h: number) => y === undefined || Math.abs(h - y) < 1e-6;
  return actors.find(
    (a) =>
      a.diedAt === null &&
      ((a.cell.x === cell.x && a.cell.y === cell.y && level(a.y)) ||
        (actorMoving(a, now) && a.from.x === cell.x && a.from.y === cell.y && level(a.fromY))),
  );
}

// the party's eyes above its feet, for the actors' line of sight
const PARTY_EYE = 0.55;

// an actor's shot at the party
export interface ActorAttack {
  actor: number;
  damage: number;
  // how far (cells) it fired from
  distance: number;
}

// An actor's chance to hit the party from `distance` cells, with `exposed`
// the share of the party's body it sees past the cover (see GameViewport's
// party cover).
export function partyHitChance(type: ActorType, distance: number, exposed: number): number {
  return Math.max(0.05, type.accuracy - type.falloff * Math.max(0, distance - 1)) * exposed;
}

const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;
const DIRECTIONS: Direction[] = ["N", "E", "S", "W"];

const toward = (from: Vec2, to: Vec2): Direction =>
  Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? (to.x > from.x ? "E" : "W") : to.y > from.y ? "S" : "N";

// Advances the actors to `now` (game time). A living one that's done
// walking and waiting:
// - unaware: walks its patrol route. It notices the party ahead of it
//   (within its sight and field of view), or hears it right next to it -
//   or feels a shot land - and turns alert.
// - alert, seeing the party: fights in a rhythm around its gun's cooldown
//   (as its type's tactics allow) - fires, holds still a moment, falls back
//   a cell or two (to a cell out of the party's line of sight, or by a
//   crate, if there's one), waits there while it reloads, steps forward
//   into a line of fire just before it's ready, and fires again. Out of
//   range, it closes in.
// - alert, not seeing it: waits in cover while reloading, then goes to
//   where it last saw the party and looks around. After alertMs without
//   seeing (or hearing) it, it's unaware again and back to its route.
// Returns the same array if nothing changed, plus the shots fired.
export function stepActors(
  map: GameMap,
  actors: ActorState[],
  now: number,
  party: Vec2,
  isDoorOpen: (cell: Vec2) => boolean,
  // the height the party stands at
  partyY: number = floorHeight(map, party.x, party.y),
): { actors: ActorState[]; attacks: ActorAttack[] } {
  let changed = false;
  const attacks: ActorAttack[] = [];
  const doorOpen = (key: string) => {
    const [x, y] = key.split(",").map(Number);
    return isDoorOpen({ x, y });
  };
  // from an actor's eyes (standing at `fromY` in a cell) to the party's
  const clearLine = (from: Vec2, to: Vec2, eyes: number) => lineOfSight(map, from, to, doorOpen, { from: eyes, to: partyY + PARTY_EYE });
  // cells with a prop to hide by (not the ones hung on walls)
  const propCells = new Set((map.props ?? []).filter((p) => !PROP_TYPES[p.prop]?.wall).map((p) => `${p.cell.x},${p.cell.y}`));

  const next = actors.map((actor) => {
    const type = ACTOR_TYPES[actor.type];
    if (actor.diedAt !== null || actorMoving(actor, now) || now < actor.waitUntil || now < actor.stunnedUntil) {
      return actor;
    }
    let a = actor;
    const update = (patch: Partial<ActorState>) => {
      a = { ...a, ...patch };
      changed = true;
    };

    // the surface it'd walk onto in a neighbouring cell (a walk - no drops,
    // no ladders - where it fits and nobody stands), or null
    const stepY = (to: Vec2, dir: Direction): number | null => {
      if (cellAt(map, to.x, to.y) === "wall") return null;
      const door = doorCrossed(map, a.cell, to);
      if (door && !isDoorOpen(door)) return null;
      const way = passage(map, a.cell, a.y, to, dir, type.body);
      if (way.kind !== "walk") return null;
      const partyThere = !type.passive && same(to, party) && Math.abs(way.y - partyY) < 1e-6;
      if (partyThere || actors.some((o) => o !== actor && actorAt([o], to, now, way.y))) return null;
      return way.y;
    };
    const canStep = (to: Vec2, dir: Direction) => stepY(to, dir) !== null;
    const neighbours = () =>
      DIRECTIONS.map((dir) => ({ dir, to: { x: a.cell.x + DIR_VECTOR[dir].x, y: a.cell.y + DIR_VECTOR[dir].y } })).filter(
        ({ to, dir }) => canStep(to, dir),
      );
    // its eyes, standing at height `y`
    const eyes = (y: number) => y + type.eyeHeight;
    // takes a step; in a fight it keeps facing the party (backing off, say)
    const stepTo = (to: Vec2, dir: Direction, face?: Vec2, speed = 1) => {
      update({
        from: a.cell,
        fromY: a.y,
        cell: to,
        y: stepY(to, dir) ?? a.y,
        moveStart: now,
        moveMs: (type.moveMs * (now < a.slowedUntil ? 2 : 1)) / speed,
        facing: face ? toward(to, face) : dir,
      });
      return a;
    };
    // a step toward a cell: along the longer axis first, the other if that's
    // blocked; if neither works it looks that way and tries again shortly
    const walkToward = (goal: Vec2) => {
      const dx = goal.x - a.cell.x;
      const dy = goal.y - a.cell.y;
      const horizontal: Direction | null = dx > 0 ? "E" : dx < 0 ? "W" : null;
      const vertical: Direction | null = dy > 0 ? "S" : dy < 0 ? "N" : null;
      const tries = (Math.abs(dx) >= Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal]).filter(
        (d): d is Direction => d !== null,
      );
      for (const dir of tries) {
        const v = DIR_VECTOR[dir];
        const to = { x: a.cell.x + v.x, y: a.cell.y + v.y };
        if (canStep(to, dir)) return stepTo(to, dir);
      }
      update({ facing: tries[0] ?? a.facing, waitUntil: now + 500 });
      return a;
    };

    // A harmless one: hit, it flees - each step to the neighbouring cell
    // farthest from the party, out of its sight if it can; else it goes
    // about its route, or wanders (on mostly straight, turning now and then)
    if (type.passive) {
      if (now - a.hitAt < type.passive.fleeMs) {
        let best: { to: Vec2; dir: Direction; score: number } | null = null;
        for (const { to, dir } of neighbours()) {
          const away = Math.hypot(party.x - to.x, party.y - to.y) - Math.hypot(party.x - a.cell.x, party.y - a.cell.y);
          const hidden = !clearLine(to, party, eyes(stepY(to, dir) ?? a.y));
          const score = away * 2 + (hidden ? 3 : 0) + Math.random() * 0.5;
          if (!best || score > best.score) best = { to, dir, score };
        }
        if (best) return stepTo(best.to, best.dir, undefined, type.passive.fleeSpeed);
        update({ waitUntil: now + 300 });
        return a;
      }
      if (a.patrol.length < 2) {
        const open = neighbours();
        if (!open.length || Math.random() < 0.25) {
          update({ waitUntil: now + type.waitMs * (0.5 + Math.random()) });
          return a;
        }
        const ahead = open.find((n) => n.dir === a.facing);
        const next = ahead && Math.random() < 0.7 ? ahead : open[Math.floor(Math.random() * open.length)];
        return stepTo(next.to, next.dir);
      }
    } else {
    // what it senses of the party
    const dist = Math.hypot(party.x - a.cell.x, party.y - a.cell.y);
    const ahead = DIR_VECTOR[a.facing];
    const inView =
      dist < 1e-6 ||
      ((party.x - a.cell.x) * ahead.x + (party.y - a.cell.y) * ahead.y) / dist >= Math.cos(((type.fieldOfView / 2) * Math.PI) / 180);
    const line = dist <= type.huntSight && clearLine(a.cell, party, eyes(a.y));
    const sees = line && (a.hostile ? dist <= type.huntSight : (inView && dist <= type.sight) || dist <= type.hearing);

    // a shot it didn't see coming: now it knows where the party is
    if (a.hitAt > a.lastSeenAt) {
      update({ hostile: true, lastSeenAt: a.hitAt, lastSeenCell: party, facing: toward(a.cell, party) });
    }
    if (sees && !a.hostile) {
      // noticed: turns to the party, a moment to react
      update({ hostile: true, lastSeenAt: now, lastSeenCell: party, facing: toward(a.cell, party), waitUntil: now + 400 });
      return a;
    }
    if (sees) update({ lastSeenAt: now, lastSeenCell: party });
    if (a.hostile && !sees && now - a.lastSeenAt > type.alertMs) {
      // lost it: back to its route, unaware
      update({ hostile: false, lastSeenCell: null, retreatSteps: 0, advanced: false, volleyLeft: 0 });
    }

    if (a.hostile) {
      // (mid-volley: the gap between its shots)
      const cooldown = a.volleyLeft > 0 && type.tactics.volley ? type.tactics.volley.gapMs : type.attackCooldownMs;
      const cooldownLeft = cooldown - (now - a.lastAttack);
      const disarmed = now < a.disarmedUntil;
      const soonReady = !disarmed && cooldownLeft <= type.moveMs * 1.1;
      const goal = a.lastSeenCell ?? party;
      const tactics = type.tactics;

      if (sees && dist <= type.attackRange && !disarmed && cooldownLeft <= 0) {
        const [lo, hi] = type.damage;
        attacks.push({ actor: a.id, damage: lo + Math.floor(Math.random() * (hi - lo + 1)), distance: dist });
        const [fewest, most] = tactics.retreat;
        // a volley: the shots left after this one
        const volleyLeft = tactics.volley ? (a.volleyLeft > 0 ? a.volleyLeft : tactics.volley.shots) - 1 : 0;
        update({
          facing: toward(a.cell, party),
          lastAttack: now,
          volleyLeft,
          retreatSteps: volleyLeft > 0 ? 0 : fewest + Math.floor(Math.random() * (most - fewest + 1)),
          advanced: false,
          // holds still a moment after the shot (mid-volley: until the next)
          waitUntil: now + (volleyLeft > 0 ? tactics.volley!.gapMs : tactics.shotPauseMs),
        });
        return a;
      }

      // falling back after a shot, while the gun cools down: to cover if
      // there's some - out of the party's sight, or by a prop - else away
      if (a.retreatSteps > 0 && !soonReady) {
        let best: { to: Vec2; dir: Direction; score: number } | null = null;
        for (const { to, dir } of neighbours()) {
          const away = Math.hypot(goal.x - to.x, goal.y - to.y) - Math.hypot(goal.x - a.cell.x, goal.y - a.cell.y);
          const hidden = !clearLine(to, goal, eyes(stepY(to, dir) ?? a.y));
          const toParty = { x: to.x + Math.sign(goal.x - to.x), y: to.y + Math.sign(goal.y - to.y) };
          const byProp = propCells.has(`${to.x},${to.y}`) || propCells.has(`${toParty.x},${toParty.y}`);
          const cover = tactics.seeksCover ? (hidden ? 3 : 0) + (byProp ? 2 : 0) : 0;
          const score = cover + (away > 0 ? 1 : away < 0 ? -2 : 0);
          if (score > 0 && (!best || score > best.score)) best = { to, dir, score };
        }
        update({ retreatSteps: best ? a.retreatSteps - 1 : 0 });
        if (best) return stepTo(best.to, best.dir, goal);
      }

      // almost ready: steps forward into a line of fire (no closer than two
      // cells), unless it has one already where it stands
      if (tactics.advance && soonReady && !a.advanced && !(sees && dist >= tactics.minRange)) {
        let best: { to: Vec2; dir: Direction; d: number } | null = null;
        for (const { to, dir } of neighbours()) {
          const d = Math.hypot(goal.x - to.x, goal.y - to.y);
          if (d < tactics.minRange || !clearLine(to, goal, eyes(stepY(to, dir) ?? a.y))) continue;
          if (!best || d < best.d) best = { to, dir, d };
        }
        update({ advanced: true });
        if (best) return stepTo(best.to, best.dir, goal);
      }

      if (sees) {
        if (dist > type.attackRange) return walkToward(party);
        // reloading, it keeps coming (if that's its way)
        if (tactics.closesIn && a.volleyLeft === 0 && dist > tactics.minRange + 1e-6) return walkToward(party);
        // in range, reloading: keeps an eye on the party
        if (a.facing !== toward(a.cell, party)) update({ facing: toward(a.cell, party) });
        return a;
      }
      // doesn't see it: waits in cover while reloading, then searches where
      // it last saw the party, looking around once there
      if (!soonReady && a.lastSeenCell && !same(a.cell, a.lastSeenCell) && now - a.lastSeenAt < type.attackCooldownMs) {
        return a;
      }
      if (a.lastSeenCell && !same(a.cell, a.lastSeenCell)) return walkToward(a.lastSeenCell);
      update({ facing: rightOf(a.facing), waitUntil: now + 900 });
      return a;
    }
    }

    let { target, forward } = a;
    if (same(a.cell, a.patrol[target])) {
      // arrived: pause, then head for the next point (turning back at the
      // route's ends)
      if (a.patrol.length < 2) return a;
      if (forward && target === a.patrol.length - 1) forward = false;
      else if (!forward && target === 0) forward = true;
      target += forward ? 1 : -1;
      update({ target, forward, waitUntil: now + type.waitMs });
      return a;
    }
    return walkToward(a.patrol[target]);
  });
  return { actors: changed ? next : actors, attacks };
}
