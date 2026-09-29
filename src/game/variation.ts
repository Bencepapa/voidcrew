import type { GameMap } from "./types";

// Variations of a deck: every prop, decal, light and actor with a `chance`
// below 1 is there or not, rolled from a seed - the same seed gives the same
// deck (a derelict ship looks the same each time it's visited), another seed
// another one. Each item's roll depends on the seed, the deck and the item
// (its kind and place in the map's list), not on the other items.

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

const kept = (seed: number, map: GameMap, kind: string, index: number, chance: number | undefined) =>
  chance === undefined || chance >= 1 || roll(`${seed}|${map.id}|${kind}|${index}`) < chance;

// The deck as it is in the variation `seed` (the same map if nothing in it
// is left to chance).
export function variantOf(map: GameMap, seed: number): GameMap {
  const props = map.props?.filter((p, i) => kept(seed, map, "prop", i, p.chance));
  const decals = map.decals?.filter((d, i) => kept(seed, map, "decal", i, d.chance));
  const actors = map.actors?.filter((a, i) => kept(seed, map, "actor", i, a.chance));
  const lights = map.lights?.filter((l, i) => kept(seed, map, "light", i, l.chance));
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
    structureKey: structural ? `${map.structureKey}|variation ${seed}` : map.structureKey,
  };
}

// a seed for a new variation
export function newSeed(): number {
  return Math.floor(Math.random() * 1e6);
}
