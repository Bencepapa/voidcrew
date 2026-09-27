import { cellAt, floorHeight } from "./map";
import { DIR_VECTOR } from "./movement";
import { passage } from "./heights";
import type { ActorSpec, Direction, GameMap, Vec2 } from "./types";

// Moving actors (robots, NPCs, enemies): each stands in a cell, walks cell
// to cell along its patrol route and is drawn as a Doom-style sprite that
// always faces the camera, its picture chosen by the angle it's seen from
// (see GameViewport). An actor holds its cell - and while walking, the one
// it's leaving too - so the party can't walk into it.

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
}

export function createActors(map: GameMap, now: number): ActorState[] {
  return (map.actors ?? []).map((spec: ActorSpec, id) => ({
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
  }));
}

export function actorMoving(actor: ActorState, now: number): boolean {
  return now - actor.moveStart < ACTOR_TYPES[actor.type].moveMs;
}

// the actor holding a cell (its own, or the one it's leaving)
export function actorAt(actors: readonly ActorState[], cell: Vec2, now: number): ActorState | undefined {
  return actors.find(
    (a) =>
      (a.cell.x === cell.x && a.cell.y === cell.y) ||
      (actorMoving(a, now) && a.from.x === cell.x && a.from.y === cell.y),
  );
}

const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

// Advances the actors to `now`: one that's done walking and waiting takes
// its next step toward its patrol point - along the longer axis first, the
// other if that's blocked - or waits if it can't move. Returns the same
// array if nothing changed.
export function stepActors(
  map: GameMap,
  actors: ActorState[],
  now: number,
  party: Vec2,
  isDoorOpen: (cell: Vec2) => boolean,
): ActorState[] {
  let changed = false;
  const next = actors.map((actor) => {
    const type = ACTOR_TYPES[actor.type];
    if (actorMoving(actor, now) || now < actor.waitUntil) return actor;

    let { target, forward } = actor;
    if (same(actor.cell, actor.patrol[target])) {
      // arrived: pause, then head for the next point (turning back at the
      // route's ends)
      if (actor.patrol.length < 2) return actor;
      if (forward && target === actor.patrol.length - 1) forward = false;
      else if (!forward && target === 0) forward = true;
      target += forward ? 1 : -1;
      changed = true;
      return { ...actor, target, forward, waitUntil: now + type.waitMs };
    }

    const goal = actor.patrol[target];
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
      return { ...actor, from: actor.cell, cell: to, moveStart: now, facing: dir };
    }
    // blocked (by the party, say): look that way and try again shortly
    changed = true;
    return { ...actor, facing: tries[0] ?? actor.facing, waitUntil: now + 500 };
  });
  return changed ? next : actors;
}
