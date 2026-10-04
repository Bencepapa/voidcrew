import { PROP_TYPES, propHeight, propPlacement } from "./props";
import { itemSpot } from "./items";
import type { CellType, GameMap, Linked } from "./types";

// Variations of a deck: every prop, decal, light and actor with a `chance`
// below 1 is there or not, rolled from a seed - the same seed gives the same
// deck (a derelict ship looks the same each time it's visited), another seed
// another one. Each item's roll depends on the seed, the deck and the item
// (its kind and place in the map's list), not on the other items.
//
// The seed also sets the ship's mood (the same for all its decks), a few
// secret rolls: how lit, how dangerous, how cluttered, how smoky it is, how
// many of its doors are there and how many of its locks are on. Each shifts
// its items' chances - lights; actors; props, decals and items; smoke;
// doors; locks (see shipPlan.ts) - up or down (see scaleChance). Items with
// no chance (always there) stay whatever the mood.

export interface ShipMood {
  light: "bright" | "dim" | "dark";
  threat: "low" | "medium" | "high";
  clutter: "sparse" | "normal" | "cluttered";
  smoke: "clear" | "hazy" | "smoky";
  doors: "few" | "some" | "many";
  locks: "few" | "some" | "many";
  // how the ship's robots take the crew until its alert is up (see
  // ActorWake): powered down, fooled by their IDs, or on guard - the same
  // for all of them (one set by hand keeps its own); never shown on the scan
  robots: "dormant" | "fooled" | "hostile";
}
export const MOOD_LEVELS: { [K in keyof ShipMood]: ShipMood[K][] } = {
  light: ["dark", "dim", "bright"],
  threat: ["low", "medium", "high"],
  clutter: ["sparse", "normal", "cluttered"],
  smoke: ["clear", "hazy", "smoky"],
  doors: ["few", "some", "many"],
  locks: ["few", "some", "many"],
  robots: ["dormant", "fooled", "hostile"],
};
export const MOOD_KEYS = Object.keys(MOOD_LEVELS) as (keyof ShipMood)[];
// what each level does to an item's odds (the low, middle and high level):
// a 50% item gets 14%, 50% or 86%; a 20% one 4%, 20% or 60%; an 80% one
// 40%, 80% or 96% - never quite 0 or 1, and the rarer and the commoner
// items keep their order
const MOOD_ODDS = [1 / 6, 1, 6];

// a chance with its odds (p to 1 - p) times `odds`
export function scaleChance(chance: number, odds: number): number {
  return (chance * odds) / (1 - chance + chance * odds);
}

// what a mood's level does to the odds of its items
export function moodOdds(mood: ShipMood, key: keyof ShipMood): number {
  return MOOD_ODDS[(MOOD_LEVELS[key] as string[]).indexOf(mood[key])] ?? 1;
}

// a number 0..1 from a text, the same each time (FNV-1a, then scrambled)
export function roll(text: string): number {
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
  return Object.fromEntries(
    MOOD_KEYS.map((key) => [key, MOOD_LEVELS[key][Math.floor(roll(`${seed}|mood|${key}`) * 3)]]),
  ) as unknown as ShipMood;
}

// A ship's livery: the hue its decks' accents are turned to (each deck
// names its own - see GameMap.accent), or none (null: as painted). Rolled
// from the seed like its mood, and never shown on the scan.
export const LIVERY_HUES = [0, 30, 55, 120, 185, 215, 280];
const LIVERY_KEPT = 0.35;
export function accentOf(seed: number): number | null {
  if (roll(`${seed}|livery`) < LIVERY_KEPT) return null;
  return LIVERY_HUES[Math.floor(roll(`${seed}|livery hue`) * LIVERY_HUES.length)];
}

export const moodText = (mood: ShipMood) =>
  `${mood.light}, ${mood.threat} threat, ${mood.clutter}, ${mood.smoke}, ${mood.doors} doors, ${mood.locks} locks, ${mood.robots} robots`;

// One item's roll: kept if its chance (its odds shifted by the mood) comes
// up - and the items it's linked to agree (see Linked): the one it's only
// there with is there, the one it's only there without isn't. For a chance
// wall, "there" is its opening: it opens only with / without the other (a
// wide breach that opens only where the narrow one did; loot only behind
// an opened wall). A prop
// stacked on another is only there with it. Links round in a circle, or to
// a name no item has, don't count.
interface Entry extends Linked {
  kind: string;
  index: number;
  chance?: number;
  odds: number;
  // a stacked prop: the one under it
  on?: Entry;
  // a chance wall: what's "there" - what its links speak of, and what
  // others' links to it mean - is its opening, the wall gone (its chance is
  // still the wall's)
  opening?: boolean;
}

function resolve(seed: number, map: GameMap, entries: Entry[]): Set<Entry> {
  const byId = new Map<string, Entry>();
  for (const e of entries) if (e.id && !byId.has(e.id)) byId.set(e.id, e);
  const done = new Map<Entry, boolean>();
  const busy = new Set<Entry>();
  const there = (e: Entry): boolean => {
    const known = done.get(e);
    if (known !== undefined) return known;
    if (busy.has(e)) return true;
    busy.add(e);
    const rolled = e.chance === undefined || e.chance >= 1 || roll(`${seed}|${map.id}|${e.kind}|${e.index}`) < scaleChance(e.chance, e.odds);
    const own = e.opening ? !rolled : rolled;
    const withOk = !e.with || !byId.has(e.with) || byId.get(e.with) === e || there(byId.get(e.with)!);
    const withoutOk = !e.without || !byId.has(e.without) || byId.get(e.without) === e || !there(byId.get(e.without)!);
    const onOk = !e.on || there(e.on);
    busy.delete(e);
    const result = own && withOk && withoutOk && onOk;
    done.set(e, result);
    return result;
  };
  return new Set(entries.filter(there));
}

// The deck as it is in the variation `seed` (the same map if nothing in it
// is left to chance), in the ship's mood (default: the seed's). A door left
// out leaves an open doorway, a chance wall left out an open floor.
export function variantOf(map: GameMap, seed: number, mood: ShipMood = moodOf(seed)): GameMap {
  const odds = (key: keyof ShipMood) => moodOdds(mood, key);
  const entry = (kind: string, index: number, item: Linked & { chance?: number }, o: number): Entry => ({
    kind,
    index,
    chance: item.chance,
    odds: o,
    id: item.id,
    with: item.with,
    without: item.without,
  });
  const props = (map.props ?? []).map((p, i) => entry("prop", i, p, odds("clutter")));
  // stacked props: on the one whose top they stand on
  (map.props ?? []).forEach((p, i) => {
    if (!p.elevation) return;
    const under = (map.props ?? []).findIndex(
      (q, j) =>
        j !== i &&
        q.cell.x === p.cell.x &&
        q.cell.y === p.cell.y &&
        PROP_TYPES[q.prop] &&
        Math.abs((q.elevation ?? 0) + propHeight(map, q) - p.elevation!) < 0.03,
    );
    if (under >= 0) props[i].on = props[under];
  });
  const decals = (map.decals ?? []).map((d, i) => entry("decal", i, d, odds("clutter")));
  const items = (map.items ?? []).map((it, i) => entry("item", i, it, odds("clutter")));
  // items lying on a prop: on the one under them
  (map.items ?? []).forEach((it, i) => {
    if (!it.elevation) return;
    const [dx, dz] = itemSpot(it.offset, i);
    const x = it.cell.x + dx;
    const z = it.cell.y + dz;
    const under = (map.props ?? []).findIndex((p) => {
      if (p.cell.x !== it.cell.x || p.cell.y !== it.cell.y || !PROP_TYPES[p.prop]) return false;
      const at = propPlacement(p);
      const top = (p.elevation ?? 0) + propHeight(map, p);
      return Math.abs(x - at.x) <= at.reachX + 0.02 && Math.abs(z - at.z) <= at.reachZ + 0.02 && it.elevation! <= top + 0.05;
    });
    if (under >= 0) items[i].on = props[under];
  });
  const actors = (map.actors ?? []).map((a, i) => entry("actor", i, a, odds("threat")));
  const smokes = (map.smokes ?? []).map((s, i) => entry("smoke", i, s, odds("smoke")));
  const lights = (map.lights ?? []).map((l, i) => entry("light", i, l, odds("light")));
  const doors = (map.doors ?? []).map((d, i) => entry("door", i, d, odds("doors")));
  const walls = (map.chanceWalls ?? []).map((w, i) => ({ ...entry("wall", i, w, 1), opening: true }));
  const kept = resolve(seed, map, [...props, ...decals, ...items, ...actors, ...smokes, ...lights, ...doors, ...walls]);
  const keep = <T>(items: T[] | undefined, entries: Entry[]) => items?.filter((_, i) => kept.has(entries[i]));

  const out = {
    props: keep(map.props, props),
    decals: keep(map.decals, decals),
    items: keep(map.items, items),
    smokes: keep(map.smokes, smokes),
    actors: keep(map.actors, actors),
    lights: keep(map.lights, lights),
    doors: keep(map.doors, doors),
    // (a wall stays unless its opening is there)
    chanceWalls: map.chanceWalls?.filter((_, i) => !kept.has(walls[i])),
  };
  const same = (a?: unknown[], b?: unknown[]) => (a?.length ?? 0) === (b?.length ?? 0);
  if (
    same(out.props, map.props) &&
    same(out.decals, map.decals) &&
    same(out.items, map.items) &&
    same(out.smokes, map.smokes) &&
    same(out.actors, map.actors) &&
    same(out.lights, map.lights) &&
    same(out.doors, map.doors) &&
    same(out.chanceWalls, map.chanceWalls)
  ) {
    return map;
  }
  // the doors and walls left out open up their cells
  let cells = map.cells;
  const open = (x: number, y: number) => {
    if (cells === map.cells) cells = map.cells.map((row) => [...row]);
    cells[y][x] = "floor" as CellType;
  };
  (map.doors ?? []).forEach((d, i) => !kept.has(doors[i]) && open(d.cell.x, d.cell.y));
  (map.chanceWalls ?? []).forEach((w, i) => kept.has(walls[i]) && open(w.cell.x, w.cell.y));
  // (what's left out is structure - but lights, smoke and robots can change
  // in place)
  const structural = ["props", "decals", "items", "doors", "chanceWalls"].some(
    (k) => !same(out[k as keyof typeof out], map[k as keyof typeof out]),
  );
  return {
    ...map,
    ...out,
    cells,
    structureKey: structural ? `${map.structureKey}|variation ${seed} ${mood.threat} ${mood.clutter}` : map.structureKey,
  };
}

// a seed for a new variation
export function newSeed(): number {
  return Math.floor(Math.random() * 1e6);
}
