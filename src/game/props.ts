import type { GameMap, PropAnchor, PropSpec, Vec2 } from "./types";
import { ROOF_SHAPES, roofShapeRise, type RoofPieceId, type RoofSegment, type RoofShape, type RoofSide } from "./roofPieces";
import { fenceBoxes, fenceClosesCell, fenceIndex, type FenceForm } from "./fences";

// 3D props standing in walkable cells (crates, beds, ...), textured like the
// walls. They sit pushed against a side or a corner of their cell. Small
// ones let the party pass (grid movement ignores them; free movement
// collides with their footprint); big ones (`blocks`) close their cell to
// grid movement too.

// Box parts in the prop's own space: x along its length, y up from the
// floor, z across (+z = the front, the side its front view shows).
export interface PropPart {
  min: [number, number, number];
  max: [number, number, number];
  // "cylinder": an upright round part filling the box (its side wrapped in
  // the front and side views - front and back from the front view, the
  // ends from the side view - its top from the top view)
  shape?: "box" | "cylinder";
  // where each view shows it, when that's not where it stands: its faces
  // there cut from this box's place in that view instead (only the view's
  // own two axes count)
  src?: Partial<Record<PropView, { min: [number, number, number]; max: [number, number, number] }>>;
  // the faces left out
  off?: PropFace[];
}
export type PropView = "front" | "side" | "top";
// front: +z (the front view), back: -z (it mirrored), right: +x (the side
// view), left: -x (it mirrored), top (the top view)
export type PropFace = "front" | "back" | "right" | "left" | "top";

export type PropType = {
  name?: string;
  elevation?: number;
  // Floor contact shadow strength (0–1) for prisms, panels, crosses and billboards.
  shadow?: number;
  // extent (cells; height in wall heights): x length, y height, z depth
  size: [number, number, number];
  blocks?: boolean;
  // mounted on (or standing against) a wall: pushed toward a side of its
  // cell, it turns to face away from that wall, into the room
  wall?: boolean;
  // its relief's depth, relative to props' usual (softer for fabric)
  relief?: number;
  // Optional depth multiplier for a prop's smooth mesh.
  smoothRelief?: number;
  // its normal maps' strength, relative to the viewer's (Normal strength)
  normal?: number;
  // something to loot (see items.ts): the loot table its contents are
  // rolled from, unless the map puts some in by hand (PropSpec.loot)
  container?: string;
  // a flame burning on it (a torch): putting the prop in the map editor puts a
  // decorative fire in with it, `up` wall heights above the floor, at the side
  // it hangs on (taking the prop out takes the fire too)
  flame?: { up: number };
} & (
  | {
      // a relief box: `side` texture set on its four sides, `top` on top
      kind: "box";
      side: string;
      top: string;
    }
  | {
      // box parts projection-textured from orthographic views: texture
      // sets <views>_front (looking at +z's side, x to the right), _side
      // (looking from +x, the front to the left) and _top (from above, x to
      // the right, the front at the bottom), each covering the whole
      // extent
      kind: "views";
      views: string;
      parts: PropPart[];
      // how high above the floor it's mounted (wall heights); the parts'
      // y stays relative to the views
      elevation?: number;
      // the views' pixel sizes (npm run props:views prints them): each view
      // then covers its own extent at the front view's scale - an AI view
      // sheet rarely draws the side and top exactly as big as the front
      px?: { front: [number, number]; side: [number, number]; top: [number, number] };
    }
  | {
      // a walk-in box (a shower cabin) seen into through its front: a
      // cutout `door` (its glass see-through, with a pane of glass behind
      // it), the `inside` of its back wall, and <views>_side / _top outside
      kind: "cabin";
      door: string;
      inside: string;
      views: string;
    }
  | {
      // one upright relief cutout (its texture's transparent pixels left
      // out), `size` wide and tall, its bottom `elevation` above the floor,
      // facing +z - a curtain before a window, a picture on a stand; seen
      // from both sides
      kind: "panel";
      texture: string;
      elevation?: number;
    }
  | {
      // one flat picture that always turns to face the viewer (like the robots'
      // sprites, with one view): a tree. `texture`: a folder under
      // public/textures/ with its diffuse.png and normal.png (texture:process
      // --key ff00ff --trim); `size`: its width, height and (for the footprint)
      // depth
      kind: "billboard";
      texture: string;
    }
  | {
      // two such cutouts crossed at right angles (a potted plant): it reads
      // as solid from any side
      kind: "cross";
      texture: string;
    }
  | {
      kind: "prism";
      texture: string;
      textureB?: string;
      sides?: number;
      inset?: number;
      // how many sides one copy of the texture stretches across (0/unset: a full copy on every face)
      wrap?: number;
    }
  | {
      // a square pillar from the floor to the ceiling (whatever the cell's
      // height), widening at its foot and head like a door's jamb: `size`
      // x and z are the foot's width, `shaft` the width between, `flare`
      // how tall the foot and head blocks stand (cells) below and above
      // their 45 degree slopes; textured with `texture`, else the deck's
      // wall set
      kind: "pillar";
      shaft: number;
      flare: number;
      texture?: string;
      // a fixed height (wall heights) instead of the room's, with a stone top to
      // stand things on (a pedestal: a magic fire, a loose item)
      height?: number;
    }
  | {
      // a 45 degree wall across a corner of its cell (at a corner anchor),
      // from the floor to the ceiling, `cut` of the cell off each side it
      // meets - in the cell's wall texture. Decoration: the cell stays
      // walkable (its center in front of it).
      kind: "chamfer";
      cut: number;
    }
  | {
      // a roof piece filling its cell, for building houses on raised ground
      // (put it on a riser block's top; stack the next piece with `Height`).
      // `profile` is its side view from the eave (the low edge, at the
      // piece's front, +z): 45 degree slopes and flat stretches, each `run`
      // cells long (what the profile doesn't cover is flat). `corner` makes
      // two of them meet: "outer" (a hip: eaves at the front and the left,
      // the slopes rising to the back and the right, meeting in a diagonal
      // ridge) or "inner" (a valley: eaves at the front and the right).
      // Textured with `texture` (a wall-kind set; PropSpec.texture picks
      // another per placement), else the deck's wall set. Decoration: it
      // never blocks (it hangs over the cell, above head height).
      // `eaves`: instead of `corner`, eaves on several sides (a ridge, a half pyramid, a pyramid)
      kind: "roof";
      profile: RoofSegment[];
      corner?: "outer" | "inner";
      eaves?: RoofSide[];
      texture?: string;
    }
  | {
      // a fence or block piece (see fences.ts): a block that closes its cell, a fence along one edge of it, or
      // one through its middle. The piece's model comes from the fence tools' settings (PropSpec.fence,
      // PropSpec.texture) and its neighbours; `size` is only a nominal one.
      kind: "fence";
      form: FenceForm;
    }
  | {
      // a lever, button, pressure plate, trap cell or wall trap (see operables.ts): drawn from plain boxes in
      // render/operableModel.ts, with a pose that follows its state (a lever down, a button sunk, a plate pressed).
      // `elevation` (above) is how high it hangs; a plate and a trap cell lie flat on their cell's floor.
      kind: "operable";
      model: OperableModel;
    }
);
export type OperableModel = "lever" | "button" | "plate" | "trapcell" | "slit" | "glyph";
// the models that lie on the floor, filling their cell (the party walks over them)
export const FLOOR_OPERABLES: readonly OperableModel[] = ["plate", "trapcell"];
export const isFloorOperable = (type: PropType | undefined) => type?.kind === "operable" && FLOOR_OPERABLES.includes(type.model);

// (the roof pieces' shapes live in roofPieces.ts, loadable without the build)
export type { RoofSegment } from "./roofPieces";
export { ROOF_THICKNESS } from "./roofPieces";
function roof(id: RoofPieceId): PropType {
  const shape: RoofShape = ROOF_SHAPES[id];
  // (the height is the rise: stacking the next piece on it puts its surface
  // level with this one's far edge)
  return { kind: "roof", size: [1, roofShapeRise(shape), 1], profile: [...shape.profile], corner: shape.corner, ...(shape.eaves ? { eaves: [...shape.eaves] } : {}) };
}

// Parts are measured off the views (see npm run props:views): x across the
// front view, y up it, z across the side view (+z = the front).
export const PROP_TYPES: Record<string, PropType> = {
  crate1: { kind: "box", size: [0.5, 0.4, 0.5], side: "crate1", top: "crate1_top", container: "crate" },
  // a hospital bed, headboard at -x; parts measured off its front view
  medbed1: {
    kind: "views",
    views: "medbed1",
    size: [0.9, 0.37, 0.4],
    blocks: true,
    parts: [
      // headboard posts and panel, footboard
      { min: [-0.45, 0, -0.2], max: [-0.387, 0.37, 0.2] },
      { min: [-0.387, 0, -0.2], max: [-0.33, 0.32, 0.2] },
      { min: [0.387, 0, -0.2], max: [0.45, 0.293, 0.2] },
      // frame, mattress and legs; the pillow on top
      { min: [-0.33, 0, -0.2], max: [0.387, 0.241, 0.2] },
      { min: [-0.35, 0.241, -0.116], max: [-0.22, 0.276, 0.12] },
    ],
  },

  // crew quarters
  crewbed1: {
    kind: "views",
    views: "crewbed1",
    size: [0.9, 0.376, 0.47],
    blocks: true,
    wall: true,
    parts: [
      // headboard; frame, mattress, pillow and blanket
      { min: [-0.45, 0, -0.235], max: [-0.37, 0.376, 0.235] },
      { min: [-0.37, 0, -0.235], max: [0.45, 0.3, 0.235] },
    ],
  },
  table1: {
    kind: "views",
    views: "table1",
    size: [0.5, 0.384, 0.41],
    blocks: true,
    px: { front: [562, 432], side: [463, 437], top: [536, 523] },
    parts: [
      // foot, pedestal, top (its edge band), and the mug on it
      { min: [-0.14, 0, -0.14], max: [0.14, 0.092, 0.14] },
      { min: [-0.035, 0.092, -0.035], max: [0.035, 0.25, 0.035] },
      { min: [-0.245, 0.25, -0.2], max: [0.245, 0.3, 0.2] },
      { min: [-0.155, 0.3, -0.14], max: [-0.07, 0.384, -0.03] },
    ],
  },
  foldtable1: {
    kind: "views",
    views: "foldtable1",
    size: [0.7, 0.262, 0.4],
    wall: true,
    elevation: 0.12,
    parts: [
      // wall plate, table top, brackets
      { min: [-0.22, 0, -0.2], max: [0.22, 0.262, -0.17] },
      { min: [-0.35, 0.162, -0.17], max: [0.35, 0.192, 0.2] },
      { min: [-0.3, 0, -0.17], max: [-0.22, 0.162, 0.1] },
      { min: [0.22, 0, -0.17], max: [0.3, 0.162, 0.1] },
    ],
  },
  shelf1: {
    kind: "views",
    container: "crate",
    views: "shelf1",
    size: [0.7, 0.415, 0.26],
    wall: true,
    elevation: 0.4,
    parts: [{ min: [-0.35, 0, -0.13], max: [0.35, 0.415, 0.13] }],
  },
  shower1: {
    kind: "cabin",
    views: "shower1",
    door: "shower1_door",
    inside: "shower1_inside",
    size: [0.5, 0.91, 0.42],
    blocks: true,
    wall: true,
  },
  kitchen1: {
    kind: "views",
    views: "kitchen1",
    size: [0.9, 0.614, 0.32],
    blocks: true,
    wall: true,
    px: { front: [739, 504], side: [263, 552], top: [744, 315] },
    parts: [
      // cabinets with the counter; microwave; kettle
      { min: [-0.45, 0, -0.109], max: [0.45, 0.43, 0.16] },
      { min: [-0.063, 0.43, -0.109], max: [0.27, 0.614, 0.08] },
      { min: [0.297, 0.43, -0.05], max: [0.405, 0.565, 0.06] },
    ],
  },
  curtain_closed: {
    kind: "panel",
    texture: "curtain_closed",
    size: [0.85, 0.75, 0.04],
    wall: true,
    elevation: 0.12,
    relief: 0.3,
  },
  curtain_open: { kind: "panel", texture: "curtain_open", size: [0.85, 0.75, 0.04], wall: true, elevation: 0.12, relief: 0.3 },
  // the fantasy gate's portcullis as a free-standing iron fence: it fills the
  // cell (the bars' gaps are transparent) and closes it to walking
  fence1: { kind: "panel", texture: "fantasygate1", size: [1, 1, 0.08], blocks: true },
  // the fantasy doorway's stone arch, standing free: its opening is walkable
  arch1: { kind: "panel", texture: "fantasydoorframe1", size: [1, 1, 0.08] },
  plant1: { kind: "cross", texture: "plant1", size: [0.3, 0.58, 0.3] },
  // a big oak (two crossed cutouts): it stands taller than a room is high, so
  // use it in the open (a sky ceiling)
  tree1: { kind: "cross", texture: "fantasytree1", size: [1, 1.33, 1], blocks: true, smoothRelief: 5 },
  // a tall pine: one picture that always faces the viewer (a billboard)
  pine1: { kind: "billboard", texture: "fantasypine1", size: [0.9, 1.97, 0.3], blocks: true },
  // billboard bushes, a barrel and a dead tree (one picture facing the viewer)
  bush1: { kind: "billboard", texture: "fantasy_bokor_kerek", size: [0.7, 0.56, 0.3] },
  bush2: { kind: "billboard", texture: "fantasy_bokor_bogyos", size: [0.7, 0.54, 0.3] },
  fern1: { kind: "billboard", texture: "fantasy_bokor_pazsit", size: [0.8, 0.43, 0.3] },
  barrel1: { kind: "billboard", texture: "fantasybarrel1", size: [0.4, 0.49, 0.4], blocks: true },
  deadtree1: { kind: "billboard", texture: "fantasydeadtree1", size: [0.9, 1.4, 0.3], blocks: true },
  // a broad, gnarled one with the roots showing
  tree2: { kind: "cross", texture: "fantasytree2", size: [1.1, 1.15, 1.1], blocks: true, smoothRelief: 5 },
  // a strip curtain over a duct's mouth (the low corridors the cleaning
  // drones use): as wide as the cell, as tall as the lowest corridor - on
  // the room's side of the wall the duct opens in
  blinds1: { kind: "panel", texture: "blinds1", size: [1, 0.27, 0.03], wall: true, relief: 0.4 },
  // pillars: a slim one and a heavy one (their height: the cell's)
  pillar1: { kind: "pillar", size: [0.26, 1, 0.26], shaft: 0.16, flare: 0.1 },
  pillar2: { kind: "pillar", size: [0.42, 1, 0.42], shaft: 0.28, flare: 0.14 },
  // an iron wall torch (unlit: the fire is a separate flame/light)
  torch1: { kind: "panel", texture: "fantasytorch1", size: [0.1, 0.3, 0.08], wall: true, elevation: 0.5, relief: 1, flame: { up: 0.82 } },
  // a pedestal: a short pillar of a fixed height, flat on top, for a fire or an item
  pedestal1: { kind: "pillar", size: [0.34, 1, 0.34], shaft: 0.27, flare: 0.07, height: 0.4 },
  // corner cuts: half the cell's sides, and more of them
  chamfer1: { kind: "chamfer", size: [0.5 * Math.SQRT2, 1, 0.02], cut: 0.5, wall: true },
  chamfer2: { kind: "chamfer", size: [0.7 * Math.SQRT2, 1, 0.02], cut: 0.7, wall: true },
  // roofs (see PropType "roof"): a 45 degree slope across the cell; a slope
  // that bends into a flat half; the flat top; the outer (hip) and inner
  // (valley) corners, each also with the bend
  roof_slope: roof("roof_slope"),
  roof_slope_flat: roof("roof_slope_flat"),
  roof_flat: roof("roof_flat"),
  roof_corner: roof("roof_corner"),
  roof_corner_flat: roof("roof_corner_flat"),
  roof_inner: roof("roof_inner"),
  roof_inner_flat: roof("roof_inner_flat"),
  // eaves on several sides (a gable's ridge, a hipped end, a pyramid cap); 0.5 high
  roof_ridge: roof("roof_ridge"),
  roof_hipend: roof("roof_hipend"),
  roof_pyramid: roof("roof_pyramid"),
  // fences and blocks (see fences.ts; the fence tools place them, one piece to a cell or an edge)
  fence_block: { kind: "fence", form: "block", size: [1, 1, 1], blocks: true },
  fence_edge: { kind: "fence", form: "edge", size: [1, 1, 0.1] },
  fence_mid: { kind: "fence", form: "mid", size: [1, 1, 0.1], blocks: true },
  // operables (see operables.ts OPERABLE_PROPS): a wall lever and button, a floor plate and a hidden trap cell, and the
  // wall traps they set off - an arrow slit and a spell glyph
  lever1: { kind: "operable", model: "lever", size: [0.16, 0.3, 0.1], wall: true, elevation: 0.35 },
  button1: { kind: "operable", model: "button", size: [0.14, 0.14, 0.06], wall: true, elevation: 0.4 },
  plate1: { kind: "operable", model: "plate", size: [0.62, 0.05, 0.62] },
  trapcell1: { kind: "operable", model: "trapcell", size: [0.9, 0.02, 0.9] },
  arrowslit1: { kind: "operable", model: "slit", size: [0.3, 0.24, 0.06], wall: true, elevation: 0.45 },
  glyph1: { kind: "operable", model: "glyph", size: [0.36, 0.36, 0.04], wall: true, elevation: 0.35 },
};

// The prop editor's saves (see src/editor/PropEditor.tsx): src/props/<name>.json
// holds a prop's size, relief and normal strength - and a views prop's view
// sizes, elevation and boxes - over the ones above, which are only its
// first draft.
export interface PropEdit {
  size: [number, number, number];
  relief?: number;
  normal?: number;
  parts?: PropPart[];
  px?: { front: [number, number]; side: [number, number]; top: [number, number] };
  elevation?: number;
}
// (a pillar's and a chamfer's sizes are their shape's: not edited)
export function propEditable(type: PropType | undefined): boolean {
  return !!type && type.kind !== "pillar" && type.kind !== "chamfer" && type.kind !== "roof" && type.kind !== "fence" && type.kind !== "operable";
}
const EDITS = import.meta.glob<PropEdit>("../props/*.json", { eager: true, import: "default" });
for (const [file, edit] of Object.entries(EDITS)) {
  const type = PROP_TYPES[file.slice("../props/".length, -".json".length)];
  if (!propEditable(type)) continue;
  const { parts, px, ...common } = edit;
  Object.assign(type, common);
  if (type.kind === "views") Object.assign(type, parts ? { parts } : {}, px ? { px } : {});
}

// the corner a chamfer cuts (any other anchor: the nearest corner)
const CHAMFER_CORNER: Record<PropAnchor, "NE" | "NW" | "SE" | "SW"> = {
  NE: "NE",
  NW: "NW",
  SE: "SE",
  SW: "SW",
  N: "NE",
  E: "SE",
  S: "SW",
  W: "NW",
  center: "NE",
};
// its turn: facing the cell's center (0: facing south, clockwise)
const CHAMFER_YAW = { NE: 45, SE: 135, SW: 225, NW: 315 };

// the texture sets a prop can wear instead of its own (see
// PropSpec.texture): only the one-texture kinds
export function propRetexturable(type: PropType): boolean {
  return type.kind === "box" || type.kind === "pillar" || type.kind === "chamfer" || type.kind === "panel" || type.kind === "cross" || type.kind === "prism" || type.kind === "roof" || type.kind === "fence";
}

// Props are small: their relief usually starts shallower than the walls'.
export const PROP_RELIEF_SCALE = 0.6;

export function propReliefAmount(depth: number, type: PropType, smooth: boolean): number {
  return depth * PROP_RELIEF_SCALE * (type.relief ?? 1) * (smooth ? type.smoothRelief ?? 1 : 1);
}

export function propReliefCells(type: PropType): number {
  return type.smoothRelief ? 48 : 32;
}

// How tall a prop stands in its cell (wall heights): a pillar reaches the ceiling.
export const isSharedPropId = (id: string) =>
  /^(scifi|fantasy)_prop_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);

export type EditableProp = Extract<PropType, { kind: "panel" | "billboard" | "cross" | "prism" }>;

export function propHeight(map: Pick<GameMap, "floorHeights" | "ceilingHeights">, spec: PropSpec, type = PROP_TYPES[spec.prop]): number {
  if (!type) return 0;
  // (the heights read here, not through map.ts: it imports this module)
  const { x, y } = spec.cell;
  if (type.kind === "pillar" && type.height) return type.height;
  if (type.kind === "pillar" || type.kind === "chamfer") return (map.ceilingHeights[y]?.[x] ?? 1) - (map.floorHeights[y]?.[x] ?? 0);
  return type.size[1];
}

// kept free between a prop and the walls it's pushed against (its relief
// sticks out a little past its footprint)
const WALL_GAP = 0.04;

const ANCHOR_VECTOR: Record<PropAnchor, [number, number]> = {
  center: [0, 0],
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
  NE: [1, -1],
  NW: [-1, -1],
  SE: [1, 1],
  SW: [-1, 1],
};

export interface PropPlacement {
  // center of its footprint, world grid units
  x: number;
  z: number;
  // yaw in radians (clockwise seen from above, like the spec's degrees)
  yaw: number;
  // half extents of the axis-aligned box around its turned footprint
  reachX: number;
  reachZ: number;
  type: PropType;
}

// the turn (degrees) that makes a wall prop face away from the wall it's
// pushed against (its front is +z, south, unturned)
const WALL_FACING: Partial<Record<PropAnchor, number>> = { N: 0, NE: 0, NW: 0, S: 180, SE: 180, SW: 180, E: 90, W: 270 };

export function propPlacement(spec: PropSpec, type: PropType = PROP_TYPES[spec.prop] ?? { kind: "panel", texture: "", size: [0, 0, 0] }): PropPlacement {
  // a fence piece's model is laid out round its cell's middle (see fences.ts): it is put there whatever its anchor
  if (type.kind === "fence") return { x: spec.cell.x, z: spec.cell.y, yaw: 0, reachX: 0.5, reachZ: 0.5, type };
  // a floor plate or trap cell lies in the middle of its cell, whatever anchor it was put at
  if (isFloorOperable(type)) return { x: spec.cell.x, z: spec.cell.y, yaw: ((spec.rotation ?? 0) * Math.PI) / 180, reachX: type.size[0] / 2, reachZ: type.size[2] / 2, type };
  if (type.kind === "chamfer") {
    // its middle halfway along the cut, flush with the walls it meets
    // (nudged and turned from there as any prop)
    const corner = CHAMFER_CORNER[spec.at];
    const [ax, az] = ANCHOR_VECTOR[corner];
    const reach = type.cut / 2;
    const [ox, oz] = spec.offset ?? [0, 0];
    const yaw = ((CHAMFER_YAW[corner] + (spec.rotation ?? 0)) * Math.PI) / 180;
    const half = (Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw))) * (type.size[0] / 2);
    return {
      x: spec.cell.x + ax * (0.5 - reach) + ox,
      z: spec.cell.y + az * (0.5 - reach) + oz,
      yaw,
      reachX: Math.min(half, reach * 2),
      reachZ: Math.min(half, reach * 2),
      type,
    };
  }
  const base = type.wall ? (WALL_FACING[spec.at] ?? 0) : 0;
  const yaw = ((base + (spec.rotation ?? 0)) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  const scale = spec.scale ?? 1;
  const [length, , depth] = type.size;
  const reachX = (scale * (cos * length + sin * depth)) / 2;
  const reachZ = (scale * (sin * length + cos * depth)) / 2;
  const [ax, az] = ANCHOR_VECTOR[spec.at];
  const [ox, oz] = spec.offset ?? [0, 0];
  return {
    x: spec.cell.x + ax * Math.max(0, 0.5 - reachX - WALL_GAP) + ox,
    z: spec.cell.y + az * Math.max(0, 0.5 - reachZ - WALL_GAP) + oz,
    yaw,
    reachX,
    reachZ,
    type,
  };
}

// where a prop's flame burns (see PropType.flame): relative to its cell's
// center, across, up (wall heights) and along - at the prop, wherever it is
// pushed, nudged or raised
export function flamePosition(spec: PropSpec): [number, number, number] | null {
  const flame = PROP_TYPES[spec.prop]?.flame;
  if (!flame) return null;
  const at = propPlacement(spec);
  return [Math.round((at.x - spec.cell.x) * 100) / 100, Math.round(((spec.elevation ?? 0) + flame.up) * 100) / 100, Math.round((at.z - spec.cell.y) * 100) / 100];
}

// footprints of the props in a cell (axis-aligned around their turn), with
// their heights above the cell's floor
export function propBoxes(map: GameMap, cx: number, cy: number) {
  const boxes = (map.props ?? [])
    // (a roof is decoration: it hangs over the cell, never in the way; a fence has boxes of its own, below; a plate is walked over)
    .filter((p) => p.cell.x === cx && p.cell.y === cy && PROP_TYPES[p.prop] && PROP_TYPES[p.prop].kind !== "roof" && PROP_TYPES[p.prop].kind !== "fence" && !isFloorOperable(PROP_TYPES[p.prop]))
    .map((p) => {
      const { x, z, reachX, reachZ } = propPlacement(p);
      return { minX: x - reachX, maxX: x + reachX, minZ: z - reachZ, maxZ: z + reachZ, height: (p.elevation ?? 0) + propHeight(map, p) };
    });
  // the fences and blocks in the cell and the edge fences round it (the bars of a mid fence, not its whole cell)
  const fences = fenceBoxes(fenceIndex(map.props), cx, cy);
  return fences.length ? [...boxes, ...fences.map(({ minX, maxX, minZ, maxZ, height }) => ({ minX, maxX, minZ, maxZ, height }))] : boxes;
}

// whether a big prop closes the cell to grid movement
export function propBlocks(map: GameMap, cell: Vec2): boolean {
  // (a fence piece closes its cell when the fence index says so: a block, a solid mid fence - not foliage bodies walk through)
  if (fenceClosesCell(fenceIndex(map.props), cell.x, cell.y)) return true;
  return (map.props ?? []).some((p) => p.cell.x === cell.x && p.cell.y === cell.y && PROP_TYPES[p.prop]?.blocks && PROP_TYPES[p.prop].kind !== "fence");
}
