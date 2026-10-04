import type { Vec2 } from "./types";

// Story: what the crew has found out on a ship (its flags), the terminals
// to read, the locks on doors and terminals, and the deck's triggers - "when
// this happens (and these flags are up), do that". A deck's map file holds
// its terminals and triggers (see MapFile); the flags last for the run, the
// ones named "story.*" for good (see meta.ts).
//
// Actions are short strings, easy to write by hand in a map file:
//   "set:flag"      the flag up         "clear:flag"   the flag down
//   "log:text"      a line in the log   "show:id"      a terminal opened
//   "unlock:x,y"    the door there unlocked (it stays shut)
//   "open:x,y"      the door there unlocked and opened
// Conditions: a flag that must be up ("flag") or down ("!flag").

// A lock on a door or a terminal: it opens once `key` is up (a code read in
// a log, a keycard picked up) - or the crew's hacker breaks it, if `hack`
// (1..3: how hard; it costs them energy and time).
export interface Lock {
  key?: string;
  hack?: number;
  // what the party is told when it's shut (default: "It's locked.")
  message?: string;
}

// A terminal: a screen of text, opened by touching a decal whose action is
// "terminal:<id>" (or with Use, facing it). Its `do` runs the first time
// it's read.
export interface Terminal {
  title: string;
  text: string;
  lock?: Lock;
  do?: string[];
}

// When a trigger fires: the party steps into a cell ("enter"), reads a
// terminal ("read"), opens a door ("open" - x, y: its cell), picks up an
// item ("pickup"), or arrives on the deck ("start").
export interface Trigger {
  on: "enter" | "read" | "open" | "pickup" | "start";
  x?: number;
  y?: number;
  terminal?: string;
  item?: string;
  if?: string[];
  do: string[];
  // fires each time (default: once a run)
  repeat?: boolean;
}

export type StoryEvent =
  | { on: "enter"; cell: Vec2 }
  | { on: "open"; cell: Vec2 }
  | { on: "read"; terminal: string }
  | { on: "pickup"; item: string }
  | { on: "start" };

export function triggerMatches(trigger: Trigger, event: StoryEvent): boolean {
  if (trigger.on !== event.on) return false;
  switch (event.on) {
    case "enter":
    case "open":
      return trigger.x === event.cell.x && trigger.y === event.cell.y;
    case "read":
      return trigger.terminal === event.terminal;
    case "pickup":
      return trigger.item === undefined || trigger.item === event.item;
    case "start":
      return true;
  }
}

export function conditionsMet(conditions: string[] | undefined, has: (flag: string) => boolean): boolean {
  return (conditions ?? []).every((c) => (c.startsWith("!") ? !has(c.slice(1)) : has(c)));
}

export type StoryStep =
  | { kind: "set" | "clear" | "log" | "show"; value: string }
  | { kind: "unlock" | "open"; cell: Vec2 };

// an action string as a step; null: one that makes no sense
export function parseAction(action: string): StoryStep | null {
  const colon = action.indexOf(":");
  if (colon < 0) return null;
  const kind = action.slice(0, colon).trim();
  const value = action.slice(colon + 1).trim();
  if (kind === "set" || kind === "clear" || kind === "log" || kind === "show") return { kind, value };
  if (kind === "unlock" || kind === "open") {
    const [x, y] = value.split(",").map((v) => Number(v.trim()));
    return Number.isInteger(x) && Number.isInteger(y) ? { kind, cell: { x, y } } : null;
  }
  return null;
}

// a door's lock taken off on a deck, as a run flag
export const unlockedFlag = (mapId: string, cell: Vec2) => `unlocked:${mapId}:${cell.x},${cell.y}`;

// The crew's hacker: who breaks locks, and what a lock of each level costs
// them (energy, and the time it takes).
export const HACKER_ROLE = "ANDROID";
export const HACK_ENERGY = 8;
export const HACK_MS = 1500;
