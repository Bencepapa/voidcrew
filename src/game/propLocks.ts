import { keyFlagFor, keyFlags } from "./keys";
import { OPERABLE_PROPS, isClickable } from "./operables";
import { PROP_TYPES } from "./props";
import type { Vec2 } from "./types";

// Locks on placed props: a chest or crate (any prop with `contents`) that won't open, a lever or button that won't move,
// until the party has the key. The pure model - the map block, the decision, the editor's key list and the problem checks;
// the runtime (useLocks.ts) applies it to the game, the Inspector (LockFields.tsx) edits it.
//
//   "props": [{ "prop": "crate1", "x": 3, "y": 4, "lock": { "key": "key.vault", "message": "A heavy padlock.", "consumeKey": true } }]
//
// KEYS are story flags, as a door's (see keys.ts): a lock's `key` names the flag, a key ITEM lying on the map raises it when
// picked up (`MapItem.sets`, the item panel's "Make it a key"), a terminal or trigger may "set:" it. One lock needs exactly
// one key; several locks (a door's too) may share it. On top of the flag, a prop's lock also takes a key that is carried:
// a lock keyed `key.<item>` opens for anybody who holds that item (found in a chest, bought) even if nothing raised the flag.
//
// An open lock is remembered for the run, like a door's (`unlocked:<map>:<x,y>`): `unlocked:<map>:prop <index>` is up.
// `consumeKey`: the key is used up by opening - one of its item taken from the party and its flag lowered (if none is left),
// so a second lock of the same key shuts the party out again.

export interface PropLock {
  // the story flag that opens it (none: it never opens - the editor warns)
  key?: string;
  // what the party is told while it is shut (default: "It's locked.")
  message?: string;
  // the key is used up when it opens the lock
  consumeKey?: boolean;
}

// the lock block of a map file (junk dropped; a block of its own - even an empty one - is a lock)
export function readPropLock(raw: unknown): PropLock | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: PropLock = {};
  if (typeof r.key === "string" && r.key.trim()) out.key = r.key.trim();
  if (typeof r.message === "string" && r.message.trim()) out.message = r.message.trim().slice(0, 300);
  if (r.consumeKey === true) out.consumeKey = true;
  return out;
}

// a lock with a change (a setting set to undefined, "" or false is dropped; the block stays)
export function patchPropLock(lock: PropLock | undefined, patch: Partial<PropLock>): PropLock {
  const next = { ...lock, ...patch } as Record<string, unknown>;
  for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === "" || next[k] === false) delete next[k];
  return next as PropLock;
}

// what can be locked: a container, a lever or a button (the props the party opens or pulls)
export function lockableProp(prop: string): boolean {
  if (Object.hasOwn(PROP_TYPES, prop) && PROP_TYPES[prop].container) return true;
  return Object.hasOwn(OPERABLE_PROPS, prop) && isClickable(OPERABLE_PROPS[prop].kind);
}

// the run flag that is up once the lock of the prop at `index` (in the deck's full map) has been opened
export const propUnlockedFlag = (mapId: string, index: number) => `unlocked:${mapId}:prop ${index}`;

export const DEFAULT_LOCKED = "It's locked.";
export function propLockMessage(lock: Pick<PropLock, "message">, fallback = DEFAULT_LOCKED): string {
  return lock.message?.trim() ? lock.message : fallback;
}

// ---- the decision

interface KeyItems {
  items?: { item: string; sets?: string }[];
}

// the item a key flag stands for: the one lying on the map that raises it, else the `key.<item>` convention
export function keyItemOf(key: string, map: KeyItems): string | undefined {
  const lying = (map.items ?? []).find((i) => i.sets === key);
  if (lying) return lying.item;
  return key.startsWith("key.") && key.length > 4 ? key.slice(4) : undefined;
}

export interface LockState {
  // whether this lock was opened earlier (its propUnlockedFlag is up)
  unlocked: boolean;
  hasFlag: (flag: string) => boolean;
  // how many of an item the party carries
  countItem: (item: string) => number;
  // the map's loose items (to tell which item a key flag is)
  map: KeyItems;
  // what a shut lock says without a message of its own
  fallback?: string;
}

export type LockStep =
  // nothing in the way
  | { kind: "open" }
  // the key is there: unlock it now (and use the key up: `consume`, the flag and the item it stands for, if any)
  | { kind: "unlock"; consume?: { flag: string; item?: string } }
  // it stays shut, and the party is told why
  | { kind: "locked"; message: string };

// whether the party holds a key: its flag is up, or - `key.<item>` - the item is carried
export function keyHeld(key: string | undefined, state: Pick<LockState, "hasFlag" | "countItem">): boolean {
  if (!key) return false;
  if (state.hasFlag(key)) return true;
  return key.startsWith("key.") && key.length > 4 && state.countItem(key.slice(4)) > 0;
}

export function lockStep(lock: PropLock | undefined, state: LockState): LockStep {
  if (!lock || state.unlocked) return { kind: "open" };
  if (keyHeld(lock.key, state)) {
    return { kind: "unlock", ...(lock.consumeKey ? { consume: { flag: lock.key!, item: keyItemOf(lock.key!, state.map) } } : {}) };
  }
  return { kind: "locked", message: propLockMessage(lock, state.fallback) };
}

// ---- the editor's key list

export interface KeyChoice {
  flag: string;
  // what raises it: a marked item lying on the map, a story action, an item in a container's contents (the convention),
  // a lock of a door, a lock of another prop
  from: "item" | "action" | "contents" | "door" | "lock";
  name?: string;
}

interface LockMap extends KeyItems {
  items?: { item: string; name?: string; sets?: string }[];
  triggers?: { do: string[] }[];
  terminals?: Record<string, { do?: string[] }>;
  doors?: { lock?: { key?: string } }[];
  props?: { prop: string; cell: Vec2; lock?: PropLock; loot?: { item: string }[] }[];
}

// the items lying in containers' contents (a key found in a chest)
const lootItems = (map: LockMap): string[] => [...new Set((map.props ?? []).flatMap((p) => (p.loot ?? []).map((l) => l.item)))];

// every flag a lock could be keyed to: what raises one on the map, the keys the map's other locks already use
export function keyChoices(map: LockMap): KeyChoice[] {
  const out = new Map<string, KeyChoice>();
  const add = (c: KeyChoice) => {
    if (c.flag && !out.has(c.flag)) out.set(c.flag, c);
  };
  for (const k of keyFlags(map)) add({ flag: k.flag, from: k.from, name: k.name });
  for (const item of lootItems(map)) add({ flag: keyFlagFor(item), from: "contents", name: item });
  for (const d of map.doors ?? []) if (d.lock?.key) add({ flag: d.lock.key, from: "door" });
  for (const p of map.props ?? []) if (p.lock?.key) add({ flag: p.lock.key, from: "lock" });
  return [...out.values()];
}

// the flags something on the map gives the party: what keyFlags lists, and the `key.<item>` of every item that can be found
// (loose or in a container's contents)
export function keySources(map: LockMap): Set<string> {
  const out = new Set(keyFlags(map).map((k) => k.flag));
  for (const it of map.items ?? []) out.add(keyFlagFor(it.item));
  for (const item of lootItems(map)) out.add(keyFlagFor(item));
  return out;
}

// a new key flag for the lock of a prop: "key.<prop>_<x>_<y>", one nobody uses yet
export function suggestKeyFlag(prop: string, cell: Vec2, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = `key.${prop.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "lock"}_${cell.x}_${cell.y}`;
  let flag = base;
  for (let n = 2; used.has(flag); n++) flag = `${base}_${n}`;
  return flag;
}

// ---- checks for the editor's problem list

export interface PropLockProblem {
  code: "lockNoKey" | "lockKeyNobody" | "lockNotLockable";
  cell: Vec2;
  params?: Record<string, string | number>;
}

export function propLockProblems(map: LockMap): PropLockProblem[] {
  const out: PropLockProblem[] = [];
  const sources = keySources(map);
  for (const p of map.props ?? []) {
    if (!p.lock) continue;
    if (!lockableProp(p.prop)) out.push({ code: "lockNotLockable", cell: p.cell, params: { prop: p.prop } });
    else if (!p.lock.key) out.push({ code: "lockNoKey", cell: p.cell });
    else if (!sources.has(p.lock.key)) out.push({ code: "lockKeyNobody", cell: p.cell, params: { id: p.lock.key } });
  }
  return out;
}
