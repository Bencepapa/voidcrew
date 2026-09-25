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
  width: number;
  height: number;
  cells: CellType[][];
  name: string;
  // floor texture set of a walkable cell (a renderer texture set id);
  // omitted = the renderer's default floor
  floorAt?: (x: number, y: number) => string;
  // wall texture set for the walls around a walkable cell (a renderer
  // texture set id); omitted = the renderer's default wall mix
  wallTextureAt?: (x: number, y: number) => string | undefined;
  decals?: DecalSpec[];
  // door cells that aren't plain standard doors
  doors?: DoorSpec[];
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
