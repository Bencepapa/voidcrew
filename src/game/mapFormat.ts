import { DIR_VECTOR } from "./movement";
import type { CellType, DecalSpec, Direction, DoorSpec, GameMap } from "./types";

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
//
// `ladders` stand in a cell against its wall toward a higher neighbor.
//
// Heights are in wall heights (1 = one wall panel), multiples of 0.25.

interface LayerFile<T> {
  legend: Record<string, T>;
  default?: T;
  rows: string[];
}

export interface MapFile {
  name: string;
  start: { x: number; y: number; facing: Direction };
  layout: string[];
  layers?: {
    floor?: LayerFile<number>;
    ceiling?: LayerFile<number>;
    floorTexture?: LayerFile<string>;
    wallTexture?: LayerFile<string>;
  };
  doors?: { x: number; y: number; kind: DoorSpec["kind"]; facing: Direction; label?: string }[];
  // x, y: the lower cell; wall: its side toward the higher one
  ladders?: { x: number; y: number; wall: Direction }[];
  decals?: {
    decal: string;
    x: number;
    y: number;
    surface: DecalSpec["surface"];
    px: number;
    py: number;
    rotation?: number;
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

export function parseMap(file: MapFile): GameMap {
  const height = file.layout.length;
  const width = file.layout[0]?.length ?? 0;
  const cells = file.layout.map((row, y) => {
    if (row.length !== width) throw new Error(`map row ${y} isn't ${width} wide`);
    return row.split("").map((char): CellType => (char === "W" ? "wall" : char === "D" ? "door" : "floor"));
  });

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

  const floorTextures = readLayer(file.layers?.floorTexture, width, height, "floorTexture");
  const wallTextures = readLayer(file.layers?.wallTexture, width, height, "wallTexture");

  return {
    name: file.name,
    width,
    height,
    cells,
    start: { cell: { x: file.start.x, y: file.start.y }, facing: file.start.facing },
    floorHeights,
    ceilingHeights,
    floorAt: file.layers?.floorTexture ? (x, y) => floorTextures[y]?.[x] ?? "" : undefined,
    wallTextureAt: (x, y) => wallTextures[y]?.[x],
    doors: (file.doors ?? []).map((d) => ({
      cell: { x: d.x, y: d.y },
      kind: d.kind,
      facing: d.facing,
      label: d.label,
    })),
    ladders,
    decals: (file.decals ?? []).map((d) => ({
      decal: d.decal,
      cell: { x: d.x, y: d.y },
      surface: d.surface,
      x: d.px,
      y: d.py,
      rotation: d.rotation,
    })),
  };
}
