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
