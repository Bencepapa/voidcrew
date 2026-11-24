import { emitterOn, readAddress, resolveAddress, smokeKeys, type Address, type Area } from "./emitters";
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

export type EmitterAction = "on" | "off" | "toggle";
// a reward's items: `qty` of an item type
export interface RewardItem { item: string; qty: number }

export type OperableTarget =
  // the door cell at x,y: opened, closed or flipped; `force` opens a locked one too (else it stays shut and says so)
  | { kind: "door"; x: number; y: number; action?: DoorAction; force?: boolean }
  // the wall trap(s) in the cell x,y (those hanging on `side`, if given) fire
  | { kind: "trap"; x: number; y: number; side?: Direction }
  // the smoke / fire emitter(s) addressed (a cell + `index`, an `id`, or an `area` of cells) switched on / off / toggled
  // (not to be confused with a wall trap, `OperableKind` "emitter": that fires a shot). The default action is "on"; as the
  // source goes off (a lever pushed back, a plate left) the inverse follows, unless the source latches.
  | ({ kind: "emitter"; action?: EmitterAction } & Address)
  // the dormant NPC(s) addressed (ActorSpec.dormant) appear, once, as the source goes on
  | ({ kind: "spawn" } & Address)
  // the dormant item(s) addressed (MapItem.dormant) appear, once, as the source goes on
  | ({ kind: "item" } & Address)
  // credits and / or items straight into the party's hands as the source goes on; once only unless `once: false`
  | { kind: "reward"; credits?: number; items?: RewardItem[]; once?: boolean };

// a target that points at a place (not a reward)
export type AddressedTarget = Extract<OperableTarget, { kind: "emitter" | "spawn" | "item" }>;
export const isAddressed = (t: OperableTarget): t is AddressedTarget => t.kind === "emitter" || t.kind === "spawn" || t.kind === "item";

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
  if (r.kind === "emitter" || r.kind === "spawn" || r.kind === "item") {
    const address = readAddress(r);
    if (!address) return undefined;
    const action = r.kind === "emitter" && (r.action === "off" || r.action === "toggle") ? r.action : undefined;
    return { kind: r.kind, ...address, ...(action ? { action } : {}) } as OperableTarget;
  }
  if (r.kind === "reward") {
    const credits = num(r.credits, 0, 1_000_000);
    const items = Array.isArray(r.items)
      ? r.items.flatMap((i): RewardItem[] => {
          const it = i as Record<string, unknown> | null;
          const qty = it ? num(it.qty, 1, 999) : undefined;
          return it && typeof it.item === "string" && it.item.trim() && qty !== undefined ? [{ item: it.item.trim(), qty: Math.round(qty) }] : [];
        })
      : [];
    if (!(credits && Math.round(credits) >= 1) && !items.length) return undefined;
    return { kind: "reward", ...(credits && Math.round(credits) >= 1 ? { credits: Math.round(credits) } : {}), ...(items.length ? { items } : {}), ...(r.once === false ? { once: false } : {}) };
  }
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
  // what the new targets address (see OperableTarget): smoke emitters, NPCs and loose items
  smokes?: { cell: Vec2; id?: string; active?: boolean }[];
  actors?: { cell: Vec2; id?: string; dormant?: boolean }[];
  items?: { cell: Vec2; id?: string; dormant?: boolean }[];
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
// whether a map has anything to touch (a lever or button prop, a decal that is one)
export const hasClickables = (map: { props?: { prop: string }[]; decals?: { operable?: OperableSpec }[] }) =>
  !!map.props?.some((p) => Object.hasOwn(OPERABLE_PROPS, p.prop) && isClickable(OPERABLE_PROPS[p.prop].kind)) || !!map.decals?.some((d) => d.operable);

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
  // the smoke emitters a switch has turned on or off, by emitter key (see emitters.ts smokeKeys); the others follow `active`
  emit: Record<string, boolean>;
  // the dormant NPCs (by index in the map's actors) and items (by index in its items) already brought in
  spawned: Record<string, boolean>;
  revealed: Record<string, boolean>;
  // the rewards paid on this deck (by "<source key>#<target index>")
  paid: Record<string, boolean>;
}
export const initialOperableState = (): OperableState => ({ on: {}, fired: {}, springAt: {}, readyAt: {}, emit: {}, spawned: {}, revealed: {}, paid: {} });

export interface OperableContext {
  // the clock (ms)
  now: number;
  // where the party stands (null: nowhere - the editor, a lift ride)
  party: Vec2 | null;
  // whether a door cell's door is open
  doorOpen: (cell: Vec2) => boolean;
  // how many items lie on a cell (a plate answers to them too; none can be put down in the world yet)
  itemsOn?: (cell: Vec2) => number;
  // whether a reward was paid before (kept for the whole run, not only this deck's visit)
  rewarded?: (key: string) => boolean;
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
  | { type: "blocked"; source: string; reason: "noDoor" | "noTrap" | "cooling" | "noEmitter" | "noSpawn" | "noItem" }
  // smoke / fire emitters (by key) switched on or off (only the ones that really changed)
  | { type: "emitters"; source: string; keys: string[]; on: boolean }
  // dormant NPCs (indices in the map's actors) come into the world
  | { type: "spawn"; source: string; actors: number[] }
  // dormant items (indices in the map's items) appear
  | { type: "reveal"; source: string; items: number[] }
  // credits and items go to the party; `key` tells the runtime which reward it is (to remember it was paid)
  | { type: "reward"; source: string; key: string; credits: number; items: RewardItem[] };

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
  (source.spec.targets ?? []).forEach((target, ti) => {
    if (target.kind === "door") {
      const cell = { x: target.x, y: target.y };
      if ((map.cells[cell.y]?.[cell.x] ?? "wall") !== "door") {
        effects.push({ type: "blocked", source: source.key, reason: "noDoor" });
        return;
      }
      const base = target.action ?? "open";
      const action = active ? base : inverse(base);
      effects.push({ type: "door", cell, action: action === "toggle" ? (ctx.doorOpen(cell) ? "close" : "open") : action, force: target.force === true, source: source.key });
    } else if (target.kind === "emitter") {
      switchEmitters(map, source, target, active, s, effects);
    } else if (!active) {
      // (what follows happens as a source goes on: a shot, a spawn, a reveal, a reward are not undone when it goes off)
    } else if (target.kind === "trap") {
      const traps = emittersAt(sources, target);
      if (!traps.length) effects.push({ type: "blocked", source: source.key, reason: "noTrap" });
      for (const trap of traps) fire(map, trap, ctx, s, effects, source.key);
    } else if (target.kind === "spawn") {
      const found = resolveAddress(map.actors, target, (a) => a.dormant === true);
      if (!found.length) effects.push({ type: "blocked", source: source.key, reason: "noSpawn" });
      const fresh = found.filter((i) => !s.spawned[i]);
      for (const i of fresh) s.spawned[i] = true;
      if (fresh.length) effects.push({ type: "spawn", source: source.key, actors: fresh });
    } else if (target.kind === "item") {
      const found = resolveAddress(map.items, target, (it) => it.dormant === true);
      if (!found.length) effects.push({ type: "blocked", source: source.key, reason: "noItem" });
      const fresh = found.filter((i) => !s.revealed[i]);
      for (const i of fresh) s.revealed[i] = true;
      if (fresh.length) effects.push({ type: "reveal", source: source.key, items: fresh });
    } else {
      const key = rewardKey(source.key, ti);
      const once = target.once !== false || source.spec.once === true;
      if (once && (s.paid[key] || ctx.rewarded?.(key))) return;
      s.paid[key] = true;
      effects.push({ type: "reward", source: source.key, key, credits: target.credits ?? 0, items: target.items ?? [] });
    }
  });
}

// the id of a reward target (its source, its place in the source's list): what a paid reward is remembered by
export const rewardKey = (sourceKey: string, targetIndex: number) => `${sourceKey}#${targetIndex}`;

const inverseEmit = (a: EmitterAction): EmitterAction => (a === "on" ? "off" : a === "off" ? "on" : "toggle");

// The emitters a target addresses go on, off or flip (as the source goes on: its action; off: the inverse). Only the ones
// that really change are reported.
function switchEmitters(map: OperableMap, source: OperableSource, target: Extract<OperableTarget, { kind: "emitter" }>, active: boolean, s: OperableState, effects: OperableEffect[]) {
  const found = resolveAddress(map.smokes, target);
  if (!found.length) {
    effects.push({ type: "blocked", source: source.key, reason: "noEmitter" });
    return;
  }
  const keys = smokeKeys(map.smokes);
  const base = target.action ?? "on";
  const action = active ? base : inverseEmit(base);
  const turnedOn: string[] = [];
  const turnedOff: string[] = [];
  for (const i of found) {
    const now = emitterOn(map.smokes![i], keys[i], s.emit);
    const want = action === "toggle" ? !now : action === "on";
    if (want === now) continue;
    s.emit[keys[i]] = want;
    (want ? turnedOn : turnedOff).push(keys[i]);
  }
  if (turnedOn.length) effects.push({ type: "emitters", source: source.key, keys: turnedOn, on: true });
  if (turnedOff.length) effects.push({ type: "emitters", source: source.key, keys: turnedOff, on: false });
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

const copy = (state: OperableState): OperableState => ({
  on: { ...state.on }, fired: { ...state.fired }, springAt: { ...state.springAt }, readyAt: { ...state.readyAt },
  emit: { ...state.emit }, spawned: { ...state.spawned }, revealed: { ...state.revealed }, paid: { ...state.paid },
});

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
  code:
    | "operableNoTarget" | "operableDoorMissing" | "operableTrapMissing" | "operableFacesWall" | "operableUnused"
    | "operableEmitterMissing" | "operableSpawnMissing" | "operableItemMissing" | "operableInactiveUnused" | "operableDormantUnused";
  cell: Vec2;
  params?: Record<string, string | number>;
}

// where a target points, for a message ("3,2", "area 1,1-4,3", "id fire-a")
export function describeAddress(a: Address): string {
  if (a.id) return `id ${a.id}`;
  if (a.area) return `${a.area.x0},${a.area.y0}-${a.area.x1},${a.area.y1}`;
  return `${a.x},${a.y}${a.index !== undefined ? `#${a.index + 1}` : ""}`;
}

export function operableProblems(map: OperableMap): OperableProblem[] {
  const sources = operableSources(map);
  const out: OperableProblem[] = [];
  const targeted = new Set<string>();
  const wakers = { emitter: new Set<number>(), actor: new Set<number>(), item: new Set<number>() };
  for (const source of sources) {
    if (source.kind !== "emitter" && !(source.spec.targets?.length)) out.push({ code: "operableNoTarget", cell: source.cell, params: { kind: source.kind } });
    for (const target of source.spec.targets ?? []) {
      if (target.kind === "door") {
        if ((map.cells[target.y]?.[target.x] ?? "wall") !== "door") out.push({ code: "operableDoorMissing", cell: source.cell, params: { x: target.x, y: target.y } });
      } else if (target.kind === "trap") {
        const traps = emittersAt(sources, target);
        if (!traps.length) out.push({ code: "operableTrapMissing", cell: source.cell, params: { x: target.x, y: target.y } });
        for (const t of traps) targeted.add(t.key);
      } else if (target.kind === "emitter") {
        const found = resolveAddress(map.smokes, target);
        if (!found.length) out.push({ code: "operableEmitterMissing", cell: source.cell, params: { at: describeAddress(target) } });
        for (const i of found) wakers.emitter.add(i);
      } else if (target.kind === "spawn") {
        const found = resolveAddress(map.actors, target, (a) => a.dormant === true);
        if (!found.length) out.push({ code: "operableSpawnMissing", cell: source.cell, params: { at: describeAddress(target) } });
        for (const i of found) wakers.actor.add(i);
      } else if (target.kind === "item") {
        const found = resolveAddress(map.items, target, (it) => it.dormant === true);
        if (!found.length) out.push({ code: "operableItemMissing", cell: source.cell, params: { at: describeAddress(target) } });
        for (const i of found) wakers.item.add(i);
      }
    }
  }
  // what waits for a switch that nothing works: an inactive emitter, a dormant NPC or item
  (map.smokes ?? []).forEach((s, i) => {
    if (s.active === false && !wakers.emitter.has(i)) out.push({ code: "operableInactiveUnused", cell: s.cell });
  });
  (map.actors ?? []).forEach((a, i) => {
    if (a.dormant && !wakers.actor.has(i)) out.push({ code: "operableDormantUnused", cell: a.cell, params: { what: "npc" } });
  });
  (map.items ?? []).forEach((it, i) => {
    if (it.dormant && !wakers.item.has(i)) out.push({ code: "operableDormantUnused", cell: it.cell, params: { what: "item" } });
  });
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
export function relocateOperable(spec: OperableSpec | undefined, area: Area, dx: number, dy: number): OperableSpec | undefined {
  if (!spec?.targets) return spec;
  const inside = (x: number, y: number) => x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1;
  return {
    ...spec,
    targets: spec.targets.map((t): OperableTarget => {
      if (t.kind === "reward") return { ...t };
      // (a target made of an area moves with it when the whole block lies inside the copied one)
      if (isAddressed(t) && t.area) {
        const a = t.area;
        if (!(inside(a.x0, a.y0) && inside(a.x1, a.y1))) return { ...t, area: { ...a } };
        return { ...t, ...(t.x !== undefined && t.y !== undefined ? { x: t.x + dx, y: t.y + dy } : {}), area: { x0: a.x0 + dx, y0: a.y0 + dy, x1: a.x1 + dx, y1: a.y1 + dy } };
      }
      return t.x !== undefined && t.y !== undefined && inside(t.x, t.y) ? { ...t, x: t.x + dx, y: t.y + dy } : { ...t };
    }),
  };
}

// the cells a target points at (a door's, a wall trap's, the emitters', NPCs' or items' it addresses); a reward has none
export function targetCells(map: OperableMap, t: OperableTarget): Vec2[] {
  switch (t.kind) {
    case "door":
    case "trap":
      return [{ x: t.x, y: t.y }];
    case "emitter":
      return resolveAddress(map.smokes, t).map((i) => map.smokes![i].cell);
    case "spawn":
      return resolveAddress(map.actors, t, (a) => a.dormant === true).map((i) => map.actors![i].cell);
    case "item":
      return resolveAddress(map.items, t, (it) => it.dormant === true).map((i) => map.items![i].cell);
    case "reward":
      return [];
  }
}

// the targets of a source, as the editor draws its links (source cell -> target cell)
export function operableLinks(map: OperableMap): { from: Vec2; to: Vec2; kind: OperableTarget["kind"] }[] {
  return operableSources(map).flatMap((s) => (s.spec.targets ?? []).flatMap((t) => targetCells(map, t).map((to) => ({ from: s.cell, to, kind: t.kind }))));
}
