import type { SmokeHarm, Vec2 } from "./types";

// Emitters as traps (see operables.ts for the switches): a smoke / fire emitter can be inactive until a lever, button or
// plate turns it on (`SmokeSpec.active`), and can hurt the crew standing in its smoke (`SmokeSpec.harm`: poison smoke, a
// flame jet). Pure: addressing, the emitters' on/off keys, the area the smoke reaches and the damage cadence. The
// runtime (useOperables.ts) applies the hits; the viewport reads which emitters are on from emitterStore.ts.

// a block of cells, corners included
export interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

// a rectangle as a map file writes it (any corner order); junk: undefined
export function readArea(raw: unknown): Area | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (!isInt(r.x0) || !isInt(r.y0) || !isInt(r.x1) || !isInt(r.y1)) return undefined;
  return { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
}
export const inArea = (area: Area, cell: Vec2) => cell.x >= area.x0 && cell.x <= area.x1 && cell.y >= area.y0 && cell.y <= area.y1;

// ---- what an emitter does to the crew

export const HARM_DEFAULTS = { every: 1, reach: 1, maxReach: 3 } as const;

// the harm block of a map file: damage 1..99 (anything less is no harm), every 0.25..60 s, reach 0..3 cells
export function readHarm(raw: unknown): SmokeHarm | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const damage = num(r.damage, 0, 99);
  if (damage === undefined || Math.round(damage) < 1) return undefined;
  const out: SmokeHarm = { damage: Math.round(damage) };
  const every = num(r.every, 0.25, 60);
  if (every !== undefined) out.every = every;
  const reach = num(r.reach, 0, HARM_DEFAULTS.maxReach);
  if (reach !== undefined) out.reach = Math.round(reach);
  if (typeof r.label === "string" && r.label.trim()) out.label = r.label.trim().slice(0, 80);
  return out;
}

// ---- the emitters' keys and on / off

// "x,y" for the first emitter in a cell, "x,y#2" for the second...: what the state and the stores know an emitter by
// (the played map's list, not the file's: a variation can leave some out)
export function smokeKeys(smokes: readonly { cell: Vec2 }[] | undefined): string[] {
  const seen = new Map<string, number>();
  return (smokes ?? []).map((s) => {
    const base = `${s.cell.x},${s.cell.y}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

// whether an emitter is on: what the runtime says (`on` by key), else its own `active` (on unless it says false)
export const emitterOn = (spec: { active?: boolean }, key: string, on: Readonly<Record<string, boolean>>): boolean => on[key] ?? spec.active !== false;

// ---- addresses

// where a target points: a cell (x, y; `index`: the n-th entry in it, counting from 0 in file order), or an `id`, or an area
export interface Address {
  x?: number;
  y?: number;
  index?: number;
  id?: string;
  area?: Area;
}

// the address part of a target as a map file writes it: needs a cell, an id or an area
export function readAddress(r: Record<string, unknown>): Address | undefined {
  const out: Address = {};
  const area = readArea(r.area);
  if (area) out.area = area;
  if (typeof r.id === "string" && r.id.trim()) out.id = r.id.trim();
  if (isInt(r.x) && isInt(r.y)) {
    out.x = r.x;
    out.y = r.y;
    if (isInt(r.index) && r.index >= 0) out.index = r.index;
  }
  return out.area || out.id || out.x !== undefined ? out : undefined;
}

// The entries a target addresses (their indices in the list): by id, else by area, else by cell (+ index). `include`
// narrows to the ones the target kind is about (the dormant ones...), after the n-th is picked.
export function resolveAddress<T extends { cell: Vec2; id?: string }>(
  list: readonly T[] | undefined,
  address: Address,
  include: (entry: T) => boolean = () => true,
): number[] {
  const entries = list ?? [];
  const out: number[] = [];
  if (address.id) {
    entries.forEach((e, i) => e.id === address.id && include(e) && out.push(i));
  } else if (address.area) {
    entries.forEach((e, i) => inArea(address.area!, e.cell) && include(e) && out.push(i));
  } else if (address.x !== undefined && address.y !== undefined) {
    let n = 0;
    entries.forEach((e, i) => {
      if (e.cell.x !== address.x || e.cell.y !== address.y) return;
      if ((address.index === undefined || address.index === n) && include(e)) out.push(i);
      n++;
    });
  }
  return out;
}

// the n-th entry of a cell's: what `index` of an address is for an entry (undefined when it is the only one there)
export function indexInCell<T extends { cell: Vec2 }>(list: readonly T[] | undefined, at: number): number | undefined {
  const entries = list ?? [];
  const me = entries[at];
  if (!me) return undefined;
  const same = entries.filter((e) => e.cell.x === me.cell.x && e.cell.y === me.cell.y);
  return same.length > 1 ? same.indexOf(me) : undefined;
}

// ---- the smoke's reach

interface Grid {
  width: number;
  height: number;
  cells: readonly (readonly ("floor" | "wall" | "door")[])[];
}

// The cells the smoke of an emitter in `from` fills: its own and those up to `reach` steps away over walkable cells (a wall
// stops it; so does a shut door).
export function harmCells(map: Grid, from: Vec2, reach: number, doorOpen: (cell: Vec2) => boolean = () => false): Vec2[] {
  const open = (c: Vec2) => {
    const type = map.cells[c.y]?.[c.x];
    return type === "floor" || (type === "door" && doorOpen(c));
  };
  const out: Vec2[] = [{ x: from.x, y: from.y }];
  const seen = new Set([`${from.x},${from.y}`]);
  let frontier = out.slice();
  for (let step = 0; step < Math.min(HARM_DEFAULTS.maxReach, Math.max(0, reach)); step++) {
    const next: Vec2[] = [];
    for (const c of frontier) {
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const n = { x: c.x + dx, y: c.y + dy };
        const key = `${n.x},${n.y}`;
        if (seen.has(key) || !open(n)) continue;
        seen.add(key);
        next.push(n);
        out.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

// ---- the damage cadence

export interface HarmHit {
  key: string;
  damage: number;
  // what the map says ("is scorched by the flames": the log line is "<name> <label>."); unset: the default line
  // ("<name> chokes on the poison smoke.")
  label?: string;
}

export interface HarmInput {
  map: Grid & { smokes?: readonly { cell: Vec2; active?: boolean; harm?: SmokeHarm }[] };
  // the runtime's on / off by emitter key (see emitterOn)
  on: Readonly<Record<string, boolean>>;
  // where the party stands (null: nowhere - the editor, a lift ride, in the air above the floor)
  party: Vec2 | null;
  now: number;
  // when each emitter last hurt, by key (the previous result's `last`)
  last: Readonly<Record<string, number>>;
  // whether the traps are armed at all (see playMode.ts trapsActive): not armed, nothing happens
  armed: boolean;
  doorOpen?: (cell: Vec2) => boolean;
}

// The hits due now: each emitter that is on and whose smoke the party stands in hurts at once on entering, then every
// `every` seconds (leaving and coming back does not start the count over).
export function harmTick(input: HarmInput): { hits: HarmHit[]; last: Record<string, number> } {
  const last = { ...input.last };
  const hits: HarmHit[] = [];
  const smokes = input.map.smokes ?? [];
  if (!input.armed || !input.party || !smokes.length) return { hits, last };
  const keys = smokeKeys(smokes);
  smokes.forEach((spec, i) => {
    const harm = spec.harm;
    if (!harm || !emitterOn(spec, keys[i], input.on)) return;
    const cells = harmCells(input.map, spec.cell, harm.reach ?? HARM_DEFAULTS.reach, input.doorOpen);
    if (!cells.some((c) => c.x === input.party!.x && c.y === input.party!.y)) return;
    const every = (harm.every ?? HARM_DEFAULTS.every) * 1000;
    const before = last[keys[i]];
    if (before !== undefined && input.now - before < every) return;
    last[keys[i]] = input.now;
    hits.push({ key: keys[i], damage: harm.damage, ...(harm.label ? { label: harm.label } : {}) });
  });
  return { hits, last };
}
