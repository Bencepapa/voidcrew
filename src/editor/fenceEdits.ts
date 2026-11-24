import type { MapFile } from "../game/mapFormat";
import { FENCE_PROP, OPPOSITE, VEC, cleanFenceStyle, edgeCells, edgeId, fenceFormOf, isSide, type FenceForm, type FenceStyle } from "../game/fences";
import type { Direction, Vec2 } from "../game/types";
import { isFloorIn } from "./roofEdits";

// The fence tools' edits on a map file (see game/fences.ts and concept/editor-ui/NOTES-fence-blocks.md): pieces
// put in cells and on edges, taken out, and kept tidy. A piece is an ordinary prop entry (`fence_block`,
// `fence_edge`, `fence_mid`), so selecting, moving, deleting and undoing work as for any prop; nothing about
// how pieces connect is stored (it follows from the neighbours - see fences.ts), so nothing here has to be
// re-evaluated after an edit but the pieces that can't stand any more.

type PropEntry = NonNullable<MapFile["props"]>[number];

const cellKey = (x: number, y: number) => `${x},${y}`;
const NEIGHBOURS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

// whether the entry is a fence piece, and its edge if it is an edge piece
const formOf = (p: PropEntry) => fenceFormOf(p.prop);
const edgeOf = (p: PropEntry) => (isSide(p.at) ? edgeId(p.x, p.y, p.at) : edgeId(p.x, p.y, "N"));

// What the tool paints new pieces with: a texture set (undefined: the deck's walls), the settings (its own
// piece's `fence`), a turn (a mid piece with no neighbour lies along x, or - 90 - along z).
export interface FencePaint {
  texture?: string;
  style?: FenceStyle;
  rotation?: number;
}

function newPiece(form: FenceForm, x: number, y: number, side: Direction | undefined, paint: FencePaint): PropEntry {
  const style = cleanFenceStyle(paint.style);
  return {
    prop: FENCE_PROP[form],
    x,
    y,
    at: form === "edge" ? side ?? "N" : "center",
    ...(form === "mid" && paint.rotation ? { rotation: paint.rotation } : {}),
    ...(paint.texture ? { texture: paint.texture } : {}),
    ...(style ? { fence: style } : {}),
  };
}

// Puts pieces of `form` in the cells (an edge piece on the cell's `side` of each). A cell that isn't a floor
// cell is left alone - for an edge, the neighbour across it takes the piece when that is a floor (the fence
// stands on the same edge). A cell that already has a piece of the form (or an edge that has one) keeps it; a
// block put where a mid fence stands (or the other way round) takes its place. Returns how many were put in
// through `placed`, when asked.
export function paintFence(file: MapFile, form: FenceForm, cells: readonly Vec2[], paint: FencePaint = {}, side?: Direction, placed?: { count: number }): MapFile {
  for (const cell of cells) {
    let { x, y } = cell;
    let at = side;
    if (form === "edge") {
      if (!at) continue;
      if (!isFloorIn(file, x, y)) {
        // (the other side of the same edge)
        const nx = x + VEC[at][0];
        const ny = y + VEC[at][1];
        if (!isFloorIn(file, nx, ny)) continue;
        x = nx;
        y = ny;
        at = OPPOSITE[at];
      }
      const id = edgeId(x, y, at);
      const props = file.props ?? (file.props = []);
      if (props.some((p) => formOf(p) === "edge" && edgeOf(p) === id)) continue;
      props.push(newPiece(form, x, y, at, paint));
    } else {
      if (!isFloorIn(file, x, y)) continue;
      const props = file.props ?? (file.props = []);
      const here = props.filter((p) => p.x === x && p.y === y && (formOf(p) === "block" || formOf(p) === "mid"));
      if (here.some((p) => formOf(p) === form)) continue;
      // (the other kind of piece is replaced, it can't share the cell)
      if (here.length) file.props = props.filter((p) => !here.includes(p));
      (file.props ?? (file.props = [])).push(newPiece(form, x, y, undefined, paint));
    }
    if (placed) placed.count++;
  }
  return file;
}

// Makes the pieces of `form` in the cells (on their `side`, for an edge) wear `paint` - the panel's settings -
// again: how the pieces of the stroke just made follow the tool's panel while it is still in hand. A cell with no
// piece of the form is left alone.
export function restyleFence(file: MapFile, form: FenceForm, cells: readonly Vec2[], paint: FencePaint, side?: Direction): MapFile {
  const style = cleanFenceStyle(paint.style);
  for (const cell of cells) {
    const piece = file.props?.[fenceIndexAt(file, form, cell, side)];
    if (!piece) continue;
    if (paint.texture) piece.texture = paint.texture;
    else delete piece.texture;
    if (style) piece.fence = style;
    else delete piece.fence;
    if (form === "mid") {
      if (paint.rotation) piece.rotation = paint.rotation;
      else delete piece.rotation;
    }
  }
  return file;
}

// Takes the pieces of `form` out of the cells (for an edge: the one on each cell's `side`, however it is
// stored - from this cell or from the one across).
export function eraseFence(file: MapFile, form: FenceForm, cells: readonly Vec2[], side?: Direction, removed?: { count: number }): MapFile {
  if (!file.props) return file;
  const gone = new Set<string>();
  for (const { x, y } of cells) {
    if (form === "edge") {
      if (side) gone.add(edgeId(x, y, side));
    } else gone.add(cellKey(x, y));
  }
  const before = file.props.length;
  file.props = file.props.filter((p) => !(formOf(p) === form && gone.has(form === "edge" ? edgeOf(p) : cellKey(p.x, p.y))));
  if (removed) removed.count += before - file.props.length;
  if (!file.props.length) delete file.props;
  return file;
}

// The piece in a cell (a block or a mid fence) or on a cell's side (an edge), as its index in the props
export function fenceIndexAt(file: MapFile, form: FenceForm, cell: Vec2, side?: Direction): number {
  const id = form === "edge" && side ? edgeId(cell.x, cell.y, side) : "";
  return file.props?.findIndex((p) => formOf(p) === form && (form === "edge" ? edgeOf(p) === id : p.x === cell.x && p.y === cell.y)) ?? -1;
}

// Keeps the pieces able to stand: a piece whose cell became a wall or a door goes (a door put on a fence
// cell replaces the fence there - how a gate is made), and so does a second piece on one edge or in one cell;
// an edge piece with no side gets north. Run after every edit (mapStore.applyEdit).
export function reevaluateFences(file: MapFile): MapFile {
  if (!file.props?.some(formOf)) return file;
  const edges = new Set<string>();
  const cells = new Set<string>();
  const kept = file.props.filter((p) => {
    const form = formOf(p);
    if (!form) return true;
    if (!isFloorIn(file, p.x, p.y)) return false;
    if (form === "edge") {
      if (!isSide(p.at)) p.at = "N";
      const id = edgeOf(p);
      if (edges.has(id)) return false;
      edges.add(id);
    } else {
      const key = cellKey(p.x, p.y);
      if (cells.has(key)) return false;
      cells.add(key);
    }
    return true;
  });
  if (kept.length !== file.props.length) {
    file.props = kept;
    if (!file.props.length) delete file.props;
  }
  return file;
}

// ---- runs: the pieces joined to one

// The indices of the pieces joined to piece `index`, itself included: blocks / mid fences are joined to the
// ones in the cells beside them, edge fences to the ones sharing a corner of the grid with them (a fence line
// and the turns it takes).
export function fenceRun(file: MapFile, index: number): number[] {
  const props = file.props ?? [];
  const first = props[index];
  const form = first && formOf(first);
  if (!first || !form) return [];
  const members = props.flatMap((p, i) => (formOf(p) === form ? [i] : []));
  // the neighbours of a piece: through shared keys (cells for blocks / mids, lattice points for edges)
  const keysOf = (p: PropEntry): string[] => {
    if (form !== "edge") return NEIGHBOURS.map(([dx, dy]) => cellKey(p.x + dx, p.y + dy));
    const id = edgeOf(p);
    const [x, y] = id.slice(1).split(",").map(Number);
    return id[0] === "H" ? [cellKey(x, y), cellKey(x + 1, y)] : [cellKey(x, y), cellKey(x, y + 1)];
  };
  const selfKey = (p: PropEntry): string[] => (form !== "edge" ? [cellKey(p.x, p.y)] : keysOf(p));
  const byKey = new Map<string, number[]>();
  for (const i of members) for (const k of selfKey(props[i])) byKey.set(k, [...(byKey.get(k) ?? []), i]);
  const run = new Set<number>([index]);
  const queue = [index];
  while (queue.length) {
    const i = queue.pop()!;
    for (const k of keysOf(props[i])) {
      for (const j of byKey.get(k) ?? []) {
        if (!run.has(j)) {
          run.add(j);
          queue.push(j);
        }
      }
    }
  }
  return [...run].sort((a, b) => a - b);
}

// whether editing one piece's look reaches the ones joined to it (the inspector's switch; on by default)
export const fenceEditing = { spread: true };

// A fence piece was changed by hand (updateProp: `next` is the prop as it will be, `patch` what was changed):
// its settings are made safe, a side that another piece holds is refused, and a change of texture or settings
// reaches the pieces joined to it that wore the same as it did (the ones set apart keep their own).
export function fencePieceEdited(file: MapFile, index: number, prop: PropEntry, next: Record<string, unknown>, patch: Partial<PropEntry>): void {
  if ("fence" in patch) {
    const clean = cleanFenceStyle(patch.fence);
    if (clean) next.fence = clean;
    else delete next.fence;
  }
  if (formOf(prop) === "edge" && "at" in patch) {
    const to = isSide(patch.at) ? patch.at : prop.at;
    const taken = file.props?.some((p, i) => i !== index && formOf(p) === "edge" && edgeOf(p) === edgeId(prop.x, prop.y, to as Direction));
    if (!isSide(patch.at) || taken) next.at = prop.at;
  }
  if (!fenceEditing.spread || !("texture" in patch || "fence" in patch)) return;
  const look = (p: PropEntry) => JSON.stringify([p.texture ?? null, cleanFenceStyle(p.fence) ?? null]);
  const was = look(prop);
  for (const i of fenceRun(file, index)) {
    const mate = file.props![i];
    if (i === index || look(mate) !== was) continue;
    if ("texture" in patch) {
      if (patch.texture) mate.texture = patch.texture;
      else delete mate.texture;
    }
    if ("fence" in patch) {
      const clean = cleanFenceStyle(patch.fence);
      if (clean) mate.fence = structuredClone(clean);
      else delete mate.fence;
    }
  }
}

// the two cells of an edge piece (for the editor's messages and checks)
export const edgePieceCells = (p: PropEntry): [Vec2, Vec2] => edgeCells(edgeOf(p));
