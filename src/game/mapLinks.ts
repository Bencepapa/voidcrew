import type { Direction, ExitSpec, GameMap, MapLinkTarget, StairsDirection, StairsSpec, StairsStyle, Vec2 } from "./types";

// Links between maps (the fantasy world's way of going from a town to a
// forest, a cellar...): a gate - an ExitSpec with a target - or stairs up or
// down (a StairsSpec). Plain functions, kept apart from the game state so they
// can be tested; they know nothing of the registry of maps (a lookup is passed in).
//
// A link leads to a map and arrives somewhere in it:
//   1. where `to.arrival` says - a name (of one of its gates or stairs) or a cell;
//   2. else at the target's link that leads back to the map left (the same
//      kind of link first - and for stairs the other way, up for down) - a
//      gate you came through is the gate you come out of;
//   3. else at the target's start.

export type LinkKind = "gate" | "stairs";

// a link that goes somewhere
export interface MapLink {
  kind: LinkKind;
  cell: Vec2;
  name?: string;
  to: MapLinkTarget;
  // stairs only
  direction?: StairsDirection;
  style?: StairsStyle;
}

// the parts of a map links work with (a GameMap is one)
export type LinkMap = Pick<GameMap, "id" | "name" | "width" | "height" | "cells" | "start"> & {
  exits?: ExitSpec[];
  stairs?: StairsSpec[];
  loadingImage?: string;
};
type LinkSource = Pick<LinkMap, "exits" | "stairs">;
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

// every gate and staircase of a map, whether or not it leads anywhere yet
type RawLink = Omit<MapLink, "to"> & { to?: MapLinkTarget };
function rawLinks(map: LinkSource): RawLink[] {
  return [
    ...(map.exits ?? []).flatMap((e) => gateLink(e) ?? []),
    ...(map.stairs ?? []).map((s): RawLink => ({ kind: "stairs", cell: s.cell, name: s.name, to: s.to, direction: s.direction, style: s.style })),
  ];
}

// every link of a map that goes somewhere
export function mapLinks(map: LinkSource): MapLink[] {
  return rawLinks(map).filter((l): l is MapLink => !!l.to);
}

// the link of one gate / one staircase, if it goes anywhere
export const gateLink = (e: ExitSpec): MapLink | null => (e.to ? { kind: "gate", cell: e.cell, name: e.name, to: e.to } : null);
export const stairsLink = (s: StairsSpec): MapLink | null =>
  s.to ? { kind: "stairs", cell: s.cell, name: s.name, to: s.to, direction: s.direction, style: s.style } : null;

const sameCell = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

export function linkAt(map: LinkSource, cell: Vec2): MapLink | undefined {
  return mapLinks(map).find((l) => sameCell(l.cell, cell));
}

// the named places of a map a link can arrive at: its gates and stairs, with or without a target
export function namedPlaces(map: LinkSource): { cell: Vec2; name: string }[] {
  const out: { cell: Vec2; name: string }[] = [];
  for (const e of map.exits ?? []) if (e.name?.trim()) out.push({ cell: e.cell, name: e.name.trim() });
  for (const s of map.stairs ?? []) if (s.name?.trim()) out.push({ cell: s.cell, name: s.name.trim() });
  return out;
}

const walkable = (map: Pick<LinkMap, "width" | "height" | "cells">, c: Vec2) =>
  c.x >= 0 && c.y >= 0 && c.x < map.width && c.y < map.height && map.cells[c.y]?.[c.x] !== "wall";

// which way the party faces arriving in `cell`: as asked, else toward open
// ground (the start's facing first)
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
export function resolveArrival(from: Pick<LinkMap, "id">, link: Pick<MapLink, "kind" | "to" | "direction">, target: LinkMap): Arrival {
  const want = link.to.arrival;
  const facing = (cell: Vec2) => arrivalFacing(target, cell, link.to.facing);
  if (typeof want === "string") {
    const place = namedPlaces(target).find((p) => p.name.toLowerCase() === want.toLowerCase());
    if (place) return { cell: place.cell, facing: facing(place.cell), via: "named" };
  } else if (want && walkable(target, want)) {
    return { cell: { x: want.x, y: want.y }, facing: facing(want), via: "cell" };
  }
  // the way back: the same kind of link, and stairs the other way (up from below...)
  const rank = (l: MapLink) => (l.kind === link.kind ? 2 : 0) + (link.kind === "stairs" && l.kind === "stairs" && l.direction !== link.direction ? 1 : 0);
  let mate: MapLink | undefined;
  for (const l of mapLinks(target)) if (l.to.map === from.id && (!mate || rank(l) > rank(mate))) mate = l;
  if (mate) return { cell: mate.cell, facing: facing(mate.cell), via: "back" };
  return { cell: target.start.cell, facing: link.to.facing ?? target.start.facing, via: "start" };
}

// The image the loading screen shows on arriving through a link: the link's own,
// else the target map's, else none (the plain loading screen)
export function loadingImageFor(link: Pick<MapLink, "to"> | undefined, target: Pick<LinkMap, "loadingImage"> | undefined): string | undefined {
  return link?.to.loadingImage || target?.loadingImage || undefined;
}

export type LinkProblemCode = "linkNoTarget" | "linkUnknownMap" | "linkSelf" | "linkUnknownArrival" | "linkNoWayBack";
export interface LinkProblem {
  code: LinkProblemCode;
  severity: "error" | "warning";
  kind: LinkKind;
  cell: Vec2;
  params: Record<string, string | number>;
}

// What is wrong with the links of a map: stairs that lead nowhere yet, a target
// that doesn't exist (an error), an arrival that isn't there, a target with no
// way back (only warnings - the party arrives at the target's start then)
export function linkProblems(map: LinkMap, lookup: LinkLookup): LinkProblem[] {
  const out: LinkProblem[] = [];
  for (const link of rawLinks(map)) {
    const problem = (code: LinkProblemCode, severity: LinkProblem["severity"], params: LinkProblem["params"] = {}) =>
      out.push({ code, severity, kind: link.kind, cell: link.cell, params });
    if (!link.to) {
      problem("linkNoTarget", "warning");
      continue;
    }
    const target = lookup(link.to.map);
    if (!target) {
      problem("linkUnknownMap", "error", { map: link.to.map });
      continue;
    }
    if (target.id === map.id) {
      problem("linkSelf", "error");
      continue;
    }
    const want = link.to.arrival;
    if (want !== undefined) {
      const found = typeof want === "string"
        ? namedPlaces(target).some((p) => p.name.toLowerCase() === want.toLowerCase())
        : walkable(target, want);
      if (!found) problem("linkUnknownArrival", "warning", { map: target.name, arrival: typeof want === "string" ? want : `${want.x},${want.y}` });
      continue;
    }
    if (!mapLinks(target).some((l) => l.to.map === map.id)) problem("linkNoWayBack", "warning", { map: target.name });
  }
  return out;
}
