import type { GameMap } from "./types";

// Variations of a deck: every prop, decal, light and actor with a `chance`
// below 1 is there or not, rolled from a seed - the same seed gives the same
// deck (a derelict ship looks the same each time it's visited), another seed
// another one. Each item's roll depends on the seed, the deck and the item
// (its kind and place in the map's list), not on the other items.
//
// The seed also sets the ship's mood (the same for all its decks): how lit,
// how dangerous and how cluttered it is. Each shifts its items' chances -
// lights, actors, props and decals - up or down (see scaleChance). Items
// with no chance (always there) stay whatever the mood.

export interface ShipMood {
  light: "bright" | "dim" | "dark";
  threat: "low" | "medium" | "high";
  clutter: "sparse" | "normal" | "cluttered";
}
export const MOOD_LEVELS: { [K in keyof ShipMood]: ShipMood[K][] } = {
  light: ["dark", "dim", "bright"],
  threat: ["low", "medium", "high"],
  clutter: ["sparse", "normal", "cluttered"],
};
// what each level does to an item's odds (the low, middle and high level):
// a 50% item gets 14%, 50% or 86%; a 20% one 4%, 20% or 60%; an 80% one
// 40%, 80% or 96% - never quite 0 or 1, and the rarer and the commoner
// items keep their order
const MOOD_ODDS = [1 / 6, 1, 6];

// a chance with its odds (p to 1 - p) times `odds`
export function scaleChance(chance: number, odds: number): number {
  return (chance * odds) / (1 - chance + chance * odds);
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

// the ship's mood in the variation `seed` (each part rolled on its own, the
// three levels alike)
export function moodOf(seed: number): ShipMood {
  const pick = <K extends keyof ShipMood>(key: K): ShipMood[K] =>
    MOOD_LEVELS[key][Math.floor(roll(`${seed}|mood|${key}`) * 3)];
  return { light: pick("light"), threat: pick("threat"), clutter: pick("clutter") };
}

export const moodText = (mood: ShipMood) => `${mood.light}, ${mood.threat} threat, ${mood.clutter}`;

const kept = (seed: number, map: GameMap, kind: string, index: number, chance: number | undefined, odds: number) =>
  chance === undefined || chance >= 1 || roll(`${seed}|${map.id}|${kind}|${index}`) < scaleChance(chance, odds);

// The deck as it is in the variation `seed` (the same map if nothing in it
// is left to chance), in the ship's mood (default: the seed's).
export function variantOf(map: GameMap, seed: number, mood: ShipMood = moodOf(seed)): GameMap {
  const odds = <K extends keyof ShipMood>(key: K) => MOOD_ODDS[MOOD_LEVELS[key].indexOf(mood[key])] ?? 1;
  const props = map.props?.filter((p, i) => kept(seed, map, "prop", i, p.chance, odds("clutter")));
  const decals = map.decals?.filter((d, i) => kept(seed, map, "decal", i, d.chance, odds("clutter")));
  const actors = map.actors?.filter((a, i) => kept(seed, map, "actor", i, a.chance, odds("threat")));
  const lights = map.lights?.filter((l, i) => kept(seed, map, "light", i, l.chance, odds("light")));
  const same = (a?: unknown[], b?: unknown[]) => (a?.length ?? 0) === (b?.length ?? 0);
  if (same(props, map.props) && same(decals, map.decals) && same(actors, map.actors) && same(lights, map.lights)) return map;
  // (what's left out is structure - but lights alone can change in place)
  const structural = !same(props, map.props) || !same(decals, map.decals) || !same(actors, map.actors);
  return {
    ...map,
    props,
    decals,
    actors,
    lights,
    structureKey: structural ? `${map.structureKey}|variation ${seed} ${mood.threat} ${mood.clutter}` : map.structureKey,
  };
}

// a seed for a new variation
export function newSeed(): number {
  return Math.floor(Math.random() * 1e6);
}
