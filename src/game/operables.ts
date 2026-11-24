import { DIR_VECTOR } from "./movement";
import type { Direction, Vec2 } from "./types";

// Operable props: things the party pulls, presses or steps on, and the things they work.
//
//   source (lever, button, pressure plate, trap cell)  ->  targets (a door's open / close, a wall trap's shot)
//
// A source is a prop (`lever1`, `button1`, `plate1`, `trapcell1`) - or a decal that carries `operable` - whose map entry
// has an `operable` block listing its targets by cell address. A wall trap (`arrowslit1`, `glyph1`: an "emitter") is a
// prop too: it fires along the line away from the wall it hangs on, when a source names it as a target.
//
// This module is pure (no three.js, no React): the map model, parsing, the state machine and the checks. The runtime
// (useOperables.ts) applies the effects it returns; the viewport draws the state (operableStore.ts).
//
// The state lasts as long as the deck is loaded: a lever stays down while the party is on the deck, and is as the map
// has it again when the deck is entered anew - unless the source names a story `flag` (then the flag decides, see
// restoreFromFlags).

export type OperableKind = "lever" | "button" | "plate" | "trapcell" | "emitter";
export type DoorAction = "open" | "close" | "toggle";
export type Projectile = "arrow" | "spell";

export type OperableTarget =
  // the door cell at x,y: opened, closed or flipped; `force` opens a locked one too (else it stays shut and says so)
  | { kind: "door"; x: number; y: number; action?: DoorAction; force?: boolean }
  // the wall trap(s) in the cell x,y (those hanging on `side`, if given) fire
  | { kind: "trap"; x: number; y: number; side?: Direction };

export interface OperableSpec {
  // (decals only: a prop's kind is its type's)
  kind?: "lever" | "button";
  targets?: OperableTarget[];
  // a button: "toggle" (each press flips it, like a lever) or "momentary" (it springs back after `delay` seconds)
  mode?: "toggle" | "momentary";
  delay?: number;
  // a plate, a momentary button: the targets' action lasts only while it is held (default), else it latches and stays
  hold?: boolean;
  // a trap cell: fires only the first time
  once?: boolean;
  // a wall trap's shot
  projectile?: Projectile;
  damage?: number;
  // how far it reaches along its line (cells) and how long before it fires again (seconds)
  range?: number;
  cooldown?: number;
  // a story flag raised while the source is on (and, kept for the run, brings the source back on when the deck is loaded)
  flag?: string;
}

export const OPERABLE_DEFAULTS = {
  delay: 3,
  damage: { arrow: 6, spell: 8 },
  range: 8,
  cooldown: 2,
} as const;

// the operable props: their kind (and a wall trap's usual shot)
export const OPERABLE_PROPS: Record<string, { kind: OperableKind; projectile?: Projectile }> = {
  lever1: { kind: "lever" },
  button1: { kind: "button" },
  plate1: { kind: "plate" },
  trapcell1: { kind: "trapcell" },
  arrowslit1: { kind: "emitter", projectile: "arrow" },
  glyph1: { kind: "emitter", projectile: "spell" },
};

const SIDES: Direction[] = ["N", "E", "S", "W"];
const isSide = (v: unknown): v is Direction => typeof v === "string" && (SIDES as string[]).includes(v);
const isCell = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

// ---- reading what a map file holds (junk is dropped, never fatal)

export function readTarget(raw: unknown): OperableTarget | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (!isCell(r.x) || !isCell(r.y)) return undefined;
  if (r.kind === "door") {
    const action = r.action === "close" || r.action === "toggle" ? r.action : undefined;
    return { kind: "door", x: r.x, y: r.y, ...(action ? { action } : {}), ...(r.force === true ? { force: true } : {}) };
  }
  if (r.kind === "trap") return { kind: "trap", x: r.x, y: r.y, ...(isSide(r.side) ? { side: r.side } : {}) };
  return undefined;
}

export function readOperable(raw: unknown): OperableSpec | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: OperableSpec = {};
  if (r.kind === "lever" || r.kind === "button") out.kind = r.kind;
  const targets = Array.isArray(r.targets) ? r.targets.flatMap((t) => readTarget(t) ?? []) : [];
  if (targets.length) out.targets = targets;
  if (r.mode === "toggle" || r.mode === "momentary") out.mode = r.mode;
  const delay = num(r.delay, 0.2, 600);
  if (delay !== undefined) out.delay = delay;
  if (typeof r.hold === "boolean") out.hold = r.hold;
  if (r.once === true) out.once = true;
  if (r.projectile === "arrow" || r.projectile === "spell") out.projectile = r.projectile;
  const damage = num(r.damage, 0, 999);
  if (damage !== undefined) out.damage = Math.round(damage);
  const range = num(r.range, 1, 40);
  if (range !== undefined) out.range = Math.round(range);
  const cooldown = num(r.cooldown, 0, 600);
  if (cooldown !== undefined) out.cooldown = cooldown;
  if (typeof r.flag === "string" && r.flag.trim()) out.flag = r.flag.trim();
  return Object.keys(out).length ? out : undefined;
}

// ---- the sources of a map

interface PropLike { prop: string; cell: Vec2; at: string; rotation?: number; operable?: OperableSpec }
interface DecalLike { decal: string; cell: Vec2; surface: string; x: number; y: number; operable?: OperableSpec }
export interface OperableMap {
  width: number;
  height: number;
  cells: ("floor" | "wall" | "door")[][];
  props?: PropLike[];
  decals?: DecalLike[];
}

export interface OperableSource {
  // stable across edits that don't move it: "<prop>@<x>,<y>:<at>" (a second one at the same place: "#2"), a decal's
  // "decal:<name>@<x>,<y>:<surface>:<px>,<py>"
  key: string;
  from: "prop" | "decal";
  // its index in the map's props / decals
  index: number;
  kind: OperableKind;
  cell: Vec2;
  // the anchor / surface it is on
  at: string;
  rotation: number;
  spec: OperableSpec;
  // a wall trap's usual shot (its type's)
  projectile?: Projectile;
}

export function operableSources(map: OperableMap): OperableSource[] {
  const out: OperableSource[] = [];
  const seen = new Map<string, number>();
  const unique = (key: string) => {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}#${n}`;
  };
  (map.props ?? []).forEach((p, index) => {
    const type = Object.hasOwn(OPERABLE_PROPS, p.prop) ? OPERABLE_PROPS[p.prop] : undefined;
    if (!type) return;
    out.push({
      key: unique(`${p.prop}@${p.cell.x},${p.cell.y}:${p.at}`), from: "prop", index, kind: type.kind, cell: p.cell, at: p.at,
      rotation: p.rotation ?? 0, spec: p.operable ?? {}, projectile: type.projectile,
    });
  });
  (map.decals ?? []).forEach((d, index) => {
    if (!d.operable) return;
    out.push({
      key: unique(`decal:${d.decal}@${d.cell.x},${d.cell.y}:${d.surface}:${d.x},${d.y}`), from: "decal", index, kind: d.operable.kind ?? "button",
      cell: d.cell, at: d.surface, rotation: 0, spec: d.operable,
    });
  });
  return out;
}

// the source keys by prop index / decal index (what the viewport looks its objects up by)
export function sourceKeys(map: OperableMap): { props: Map<number, string>; decals: Map<number, string> } {
  const props = new Map<number, string>();
  const decals = new Map<number, string>();
  for (const s of operableSources(map)) (s.from === "prop" ? props : decals).set(s.index, s.key);
  return { props, decals };
}

// whether touching it is what works it (a lever, a button)
export const isClickable = (kind: OperableKind) => kind === "lever" || kind === "button";

const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

// ---- a wall trap: where it looks and what it fires

const CLOCKWISE_FROM_SOUTH: Direction[] = ["S", "W", "N", "E"];
// the way a wall prop faces (see props.ts WALL_FACING: it turns away from the wall it hangs on; `rotation` turns it on)
const WALL_YAW: Record<string, number> = { N: 0, NE: 0, NW: 0, S: 180, SE: 180, SW: 180, E: 90, W: 270, center: 0 };
export function facingOf(at: string, rotation = 0): Direction {
  const quarter = Math.round(((WALL_YAW[at] ?? 0) + rotation) / 90);
  return CLOCKWISE_FROM_SOUTH[((quarter % 4) + 4) % 4];
}

export interface EmitterInfo {
  key: string;
  cell: Vec2;
  dir: Direction;
  projectile: Projectile;
  damage: number;
  range: number;
  cooldownMs: number;
}
export function emitterInfo(source: OperableSource): EmitterInfo {
  const projectile = source.spec.projectile ?? source.projectile ?? "arrow";
  return {
    key: source.key,
    cell: source.cell,
    dir: facingOf(source.at, source.rotation),
    projectile,
    damage: source.spec.damage ?? OPERABLE_DEFAULTS.damage[projectile],
    range: source.spec.range ?? OPERABLE_DEFAULTS.range,
    cooldownMs: (source.spec.cooldown ?? OPERABLE_DEFAULTS.cooldown) * 1000,
  };
}

// the wall traps a trap target names: those in its cell (hanging on its `side`, if it says)
export function emittersAt(sources: OperableSource[], target: { x: number; y: number; side?: Direction }): OperableSource[] {
  return sources.filter((s) => s.kind === "emitter" && s.cell.x === target.x && s.cell.y === target.y && (!target.side || s.at === target.side));
}

// The cells a shot passes, from the trap's own to as far as `range` or the first wall / shut door.
export function traceLine(map: Pick<OperableMap, "width" | "height" | "cells">, from: Vec2, dir: Direction, range: number, doorOpen: (cell: Vec2) => boolean): Vec2[] {
  const v = DIR_VECTOR[dir];
  const cells: Vec2[] = [{ x: from.x, y: from.y }];
  for (let i = 1; i <= range; i++) {
    const c = { x: from.x + v.x * i, y: from.y + v.y * i };
    const type = map.cells[c.y]?.[c.x] ?? "wall";
    if (type === "wall" || (type === "door" && !doorOpen(c))) break;
    cells.push(c);
  }
  return cells;
}

// ---- the state

export interface OperableState {
  // whether a source is on: a lever flipped, a button down, a plate pressed, a trap cell stood on
  on: Record<string, boolean>;
  // a plate that latched, a trap cell that fired (for `once`)
  fired: Record<string, boolean>;
  // a momentary button: when it springs back (clock ms)
  springAt: Record<string, number>;
  // a wall trap: when it can fire again (clock ms)
  readyAt: Record<string, number>;
}
export const initialOperableState = (): OperableState => ({ on: {}, fired: {}, springAt: {}, readyAt: {} });

export interface OperableContext {
  // the clock (ms)
  now: number;
  // where the party stands (null: nowhere - the editor, a lift ride)
  party: Vec2 | null;
  // whether a door cell's door is open
  doorOpen: (cell: Vec2) => boolean;
  // how many items lie on a cell (a plate answers to them too; none can be put down in the world yet)
  itemsOn?: (cell: Vec2) => number;
}

export type OperableEffect =
  // the door cell opens or closes (`force`: even a locked one)
  | { type: "door"; cell: Vec2; action: "open" | "close"; force: boolean; source: string }
  // a wall trap fires: along `cells`, `hit` when the party stands on one
  | { type: "shot"; source: string; projectile: Projectile; damage: number; from: Vec2; dir: Direction; cells: Vec2[]; hit: boolean }
  // a source changed (for the log and the pose): `on` is its new state
  | { type: "changed"; source: string; kind: OperableKind; on: boolean }
  // the story flag a source raises (or lowers)
  | { type: "flag"; flag: string; value: boolean }
  // a target that cannot do it (no such door...), for the log
  | { type: "blocked"; source: string; reason: "noDoor" | "noTrap" | "cooling" };

export interface Step {
  state: OperableState;
  effects: OperableEffect[];
}

const inverse = (a: DoorAction): DoorAction => (a === "open" ? "close" : a === "close" ? "open" : "toggle");

// whether a source's targets go back when it goes off (a lever, a toggle button always; a plate and a momentary button
// unless they latch; a trap cell never)
export function holdsEffect(source: OperableSource): boolean {
  if (source.kind === "lever") return true;
  if (source.kind === "button") return source.spec.mode !== "momentary" || source.spec.hold !== false;
  if (source.kind === "plate") return source.spec.hold !== false;
  return false;
}

// the targets of a source work: as it goes on (`active`), or - if it holds - as it goes off
function work(map: OperableMap, sources: OperableSource[], source: OperableSource, active: boolean, ctx: OperableContext, s: OperableState, effects: OperableEffect[]) {
  if (!active && !holdsEffect(source)) return;
  for (const target of source.spec.targets ?? []) {
    const cell = { x: target.x, y: target.y };
    if (target.kind === "door") {
      if ((map.cells[cell.y]?.[cell.x] ?? "wall") !== "door") {
        effects.push({ type: "blocked", source: source.key, reason: "noDoor" });
        continue;
      }
      const base = target.action ?? "open";
      const action = active ? base : inverse(base);
      effects.push({ type: "door", cell, action: action === "toggle" ? (ctx.doorOpen(cell) ? "close" : "open") : action, force: target.force === true, source: source.key });
    } else if (active) {
      const traps = emittersAt(sources, target);
      if (!traps.length) effects.push({ type: "blocked", source: source.key, reason: "noTrap" });
      for (const trap of traps) fire(map, trap, ctx, s, effects, source.key);
    }
  }
}

function fire(map: OperableMap, trap: OperableSource, ctx: OperableContext, s: OperableState, effects: OperableEffect[], by: string) {
  const info = emitterInfo(trap);
  if ((s.readyAt[trap.key] ?? 0) > ctx.now) {
    effects.push({ type: "blocked", source: by, reason: "cooling" });
    return;
  }
  s.readyAt[trap.key] = ctx.now + info.cooldownMs;
  const cells = traceLine(map, info.cell, info.dir, info.range, ctx.doorOpen);
  effects.push({
    type: "shot", source: trap.key, projectile: info.projectile, damage: info.damage, from: info.cell, dir: info.dir, cells,
    hit: !!ctx.party && cells.some((c) => same(c, ctx.party!)),
  });
}

const copy = (state: OperableState): OperableState => ({ on: { ...state.on }, fired: { ...state.fired }, springAt: { ...state.springAt }, readyAt: { ...state.readyAt } });

function setOn(source: OperableSource, on: boolean, s: OperableState, effects: OperableEffect[]) {
  s.on[source.key] = on;
  effects.push({ type: "changed", source: source.key, kind: source.kind, on });
  if (source.spec.flag) effects.push({ type: "flag", flag: source.spec.flag, value: on });
}

// The party touches a lever or a button (a click, Use).
export function operate(map: OperableMap, state: OperableState, key: string, ctx: OperableContext): Step {
  const sources = operableSources(map);
  const source = sources.find((x) => x.key === key);
  const s = copy(state);
  const effects: OperableEffect[] = [];
  if (!source || !isClickable(source.kind)) return { state, effects };
  const was = !!s.on[key];
  if (source.kind === "button" && source.spec.mode === "momentary") {
    // (pressed already: it has to spring back first)
    if (was) return { state, effects };
    setOn(source, true, s, effects);
    s.springAt[key] = ctx.now + (source.spec.delay ?? OPERABLE_DEFAULTS.delay) * 1000;
    work(map, sources, source, true, ctx, s, effects);
    return { state: s, effects };
  }
  setOn(source, !was, s, effects);
  work(map, sources, source, !was, ctx, s, effects);
  return { state: s, effects };
}

// Time passes: the momentary buttons due spring back.
export function tick(map: OperableMap, state: OperableState, ctx: OperableContext): Step {
  const due = Object.keys(state.springAt).filter((k) => state.springAt[k] <= ctx.now);
  if (!due.length) return { state, effects: [] };
  const sources = operableSources(map);
  const s = copy(state);
  const effects: OperableEffect[] = [];
  for (const key of due) {
    delete s.springAt[key];
    const source = sources.find((x) => x.key === key);
    if (!source) continue;
    setOn(source, false, s, effects);
    work(map, sources, source, false, ctx, s, effects);
  }
  return { state: s, effects };
}

// Whether the party (or an item) is on each plate and trap cell: call it when the party moves and when items are put
// down or taken away.
export function evaluatePlates(map: OperableMap, state: OperableState, ctx: OperableContext): Step {
  const sources = operableSources(map);
  const s = copy(state);
  const effects: OperableEffect[] = [];
  for (const source of sources) {
    if (source.kind !== "plate" && source.kind !== "trapcell") continue;
    const key = source.key;
    const active = (!!ctx.party && same(ctx.party, source.cell)) || (ctx.itemsOn?.(source.cell) ?? 0) > 0;
    const was = !!s.on[key];
    if (source.kind === "plate") {
      if (holdsEffect(source)) {
        if (active === was) continue;
        setOn(source, active, s, effects);
        work(map, sources, source, active, ctx, s, effects);
      } else if (active && !s.fired[key]) {
        // (latched: it stays pressed for good)
        s.fired[key] = true;
        setOn(source, true, s, effects);
        work(map, sources, source, true, ctx, s, effects);
      }
    } else if (active && !was) {
      s.on[key] = true;
      if (source.spec.once && s.fired[key]) continue;
      s.fired[key] = true;
      effects.push({ type: "changed", source: key, kind: source.kind, on: true });
      work(map, sources, source, true, ctx, s, effects);
    } else if (!active && was) {
      s.on[key] = false;
      effects.push({ type: "changed", source: key, kind: source.kind, on: false });
    }
  }
  return effects.length || Object.keys(s.on).some((k) => s.on[k] !== state.on[k]) ? { state: s, effects } : { state, effects };
}

// The deck is loaded: sources whose story flag is up are on again (a lever flipped for good) and their targets work.
export function restoreFromFlags(map: OperableMap, hasFlag: (flag: string) => boolean, ctx: OperableContext): Step {
  const sources = operableSources(map);
  const s = initialOperableState();
  const effects: OperableEffect[] = [];
  for (const source of sources) {
    const flag = source.spec.flag;
    // (what is held down only while someone stands on it cannot come back on its own)
    const stays = source.kind === "lever" || (source.kind === "button" && source.spec.mode !== "momentary") || (source.kind === "plate" && source.spec.hold === false);
    if (!flag || !stays || !hasFlag(flag)) continue;
    s.on[source.key] = true;
    if (source.kind === "plate") s.fired[source.key] = true;
    effects.push({ type: "changed", source: source.key, kind: source.kind, on: true });
    work(map, sources, source, true, ctx, s, effects);
  }
  return { state: s, effects };
}

// a door effect that would shut a door on the party: not done
export const doorBlocked = (effect: Extract<OperableEffect, { type: "door" }>, party: Vec2 | null) =>
  effect.action === "close" && !!party && same(effect.cell, party);

// ---- the crew takes a hit

// the crewmate a shot lands on: a random standing one (`roll`: 0..1)
export function pickVictim<T extends { hp: number }>(crew: readonly T[], roll: number): T | undefined {
  const standing = crew.filter((c) => c.hp > 0);
  return standing[Math.min(standing.length - 1, Math.floor(roll * standing.length))];
}

// ---- checks for the editor's problem list

export interface OperableProblem {
  code: "operableNoTarget" | "operableDoorMissing" | "operableTrapMissing" | "operableFacesWall" | "operableUnused";
  cell: Vec2;
  params?: Record<string, string | number>;
}

export function operableProblems(map: OperableMap): OperableProblem[] {
  const sources = operableSources(map);
  const out: OperableProblem[] = [];
  const targeted = new Set<string>();
  for (const source of sources) {
    if (source.kind !== "emitter" && !(source.spec.targets?.length)) out.push({ code: "operableNoTarget", cell: source.cell, params: { kind: source.kind } });
    for (const target of source.spec.targets ?? []) {
      if (target.kind === "door") {
        if ((map.cells[target.y]?.[target.x] ?? "wall") !== "door") out.push({ code: "operableDoorMissing", cell: source.cell, params: { x: target.x, y: target.y } });
      } else {
        const traps = emittersAt(sources, target);
        if (!traps.length) out.push({ code: "operableTrapMissing", cell: source.cell, params: { x: target.x, y: target.y } });
        for (const t of traps) targeted.add(t.key);
      }
    }
  }
  for (const source of sources) {
    if (source.kind !== "emitter") continue;
    if (!targeted.has(source.key)) out.push({ code: "operableUnused", cell: source.cell });
    const dir = facingOf(source.at, source.rotation);
    const v = DIR_VECTOR[dir];
    if ((map.cells[source.cell.y + v.y]?.[source.cell.x + v.x] ?? "wall") === "wall") out.push({ code: "operableFacesWall", cell: source.cell, params: { side: dir } });
  }
  return out;
}

// ---- area copy

// A source copied with an area (moved by dx, dy): the targets inside the area move with it, so a lever and its doors keep
// working together; the ones outside it stay where they were.
export function relocateOperable(spec: OperableSpec | undefined, area: { x0: number; y0: number; x1: number; y1: number }, dx: number, dy: number): OperableSpec | undefined {
  if (!spec?.targets) return spec;
  const inside = (t: OperableTarget) => t.x >= area.x0 && t.x <= area.x1 && t.y >= area.y0 && t.y <= area.y1;
  return { ...spec, targets: spec.targets.map((t) => (inside(t) ? { ...t, x: t.x + dx, y: t.y + dy } : { ...t })) };
}

// the targets of a source, as the editor draws its links (source cell -> target cell)
export function operableLinks(map: OperableMap): { from: Vec2; to: Vec2; kind: OperableTarget["kind"] }[] {
  return operableSources(map).flatMap((s) => (s.spec.targets ?? []).map((t) => ({ from: s.cell, to: { x: t.x, y: t.y }, kind: t.kind })));
}
