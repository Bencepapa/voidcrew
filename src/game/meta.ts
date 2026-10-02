import { useSyncExternalStore } from "react";
import { ITEM_TYPES } from "./items";
import type { Weapon } from "./combat";

// What lasts between runs - the base: credits, the stash (how many of each
// item), the weapons owned and who carries which (two slots each), and how
// deep into space the crew has gone. Kept in the browser (localStorage), so
// a reload doesn't lose it.

// the weapons and tools there are: the crew's own, and what the shop sells
export interface WeaponType extends Weapon {
  blurb: string;
  // credits at the shop
  price: number;
}

export const WEAPON_TYPES: Record<string, WeaponType> = {
  pulse_rifle: {
    name: "Pulse rifle",
    blurb: "Three-shot bursts, good at range.",
    price: 220,
    kind: "shot",
    amount: [5, 9],
    cooldownMs: 4000,
    range: 8,
    accuracy: 0.95,
    falloff: 0.05,
    sway: 0.035,
    aimZoom: 1.8,
    burst: 3,
  },
  arc_welder: {
    name: "Arc welder",
    blurb: "Short reach, heavy damage.",
    price: 180,
    kind: "shot",
    amount: [14, 22],
    cooldownMs: 5000,
    range: 3,
    accuracy: 0.9,
    falloff: 0.15,
    sway: 0.05,
    aimZoom: 1,
  },
  shock_emitter: {
    name: "Shock emitter",
    blurb: "Light damage, but every hit stuns.",
    price: 200,
    kind: "shot",
    amount: [4, 8],
    cooldownMs: 6000,
    range: 6,
    accuracy: 0.95,
    falloff: 0.04,
    sway: 0.03,
    aimZoom: 1.3,
    stunMs: 2500,
  },
  stim_injector: { name: "Stim injector", blurb: "Patches the crew up.", price: 160, kind: "heal", amount: [8, 14], cooldownMs: 8000 },
  sidearm: {
    name: "Sidearm",
    blurb: "Quick and steady, modest damage.",
    price: 90,
    kind: "shot",
    amount: [6, 10],
    cooldownMs: 2500,
    range: 5,
    accuracy: 0.92,
    falloff: 0.08,
    sway: 0.04,
    aimZoom: 1.1,
  },
  scatter_gun: {
    name: "Scatter gun",
    blurb: "Devastating up close, useless far.",
    price: 260,
    kind: "shot",
    amount: [18, 30],
    cooldownMs: 6000,
    range: 3,
    accuracy: 0.95,
    falloff: 0.25,
    sway: 0.06,
    aimZoom: 1,
  },
  rail_rifle: {
    name: "Rail rifle",
    blurb: "One scoped, very hard shot. Slow.",
    price: 420,
    kind: "shot",
    amount: [26, 38],
    cooldownMs: 9000,
    range: 10,
    accuracy: 0.98,
    falloff: 0.02,
    sway: 0.025,
    aimZoom: 4,
  },
  trauma_kit: { name: "Trauma kit", blurb: "A bigger heal, slower.", price: 300, kind: "heal", amount: [16, 24], cooldownMs: 12000 },
};

// an owned weapon: its type, and how far it's been upgraded (0..MAX_LEVEL)
export interface OwnedWeapon {
  id: number;
  type: string;
  level: number;
}
export const MAX_LEVEL = 3;

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
}

const STARTING: [string, string][] = [
  ["reese", "pulse_rifle"],
  ["lyn", "arc_welder"],
  ["orion", "shock_emitter"],
  ["kell", "stim_injector"],
];

function fresh(): Meta {
  const weapons = STARTING.map(([, type], id) => ({ id, type, level: 0 }));
  return {
    credits: 0,
    stash: {},
    weapons,
    loadout: Object.fromEntries(STARTING.map(([crew], id) => [crew, [id, null]])),
    active: {},
    depth: 0,
    runs: 0,
    nextId: weapons.length,
  };
}

const KEY = "voidcrew-meta-v1";
function load(): Meta {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Meta | null;
    if (saved && Array.isArray(saved.weapons) && saved.loadout) return { ...fresh(), ...saved };
  } catch {
    // (a broken save: start over)
  }
  return fresh();
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

// an owned weapon as it fires: each level adds 15% to what it deals (or
// heals) and takes 7% off its cooldown
export function weaponStats(owned: OwnedWeapon): Weapon {
  const type = WEAPON_TYPES[owned.type];
  const more = 1 + 0.15 * owned.level;
  return {
    ...type,
    name: owned.level ? `${type.name} +${owned.level}` : type.name,
    amount: [Math.round(type.amount[0] * more), Math.round(type.amount[1] * more)],
    cooldownMs: Math.round(type.cooldownMs * (1 - 0.07 * owned.level)),
  };
}

// the weapon a crewmate has in hand (its other slot if that one's empty)
export function crewWeapon(crewId: string): Weapon | undefined {
  const slots = meta.loadout[crewId];
  if (!slots) return undefined;
  const active = meta.active[crewId] ?? 0;
  const id = slots[active] ?? slots[active ? 0 : 1];
  const owned = meta.weapons.find((w) => w.id === id);
  return owned && WEAPON_TYPES[owned.type] ? weaponStats(owned) : undefined;
}

// whether a crewmate has a second weapon to switch to
export function canSwitch(crewId: string): boolean {
  const slots = meta.loadout[crewId];
  return !!slots && slots[0] !== null && slots[1] !== null;
}

export function switchWeapon(crewId: string) {
  if (!canSwitch(crewId)) return;
  set({ ...meta, active: { ...meta.active, [crewId]: (meta.active[crewId] ?? 0) === 0 ? 1 : 0 } });
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

export function buyWeapon(type: string): boolean {
  const price = WEAPON_TYPES[type]?.price;
  if (price === undefined || meta.credits < price) return false;
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
