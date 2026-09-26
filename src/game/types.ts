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
  decals?: DecalSpec[];
  // door cells that aren't plain standard doors
  doors?: DoorSpec[];
  ladders?: LadderSpec[];
  bridges?: BridgeSpec[];
  // hand-placed ceiling lights, on top of the generated mood lighting
  lights?: Vec2[];
  windows?: WindowSpec[];
  lifts?: LiftSpec[];
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

export interface DoorSpec {
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
}

// A decal (bullet hole, stencil, stain...) projected onto one surface of a
// walkable cell. Positions are in the surface texture's pixels (256 per
// cell), so decals line up with the wall's own pixel grid.
export interface DecalSpec {
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
