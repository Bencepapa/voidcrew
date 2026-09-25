import type { CellType, DoorSpec, GameMap } from "./types";

// W = wall, . = floor, D = door
// (1,1) is the lift the player arrives in, (2,1) its door
const LAYOUT = [
  "WWWWWWWWW",
  "W.D.....W",
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
  // the lift cabin (placeholder until a proper lift interior texture exists)
  wallTextureAt: (x, y) => (x === 1 && y === 1 ? "wall1" : undefined),
  doors: [{ cell: { x: 2, y: 1 }, kind: "lift", facing: "E", label: "EN\nGI\nNE" }],
  decals: [
    // a burst of shots on the corridor wall just outside the lift
    { decal: "bullet_holes", cell: { x: 3, y: 1 }, surface: "N", x: 140, y: 50 },
    { decal: "bullet_hole", cell: { x: 3, y: 1 }, surface: "N", x: 212, y: 100, rotation: 70 },
    // arrows pointing the way: under the ENGINE stencil (east) and on the
    // floor. Painted decals go on the flat diamond plate (floor2); the grate
    // floor's slots would cut them to pieces.
    { decal: "arrow", cell: { x: 4, y: 1 }, surface: "S", x: 80, y: 90, rotation: 270 },
    { decal: "arrow", cell: { x: 7, y: 7 }, surface: "floor", x: 80, y: 66, rotation: 270 },
    // a deck number beside the door and a warning sign on the wall across
    { decal: "num_07", cell: { x: 4, y: 3 }, surface: "E", x: 106, y: 56 },
    { decal: "warning", cell: { x: 4, y: 3 }, surface: "N", x: 80, y: 50 },
    // hazard stripes on the floor before the bottom door
    { decal: "hazard_stripes", cell: { x: 5, y: 7 }, surface: "floor", x: 0, y: 79, rotation: 90 },
    // signs of trouble around the deck
    { decal: "scorch", cell: { x: 7, y: 3 }, surface: "E", x: 70, y: 70 },
    { decal: "bullet_hole", cell: { x: 7, y: 3 }, surface: "E", x: 40, y: 150, rotation: 200 },
    { decal: "claw_marks", cell: { x: 1, y: 5 }, surface: "E", x: 90, y: 70 },
    { decal: "oil", cell: { x: 3, y: 5 }, surface: "W", x: 90, y: 60 },
    { decal: "patch_plate", cell: { x: 4, y: 5 }, surface: "S", x: 110, y: 150 },
    // big stencils, each running across two wall panels (a south-facing
    // wall's pixels run westward, so they continue into the cell to the west)
    { decal: "text_danger", cell: { x: 3, y: 3 }, surface: "S", x: 100, y: 40 },
    { decal: "text_engine", cell: { x: 5, y: 1 }, surface: "S", x: 120, y: 40 },
    { decal: "text_lift", cell: { x: 1, y: 7 }, surface: "W", x: 36, y: 40 },
  ],
};

// the door spec of a door cell; unlisted door cells are standard doors
// whose front faces along the passage
export function doorAt(map: GameMap, x: number, y: number): DoorSpec {
  const spec = map.doors?.find((d) => d.cell.x === x && d.cell.y === y);
  if (spec) return spec;
  const northSouth = cellAt(map, x, y - 1) !== "wall" || cellAt(map, x, y + 1) !== "wall";
  return { cell: { x, y }, kind: "standard", facing: northSouth ? "S" : "E" };
}

export function cellAt(map: GameMap, x: number, y: number): CellType {
  if (y < 0 || y >= map.height || x < 0 || x >= map.width) return "wall";
  return map.cells[y][x];
}
