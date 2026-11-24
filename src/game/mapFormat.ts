import { DIR_VECTOR, rightOf } from "./movement";
import { ITEM_TYPES, isSharedPickupId } from "./items";
import { readInteraction, type Interaction } from "./interactions";
import { wallFaceSpans, type WallFacePart } from "./mapGeometry";
import { PROP_TYPES, isSharedPropId } from "./props";
import { parseRoofGroup } from "./roofAutotile";
import { isRoofPieceId } from "./roofPieces";
import { cleanFenceStyle, fenceFormOf, isSide, type FenceStyle } from "./fences";
import type { ActorWake, CellType, DecalSpec, Direction, DoorSpec, GameMap, MapLight, MapLinkTarget, PropAnchor, StairsDirection, StairsStyle } from "./types";
import { readLinkTarget } from "./mapLinks";
import { readDoorTexture } from "./doorTextures";
import { readOperable, type OperableSpec } from "./operables";
import type { Lock, Terminal, Trigger } from "./story";
import { cleanRenderLook } from "./renderLook";
import { cleanSkyGradient, type SkyGradient } from "./skyGradient";
import { worldOfMap } from "./worlds";
import { parsePickupMode } from "./pickupMode";
import type { RenderLook } from "./renderLook";

// Map files (src/maps/*.json): a character grid for the cells plus optional
// per-cell layers, each its own character grid with a legend. Characters
// missing from a legend (like ".") take the layer's default.
//
//   layout        W = wall, . = floor, D = door
//   floor         floor height (default 0)
//   ceiling       ceiling height (default: floor + 1)
//   floorTexture  floor texture set (default: "default", or the renderer's)
//   wallTexture   texture set of the walls around the cell (default: the
//                 renderer's mix)
//   ceilingTexture  texture set of the ceiling (default: the renderer's)
//
// `ladders` stand in a cell against its wall toward a higher neighbor;
// `bridges` span a cell at a height along an axis; `lights` add ceiling
// lights; `windows` look out of a wall onto space; `props` stand in cells.
//
// Heights are in wall heights (1 = one wall panel), multiples of 0.25.

interface LayerFile<T> {
  legend: Record<string, T>;
  default?: T;
  rows: string[];
}

// "deck2-engineering" -> "Deck2 engineering": the place of a map that has none
export function prettifyId(id: string): string {
  const s = id.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface MapFile {
  name: string;
  // the place the map is in (a town, a forest, a ship); optional: older maps
  // use their id, prettified
  place?: string;
  // show the "Place - Name" caption on entering (default: on when `place` is set)
  showTitle?: boolean;
  // deck number (lower = higher up the ship)
  deck: number;
  // default texture sets for the deck (see GameMap.textures)
  textures?: {
    [slot: string]: string | SkyGradient | undefined;
    wall?: string;
    accent?: string;
    sky?: string;
    // a vertical colour ramp instead of a sky image (bad colours are dropped in parseMap)
    skyGradient?: SkyGradient;
    floor?: string;
    ceiling?: string;
    door?: string;
    liftDoor?: string;
    doorFrame?: string;
    // a window panel set; wider windows use its _left, _mid and _right sets
    window?: string;
  };
  labelColor?: string;
  lightColor?: string;
  // the deck's accent hue (see GameMap.accent)
  accent?: { hue: number; range?: number };
  // how the deck is drawn, if not the viewer's defaults: its baked light's
  // samples per cell (few: softer, light spilling to the cells around; many:
  // sharper shadows, lightmap-like) and its walls' relief depth (world units)
  lightGridDensity?: number;
  // the baked light's ambient part from a coarser grid of its own (samples
  // per cell): a lit room's light spreads into the cells around it, while
  // the main part keeps lightGridDensity's sharp shadows; unset: one grid
  lightGridAmbient?: number;
  reliefDepth?: number;
  // render values saved with the deck: material, AO, relief, wall height,
  // ambient light... (see renderLook.ts)
  render?: RenderLook;
  start: { x: number; y: number; facing: Direction };
  layout: string[];
  layers?: {
    floor?: LayerFile<number>;
    ceiling?: LayerFile<number>;
    floorTexture?: LayerFile<string>;
    wallTexture?: LayerFile<string>;
    ceilingTexture?: LayerFile<string>;
  };
  doors?: {
    type?: string;
    interaction?: Interaction;
    x: number;
    y: number;
    kind: DoorSpec["kind"];
    facing: Direction;
    label?: string;
    labelVertical?: boolean;
    // where in the cell it stands (see DoorSpec.offset)
    offset?: number;
    // its own leaf / frame texture set ids (see DoorSpec.leafTexture)
    leafTexture?: string;
    frameTexture?: string;
    chance?: number;
    lock?: Lock;
    id?: string;
    with?: string;
    without?: string;
  }[];
  // Texture sets of single step faces: the side face of a raised floor
  // (a "riser") or a lowered ceiling's strip (a "header"). x, y: the open cell
  // the face is seen from (the LOWER one of a riser: the lower floor, the
  // higher ceiling); face: its side toward the higher floor / lower
  // ceiling; texture: a texture set id. Beats the cell's wallTexture on that
  // face; a face with no entry (or no step there any more) uses the cell's.
  faceTextures?: { x: number; y: number; face: Direction; texture: string }[];
  // ways off the ship (see ExitSpec); with a `to`, a gate to another map:
  //   { "x": 5, "y": 0, "name": "North gate", "to": { "map": "forest", "arrival": "Town road" } }
  // `arrival` is a gate's name or a cell { x, y }; `facing` and `loadingImage` are optional too
  exits?: { x: number; y: number; name?: string; to?: MapLinkTarget }[];
  // stairs up or down to another map (see StairsSpec); `to` as for an exit's, without it they go nowhere yet:
  //   { "x": 3, "y": 2, "direction": "up", "style"?: "spiral", "name"?: "Tower stairs", "to": { "map": "tower-1" } }
  stairs?: { x: number; y: number; direction: StairsDirection; style?: StairsStyle; name?: string; to?: MapLinkTarget }[];
  // a shared still image's id: the loading screen of this map shows it
  loadingImage?: string;
  // how loose items are picked up here, over the player's choice and the world's default (see
  // pickupMode.ts): "auto" - stepping onto an item takes it; "click" - only a click or Use does
  pickup?: "auto" | "click";
  // the cells where the crew mustn't be (see GameMap.restricted)
  restricted?: [number, number][];
  // smoke emitters (see SmokeSpec)
  weather?: GameMap["weather"];
  smokes?: {
    effect?: import("./types").AmbientEffect;
    mistStyle?: "standing" | "ground";
    spread?: number;
    height?: number;
    sprite?: string;
    x: number;
    y: number;
    pos: [number, number, number];
    density?: number;
    size?: number;
    color?: string;
    blow?: { speed: number; yaw: number; pitch?: number };
    fire?: boolean;
    lightColor?: string;
    lightIntensity?: number;
    lightReach?: number;
    petals?: boolean;
    decorative?: boolean;
    opacity?: number;
    opacityDark?: number;
    chance?: number;
    id?: string;
    with?: string;
    without?: string;
  }[];
  // loot lying about (see MapItem)
  items?: {
    interaction?: Interaction;
    item: string;
    x: number;
    y: number;
    count?: number;
    offset?: [number, number];
    elevation?: number;
    chance?: number;
    // a story item (see MapItem)
    name?: string;
    sets?: string;
    id?: string;
    with?: string;
    without?: string;
  }[];
  // the deck's story (see story.ts): terminals by id, and triggers
  terminals?: Record<string, Terminal>;
  triggers?: Trigger[];
  // walls left to chance (see ChanceWall): their cells are walls in the
  // layout
  chanceWalls?: { x: number; y: number; chance?: number; id?: string; with?: string; without?: string }[];
  // x, y: the cabin; button: the wall its button decal is on; to: map id
  lifts?: { x: number; y: number; button: Direction; to: string }[];
  // x, y: the lower cell; wall: its side toward the higher one
  ladders?: { x: number; y: number; wall: Direction }[];
  bridges?: { x: number; y: number; height: number; axis: "NS" | "EW" }[];
  lights?: MapLight[];
  // x, y: the (leftmost) cell; wall: the wall it's in; width: panels
  // glow: false - no starlight glowing in through it
  windows?: { x: number; y: number; wall: Direction; width?: number; glow?: boolean }[];
  // at: where in the cell (default "center"); rotation: degrees
  props?: {
    interaction?: Interaction;
    prop: string;
    x: number;
    y: number;
    at?: PropAnchor;
    rotation?: number;
    offset?: [number, number];
    elevation?: number;
    scale?: number;
    chance?: number;
    texture?: string;
    loot?: { item: string; count: number }[];
    // roof autotile (see PropSpec.auto)
    auto?: string;
    detached?: boolean;
    // fence and block pieces (see PropSpec.fence)
    fence?: FenceStyle;
    // a lever, button, plate, trap cell or wall trap's targets and settings (see operables.ts)
    operable?: OperableSpec;
    id?: string;
    with?: string;
    without?: string;
  }[];
  // patrol: the cells it walks between ([x, y] each), starting with the first
  actors?: {
    actor: string;
    x: number;
    y: number;
    facing?: Direction;
    patrol?: [number, number][];
    chance?: number;
    wake?: ActorWake;
    friendly?: boolean;
    dialogue?: { library: string; entry: string };
    portrait?: string;
    shop?: string;
    greeting?: string;
    id?: string;
    with?: string;
    without?: string;
  }[];
  wallInteractions?: { x: number; y: number; side: Direction; part?: WallFacePart; interaction: Interaction }[];
  decals?: {
    interaction?: Interaction;
    decal: string;
    x: number;
    y: number;
    surface: DecalSpec["surface"];
    px: number;
    py: number;
    rotation?: number;
    scale?: number;
    action?: string;
    // a painted lever / button that works (see PropSpec.operable; `kind` says which)
    operable?: OperableSpec;
    chance?: number;
    id?: string;
    with?: string;
    without?: string;
  }[];
}

const HEIGHT_STEP = 0.25;

// a layer's value per cell (undefined = the layer's default, or unset)
function readLayer<T>(layer: LayerFile<T> | undefined, width: number, height: number, name: string) {
  const grid: (T | undefined)[][] = [];
  for (let y = 0; y < height; y++) {
    const row = layer?.rows[y] ?? "";
    if (layer && row.length !== width) throw new Error(`map layer "${name}" row ${y} isn't ${width} wide`);
    grid.push(Array.from({ length: width }, (_, x) => layer?.legend[row[x]] ?? layer?.default));
  }
  return grid;
}

function checkHeight(value: number, what: string) {
  if (Math.abs(value / HEIGHT_STEP - Math.round(value / HEIGHT_STEP)) > 1e-6) {
    throw new Error(`${what} ${value} isn't a multiple of ${HEIGHT_STEP}`);
  }
}

export function parseMap(id: string, file: MapFile): GameMap {
  const height = file.layout.length;
  const width = file.layout[0]?.length ?? 0;
  const cells = file.layout.map((row, y) => {
    if (row.length !== width) throw new Error(`map row ${y} isn't ${width} wide`);
    return row.split("").map((char): CellType => (char === "W" ? "wall" : char === "D" ? "door" : "floor"));
  });
  for (const w of file.chanceWalls ?? []) {
    if (!cells[w.y]?.[w.x]) throw new Error(`chance wall at ${w.x},${w.y} is off the map`);
    cells[w.y][w.x] = "wall";
  }

  const floors = readLayer(file.layers?.floor, width, height, "floor");
  const ceilings = readLayer(file.layers?.ceiling, width, height, "ceiling");
  const floorHeights = floors.map((row) => row.map((f) => f ?? 0));
  const ceilingHeights = ceilings.map((row, y) =>
    row.map((c, x) => {
      const floor = floorHeights[y][x];
      // a door's frame is one panel tall: its cell can't be taller
      if (cells[y][x] === "door") return floor + 1;
      return c ?? floor + 1;
    }),
  );
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x] === "wall") continue;
      checkHeight(floorHeights[y][x], `floor at ${x},${y}`);
      checkHeight(ceilingHeights[y][x], `ceiling at ${x},${y}`);
      if (ceilingHeights[y][x] <= floorHeights[y][x]) throw new Error(`ceiling at ${x},${y} isn't above its floor`);
    }
  }

  const ladders = (file.ladders ?? []).map((l) => {
    const v = DIR_VECTOR[l.wall];
    const top = { x: l.x + v.x, y: l.y + v.y };
    const open = (x: number, y: number) => cells[y]?.[x] !== undefined && cells[y][x] !== "wall";
    if (!open(l.x, l.y) || !open(top.x, top.y) || floorHeights[top.y][top.x] <= floorHeights[l.y][l.x]) {
      throw new Error(`ladder at ${l.x},${l.y} ${l.wall} doesn't lead up to a higher floor`);
    }
    return { cell: { x: l.x, y: l.y }, wall: l.wall };
  });

  const bridges = (file.bridges ?? []).map((b) => {
    const at = `bridge at ${b.x},${b.y}`;
    if (cells[b.y]?.[b.x] !== "floor") throw new Error(`${at} isn't in a floor cell`);
    checkHeight(b.height, at);
    if (b.height <= floorHeights[b.y][b.x] || b.height >= ceilingHeights[b.y][b.x]) {
      throw new Error(`${at} isn't between the cell's floor and ceiling`);
    }
    return { cell: { x: b.x, y: b.y }, height: b.height, axis: b.axis };
  });

  const windows = (file.windows ?? []).map((w) => {
    const count = w.width ?? 1;
    const out = DIR_VECTOR[w.wall];
    const right = DIR_VECTOR[rightOf(w.wall)];
    for (let i = 0; i < count; i++) {
      const x = w.x + right.x * i;
      const y = w.y + right.y * i;
      const open = cells[y]?.[x] !== undefined && cells[y][x] !== "wall";
      const walled = (cells[y + out.y]?.[x + out.x] ?? "wall") === "wall";
      if (!open || !walled) throw new Error(`window at ${w.x},${w.y} ${w.wall}: panel ${i} isn't a wall of a walkable cell`);
    }
    return { cell: { x: w.x, y: w.y }, wall: w.wall, width: count, glow: w.glow !== false };
  });

  const floorTextures = readLayer(file.layers?.floorTexture, width, height, "floorTexture");
  const wallTextures = readLayer(file.layers?.wallTexture, width, height, "wallTexture");
  const ceilingTextures = readLayer(file.layers?.ceilingTexture, width, height, "ceilingTexture");
  // (stale entries - a cell turned into wall, a bad side - are ignored, not errors)
  const faceTextures = new Map<string, string>();
  for (const f of file.faceTextures ?? []) {
    if (DIR_VECTOR[f.face] && f.texture) faceTextures.set(`${f.x},${f.y},${f.face}`, f.texture);
  }
  const gradient = cleanSkyGradient(file.textures?.skyGradient);
  const textures = file.textures ? { ...file.textures, skyGradient: gradient } : undefined;
  if (textures && !gradient) delete textures.skyGradient;

  return {
    id,
    deck: file.deck,
    textures,
    labelColor: file.labelColor,
    lightColor: file.lightColor,
    accent: file.accent,
    lightGridDensity: file.lightGridDensity,
    lightGridAmbient: file.lightGridAmbient,
    reliefDepth: file.reliefDepth,
    render: cleanRenderLook(file.render),
    name: file.name,
    place: file.place?.trim() || prettifyId(id),
    hasPlace: !!file.place?.trim(),
    showTitle: file.showTitle ?? !!file.place?.trim(),
    world: worldOfMap(id),
    width,
    height,
    cells,
    start: { cell: { x: file.start.x, y: file.start.y }, facing: file.start.facing },
    floorHeights,
    ceilingHeights,
    floorAt: file.layers?.floorTexture ? (x, y) => floorTextures[y]?.[x] ?? "" : undefined,
    wallTextureAt: (x, y) => wallTextures[y]?.[x],
    faceTextureAt: faceTextures.size ? (x, y, side) => faceTextures.get(`${x},${y},${side}`) : undefined,
    ceilingTextureAt: (x, y) => ceilingTextures[y]?.[x],
    doors: (file.doors ?? []).map((d) => ({
      type: typeof d.type === "string" ? d.type : undefined,
      interaction: readInteraction(d.interaction),
      cell: { x: d.x, y: d.y },
      kind: d.kind,
      facing: d.facing,
      label: d.label,
      labelVertical: d.labelVertical,
      offset: d.offset,
      leafTexture: readDoorTexture(d.leafTexture),
      frameTexture: readDoorTexture(d.frameTexture),
      chance: d.chance,
      lock: d.lock,
      id: d.id,
      with: d.with,
      without: d.without,
    })),
    terminals: file.terminals,
    triggers: file.triggers,
    restricted: (file.restricted ?? []).map(([x, y]) => ({ x, y })),
    chanceWalls: (file.chanceWalls ?? []).map((w) => ({ cell: { x: w.x, y: w.y }, chance: w.chance, id: w.id, with: w.with, without: w.without })),
    ladders,
    bridges,
    lights: (file.lights ?? []).map((l) => ({ ...l })),
    structureKey: JSON.stringify({
      ...file,
      // the cleaned sky spec: a bad colour must not rebuild the scene differently
      textures,
      lights: undefined,
      lightGridDensity: undefined,
      lightGridAmbient: undefined,
      smokes: undefined,
      weather: undefined,
      actors: undefined,
      terminals: undefined,
      triggers: undefined,
      accent: undefined,
      restricted: undefined,
      // (redone in place by the viewport - see applyLightsRef)
      decals: undefined,
      props: undefined,
      wallInteractions: undefined,
      doors: file.doors?.map(({ interaction: _interaction, ...door }) => door),
      items: undefined,
      render: undefined,
      // (only where an exit's plate stands, and whether it's a gate, matters to the scene - not its name or target)
      exits: file.exits?.map(({ x, y, to }) => ({ x, y, gate: !!readLinkTarget(to) })),
      // (a staircase's plate: where it is and how it looks)
      stairs: file.stairs?.map(({ x, y, direction, style }) => ({ x, y, direction, style })),
      loadingImage: undefined,
      pickup: undefined,
    }),
    windows,
    props: (file.props ?? []).map((p) => {
      if (!Object.hasOwn(PROP_TYPES, p.prop) && !isSharedPropId(p.prop)) {
        throw new Error(`prop at ${p.x},${p.y}: unknown prop "${p.prop}"`);
      }
      if (cells[p.y]?.[p.x] !== "floor") throw new Error(`prop at ${p.x},${p.y} isn't in a floor cell`);
      if (p.auto !== undefined) {
        if (!parseRoofGroup(p.auto)) throw new Error(`prop at ${p.x},${p.y}: "${String(p.auto)}" isn't a roof group (<slope|flat|bent|pyramid|pyramidcell|gable>-<number>)`);
        if (!isRoofPieceId(p.prop)) throw new Error(`prop at ${p.x},${p.y}: a roof group's piece must be a roof prop, not "${p.prop}"`);
      }
      const form = fenceFormOf(p.prop);
      if (p.fence !== undefined && !form) throw new Error(`prop at ${p.x},${p.y}: "${p.prop}" is no fence piece, it has no fence settings`);
      if (p.fence !== undefined && (typeof p.fence !== "object" || p.fence === null || Array.isArray(p.fence))) throw new Error(`prop at ${p.x},${p.y}: fence settings must be an object`);
      if (form === "edge" && !isSide(p.at)) throw new Error(`prop at ${p.x},${p.y}: a fence_edge needs the side of its cell it stands on (at: N, E, S or W)`);
      return {
        prop: p.prop,
        interaction: readInteraction(p.interaction),
        cell: { x: p.x, y: p.y },
        at: p.at ?? "center",
        rotation: p.rotation,
        offset: p.offset,
        elevation: p.elevation,
        scale: p.scale,
        chance: p.chance,
        texture: p.texture,
        loot: p.loot,
        auto: p.auto,
        detached: p.detached,
        fence: cleanFenceStyle(p.fence),
        operable: readOperable(p.operable),
        id: p.id,
        with: p.with,
        without: p.without,
      };
    }),
    exits: (file.exits ?? []).map((e) => {
      if (cells[e.y]?.[e.x] !== "floor") throw new Error(`exit at ${e.x},${e.y} isn't in a floor cell`);
      const to = readLinkTarget(e.to);
      return { cell: { x: e.x, y: e.y }, name: e.name, ...(to ? { to } : {}) };
    }),
    stairs: (file.stairs ?? []).map((s) => {
      const at = `stairs at ${s.x},${s.y}`;
      if (cells[s.y]?.[s.x] !== "floor") throw new Error(`${at} isn't in a floor cell`);
      if (s.direction !== "up" && s.direction !== "down") throw new Error(`${at}: direction must be "up" or "down"`);
      const to = readLinkTarget(s.to);
      return {
        cell: { x: s.x, y: s.y },
        direction: s.direction,
        ...(s.style === "spiral" ? { style: "spiral" as const } : {}),
        name: s.name,
        ...(to ? { to } : {}),
      };
    }),
    loadingImage: typeof file.loadingImage === "string" && file.loadingImage ? file.loadingImage : undefined,
    pickup: parsePickupMode(file.pickup),
    weather: file.weather ? { ...file.weather, wetness: Math.max(0, Math.min(1, file.weather.wetness ?? (file.weather.type === "rain" ? 0.6 : 0))), snowCover: Math.max(0, Math.min(1, file.weather.snowCover ?? 0.6)), intensity: Math.max(0, Math.min(2, file.weather.intensity ?? 1)) } : undefined,
    smokes: (file.smokes ?? []).map((s) => {
      if (cells[s.y]?.[s.x] === undefined || cells[s.y][s.x] === "wall") throw new Error(`smoke at ${s.x},${s.y} isn't in a walkable cell`);
      return {
        cell: { x: s.x, y: s.y },
        pos: s.pos,
        density: s.density,
        size: s.size,
        color: s.color,
        blow: s.blow,
        effect: s.effect === "mist" && s.mistStyle === "ground" ? "groundfog" : s.effect ?? (s.petals ? "motes" : s.fire ? "fire" : "smoke"),
        spread: s.spread === undefined ? undefined : Math.max(.25, Math.min(12, s.spread)),
        height: s.height === undefined ? undefined : Math.max(.05, Math.min(2, s.height)),
        mistStyle: s.mistStyle,
        sprite: s.sprite,
        fire: s.effect ? s.effect === "fire" : s.fire,
        lightColor: typeof s.lightColor === "string" && /^#[0-9a-f]{6}$/i.test(s.lightColor) ? s.lightColor : undefined,
        lightIntensity: typeof s.lightIntensity === "number" && Number.isFinite(s.lightIntensity) ? Math.max(0, Math.min(3, s.lightIntensity)) : undefined,
        lightReach: typeof s.lightReach === "number" && Number.isFinite(s.lightReach) ? Math.max(0.2, Math.min(3, s.lightReach)) : undefined,
        decorative: s.decorative,
        opacity: s.opacity === undefined ? undefined : Math.max(0.05, Math.min(1.5, s.opacity)),
        opacityDark: s.opacityDark === undefined ? undefined : Math.max(0, Math.min(1, s.opacityDark)),
        chance: s.chance,
        id: s.id,
        with: s.with,
        without: s.without,
      };
    }),
    items: (file.items ?? []).map((it) => {
      if (!Object.hasOwn(ITEM_TYPES, it.item) && !isSharedPickupId(it.item)) {
        throw new Error(`item at ${it.x},${it.y}: unknown item "${it.item}"`);
      }
      if (cells[it.y]?.[it.x] !== "floor") throw new Error(`item at ${it.x},${it.y} isn't in a floor cell`);
      return {
        item: it.item,
        interaction: readInteraction(it.interaction),
        cell: { x: it.x, y: it.y },
        count: it.count,
        offset: it.offset,
        elevation: it.elevation,
        chance: it.chance,
        name: it.name,
        sets: it.sets,
        id: it.id,
        with: it.with,
        without: it.without,
      };
    }),
    actors: (file.actors ?? []).map((a) => {
      for (const [x, y] of [[a.x, a.y], ...(a.patrol ?? [])]) {
        if (cells[y]?.[x] !== "floor") throw new Error(`actor ${a.actor}: ${x},${y} isn't a floor cell`);
      }
      return {
        actor: a.actor,
        cell: { x: a.x, y: a.y },
        facing: a.facing ?? "S",
        patrol: (a.patrol ?? []).map(([x, y]) => ({ x, y })),
        chance: a.chance,
        wake: a.wake,
        friendly: typeof a.friendly === "boolean" ? a.friendly : undefined,
        dialogue: a.dialogue && typeof a.dialogue.library === "string" && typeof a.dialogue.entry === "string" && a.dialogue.library
          ? { library: a.dialogue.library, entry: a.dialogue.entry } : undefined,
        portrait: typeof a.portrait === "string" && a.portrait ? a.portrait : undefined,
        shop: typeof a.shop === "string" && a.shop ? a.shop : undefined,
        greeting: typeof a.greeting === "string" && a.greeting.trim() ? a.greeting : undefined,
        id: a.id,
        with: a.with,
        without: a.without,
      };
    }),
    lifts: (file.lifts ?? []).map((l) => {
      if (cells[l.y]?.[l.x] !== "floor") throw new Error(`lift at ${l.x},${l.y} isn't a floor cell`);
      return { cell: { x: l.x, y: l.y }, button: l.button, to: l.to };
    }),
    wallInteractions: (file.wallInteractions ?? []).flatMap(({ x, y, side, part, interaction }) => {
      const event = readInteraction(interaction);
      if (!event || !cells[y]?.[x] || cells[y][x] === "wall" || !["N", "E", "S", "W"].includes(side)) return [];
      const cell = { x, y };
      // Old records used the same key for a step and a full wall.
      const face = part ?? wallFaceSpans({ width, height, cells, floorHeights, ceilingHeights }, cell, side)[0]?.part;
      return [{ cell, side, part: face, interaction: event }];
    }),
    decals: (file.decals ?? []).map((d) => ({
      interaction: readInteraction(d.interaction),
      decal: d.decal,
      cell: { x: d.x, y: d.y },
      surface: d.surface,
      x: d.px,
      y: d.py,
      rotation: d.rotation,
      scale: d.scale,
      action: d.action,
      operable: readOperable(d.operable),
      chance: d.chance,
      id: d.id,
      with: d.with,
      without: d.without,
    })),
  };
}
