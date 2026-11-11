// The game's worlds: each its own maps (src/maps/<world>/), assets and way of
// going round. Void Crew (sci-fi) is the ship loop - base, scan, run aboard
// a derelict, back; Void Fantasy is open: you start in its first map and,
// when the party falls, wake again there. The engine is the same.

export type WorldId = "scifi" | "fantasy";

export interface WorldDef {
  id: WorldId;
  name: string;
  tagline: string;
  // the map the world starts in (and where the party wakes, if it falls)
  startMap: string;
  // "ship": the base / scan / derelict loop; "open": no base, you respawn
  loop: "ship" | "open";
}

export const WORLDS: Record<WorldId, WorldDef> = {
  scifi: {
    id: "scifi",
    name: "Void Crew",
    tagline: "Board derelict ships, strip them, get out.",
    startMap: "deck2-engineering",
    loop: "ship",
  },
  fantasy: {
    id: "fantasy",
    name: "Void Fantasy",
    tagline: "Torchlit dungeons, forests and the things in them.",
    startMap: "fantasy",
    loop: "open",
  },
};

const WORLD_IDS = Object.keys(WORLDS) as WorldId[];
export const isWorldId = (id: string | null | undefined): id is WorldId => !!id && (WORLD_IDS as string[]).includes(id);

// which world each map belongs to (its folder under src/maps/)
const mapWorlds = new Map<string, WorldId>();
export function registerMapWorld(id: string, world: WorldId) {
  mapWorlds.set(id, world);
}
export function worldOfMap(id: string): WorldId {
  return mapWorlds.get(id) ?? "scifi";
}

const STORE_KEY = "voidcrew.world";

// The world the game opens in: ?world= in the URL, else the build's (a
// packaged world: VITE_WORLD), else the one played last, else Void Fantasy.
export function startWorld(): WorldId {
  const fromUrl = typeof location !== "undefined" ? new URLSearchParams(location.search).get("world") : null;
  if (isWorldId(fromUrl)) return fromUrl;
  const built = import.meta.env.VITE_WORLD as string | undefined;
  if (isWorldId(built)) return built;
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (isWorldId(stored)) return stored;
  } catch {
    // (no storage: the default)
  }
  // (nothing asked for: Void Fantasy)
  return "fantasy";
}

// a build made for one world (the world picker is left out)
export const LOCKED_WORLD: WorldId | null = isWorldId(import.meta.env.VITE_WORLD as string | undefined)
  ? (import.meta.env.VITE_WORLD as WorldId)
  : null;

// remembers the world, and reopens the game in it
export function switchWorld(world: WorldId) {
  try {
    localStorage.setItem(STORE_KEY, world);
  } catch {
    // (nothing to remember with)
  }
  const url = new URL(location.href);
  url.searchParams.delete("map");
  url.searchParams.delete("seed");
  url.searchParams.set("world", world);
  location.href = url.toString();
}

// The world the editor and the palettes work in now: set when a map opens.
let current: WorldId = startWorld();
export const activeWorld = (): WorldId => current;
export function setActiveWorld(world: WorldId) {
  current = world;
}

// ---- assets: which world a texture set, prop, actor or decal is for ----

// the fantasy names that don't start with "fantasy"
const FANTASY_ASSETS = new Set([
  "ogre1", "goblin1", "mage1", "thief1", "skeleton1",
  "fantasy_bokor_kerek", "fantasy_bokor_bogyos", "fantasy_bokor_pazsit",
  "grass_small", "grass_medium", "grass_large", "grass_white", "grass_yellow", "grass_blades",
  "fern_big", "bush_leafy", "grass_tall", "leaves_pile", "mushrooms", "wildflowers",
  "puddle_small", "puddle_large", "puddle_long", "cart_ruts", "footpath", "footpath_bend", "cartwheel",
]);
// what both worlds may use
const SHARED_ASSETS = new Set(["sky", "chamfer1", "chamfer2", "pillar1", "pillar2"]);

export function assetWorld(id: string): WorldId {
  return id.startsWith("fantasy") || FANTASY_ASSETS.has(id) ? "fantasy" : "scifi";
}
// whether an asset is offered in a world's palettes
export function assetInWorld(id: string, world: WorldId = current): boolean {
  return SHARED_ASSETS.has(id) || assetWorld(id) === world;
}
