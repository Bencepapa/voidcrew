import type { MapFile } from "../game/mapFormat";
import { parseRoofGroup, planRoof, raisedFootprint, roofGroupId, type RoofCell, type RoofForm } from "../game/roofAutotile";
import { isRoofPieceId } from "../game/roofPieces";
import type { Vec2 } from "../game/types";

// The Roof tool's edits on a map file (see roofAutotile.ts and
// concept/editor-ui/NOTES-roof-autotile.md): roof cells painted or taken out,
// and the pieces worked out again from the cells of each roof. A roof is the
// props with the same `auto` group id; each is a normal roof prop, so the
// renderer and the rest of the editor treat them like hand-placed ones.

type PropEntry = NonNullable<MapFile["props"]>[number];

// a cell's floor height, read from the file's floor layer (as parseMap does)
export function floorHeightIn(file: MapFile, x: number, y: number): number {
  const layer = file.layers?.floor;
  if (!layer) return 0;
  return layer.legend[layer.rows[y]?.[x] ?? ""] ?? layer.default ?? 0;
}

// whether a prop can stand in the cell: parseMap wants a floor cell (no wall, no door, no chance wall)
export function isFloorIn(file: MapFile, x: number, y: number): boolean {
  const char = file.layout[y]?.[x];
  return char !== undefined && char !== "W" && char !== "D" && !file.chanceWalls?.some((w) => w.x === x && w.y === y);
}

const keyOf = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const NEIGHBOURS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

// the roofs the file has: group id -> its props
export function roofGroups(file: MapFile): Map<string, PropEntry[]> {
  const groups = new Map<string, PropEntry[]>();
  for (const p of file.props ?? []) {
    if (!p.auto) continue;
    const list = groups.get(p.auto);
    if (list) list.push(p);
    else groups.set(p.auto, [p]);
  }
  return groups;
}

// Works out the piece of every cell of every roof again, from the cells of its
// group and the floor heights, and writes it into the props - the tool's own
// pieces only: a detached one keeps what it was set to (though it still counts
// as a cell of the roof for the others). An auto piece that can't stand where
// it is any more (the cell became a wall) goes, and so does a second one in the
// same cell. Run after every edit (mapStore.applyEdit): changing the roof's
// cells, a floor's height or what stands in a cell changes the roof.
export function reevaluateRoofs(file: MapFile): MapFile {
  if (!file.props?.some((p) => p.auto)) return file;
  const seen = new Set<string>();
  const kept = file.props.filter((p) => {
    if (!p.auto) return true;
    if (!p.detached && !isFloorIn(file, p.x, p.y)) return false;
    const key = `${p.auto}|${keyOf(p)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (kept.length !== file.props.length) file.props = kept;
  for (const [group, members] of roofGroups(file)) {
    const parsed = parseRoofGroup(group);
    if (!parsed) continue;
    const cells: RoofCell[] = members.map((p) => ({ x: p.x, y: p.y, level: floorHeightIn(file, p.x, p.y) }));
    const plan = planRoof(cells, parsed.form);
    members.forEach((p, i) => {
      if (p.detached) return;
      const piece = plan[i];
      if (p.prop !== piece.prop) p.prop = piece.prop;
      if (piece.rotation) p.rotation = piece.rotation;
      else delete p.rotation;
      if (piece.elevation) p.elevation = piece.elevation;
      else delete p.elevation;
    });
  }
  return file;
}

// the group a stroke starting in `cell` paints into: the roof of the same form
// that's in the cell, or next to it; a new one if there is none (or `forceNew`)
export function roofGroupFor(file: MapFile, cell: Vec2, form: RoofForm, forceNew = false): string {
  if (!forceNew) {
    const of = (x: number, y: number) => file.props?.find((p) => p.x === x && p.y === y && p.auto && parseRoofGroup(p.auto)?.form === form)?.auto;
    const own = of(cell.x, cell.y);
    if (own) return own;
    for (const [dx, dy] of NEIGHBOURS) {
      const next = of(cell.x + dx, cell.y + dy);
      if (next) return next;
    }
  }
  let n = 0;
  for (const p of file.props ?? []) n = Math.max(n, parseRoofGroup(p.auto)?.n ?? 0);
  return roofGroupId(form, n + 1);
}

// Roofs the cells, in `group` (see roofGroupFor): a new piece in each floor cell
// that has no roof piece, and an auto piece of another form is taken into the
// group (the form changes). A cell with a hand-placed roof piece, or one of
// another roof of the same form, is left as it is. A new piece wears the texture
// of the group's others, else `texture`.
export function paintRoof(file: MapFile, cells: readonly Vec2[], group: string, texture?: string): MapFile {
  const form = parseRoofGroup(group)?.form;
  if (!form) return file;
  for (const cell of cells) {
    if (!isFloorIn(file, cell.x, cell.y)) continue;
    const props = file.props ?? (file.props = []);
    const here = props.filter((p) => p.x === cell.x && p.y === cell.y && isRoofPieceId(p.prop));
    const auto = here.find((p) => p.auto);
    if (auto) {
      if (parseRoofGroup(auto.auto)?.form !== form) {
        auto.auto = group;
        delete auto.detached;
      }
      continue;
    }
    if (here.length) continue;
    const wears = texture ?? props.find((p) => p.auto === group && p.texture)?.texture;
    props.push({ prop: "roof_flat", x: cell.x, y: cell.y, at: "center", ...(wears ? { texture: wears } : {}), auto: group });
  }
  return reevaluateRoofs(file);
}

// Takes the auto roof pieces out of the cells (the roof closes up around them)
export function eraseRoof(file: MapFile, cells: readonly Vec2[]): MapFile {
  const gone = new Set(cells.map(keyOf));
  return removeWhere(file, (p) => !!p.auto && gone.has(keyOf(p)));
}

// Takes a whole roof away
export function eraseRoofGroup(file: MapFile, group: string): MapFile {
  return removeWhere(file, (p) => p.auto === group);
}

function removeWhere(file: MapFile, test: (p: PropEntry) => boolean): MapFile {
  if (!file.props) return file;
  file.props = file.props.filter((p) => !test(p));
  if (!file.props.length) delete file.props;
  return reevaluateRoofs(file);
}

// The raised block the cell is part of, as cells to roof (null: it isn't one -
// the level ground - or it's too big: see raisedFootprint)
export function roofFootprint(file: MapFile, cell: Vec2): Vec2[] | null {
  return raisedFootprint(cell, (x, y) => (isFloorIn(file, x, y) ? floorHeightIn(file, x, y) : null));
}

// Detaches an auto piece from the autotile (it keeps what it is now and the
// tool leaves it be), or takes it back
export function setRoofDetached(file: MapFile, index: number, detached: boolean): MapFile {
  const prop = file.props?.[index];
  if (!prop?.auto) return file;
  if (detached) prop.detached = true;
  else delete prop.detached;
  return reevaluateRoofs(file);
}

// the settings of a prop that make it a different piece (changing one by hand
// detaches an auto piece)
const ROOF_SHAPE_KEYS = ["prop", "rotation", "elevation", "offset", "at", "scale", "x", "y"] as const;

// An auto piece was changed by hand (updateProp: `next` is the prop as it will be, `patch` what
// was changed): a change to its shape detaches it - the tool leaves it be from then on - and a
// texture is the whole roof's.
export function roofPieceEdited(file: MapFile, prop: PropEntry, next: Record<string, unknown>, patch: Partial<PropEntry>): void {
  const before = prop as Record<string, unknown>;
  if (!("detached" in patch) && ROOF_SHAPE_KEYS.some((k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]))) next.detached = true;
  if ("texture" in patch) {
    for (const other of file.props ?? []) {
      if (other.auto !== prop.auto || other === prop) continue;
      if (patch.texture === undefined) delete other.texture;
      else other.texture = patch.texture;
    }
  }
}
