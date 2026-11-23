// A size factor per built-in actor type (robots, goblins, ...), set with the
// slider in the Asset Manager (NPCs) and saved to actorSizes.json, so a type
// that's too big (or small) can be tuned without editing actors.ts. Unset = 1 =
// the size actors.ts gives it. The factor scales the type's `height` (what the
// sprite is drawn at - and so what a shot hits), its `eyeHeight` and its body's
// headroom (the lowest opening it fits through); read it only through the
// helpers in actors.ts (actorHeight, actorEyeHeight, actorBody).
// A shared (published) NPC has its own size, its sheet's world height: no factor.

import saved from "./actorSizes.json";
import { isSharedActorId } from "./actorSheets";
import type { Body } from "./heights";

export const ACTOR_SIZE_MIN = 0.5;
export const ACTOR_SIZE_MAX = 1.5;
export const ACTOR_SIZE_STEP = 0.05;

export type ActorSizeTable = Record<string, number>;

// a size factor within the range, to hundredths (anything that isn't a number: 1)
export function clampActorSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.round(Math.min(ACTOR_SIZE_MAX, Math.max(ACTOR_SIZE_MIN, value)) * 100) / 100;
}

// the table as the file (or anything else) has it: only built-in type names
// with a factor other than 1, each clamped
export function readActorSizes(raw: unknown): ActorSizeTable {
  const table: ActorSizeTable = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return table;
  for (const [name, value] of Object.entries(raw)) {
    if (!/^\w+$/.test(name) || isSharedActorId(name) || typeof value !== "number" || !Number.isFinite(value)) continue;
    const factor = clampActorSize(value);
    if (factor !== 1) table[name] = factor;
  }
  return table;
}

// the table as actorSizes.json (also what the dev save writes): names in order
export function actorSizesJson(table: ActorSizeTable): string {
  return JSON.stringify(Object.fromEntries(Object.entries(readActorSizes(table)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 2) + "\n";
}

// what the game uses; the Asset Manager changes it live before it's saved
let table: ActorSizeTable = readActorSizes(saved);
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export const actorSizes = (): ActorSizeTable => table;
export const actorSize = (typeName: string): number => table[typeName] ?? 1;

// (a table replaced on every change: a snapshot for useSyncExternalStore)
export function subscribeActorSizes(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

// a factor equal to 1 (or none) drops the type's entry
export function setActorSize(typeName: string, factor: number | undefined) {
  const next = readActorSizes({ ...table, [typeName]: factor ?? 1 });
  if (JSON.stringify(next) === JSON.stringify(table)) return;
  table = next;
  emit();
}

export function resetActorSizes() {
  if (!Object.keys(table).length) return;
  table = {};
  emit();
}

// a body scaled with the actor: a smaller one fits lower openings, a bigger one
// needs more - but never more than a normal ceiling (one wall height), or a
// bigger goblin would fit nowhere (its step stays what it was)
export const sizedBody = (body: Body, factor: number): Body =>
  factor === 1 ? body : { ...body, headroom: Math.min(body.headroom * factor, Math.max(body.headroom, 1)) };
