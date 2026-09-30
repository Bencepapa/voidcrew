export type Direction = "N" | "E" | "S" | "W";

export interface Vec2 {
  x: number;
  y: number;
}

export type CellType = "floor" | "wall" | "door";

export interface MapCell {
  type: CellType;
}

export interface GameMap {
  // the map file's name (src/maps/<id>.json)
  id: string;
  // deck number: lower decks are higher up the ship (deck 1 above deck 2)
  deck: number;
  width: number;
  height: number;
  cells: CellType[][];
  name: string;
  // where the player arrives
  start: { cell: Vec2; facing: Direction };
  // per cell, in wall heights (1 = one wall panel), multiples of 0.25: the
  // floor's level and the ceiling's. Unused for wall cells.
  floorHeights: number[][];
  ceilingHeights: number[][];
  // floor texture set of a walkable cell (a renderer texture set id);
  // omitted = the renderer's default floor
  floorAt?: (x: number, y: number) => string;
  // wall texture set for the walls around a walkable cell (a renderer
  // texture set id); omitted = the renderer's default wall mix
  wallTextureAt?: (x: number, y: number) => string | undefined;
  // ceiling texture set of a walkable cell; omitted = the renderer's choice
  ceilingTextureAt?: (x: number, y: number) => string | undefined;
  // the deck's own look: its default texture sets (renderer ids) - any
  // omitted falls back to the renderer's settings
  textures?: {
    wall?: string;
    floor?: string;
    ceiling?: string;
    door?: string;
    liftDoor?: string;
    doorFrame?: string;
    // a window panel set; wider windows use its _left, _mid and _right sets
    window?: string;
  };
  // the paint of the deck's door labels and numbers (hex, e.g. "#1f8f45")
  labelColor?: string;
  // the deck's ceiling lights (hex, e.g. "#ffd08a"); default a neutral warm white
  lightColor?: string;
  // how the deck is drawn, if not the viewer's defaults: its baked light's
  // samples per cell (few: softer, light spilling to the cells around; many:
  // sharper shadows, lightmap-like) and its walls' relief depth (world units) - see MapFile
  lightGridDensity?: number;
  // the baked light's ambient part from a coarser grid of its own (samples
  // per cell): a lit room's light spreads into the cells around it, while
  // the main part keeps lightGridDensity's sharp shadows; unset: one grid
  lightGridAmbient?: number;
  reliefDepth?: number;
  decals?: DecalSpec[];
  // door cells that aren't plain standard doors
  doors?: DoorSpec[];
  ladders?: LadderSpec[];
  bridges?: BridgeSpec[];
  // the deck's lights, all placed (see the editor's Light tool)
  lights?: MapLight[];
  // everything about the map but its lights and baked light density (see
  // parseMap): two versions with the same key differ only in lighting, which
  // the renderer can change without rebuilding the deck
  structureKey?: string;
  windows?: WindowSpec[];
  // walls left to chance (in the full map: walls)
  chanceWalls?: ChanceWall[];
  lifts?: LiftSpec[];
  props?: PropSpec[];
  actors?: ActorSpec[];
}

// A moving actor (see actors.ts): where it starts, which way it looks, and
// the cells it patrols between, back and forth (empty: it stays put).
export interface ActorSpec extends Linked {
  // an actors.ts ACTOR_TYPES name, e.g. "robot1"
  actor: string;
  cell: Vec2;
  facing: Direction;
  patrol: Vec2[];
  // the chance (0..1) it's there in a variation of the deck (see
  // variation.ts); unset: always
  chance?: number;
}

// A 3D prop (see props.ts) in a walkable cell, pushed toward `at`: a side,
// a corner or the center of the cell.
export type PropAnchor = Direction | "NE" | "NW" | "SE" | "SW" | "center";

// A hand-placed light in a cell: a ceiling lamp, or - given `pos` - a
// free-standing one at that spot (a bulb). Unset values: the deck's lamp
// color, and a ceiling lamp's usual strength and reach.
// How an item left to chance (see variation.ts) depends on others: its own
// name, and another's it's only there with, or only without (e.g. a decal
// only with the crate it's painted on, a red lamp only without the white
// one). Names are free text, one per item across all kinds.
export interface Linked {
  id?: string;
  with?: string;
  without?: string;
}

export interface MapLight extends Linked {
  x: number;
  y: number;
  // "#rrggbb"
  color?: string;
  // from the cell's center and its floor: across (x), up in wall heights,
  // along (z)
  pos?: [number, number, number];
  intensity?: number;
  // how far it reaches (world units)
  range?: number;
  // a free-standing one: its bulb shows in the game too (else only while
  // editing - just the light is there)
  bulb?: boolean;
  // the chance (0..1) it's there in a variation of the deck (see
  // variation.ts); unset: always
  chance?: number;
  // a light that doesn't hold steady (see lightEffects.ts): it isn't baked,
  // a real light serves it
  effect?: LightEffect;
}

// flicker: a failing tube, mostly on; spark: dark, with bursts of sparks;
// pulse: an alarm's slow throb
export type LightEffect = "flicker" | "spark" | "pulse";

export interface PropSpec extends Linked {
  // a props.ts PROP_TYPES name, e.g. "crate1"
  prop: string;
  cell: Vec2;
  at: PropAnchor;
  // degrees, clockwise seen from above
  rotation?: number;
  // a nudge from its anchored spot (cells: across, along)
  offset?: [number, number];
  // raised off the floor (wall heights) - on another prop, say
  elevation?: number;
  // the chance (0..1) it's there in a variation of the deck (see
  // variation.ts); unset: always
  chance?: number;
  // a texture set to wear instead of its type's (a box's sides - and its
  // top, if there's a <texture>_top set); unset: its type's (a pillar's:
  // the deck's walls, a chamfer's: its cell's)
  texture?: string;
}

// A lift cabin: the cell behind a lift door. Its button (a decal with the
// "lift" action on the `button` wall) takes it to another map's lift.
export interface LiftSpec {
  cell: Vec2;
  button: Direction;
  // the map id it goes to; it arrives in that map's lift leading back here
  to: string;
}

// A window onto space in a wall of a walkable cell, `width` panels wide:
// the cell's panel and the next ones to its right (seen facing the wall).
// It takes the wall's first panel above the floor.
export interface WindowSpec {
  cell: Vec2;
  wall: Direction;
  width: number;
  // its faint glow of starlight into the room (see lights.ts); false: none
  glow: boolean;
}

// A catwalk across a tall cell at `height`, walkable along its axis: an
// upper passage crosses over whatever runs along the cell's floor. Stepping
// off its side (or jumping down) drops to the floor.
export interface BridgeSpec {
  cell: Vec2;
  // deck height (wall heights)
  height: number;
  axis: "NS" | "EW";
}

// A ladder up a step face too high to climb otherwise: it stands in the
// lower cell against its wall toward the higher neighbor, and takes the
// party up onto that ledge or back down.
export interface LadderSpec {
  // the lower cell (the ladder's foot)
  cell: Vec2;
  // the side of it the ladder is on, toward the higher cell
  wall: Direction;
}

export interface DoorSpec extends Linked {
  cell: Vec2;
  // standard: panel slides up and stays open; lift: panel slides to the
  // right (seen from the front) and closes again after a while
  kind: "standard" | "lift";
  // the side the door's front faces (which side is "outside")
  facing: Direction;
  // stenciled onto the panel; "\n" stacks lines (e.g. "EN\nGI\nNE")
  label?: string;
  // run the label down the panel, turned 90 degrees clockwise
  labelVertical?: boolean;
  // where in its cell the door stands: moved this far (cells) toward its
  // front from the middle; at +-DOOR_EDGE_OFFSET it's flush with the cell's
  // edge, in line with the walls there (see doorCrossed)
  offset?: number;
  // the chance (0..1) it's there in a variation (see variation.ts) - if not,
  // its cell is an open doorway; unset: always
  chance?: number;
}

// A wall left to chance (see variation.ts): its cell is a wall with this
// chance, else an open floor - a caved-in passage, a blocked corridor.
export interface ChanceWall extends Linked {
  cell: Vec2;
  chance?: number;
}

// A decal (bullet hole, stencil, stain...) projected onto one surface of a
// walkable cell. Positions are in the surface texture's pixels (256 per
// cell), so decals line up with the wall's own pixel grid.
export interface DecalSpec extends Linked {
  // name in public/decals/index.json
  decal: string;
  // the walkable cell the surface belongs to
  cell: Vec2;
  // a wall seen from that cell (in that direction), its floor or ceiling
  surface: Direction | "floor" | "ceiling";
  // top-left pixel of the decal on the surface, 0..255 (for floors the top
  // of the texture is north)
  x: number;
  y: number;
  // degrees, clockwise as seen looking at the surface
  rotation?: number;
  // touching (clicking, tapping) the decal does this - e.g. "lift"
  action?: string;
  // the chance (0..1) it's there in a variation of the deck (see
  // variation.ts); unset: always
  chance?: number;
}

export interface Crewmate {
  id: string;
  name: string;
  role: string;
  hp: number;
  maxHp: number;
  en: number;
  maxEn: number;
}
