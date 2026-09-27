import { cellAt, floorHeight } from "./map";
import { DIR_VECTOR } from "./movement";
import { passage } from "./heights";
import { cellKey, visibleCells } from "./visibility";
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

// body parts, for aiming: where each sits in a sheet cell (fractions of
// its width and height from the top left: x0, y0, x1, y1)
export type BodyPart = "head" | "torso" | "arms" | "legs";
export const BODY_PARTS: BodyPart[] = ["head", "torso", "arms", "legs"];

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
  // how long a step to the next cell takes
  moveMs: number;
  // the pause at each patrol point
  waitMs: number;
  // sheet rows: standing, and the walk cycle over one step
  idleRow: number;
  walkRows: number[];
  // fighting
  hp: number;
  // damage per shot at the party, and how far (cells) and how often it fires
  damage: [number, number];
  attackRange: number;
  attackCooldownMs: number;
  // how far (cells) it notices the party
  sight: number;
  // its body parts' names (for the aiming overlay) and where they are
  parts: Record<BodyPart, { label: string; zone: [number, number, number, number] }>;
}

export const ACTOR_TYPES: Record<string, ActorType> = {
  robot1: {
    name: "A combat robot",
    sheet: "robot1",
    cols: 5,
    rows: 3,
    cellAspect: 0.75,
    height: 0.82,
    moveMs: 900,
    waitMs: 1800,
    idleRow: 0,
    walkRows: [1, 0, 2, 0],
    hp: 60,
    damage: [3, 6],
    attackRange: 4,
    attackCooldownMs: 2600,
    sight: 6,
    parts: {
      head: { label: "SENSOR", zone: [0.36, 0.06, 0.64, 0.26] },
      torso: { label: "CORE", zone: [0.3, 0.26, 0.7, 0.56] },
      arms: { label: "WEAPON ARMS", zone: [0.04, 0.3, 0.96, 0.6] },
      legs: { label: "LEGS", zone: [0.28, 0.6, 0.72, 0.98] },
    },
  },
};

export interface ActorState {
  id: number;
  type: string;
  // where it stands - or, while walking, where it's headed
  cell: Vec2;
  // the cell it's walking from, and when it set off (performance.now())
  from: Vec2;
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
  // fighting: it has seen the party and hunts it
  hp: number;
  hostile: boolean;
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
    from: spec.cell,
    moveStart: now - 1e6,
    facing: spec.facing,
    patrol: spec.patrol.length ? spec.patrol : [spec.cell],
    target: 0,
    forward: true,
    waitUntil: now,
    moveMs: ACTOR_TYPES[spec.actor].moveMs,
    hp: ACTOR_TYPES[spec.actor].hp,
    hostile: false,
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

// the (living) actor holding a cell (its own, or the one it's leaving)
export function actorAt(actors: readonly ActorState[], cell: Vec2, now: number): ActorState | undefined {
  return actors.find(
    (a) =>
      a.diedAt === null &&
      ((a.cell.x === cell.x && a.cell.y === cell.y) ||
        (actorMoving(a, now) && a.from.x === cell.x && a.from.y === cell.y)),
  );
}

// an actor's shot at the party
export interface ActorAttack {
  actor: number;
  damage: number;
}

const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

const toward = (from: Vec2, to: Vec2): Direction =>
  Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? (to.x > from.x ? "E" : "W") : to.y > from.y ? "S" : "N";

// Advances the actors to `now` (game time). A living one that's done
// walking and waiting:
// - hostile, seeing the party: fires if it's in range, able and its gun is
//   ready; else it closes in
// - otherwise: takes its next step toward its patrol point - along the
//   longer axis first, the other if that's blocked - or waits if it can't
//   move. Seeing the party makes it hostile.
// Returns the same array if nothing changed, plus the shots fired.
export function stepActors(
  map: GameMap,
  actors: ActorState[],
  now: number,
  party: Vec2,
  isDoorOpen: (cell: Vec2) => boolean,
): { actors: ActorState[]; attacks: ActorAttack[] } {
  let changed = false;
  const attacks: ActorAttack[] = [];
  const next = actors.map((actor) => {
    const type = ACTOR_TYPES[actor.type];
    if (actor.diedAt !== null || actorMoving(actor, now) || now < actor.waitUntil || now < actor.stunnedUntil) {
      return actor;
    }

    const sees =
      Math.hypot(party.x - actor.cell.x, party.y - actor.cell.y) <= type.sight &&
      visibleCells(map, actor.cell.x, actor.cell.y, type.sight, (key) => {
        const [x, y] = key.split(",").map(Number);
        return isDoorOpen({ x, y });
      }).has(cellKey(party.x, party.y));
    if (sees && !actor.hostile) {
      changed = true;
      return { ...actor, hostile: true, facing: toward(actor.cell, party), waitUntil: now + 400 };
    }
    if (actor.hostile && sees) {
      const distance = Math.hypot(party.x - actor.cell.x, party.y - actor.cell.y);
      if (distance <= type.attackRange) {
        if (now < actor.disarmedUntil || now - actor.lastAttack < type.attackCooldownMs) {
          if (actor.facing === toward(actor.cell, party)) return actor;
          changed = true;
          return { ...actor, facing: toward(actor.cell, party) };
        }
        const [lo, hi] = type.damage;
        attacks.push({ actor: actor.id, damage: lo + Math.floor(Math.random() * (hi - lo + 1)) });
        changed = true;
        return { ...actor, facing: toward(actor.cell, party), lastAttack: now };
      }
    }

    let { target, forward } = actor;
    // a hostile one that doesn't see the party walks back to its route
    const chasing = actor.hostile && sees;
    if (!chasing && same(actor.cell, actor.patrol[target])) {
      // arrived: pause, then head for the next point (turning back at the
      // route's ends)
      if (actor.patrol.length < 2) return actor;
      if (forward && target === actor.patrol.length - 1) forward = false;
      else if (!forward && target === 0) forward = true;
      target += forward ? 1 : -1;
      changed = true;
      return { ...actor, target, forward, waitUntil: now + type.waitMs };
    }

    const goal = chasing ? party : actor.patrol[target];
    const dx = goal.x - actor.cell.x;
    const dy = goal.y - actor.cell.y;
    const horizontal: Direction | null = dx > 0 ? "E" : dx < 0 ? "W" : null;
    const vertical: Direction | null = dy > 0 ? "S" : dy < 0 ? "N" : null;
    const tries = (Math.abs(dx) >= Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal]).filter(
      (d): d is Direction => d !== null,
    );
    for (const dir of tries) {
      const v = DIR_VECTOR[dir];
      const to = { x: actor.cell.x + v.x, y: actor.cell.y + v.y };
      const kind = cellAt(map, to.x, to.y);
      if (kind === "wall" || (kind === "door" && !isDoorOpen(to))) continue;
      if (same(to, party) || actors.some((a) => a !== actor && actorAt([a], to, now))) continue;
      const way = passage(map, actor.cell, floorHeight(map, actor.cell.x, actor.cell.y), to, dir);
      if (way.kind !== "walk" || way.y !== floorHeight(map, to.x, to.y)) continue;
      changed = true;
      const moveMs = type.moveMs * (now < actor.slowedUntil ? 2 : 1);
      return { ...actor, from: actor.cell, cell: to, moveStart: now, moveMs, facing: dir };
    }
    // blocked (by the party, say): look that way and try again shortly
    changed = true;
    return { ...actor, facing: tries[0] ?? actor.facing, waitUntil: now + 500 };
  });
  return { actors: changed ? next : actors, attacks };
}
