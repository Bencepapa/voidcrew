import type { CellType, GameMap } from "./types";

// W = wall, . = floor, D = door
const LAYOUT = [
  "WWWWWWWWW",
  "WW......W",
  "WWW.WW.WW",
  "W....W..W",
  "W.WWDW.WW",
  "W.W..W..W",
  "W.W.WWW.W",
  "W...D...W",
  "WWWWWWWWW",
];

function parseLayout(rows: string[]): CellType[][] {
  return rows.map((row) =>
    row.split("").map((char): CellType => {
      if (char === "W") return "wall";
      if (char === "D") return "door";
      return "floor";
    }),
  );
}

export const deck2Engineering: GameMap = {
  name: "Deck 2 - Engineering",
  width: LAYOUT[0].length,
  height: LAYOUT.length,
  cells: parseLayout(LAYOUT),
  // grate floor up top, diamond plate in the bottom corridors
  floorAt: (_x, y) => (y > 5 ? "floor2" : "floor1"),
};

export function cellAt(map: GameMap, x: number, y: number): CellType {
  if (y < 0 || y >= map.height || x < 0 || x >= map.width) return "wall";
  return map.cells[y][x];
}
