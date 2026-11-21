import type { Direction, ExitSpec, GameMap, MapLinkTarget, Vec2 } from "./types";

// Links between maps (the fantasy world's way of going from a town to a
// forest, a cellar...): a gate - an ExitSpec with a target - today. Plain
// functions, kept apart from the game state so they can be tested; they know
// nothing of the registry of maps (a lookup is passed in).
//
// A link leads to a map and arrives somewhere in it:
//   1. where `to.arrival` says - a name (of one of its gates) or a cell;
//   2. else at the target's link that leads back to the map left (the same
//      kind of link first) - a gate you came through is the gate you come out of;
//   3. else at the target's start.

export type LinkKind = "gate";

// a link that goes somewhere
export interface MapLink {
  kind: LinkKind;
  cell: Vec2;
  name?: string;
  to: MapLinkTarget;
}

// the parts of a map links work with (a GameMap is one)
export type LinkMap = Pick<GameMap, "id" | "name" | "width" | "height" | "cells" | "start"> & {
  exits?: ExitSpec[];
  loadingImage?: string;
};
export type LinkLookup = (id: string) => LinkMap | undefined;

const DIRECTIONS: readonly Direction[] = ["N", "E", "S", "W"];
const STEP: Record<Direction, Vec2> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
const isDirection = (value: unknown): value is Direction => typeof value === "string" && (DIRECTIONS as readonly string[]).includes(value);

// A target as a file has it, or none if it names no map. Unknown parts are dropped.
export function readLinkTarget(value: unknown): MapLinkTarget | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.map !== "string" || !v.map.trim()) return undefined;
  const arrival = v.arrival;
  const cell = arrival && typeof arrival === "object" ? (arrival as Record<string, unknown>) : null;
  return {
    map: v.map.trim(),
    ...(typeof arrival === "string" && arrival.trim()
      ? { arrival: arrival.trim() }
      : cell && Number.isInteger(cell.x) && Number.isInteger(cell.y)
        ? { arrival: { x: cell.x as number, y: cell.y as number } }
        : {}),
    ...(isDirection(v.facing) ? { facing: v.facing } : {}),
    ...(typeof v.loadingImage === "string" && v.loadingImage ? { loadingImage: v.loadingImage } : {}),
  };
}

// every link of a map that goes somewhere
export function mapLinks(map: Pick<LinkMap, "exits">): MapLink[] {
  const links: MapLink[] = [];
  for (const e of map.exits ?? []) if (e.to) links.push({ kind: "gate", cell: e.cell, name: e.name, to: e.to });
  return links;
}

const sameCell = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

export function linkAt(map: Pick<LinkMap, "exits">, cell: Vec2): MapLink | undefined {
  return mapLinks(map).find((l) => sameCell(l.cell, cell));
}

// the named places of a map a link can arrive at: its gates, with or without a target
export function namedPlaces(map: Pick<LinkMap, "exits">): { cell: Vec2; name: string }[] {
  const out: { cell: Vec2; name: string }[] = [];
  for (const e of map.exits ?? []) if (e.name?.trim()) out.push({ cell: e.cell, name: e.name.trim() });
  return out;
}

const walkable = (map: Pick<LinkMap, "width" | "height" | "cells">, c: Vec2) =>
  c.x >= 0 && c.y >= 0 && c.x < map.width && c.y < map.height && map.cells[c.y]?.[c.x] !== "wall";

// which way the party faces arriving in `cell`: as asked if it can, else toward
// open ground (the start's facing first)
export function arrivalFacing(map: Pick<LinkMap, "width" | "height" | "cells" | "start">, cell: Vec2, preferred?: Direction): Direction {
  if (preferred) return preferred;
  const order = [map.start.facing, ...DIRECTIONS.filter((d) => d !== map.start.facing)];
  return order.find((d) => walkable(map, { x: cell.x + STEP[d].x, y: cell.y + STEP[d].y })) ?? map.start.facing;
}

export type ArrivalVia = "named" | "cell" | "back" | "start";
export interface Arrival {
  cell: Vec2;
  facing: Direction;
  via: ArrivalVia;
}

// Where the party arrives in `target` going through `link` out of the map `from`
export function resolveArrival(from: Pick<LinkMap, "id">, link: Pick<MapLink, "kind" | "to">, target: LinkMap): Arrival {
  const want = link.to.arrival;
  const facing = (cell: Vec2) => arrivalFacing(target, cell, link.to.facing);
  if (typeof want === "string") {
    const place = namedPlaces(target).find((p) => p.name.toLowerCase() === want.toLowerCase());
    if (place) return { cell: place.cell, facing: facing(place.cell), via: "named" };
  } else if (want && walkable(target, want)) {
    return { cell: { x: want.x, y: want.y }, facing: facing(want), via: "cell" };
  }
  const back = mapLinks(target).filter((l) => l.to.map === from.id);
  const mate = back.find((l) => l.kind === link.kind) ?? back[0];
  if (mate) return { cell: mate.cell, facing: facing(mate.cell), via: "back" };
  return { cell: target.start.cell, facing: link.to.facing ?? target.start.facing, via: "start" };
}

// The image the loading screen shows on arriving through a link: the link's own,
// else the target map's, else none (the plain loading screen)
export function loadingImageFor(link: Pick<MapLink, "to"> | undefined, target: Pick<LinkMap, "loadingImage"> | undefined): string | undefined {
  return link?.to.loadingImage || target?.loadingImage || undefined;
}

export type LinkProblemCode = "linkUnknownMap" | "linkSelf" | "linkUnknownArrival" | "linkNoWayBack";
export interface LinkProblem {
  code: LinkProblemCode;
  severity: "error" | "warning";
  cell: Vec2;
  params: Record<string, string | number>;
}

// What is wrong with the links of a map: a target that doesn't exist (an error),
// an arrival that isn't there, a target with no way back (only warnings - the
// party arrives at the target's start then)
export function linkProblems(map: LinkMap, lookup: LinkLookup): LinkProblem[] {
  const out: LinkProblem[] = [];
  for (const link of mapLinks(map)) {
    const target = lookup(link.to.map);
    if (!target) {
      out.push({ code: "linkUnknownMap", severity: "error", cell: link.cell, params: { map: link.to.map } });
      continue;
    }
    if (target.id === map.id) {
      out.push({ code: "linkSelf", severity: "error", cell: link.cell, params: {} });
      continue;
    }
    const want = link.to.arrival;
    if (want !== undefined) {
      const found = typeof want === "string"
        ? namedPlaces(target).some((p) => p.name.toLowerCase() === want.toLowerCase())
        : walkable(target, want);
      if (!found) {
        out.push({ code: "linkUnknownArrival", severity: "warning", cell: link.cell, params: { map: target.name, arrival: typeof want === "string" ? want : `${want.x},${want.y}` } });
      }
      continue;
    }
    if (!mapLinks(target).some((l) => l.to.map === map.id)) {
      out.push({ code: "linkNoWayBack", severity: "warning", cell: link.cell, params: { map: target.name } });
    }
  }
  return out;
}
