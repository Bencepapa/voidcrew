import { cellAt, doorCrossed, floorHeight } from "./map";
import { DIR_VECTOR, rightOf } from "./movement";
import { PROP_TYPES } from "./props";
import { passage } from "./heights";
import { lineOfSight } from "./visibility";
import type { Body } from "./heights";
import type { ActorSpec, Direction, GameMap, Vec2, ActorWake } from "./types";

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
  // a fixture (a turret, a camera): never moves, turns to what it sees; hung
  // from the ceiling (drawn from it down; nobody bumps into it)
  stationary?: boolean;
  ceiling?: boolean;
  // a camera: never fires - seeing the crew where it shouldn't be, it calls
  // it in (the ship's alert up by `alert`, again every attackCooldownMs
  // while it keeps seeing it); its rows: watching the crew, raising the
  // alarm
  watcher?: { alert: number; watchRow: number; alarmRow: number };
  // whose side it's on (see FOES): the ship's robots (the default), the
  // aliens, the infected, the survivors
  faction?: Faction;
  // it fights hand to hand: no gun, no muzzle flash
  melee?: boolean;
  // it gets about in leaps: a take-off row, a row in the air, how high it
  // leaps (wall heights)
  hop?: { takeoffRow: number; airRow: number; height: number };
  // how much hurt it takes (`tolerance`: damage, wearing off at `decay` a
  // second) before it breaks: flees (cornered, it fights on) or plays dead
  // (and gets up again once it's worn off) - see scared
  fear?: { tolerance: number; decay: number; mode: "flee" | "playDead" };
  // a small crawler: it gets about on the ceiling (over everyone's heads,
  // sharing their cells), drops on the crew only in its cell, and slips into
  // the deck's vents (decals whose action is "vent") to come out of another
  crawler?: boolean;
}

export type Faction = "robot" | "alien" | "infected" | "survivor";
// Who fights whom besides the crew: each faction's foes, and whether only
// right next to it ("adjacent": in its cell or the next) or as far as its
// weapon reaches. The robots shoot aliens on sight (unless powered down) -
// the infected and the survivors they take for crew; the aliens and the
// infected hunt the crew and turn on others only when they're right there.
const FOES: Record<Faction, Partial<Record<Faction, "reach" | "adjacent">>> = {
  robot: { alien: "reach" },
  alien: { robot: "adjacent", infected: "adjacent", survivor: "adjacent" },
  infected: { robot: "adjacent", survivor: "adjacent", alien: "adjacent" },
  survivor: { alien: "reach", infected: "reach" },
};

// how scared an actor is now (its fear wearing off since it was last hurt)
export function fearOf(actor: ActorState, now: number): number {
  const fear = ACTOR_TYPES[actor.type]?.fear;
  if (!fear || !actor.fear) return 0;
  return Math.max(0, actor.fear - (fear.decay * (now - (actor.fearAt ?? now))) / 1000);
}
// an actor hurt `damage` (by whoever's at `from`): its fear up - past its
// tolerance it breaks (flees from there, or plays dead)
export function scared(actor: ActorState, damage: number, now: number, from?: Vec2): ActorState {
  const fear = ACTOR_TYPES[actor.type]?.fear;
  if (!fear || actor.diedAt !== null) return actor;
  const level = fearOf(actor, now) + damage;
  const broken = level > fear.tolerance;
  return {
    ...actor,
    fear: level,
    fearAt: now,
    fleeFrom: from ? { ...from } : actor.fleeFrom,
    panicked: actor.panicked || (broken && fear.mode === "flee"),
    playingDead: actor.playingDead || (broken && fear.mode === "playDead"),
  };
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
  // A ceiling turret: hangs over a cell, turns all round to whatever it
  // sees and fires short bursts; it never moves
  turret1: {
    name: "A ceiling turret",
    sheet: "turret1",
    cols: 5,
    rows: 5,
    cellAspect: 96 / 112,
    height: 0.5,
    body: { headroom: 0, step: 0 },
    // (its sensor near the ceiling)
    eyeHeight: 0.78,
    moveMs: 400,
    waitMs: 1000,
    idleRow: 0,
    walkRows: [0],
    shootRows: [1, 2],
    hitRow: 3,
    dieRows: [3],
    wreckRow: 4,
    loot: "robot",
    stationary: true,
    ceiling: true,
    hp: 45,
    damage: [2, 5],
    attackRange: 6,
    attackCooldownMs: 1500,
    accuracy: 0.85,
    falloff: 0.1,
    sight: 6,
    fieldOfView: 360,
    huntSight: 7,
    hearing: 1,
    alertMs: 6000,
    tactics: { shotPauseMs: 300, retreat: [0, 0], seeksCover: false, advance: false, minRange: 0 },
    parts: {
      head: { label: "SENSOR EYE", zone: [0.3, 0.3, 0.7, 0.55] },
      torso: { label: "GUN POD", zone: [0.15, 0.3, 0.85, 0.72] },
      armL: { label: "BARRELS", zone: [0.15, 0.6, 0.5, 0.85] },
      armR: { label: "BARRELS", zone: [0.5, 0.6, 0.85, 0.85] },
      legs: { label: "MOUNT ARM", zone: [0.35, 0.05, 0.65, 0.3] },
    },
    crits: [],
  },
  // A security camera: hangs from the ceiling, watching one way; it never
  // fires, but the crew seen where it shouldn't be (anywhere, on a ship
  // that takes it for intruders) puts the ship's alert up
  camera1: {
    name: "A security camera",
    sheet: "camera1",
    cols: 5,
    rows: 4,
    cellAspect: 1,
    height: 0.36,
    body: { headroom: 0, step: 0 },
    eyeHeight: 0.8,
    moveMs: 400,
    waitMs: 1000,
    idleRow: 0,
    walkRows: [0],
    hitRow: 3,
    dieRows: [3],
    wreckRow: 3,
    stationary: true,
    ceiling: true,
    watcher: { alert: 30, watchRow: 1, alarmRow: 2 },
    hp: 14,
    damage: [0, 0],
    attackRange: 0,
    attackCooldownMs: 5000,
    accuracy: 0,
    falloff: 0,
    sight: 6,
    fieldOfView: 110,
    huntSight: 6,
    hearing: 0,
    alertMs: 5000,
    tactics: { shotPauseMs: 0, retreat: [0, 0], seeksCover: false, advance: false, minRange: 0 },
    parts: {
      head: { label: "LENS", zone: [0.3, 0.38, 0.7, 0.75] },
      torso: { label: "HOUSING", zone: [0.15, 0.35, 0.85, 0.85] },
      armL: { label: "BRACKET", zone: [0.3, 0.12, 0.7, 0.38] },
      armR: { label: "BRACKET", zone: [0.3, 0.12, 0.7, 0.38] },
      legs: { label: "CABLES", zone: [0.2, 0.75, 0.8, 0.95] },
    },
    crits: [],
  },
  // A big alien: hunts the crew in long leaps, faster than a robot, claws
  // only - lands on it, slashes, springs back; hurt past its tolerance it
  // runs (cornered, it fights on). Robots shoot it on sight.
  alien1: {
    name: "A leaping alien",
    sheet: "alien1",
    cols: 5,
    rows: 7,
    cellAspect: 160 / 128,
    height: 1.15,
    body: { headroom: 0.75, step: 0.25 },
    eyeHeight: 0.55,
    moveMs: 420,
    waitMs: 1400,
    idleRow: 0,
    walkRows: [0],
    hop: { takeoffRow: 1, airRow: 2, height: 0.35 },
    shootRow: 3,
    hitRow: 4,
    dieRows: [5],
    wreckRow: 6,
    faction: "alien",
    melee: true,
    fear: { tolerance: 35, decay: 7, mode: "flee" },
    hp: 70,
    damage: [6, 11],
    attackRange: 1,
    attackCooldownMs: 1700,
    accuracy: 0.9,
    falloff: 0,
    sight: 6,
    fieldOfView: 160,
    huntSight: 9,
    hearing: 2,
    alertMs: 10000,
    tactics: { shotPauseMs: 250, retreat: [1, 2], seeksCover: false, advance: true, closesIn: true, minRange: 1 },
    parts: {
      head: { label: "HEAD", zone: [0.38, 0.2, 0.62, 0.45] },
      torso: { label: "THORAX", zone: [0.3, 0.38, 0.7, 0.68] },
      armL: { label: "CLAWS", zone: [0.12, 0.4, 0.45, 0.85] },
      armR: { label: "CLAWS", zone: [0.55, 0.4, 0.88, 0.85] },
      legs: { label: "LEGS", zone: [0.28, 0.66, 0.72, 1] },
    },
    crits: [],
  },
  // A small alien: scuttles about on the ceiling in quick leaps, over
  // everyone's heads, drops on the crew in its own cell to bite; hurt, it
  // runs for a vent - and comes out of another one later
  alien2: {
    name: "A vent crawler",
    sheet: "alien2",
    cols: 5,
    rows: 5,
    cellAspect: 112 / 96,
    height: 0.42,
    body: { headroom: 0.25, step: 0.25 },
    eyeHeight: 0.85,
    moveMs: 330,
    waitMs: 1200,
    idleRow: 0,
    walkRows: [0],
    hop: { takeoffRow: 1, airRow: 1, height: 0.08 },
    shootRow: 2,
    hitRow: 3,
    dieRows: [3],
    wreckRow: 4,
    faction: "alien",
    melee: true,
    crawler: true,
    fear: { tolerance: 9, decay: 5, mode: "flee" },
    hp: 18,
    damage: [3, 6],
    attackRange: 0,
    attackCooldownMs: 1100,
    accuracy: 0.9,
    falloff: 0,
    sight: 6,
    fieldOfView: 360,
    huntSight: 8,
    hearing: 3,
    alertMs: 8000,
    tactics: { shotPauseMs: 200, retreat: [0, 0], seeksCover: false, advance: false, closesIn: true, minRange: 0 },
    parts: {
      head: { label: "MAW", zone: [0.35, 0.3, 0.65, 0.7] },
      torso: { label: "BODY", zone: [0.25, 0.25, 0.75, 0.75] },
      armL: { label: "LEGS", zone: [0.05, 0.3, 0.4, 1] },
      armR: { label: "LEGS", zone: [0.6, 0.3, 0.95, 1] },
      legs: { label: "TAIL", zone: [0.3, 0, 0.7, 0.35] },
    },
    crits: [],
  },
  // A survivor: holed up, never moving, never against the crew - and the
  // robots take them for crew; they shoot the aliens and the infected
  survivor1: {
    name: "A survivor",
    sheet: "survivor1",
    cols: 5,
    rows: 6,
    cellAspect: 160 / 128,
    height: 1.1,
    body: { headroom: 0.75, step: 0.25 },
    eyeHeight: 0.62,
    moveMs: 900,
    waitMs: 1800,
    idleRow: 0,
    walkRows: [0],
    shootRow: 2,
    hitRow: 3,
    dieRows: [4],
    wreckRow: 5,
    faction: "survivor",
    stationary: true,
    hp: 30,
    damage: [4, 8],
    attackRange: 6,
    attackCooldownMs: 1500,
    accuracy: 0.8,
    falloff: 0.1,
    sight: 6,
    fieldOfView: 360,
    huntSight: 6,
    hearing: 2,
    alertMs: 6000,
    tactics: { shotPauseMs: 400, retreat: [0, 0], seeksCover: false, advance: false, minRange: 0 },
    parts: {
      head: { label: "HEAD", zone: [0.4, 0.22, 0.6, 0.38] },
      torso: { label: "CHEST", zone: [0.35, 0.36, 0.65, 0.62] },
      armL: { label: "ARM", zone: [0.22, 0.36, 0.42, 0.66] },
      armR: { label: "ARM", zone: [0.58, 0.36, 0.78, 0.66] },
      legs: { label: "LEGS", zone: [0.36, 0.62, 0.64, 1] },
    },
    crits: [],
  },
  // An infected crew member: shambles after the crew and the survivors,
  // claws them; hurt past its tolerance it drops and lies still as if dead -
  // and gets up again once it's worn off. The robots take it for crew.
  zombie1: {
    name: "An infected crewman",
    sheet: "zombie1",
    cols: 5,
    rows: 7,
    cellAspect: 160 / 128,
    height: 1.1,
    body: { headroom: 0.75, step: 0.25 },
    eyeHeight: 0.6,
    moveMs: 1150,
    waitMs: 2200,
    idleRow: 0,
    walkRows: [1, 0, 2, 0],
    shootRow: 3,
    hitRow: 4,
    dieRows: [5],
    wreckRow: 6,
    faction: "infected",
    melee: true,
    fear: { tolerance: 20, decay: 4, mode: "playDead" },
    hp: 45,
    damage: [4, 8],
    attackRange: 1,
    attackCooldownMs: 1600,
    accuracy: 0.85,
    falloff: 0,
    sight: 5,
    fieldOfView: 140,
    huntSight: 7,
    hearing: 2,
    alertMs: 12000,
    tactics: { shotPauseMs: 400, retreat: [0, 0], seeksCover: false, advance: false, closesIn: true, minRange: 1 },
    parts: {
      head: { label: "HEAD", zone: [0.4, 0.2, 0.6, 0.36] },
      torso: { label: "CHEST", zone: [0.35, 0.34, 0.65, 0.62] },
      armL: { label: "CLAW", zone: [0.18, 0.34, 0.42, 0.72] },
      armR: { label: "ARM", zone: [0.58, 0.34, 0.82, 0.72] },
      legs: { label: "LEGS", zone: [0.36, 0.62, 0.64, 1] },
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
  // waiting for the alert (see ActorWake): powered down, or taking the crew
  // for its own
  dormant: boolean;
  fooled: boolean;
  // one of the reinforcements of an "arrive" actor (its index in the map's
  // actors)
  spawnOf?: number;
  // a camera with the crew in its view (taking it for its own, or not)
  watching?: boolean;
  // turned to the crew's side (a turret, from the security room): it fires
  // at the ship's robots instead
  ally?: boolean;
  // a fixture's eye on the crew: where it looks (the crew's cell; null: the
  // way it faces), and the way it faces when it's done looking
  lookAt?: Vec2 | null;
  homeFacing?: Direction;
  // its fear (see scared): how much, as of when; broken by it - fleeing, or
  // lying still playing dead
  fear?: number;
  fearAt?: number;
  // where what hurt it last was (what it flees from)
  fleeFrom?: Vec2;
  panicked?: boolean;
  playingDead?: boolean;
  // a crawler in the vents: out again then (game time)
  inVentUntil?: number | null;
}

// (the map loader can't check actor types: actors.ts imports the map
// module, so this does)
// The deck's actors (each with its index in the map's actors as its id), as
// they are at the ship's alert `level`: the ones waiting for a higher one
// dormant or fooled - and the ones yet to arrive not there (unless `all`:
// the map editor shows every one).
// `stance`: how the ship's robots take the crew (see ShipMood.robots).
export function createActors(map: GameMap, now: number, level = 0, all = false, stance: Stance = "hostile"): ActorState[] {
  return (map.actors ?? []).flatMap((spec, id) => {
    if (!ACTOR_TYPES[spec.actor]) {
      console.error(`${map.id}: unknown actor "${spec.actor}" at ${spec.cell.x},${spec.cell.y}`);
      return [];
    }
    const wake = actorWake(spec, stance);
    const waiting = wake && level < wake.level && !all;
    if (waiting && wake.mode === "arrive") return [];
    const actor = actorFromSpec(map, spec, id, now);
    return [{ ...actor, dormant: !!waiting && wake.mode === "dormant", fooled: !!waiting && wake.mode === "fooled" }];
  });
}

export type Stance = "dormant" | "fooled" | "hostile";
// the level an actor waits for, and how: its own (set by hand), else the
// ship's stance - dormant or fooled until the alert (not for the harmless
// ones: they keep to themselves anyway)
export const STANCE_WAKES_AT = 2;
export function actorWake(spec: ActorSpec, stance: Stance): ActorWake | undefined {
  if (spec.wake) return spec.wake;
  const type = ACTOR_TYPES[spec.actor];
  if (stance === "hostile" || type?.passive || (type?.faction ?? "robot") !== "robot") return undefined;
  return { level: STANCE_WAKES_AT, mode: stance };
}

// an actor as its spec places it, on guard
export function actorFromSpec(map: GameMap, spec: ActorSpec, id: number, now: number): ActorState {
  return {
    id,
    type: spec.actor,
    cell: spec.cell,
    y: floorHeight(map, spec.cell.x, spec.cell.y),
    from: spec.cell,
    fromY: floorHeight(map, spec.cell.x, spec.cell.y),
    moveStart: now - 1e6,
    facing: spec.facing,
    homeFacing: spec.facing,
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
    dormant: false,
    fooled: false,
  };
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
      !ACTOR_TYPES[a.type]?.ceiling &&
      !ACTOR_TYPES[a.type]?.crawler &&
      !a.playingDead &&
      !a.inVentUntil &&
      ((a.cell.x === cell.x && a.cell.y === cell.y && level(a.y)) ||
        (actorMoving(a, now) && a.from.x === cell.x && a.from.y === cell.y && level(a.fromY))),
  );
}

// the party's eyes above its feet, for the actors' line of sight
const PARTY_EYE = 0.55;

// An actor calling the crew in (a camera seeing it, a fooled robot finding
// it where it mustn't be): the ship's alert up by `alert`
export interface ActorAlarm {
  actor: number;
  alert: number;
}
// a fixture on the crew's side firing at a robot
export interface AllyShot {
  actor: number;
  target: number;
  damage: number;
}
// how much a fooled robot finding the crew in a restricted area puts the
// alert up
const RESTRICTED_ALERT = 25;
// how long a crawler stays in the vents (game ms, at least / at most)
const VENT_MS: [number, number] = [6000, 14000];

// how long a fixture keeps looking where it last saw the crew before it
// turns back (unless it's raised the alarm: then its type's alertMs)
const WATCH_HOLD_MS = 3000;

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
): { actors: ActorState[]; attacks: ActorAttack[]; alarms: ActorAlarm[]; allyShots: AllyShot[] } {
  let changed = false;
  const attacks: ActorAttack[] = [];
  const alarms: ActorAlarm[] = [];
  const allyShots: AllyShot[] = [];
  // the deck's vents (the cells their decals are seen from): the vent_
  // decals, or any whose action is "vent"
  const vents = [...new Map((map.decals ?? []).filter((d) => d.action === "vent" || d.decal.startsWith("vent_")).map((d) => [`${d.cell.x},${d.cell.y}`, d.cell])).values()];
  const ventCells = new Set(vents.map((c) => `${c.x},${c.y}`));
  // where the crew mustn't be (see GameMap.restricted)
  const restricted = new Set((map.restricted ?? []).map((c) => `${c.x},${c.y}`));
  const partyRestricted = restricted.has(`${party.x},${party.y}`);
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
    // waiting for the alert: a hit wakes it (then it knows where the party
    // is); else a dormant one stands still, a fooled one goes its rounds
    if ((a.dormant || a.fooled) && a.hitAt > a.lastSeenAt) update({ dormant: false, fooled: false });
    if (a.dormant) {
      if (a.watching) update({ watching: false });
      return a;
    }
    // in the vents: out of another one, once it's time
    if (a.inVentUntil) {
      if (now < a.inVentUntil) return a;
      const others = vents.filter((c) => !same(c, a.cell));
      const out = (others.length ? others : vents)[Math.floor(Math.random() * Math.max(1, (others.length || vents.length)))] ?? a.cell;
      update({ inVentUntil: null, cell: out, from: out, y: floorHeight(map, out.x, out.y), fromY: floorHeight(map, out.x, out.y), moveStart: now - 1e6, waitUntil: now + 600 });
      return a;
    }
    // hurt past its tolerance: fleeing or playing dead, until it's worn off
    if (type.fear && (a.panicked || a.playingDead) && fearOf(a, now) <= 0) {
      update({ panicked: false, playingDead: false, fear: 0, waitUntil: now + (a.playingDead ? 700 : 0) });
      return a;
    }
    if (a.playingDead) return a;
    // (its changes land on `a` here, through update)
    if (type.stationary) {
      stepFixture(a, type, update);
      return a;
    }

    // the surface it'd walk onto in a neighbouring cell (a walk - no drops,
    // no ladders - where it fits and nobody stands), or null
    const stepY = (to: Vec2, dir: Direction): number | null => {
      if (cellAt(map, to.x, to.y) === "wall") return null;
      const door = doorCrossed(map, a.cell, to);
      if (door && !isDoorOpen(door)) return null;
      const way = passage(map, a.cell, a.y, to, dir, type.body);
      if (way.kind !== "walk") return null;
      // (a small harmless one slips past anyone, and anyone past it - and
      // a crawler on the ceiling over everyone's heads: only two that both
      // stand their ground can't share a cell)
      const slips = type.passive || type.crawler;
      const partyThere = !slips && same(to, party) && Math.abs(way.y - partyY) < 1e-6;
      const blocks = (o: ActorState) => !slips && !ACTOR_TYPES[o.type].passive;
      if (partyThere || actors.some((o) => o !== actor && blocks(o) && actorAt([o], to, now, way.y))) return null;
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

    // Broken (see scared): it flees from the crew - a crawler into a vent
    // if it's at one - unless it's cornered: then it fights on
    if (a.panicked) {
      if (type.crawler && ventCells.has(`${a.cell.x},${a.cell.y}`)) {
        update({ inVentUntil: now + VENT_MS[0] + Math.random() * (VENT_MS[1] - VENT_MS[0]), hostile: false });
        return a;
      }
      const threat = a.fleeFrom ?? party;
      let best: { to: Vec2; dir: Direction; score: number } | null = null;
      for (const { to, dir } of neighbours()) {
        const away = Math.hypot(threat.x - to.x, threat.y - to.y) - Math.hypot(threat.x - a.cell.x, threat.y - a.cell.y);
        if (away <= 0) continue;
        const hidden = !clearLine(to, threat, eyes(stepY(to, dir) ?? a.y));
        const score = away * 2 + (hidden ? 3 : 0) + (type.crawler && ventCells.has(`${to.x},${to.y}`) ? 4 : 0) + Math.random() * 0.5;
        if (!best || score > best.score) best = { to, dir, score };
      }
      if (best) return stepTo(best.to, best.dir, undefined, 1.3);
    }
    // a crawler at a vent, nothing to hunt: now and then it slips in
    if (type.crawler && !a.hostile && ventCells.has(`${a.cell.x},${a.cell.y}`) && Math.random() < 0.08) {
      update({ inVentUntil: now + VENT_MS[0] + Math.random() * (VENT_MS[1] - VENT_MS[0]) });
      return a;
    }

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
    // fooled, it takes the crew for its own - unless it catches it where
    // it mustn't be: then it calls it in and turns on it
    const noticed = line && ((inView && dist <= type.sight) || dist <= type.hearing);
    if (a.fooled && noticed && partyRestricted && !type.passive) {
      update({ fooled: false });
      alarms.push({ actor: a.id, alert: RESTRICTED_ALERT });
    }
    const sees = !a.fooled && line && (a.hostile ? dist <= type.huntSight : (inView && dist <= type.sight) || dist <= type.hearing);

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

    if (a.patrol.length < 2 && (type.faction === "alien" || type.faction === "infected")) {
      const open = neighbours();
      if (!open.length || Math.random() < 0.3) {
        update({ waitUntil: now + type.waitMs * (0.5 + Math.random()) });
        return a;
      }
      const ahead = open.find((n) => n.dir === a.facing);
      const next = ahead && Math.random() < 0.6 ? ahead : open[Math.floor(Math.random() * open.length)];
      return stepTo(next.to, next.dir);
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
  // The fights between actors (not the crew - see FOES): each ready to
  // attack, not busy with the crew this very moment, at the nearest foe in
  // its reach (or right next to it)
  const fighters = changed ? next : [...actors];
  for (let i = 0; i < fighters.length; i++) {
    const a = fighters[i];
    const type = ACTOR_TYPES[a.type];
    const faction = type.faction ?? "robot";
    if (a.diedAt !== null || a.dormant || a.playingDead || a.panicked || a.inVentUntil || a.ally || type.passive || type.watcher) continue;
    if (!type.damage[1] || a.lastAttack === now || now - a.lastAttack < type.attackCooldownMs || now < a.disarmedUntil) continue;
    const eyes = a.y + type.eyeHeight;
    let best: { o: ActorState; d: number } | null = null;
    for (const o of fighters) {
      // (one lying still as if dead fools them all)
      if (o === a || o.diedAt !== null || o.inVentUntil || o.playingDead) continue;
      const how = FOES[faction][ACTOR_TYPES[o.type].faction ?? "robot"];
      if (!how || ACTOR_TYPES[o.type].passive) continue;
      const d = Math.hypot(o.cell.x - a.cell.x, o.cell.y - a.cell.y);
      const reach = how === "adjacent" ? 1.01 : Math.max(1.01, type.attackRange);
      if (d > reach || (best && d >= best.d)) continue;
      if (d > 1.01 && !lineOfSight(map, a.cell, o.cell, doorOpen, { from: eyes, to: o.y + ACTOR_TYPES[o.type].eyeHeight })) continue;
      best = { o, d };
    }
    if (!best) continue;
    const [lo, hi] = type.damage;
    allyShots.push({ actor: a.id, target: best.o.id, damage: lo + Math.floor(Math.random() * (hi - lo + 1)) });
    fighters[i] = { ...a, lastAttack: now, facing: toward(a.cell, best.o.cell), waitUntil: now + type.tactics.shotPauseMs };
    changed = true;
  }
  return { actors: changed ? fighters : actors, attacks, alarms, allyShots };

  // A fixture's turn: it turns to the crew if it sees it - a turret fires
  // (or, on the crew's side, fires at the robots it sees), a camera calls
  // it in; fooled, only where the crew mustn't be
  function stepFixture(a: ActorState, type: ActorType, update: (patch: Partial<ActorState>) => void): ActorState {
    if (type.faction === "survivor") return a;
    const dist = Math.hypot(party.x - a.cell.x, party.y - a.cell.y);
    const ahead = DIR_VECTOR[a.facing];
    // (once it has the crew in its eye it follows it round)
    const inView =
      type.fieldOfView >= 360 ||
      !!a.lookAt ||
      dist < 1e-6 ||
      ((party.x - a.cell.x) * ahead.x + (party.y - a.cell.y) * ahead.y) / dist >= Math.cos(((type.fieldOfView / 2) * Math.PI) / 180);
    const eyes = a.y + type.eyeHeight;
    const seen = dist <= (a.hostile || a.lookAt ? type.huntSight : type.sight) && (inView || a.hostile) && clearLine(a.cell, party, eyes);
    if (a.ally) {
      // on the crew's side: the nearest robot in its sight and reach
      if (now - a.lastAttack < type.attackCooldownMs || !type.attackRange) return a;
      const target = actors
        .filter((o) => o.diedAt === null && !o.ally && o.id !== a.id && !ACTOR_TYPES[o.type].passive && !ACTOR_TYPES[o.type].watcher)
        .map((o) => ({ o, d: Math.hypot(o.cell.x - a.cell.x, o.cell.y - a.cell.y) }))
        .filter(({ o, d }) => d <= type.attackRange && lineOfSight(map, a.cell, o.cell, doorOpen, { from: eyes, to: o.y + ACTOR_TYPES[o.type].eyeHeight }))
        .sort((p, q) => p.d - q.d)[0];
      if (target) {
        const [lo, hi] = type.damage;
        allyShots.push({ actor: a.id, target: target.o.id, damage: lo + Math.floor(Math.random() * (hi - lo + 1)) });
        update({ facing: toward(a.cell, target.o.cell), lastAttack: now, waitUntil: now + type.tactics.shotPauseMs });
      }
      return a;
    }
    // seen (even taken for crew): it looks right at the crew; lost a while
    // (longer once it's raised the alarm), it gives up - back the way it
    // faced, its light out
    const hostile = a.hostile;
    if (seen) {
      update({ watching: true, lookAt: { ...party }, lastSeenAt: now, facing: toward(a.cell, party) });
    } else if ((a.watching || hostile) && now - a.lastSeenAt > (hostile ? type.alertMs : WATCH_HOLD_MS)) {
      update({ watching: false, lookAt: null, hostile: false, lastSeenCell: null, facing: a.homeFacing ?? a.facing });
    }
    if (a.fooled && seen && partyRestricted) update({ fooled: false });
    if (a.hitAt > a.lastSeenAt) update({ hostile: true, lastSeenAt: a.hitAt, lastSeenCell: party, facing: toward(a.cell, party) });
    const fooled = a.fooled && !(seen && partyRestricted);
    const sees = seen && !fooled;
    if (sees) {
      const first = !hostile;
      update({ hostile: true, lastSeenCell: party });
      if (type.watcher) {
        // (the first sighting the most, then a little more while it lasts)
        if (first || now - a.lastAttack >= type.attackCooldownMs) {
          alarms.push({ actor: a.id, alert: first ? type.watcher.alert : type.watcher.alert / 4 });
          update({ lastAttack: now });
        }
      } else if (dist <= type.attackRange && now >= a.disarmedUntil && now - a.lastAttack >= type.attackCooldownMs) {
        const [lo, hi] = type.damage;
        attacks.push({ actor: a.id, damage: lo + Math.floor(Math.random() * (hi - lo + 1)), distance: dist });
        update({ lastAttack: now, waitUntil: now + type.tactics.shotPauseMs });
      }
    }
    return a;
  }
}
