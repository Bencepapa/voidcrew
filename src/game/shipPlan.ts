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
  const holders: { deck: GameMap; terminal: string }[] = [];
  const codeLocks: { deck: GameMap; key: string; label: string; planned: PlannedLock; hackable: boolean }[] = [];

  for (const full of shipDecks(entry)) {
    // (as it is in this variation: a door or a terminal's screen left out
    // takes no part)
    const deck = variantOf(full, seed, mood);
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
      const shown = (deck.decals ?? []).some((d) => d.action === `terminal:${id}`);
      if (terminal.codes && shown) holders.push({ deck, terminal: id });
    }
  }

  // each code lock: a code, read on one of the code-holding terminals
  // (none on the ship: it can only be hacked - or, if it can't, it's off)
  for (const lock of codeLocks) {
    const tag = `${seed}|${lock.deck.id}|code|${lock.key}`;
    if (!holders.length) {
      if (!lock.hackable) locks.get(lock.deck.id)!.delete(lock.key);
      continue;
    }
    lock.planned.code = String(Math.floor(roll(tag) * 10000)).padStart(4, "0");
    const holder = holders[Math.floor(roll(`${tag}|where`) * holders.length)];
    lock.planned.readAt = { deck: holder.deck.id, terminal: holder.terminal };
    const lines = codes.get(`${holder.deck.id}|${holder.terminal}`) ?? [];
    const where = holder.deck.id === lock.deck.id ? "" : ` (${lock.deck.name})`;
    lines.push(`${lock.label.toUpperCase()}${where}: ${lock.planned.code}`);
    codes.set(`${holder.deck.id}|${holder.terminal}`, lines);
  }
  return { locks, codes };
}
