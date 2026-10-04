import { MAPS } from "./map";
import { moodOdds, roll, scaleChance, variantOf } from "./variation";
import type { ShipMood } from "./variation";
import type { GameMap } from "./types";

// A ship's plan, worked out once on boarding from its seed and mood, for
// all its decks at once (the decks its lifts reach): which of the locks
// left to chance are on, the code of each code lock, and which terminal -
// on any of its decks - shows that code (see story.ts: Lock, Terminal).
// The same seed gives the same plan.

export interface PlannedLock {
  // the code that opens it (a code lock), and where it can be read
  code?: string;
  readAt?: { deck: string; terminal: string };
}

export interface ShipPlan {
  // the locks that are on, by deck and door cell ("x,y"); a lock not here
  // is off (its door opens as any other)
  locks: Map<string, Map<string, PlannedLock>>;
  // the codes each code-holding terminal shows, by "deck|terminal"
  codes: Map<string, string[]>;
}

// The cells of a deck that are only reached through a door whose lock is
// on in this ship (as "x,y"): walking from where the party can come aboard
// (its start, its lifts, its exits), with and without the locks shut. What
// stands there is worth guarding (see LOOT_TABLES.vault).
export function lockedAway(deck: GameMap, plan: ShipPlan | null): Set<string> {
  const shut = plan?.locks.get(deck.id);
  const away = new Set<string>();
  if (!shut?.size) return away;
  const open = reach(deck, new Set());
  const locked = reach(deck, new Set(shut.keys()));
  for (const key of open) if (!locked.has(key)) away.add(key);
  return away;
}

// the cells ("x,y") of a deck reached from where the party can come aboard
// (its start, its lifts, its exits) without going through the `shut` doors
function reach(deck: GameMap, shut: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>();
  const queue = [deck.start.cell, ...(deck.lifts ?? []).map((l) => l.cell), ...(deck.exits ?? []).map((e) => e.cell)];
  for (const c of queue) seen.add(`${c.x},${c.y}`);
  while (queue.length) {
    const c = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx;
      const y = c.y + dy;
      const key = `${x},${y}`;
      const cell = deck.cells[y]?.[x];
      if (seen.has(key) || cell === undefined || cell === "wall") continue;
      if (cell === "door" && shut.has(key)) continue;
      seen.add(key);
      queue.push({ x, y });
    }
  }
  return seen;
}

// the decks of the ship `entry` belongs to: all its lifts reach
export function shipDecks(entry: GameMap): GameMap[] {
  const decks: GameMap[] = [];
  const queue = [entry.id];
  const seen = new Set(queue);
  while (queue.length) {
    const deck = MAPS[queue.shift()!];
    if (!deck) continue;
    decks.push(deck);
    for (const lift of deck.lifts ?? []) {
      if (!seen.has(lift.to)) {
        seen.add(lift.to);
        queue.push(lift.to);
      }
    }
  }
  return decks;
}

export function planShip(entry: GameMap, seed: number, mood: ShipMood): ShipPlan {
  const locks = new Map<string, Map<string, PlannedLock>>();
  const codes = new Map<string, string[]>();
  // the code-holding terminals, with the cell their screen is seen from
  const holders: { deck: GameMap; terminal: string; cell: string }[] = [];
  const decks: GameMap[] = [];
  const codeLocks: { deck: GameMap; key: string; label: string; planned: PlannedLock; hackable: boolean }[] = [];

  for (const full of shipDecks(entry)) {
    // (as it is in this variation: a door or a terminal's screen left out
    // takes no part)
    const deck = variantOf(full, seed, mood);
    decks.push(deck);
    const deckLocks = new Map<string, PlannedLock>();
    locks.set(deck.id, deckLocks);
    for (const door of deck.doors ?? []) {
      const lock = door.lock;
      if (!lock) continue;
      const key = `${door.cell.x},${door.cell.y}`;
      const chance = lock.chance;
      const on =
        chance === undefined ||
        chance >= 1 ||
        roll(`${seed}|${deck.id}|lock|${key}`) < scaleChance(chance, moodOdds(mood, "locks"));
      if (!on) continue;
      const planned: PlannedLock = {};
      deckLocks.set(key, planned);
      if (lock.code) {
        codeLocks.push({ deck, key, label: door.label?.replace(/\n/g, "") || `door ${key}`, planned, hackable: !!lock.hack });
      }
    }
    for (const [id, terminal] of Object.entries(deck.terminals ?? {})) {
      const screen = (deck.decals ?? []).find((d) => d.action === `terminal:${id}`);
      if (terminal.codes && screen) holders.push({ deck, terminal: id, cell: `${screen.cell.x},${screen.cell.y}` });
    }
  }

  // Each code lock: a code, read on one of the code-holding terminals the
  // party can get to - never behind the lock itself. Working outward: first
  // the terminals reached with every lock shut; each lock whose code is
  // placed then counts as open, which may bring more terminals in reach
  // (another lock's code behind it). A lock whose code can't be placed can
  // only be hacked - or, if it can't, it's off.
  const reachable = (deck: GameMap) => {
    const shut = new Set([...(locks.get(deck.id) ?? new Map<string, PlannedLock>()).entries()].filter(([, p]) => !p.code).map(([k]) => k));
    for (const lock of codeLocks) if (lock.deck === deck && lock.planned.code === undefined) shut.add(lock.key);
    return reach(deck, shut);
  };
  const waiting = [...codeLocks];
  for (let placed = true; placed && waiting.length; ) {
    placed = false;
    const inReach = new Map(decks.map((d) => [d.id, reachable(d)]));
    for (const lock of [...waiting]) {
      const tag = `${seed}|${lock.deck.id}|code|${lock.key}`;
      const open = holders.filter((h) => inReach.get(h.deck.id)?.has(h.cell));
      if (!open.length) continue;
      lock.planned.code = String(Math.floor(roll(tag) * 10000)).padStart(4, "0");
      const holder = open[Math.floor(roll(`${tag}|where`) * open.length)];
      lock.planned.readAt = { deck: holder.deck.id, terminal: holder.terminal };
      const lines = codes.get(`${holder.deck.id}|${holder.terminal}`) ?? [];
      const where = holder.deck.id === lock.deck.id ? "" : ` (${lock.deck.name})`;
      lines.push(`${lock.label.toUpperCase()}${where}: ${lock.planned.code}`);
      codes.set(`${holder.deck.id}|${holder.terminal}`, lines);
      waiting.splice(waiting.indexOf(lock), 1);
      placed = true;
    }
  }
  for (const lock of waiting) if (!lock.hackable) locks.get(lock.deck.id)!.delete(lock.key);
  return { locks, codes };
}
