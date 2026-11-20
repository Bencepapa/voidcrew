import { useSyncExternalStore } from "react";
import { ITEM_TYPES } from "./items";
import { activeWorld } from "./worlds";
import { WEAPON_TYPES, weaponInWorld, MAX_LEVEL, type OwnedWeapon } from "./weapons";

// What lasts between runs - the base: credits, the stash (how many of each
// item), the weapons owned and who carries which (two slots each), and how
// deep into space the crew has gone. Kept in the browser (localStorage), so
// a reload doesn't lose it.

// (the weapons' data lives in weapons.ts; meta.ts still names them for the screens that import it here)
export { WEAPON_TYPES, weaponInWorld, weaponStats, MAX_LEVEL, type WeaponType, type OwnedWeapon } from "./weapons";

export interface Meta {
  credits: number;
  stash: Record<string, number>;
  weapons: OwnedWeapon[];
  // who carries which: two slots of owned weapon ids each
  loadout: Record<string, [number | null, number | null]>;
  // the slot in hand, per crewmate
  active: Record<string, 0 | 1>;
  // how deep into space the crew has been (the ships get more dangerous
  // and richer), and how many runs it's come back from
  depth: number;
  runs: number;
  nextId: number;
  // the story's lasting flags ("story.*" - see story.ts)
  story: string[];
}

// who starts with what: the crew member, their weapon, and (maybe) a second
const STARTING: [string, string, string?][] = [
  ["reese", "pulse_rifle"],
  ["lyn", "arc_welder"],
  ["orion", "shock_emitter"],
  ["kell", "stim_injector"],
  // Void Fantasy's party
  ["aldra", "spear"],
  ["borin", "crossbow"],
  ["merlen", "arcane_staff", "healing_staff"],
  ["elara", "longbow"],
];

function fresh(): Meta {
  const weapons: OwnedWeapon[] = [];
  const loadout: Record<string, [number | null, number | null]> = {};
  for (const [crew, first, second] of STARTING) {
    const slots: [number | null, number | null] = [null, null];
    [first, second].forEach((type, slot) => {
      if (!type) return;
      slots[slot] = weapons.length;
      weapons.push({ id: weapons.length, type, level: 0 });
    });
    loadout[crew] = slots;
  }
  return {
    credits: 0,
    stash: {},
    weapons,
    loadout,
    active: {},
    depth: 0,
    runs: 0,
    nextId: weapons.length,
    story: [],
  };
}

const KEY = "voidcrew-meta-v1";
function load(): Meta {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Meta | null;
    if (saved && Array.isArray(saved.weapons) && saved.loadout) return withStarting({ ...fresh(), ...saved });
  } catch {
    // (a broken save: start over)
  }
  return fresh();
}

// (an older save has no weapons for the crew that came later: they're given them)
function withStarting(m: Meta): Meta {
  const next: Meta = { ...m, weapons: [...m.weapons], loadout: { ...m.loadout } };
  for (const [crew, first, second] of STARTING) {
    if (next.loadout[crew]) continue;
    const slots: [number | null, number | null] = [null, null];
    [first, second].forEach((type, slot) => {
      if (!type) return;
      const id = next.nextId++;
      next.weapons.push({ id, type, level: 0 });
      slots[slot] = id;
    });
    next.loadout[crew] = slots;
  }
  return next;
}

let meta = load();
const listeners = new Set<() => void>();
function set(next: Meta) {
  meta = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    // (no storage: it lasts as long as the page)
  }
  listeners.forEach((l) => l());
}

export const getMeta = () => meta;
export function useMeta(): Meta {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => meta,
  );
}

// (what a crewmate has in hand during a run - the right hand's weapon - is
// inventoryStore.ts's: the loadout above is what they take along at the start)

// A run that came home: the weapons the crew held in the end are their loadout
// now (right hand = first slot, in use). A weapon with no owner yet (one bought
// or found on the run) becomes an owned one; `spare` are weapon types carried in
// the backpack that nobody holds.
export type CarriedWeapon = { type: string; uid?: number };
export function commitLoadout(held: Record<string, [CarriedWeapon | null, CarriedWeapon | null]>, spare: string[] = []) {
  const weapons = [...meta.weapons];
  let nextId = meta.nextId;
  const own = (w: CarriedWeapon | null): number | null => {
    if (!w || !WEAPON_TYPES[w.type]) return null;
    if (w.uid !== undefined && weapons.some((o) => o.id === w.uid)) return w.uid;
    weapons.push({ id: nextId, type: w.type, level: 0 });
    return nextId++;
  };
  const loadout = { ...meta.loadout };
  const active = { ...meta.active };
  for (const [crew, [right, left]] of Object.entries(held)) {
    const pair: [number | null, number | null] = [own(right), own(left)];
    loadout[crew] = pair[0] === null ? [pair[1], null] : pair;
    active[crew] = 0;
  }
  for (const type of spare) own({ type });
  set({ ...meta, weapons, loadout, active, nextId });
}

// Bringing the downed back for the next run: each a clone, paid with a
// medkit from the stash, else credits (as far as there are any - a crew is
// never left unrevived). The rest of the crew heals for free.
export const CLONE_CREDITS = 40;
export function revivalBill(
  down: number,
  stash: Readonly<Record<string, number>> = meta.stash,
  credits = meta.credits,
): { medkits: number; credits: number } {
  const medkits = Math.min(down, stash.medkit ?? 0);
  return { medkits, credits: Math.min(credits, (down - medkits) * CLONE_CREDITS) };
}
export function payRevival(down: number) {
  if (down <= 0) return;
  const bill = revivalBill(down);
  const stash: Record<string, number> = { ...meta.stash, medkit: (meta.stash.medkit ?? 0) - bill.medkits };
  if (!stash.medkit) delete stash.medkit;
  set({ ...meta, stash, credits: meta.credits - bill.credits });
}

// a run lost with the whole crew: its haul with it
export function failRun() {
  set({ ...meta, runs: meta.runs + 1 });
}

// a lasting story flag up or down
export function setStoryFlag(flag: string, on: boolean) {
  const has = meta.story.includes(flag);
  if (has === on) return;
  set({ ...meta, story: on ? [...meta.story, flag] : meta.story.filter((f) => f !== flag) });
}

// a run's haul comes home
export function bankHaul(haul: Readonly<Record<string, number>>, depth: number) {
  const stash = { ...meta.stash };
  for (const [item, count] of Object.entries(haul)) stash[item] = (stash[item] ?? 0) + count;
  set({ ...meta, stash, runs: meta.runs + 1, depth: Math.max(meta.depth, depth) });
}

export function sellItem(item: string, count: number) {
  const have = meta.stash[item] ?? 0;
  const n = Math.min(have, count);
  if (n <= 0) return;
  const stash = { ...meta.stash, [item]: have - n };
  if (!stash[item]) delete stash[item];
  set({ ...meta, stash, credits: meta.credits + n * (ITEM_TYPES[item]?.value ?? 0) });
}

// credits as a plain counter (a shop's deals): the new total, or false if it would go below 0
export function setCredits(credits: number): boolean {
  if (!Number.isFinite(credits) || credits < 0) return false;
  if (credits !== meta.credits) set({ ...meta, credits: Math.floor(credits) });
  return true;
}

export function buyWeapon(type: string): boolean {
  const price = WEAPON_TYPES[type]?.price;
  if (price === undefined || meta.credits < price || !weaponInWorld(type, activeWorld())) return false;
  set({ ...meta, credits: meta.credits - price, weapons: [...meta.weapons, { id: meta.nextId, type, level: 0 }], nextId: meta.nextId + 1 });
  return true;
}

// what the next level of a weapon costs: credits and parts
export function upgradeCost(owned: OwnedWeapon): { credits: number; items: Record<string, number> } | null {
  if (owned.level >= MAX_LEVEL) return null;
  const next = owned.level + 1;
  return { credits: 60 * next, items: { circuit: next, servo: next > 1 ? next - 1 : 0, powercell: next > 2 ? 1 : 0 } };
}

export function canAfford(cost: { credits: number; items: Record<string, number> }): boolean {
  return meta.credits >= cost.credits && Object.entries(cost.items).every(([item, n]) => (meta.stash[item] ?? 0) >= n);
}

export function upgradeWeapon(id: number): boolean {
  const owned = meta.weapons.find((w) => w.id === id);
  const cost = owned && upgradeCost(owned);
  if (!owned || !cost || !canAfford(cost)) return false;
  const stash = { ...meta.stash };
  for (const [item, n] of Object.entries(cost.items)) {
    stash[item] = (stash[item] ?? 0) - n;
    if (!stash[item]) delete stash[item];
  }
  set({
    ...meta,
    credits: meta.credits - cost.credits,
    stash,
    weapons: meta.weapons.map((w) => (w.id === id ? { ...w, level: w.level + 1 } : w)),
  });
  return true;
}

// a weapon into a crewmate's slot (null: out of it) - out of wherever else
// it was
export function equip(crewId: string, slot: 0 | 1, weaponId: number | null) {
  const loadout: Meta["loadout"] = {};
  for (const [crew, slots] of Object.entries(meta.loadout)) {
    loadout[crew] = slots.map((id) => (weaponId !== null && id === weaponId ? null : id)) as [number | null, number | null];
  }
  const mine = loadout[crewId] ?? [null, null];
  mine[slot] = weaponId;
  loadout[crewId] = mine;
  set({ ...meta, loadout, active: { ...meta.active, [crewId]: 0 } });
}

// (testing) everything back to how a new game starts
export function resetMeta() {
  set(fresh());
}
