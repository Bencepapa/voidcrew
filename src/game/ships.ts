import { MOOD_LEVELS } from "./variation";
import type { ShipMood } from "./variation";
import type { ItemCategory } from "./items";

// The derelicts to board. A ship's class says what kind of ship it is -
// which decks it has, how its mood (light, threat, clutter) tends to turn
// out and what its crates tend to hold; the ship itself is one seed of that
// class: its decks' variation and its actual mood. The crew picks one from a
// few offers, seeing some of what awaits there and not the rest; the deeper
// into space, the more dangerous and the richer.

export interface ShipClass {
  name: string;
  blurb: string;
  // the deck (map id) it's boarded on; its other decks are reached by lift
  entry: string;
  // how likely each level of a mood is (low, middle, high - see
  // MOOD_LEVELS), before depth
  mood: { [K in keyof ShipMood]: [number, number, number] };
  // what its containers tend to hold: weights on the loot tables' entries
  // by item category (unset: 1)
  loot: Partial<Record<ItemCategory, number>>;
}

export const SHIP_CLASSES: Record<string, ShipClass> = {
  freighter: {
    name: "Bulk freighter",
    blurb: "Holds full of cargo, a skeleton crew's worth of security.",
    entry: "deck0-crew",
    mood: { light: [3, 4, 3], threat: [5, 4, 1], clutter: [1, 3, 6] },
    loot: { salvage: 1.6, supplies: 1.2, tech: 0.8 },
  },
  hospital: {
    name: "Hospital ship",
    blurb: "Wards and labs. Medical stores, and not much to guard them.",
    entry: "deck0-crew",
    mood: { light: [1, 3, 6], threat: [6, 3, 1], clutter: [3, 4, 3] },
    loot: { supplies: 2.5, data: 1.5, salvage: 0.6 },
  },
  corvette: {
    name: "Patrol corvette",
    blurb: "A warship: drones on every deck, and the gear they guarded.",
    entry: "deck0-crew",
    mood: { light: [4, 4, 2], threat: [1, 3, 6], clutter: [4, 4, 2] },
    loot: { tech: 2, valuables: 1.6, supplies: 1.3, salvage: 0.6 },
  },
  survey: {
    name: "Survey vessel",
    blurb: "Instruments and archives, running on emergency power.",
    entry: "deck0-crew",
    mood: { light: [6, 3, 1], threat: [3, 5, 2], clutter: [3, 4, 3] },
    loot: { data: 4, tech: 1.5, valuables: 1.3, salvage: 0.7 },
  },
};

export interface ShipOffer {
  seed: number;
  classId: string;
  name: string;
  // how deep in space it drifts (0: the near lanes)
  depth: number;
  mood: ShipMood;
  // what the scan made out of its mood (the rest shows as unknown)
  known: { [K in keyof ShipMood]: boolean };
  // how much more its containers hold (deeper: more)
  lootScale: number;
}

// a number 0..1 from a text, the same each time (FNV-1a, then scrambled)
function roll(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

const NAMES_A = ["Calder", "Meridian", "Vesper", "Halcyon", "Ostrava", "Tamsin", "Kestrel", "Ardent", "Solace", "Brannoch", "Io Maru", "Wren"];
const NAMES_B = ["USV", "MSV", "ISV", "RSV"];

function pick<T>(weights: number[], items: readonly T[], r: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let at = r * total;
  const i = weights.findIndex((w) => (at -= w) < 0);
  return items[i < 0 ? items.length - 1 : i];
}

// A ship of a class, from a seed: deeper, the threat leans higher.
export function makeShip(seed: number, classId: string, depth: number): ShipOffer {
  const type = SHIP_CLASSES[classId];
  const deeper = (w: [number, number, number]): number[] => [w[0] / (1 + depth * 0.5), w[1], w[2] * (1 + depth * 0.5)];
  const mood: ShipMood = {
    light: pick(type.mood.light, MOOD_LEVELS.light, roll(`${seed}|light`)),
    threat: pick(deeper(type.mood.threat), MOOD_LEVELS.threat, roll(`${seed}|threat`)),
    clutter: pick(type.mood.clutter, MOOD_LEVELS.clutter, roll(`${seed}|clutter`)),
  };
  return {
    seed,
    classId,
    name: `${NAMES_B[Math.floor(roll(`${seed}|b`) * NAMES_B.length)]} ${NAMES_A[Math.floor(roll(`${seed}|a`) * NAMES_A.length)]}`,
    depth,
    mood,
    // the scan makes out each part of the mood about two times in three
    known: {
      light: roll(`${seed}|known light`) < 0.65,
      threat: roll(`${seed}|known threat`) < 0.65,
      clutter: roll(`${seed}|known clutter`) < 0.65,
    },
    lootScale: 1 + depth * 0.25,
  };
}

// The ships within reach: two at the depth the crew has been to, one
// deeper. `round` tells one set of offers from the next.
export function shipOffers(depth: number, round: number): ShipOffer[] {
  // (of three different classes: in an order of the round's own)
  const classes = Object.keys(SHIP_CLASSES).sort((a, b) => roll(`class ${round} ${a}`) - roll(`class ${round} ${b}`));
  return [depth, depth, depth + 1].map((d, i) => {
    const seed = 1 + Math.floor(roll(`offer ${round} ${i}`) * 999998);
    return makeShip(seed, classes[i % classes.length], d);
  });
}

// what a class's containers hold most of, for the offer's card
export function lootHint(classId: string): ItemCategory[] {
  return (Object.entries(SHIP_CLASSES[classId].loot) as [ItemCategory, number][])
    .filter(([, w]) => w > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
}
