import type { MutableRefObject } from "react";
import { type ClickEvent, type InteractionTarget } from "../../game/interactions";
import type { LootSpill } from "../../game/items";
import type { Direction, GameMap, Vec2 } from "../../game/types";
import type { ActorState, BodyPart } from "../../game/actors";
import type { ShotResult, Weapon } from "../../game/combat";
import type { FreePose } from "../../game/freeMovement";
import type { PeekState } from "../../components/useViewControls";
import type { LiftRide, MapTransit } from "../../game/useGameState";
import { type DoorType } from "../../game/doorTypes";
import type { EditTool } from "../../editor/mapEdits";

import type { ViewportSettings } from "./settings";

export type ViewportRef<T> = { readonly current: T };

export interface ReliefStats {
  trianglesPerWall: number;
  levelCount: number;
  // levels came straight from the map's distinct grays
  baked: boolean;
}

// What the aiming overlay gets each frame: the enemies in reach, nearest
// first, with their body parts' rectangles (view pixels) and hit chances;
// and a way to shoot at a point of the view.
export interface AimTarget {
  id: number;
  name: string;
  distance: number;
  parts: { part: BodyPart; label: string; rect: [number, number, number, number]; chance: number }[];
}
export interface AimFrame {
  targets: AimTarget[];
  width: number;
  height: number;
  // the view's current magnification (1 = the normal field of view): a
  // weapon's sway, an angle, spans this many times more pixels
  zoom: number;
  shoot: (x: number, y: number) => ShotResult;
}

// What the aiming overlay has picked, for the camera: it turns to the
// target - framing it while a part is picked, then at the weapon's zoom
// (Weapon.aimZoom) for the mini-game.
export interface AimFocus {
  target: number | null;
  // the picked body part: its pixels light up on the sprite
  part: BodyPart | null;
  phase: "pick" | "aim";
}

// The kinds of thing the editor drags, and one step of a drag: what (its
// index in the map's list - a door by its cell), whether Ctrl copies it, the
// drag's first step, the drag (one undo step each), and for those that slide
// on a level (props on a floor, lights, robots, doors) where the spot they
// were grabbed by is taken to (world x, z); `drop`: a door let go of.
export type EditDragKind = "prop" | "decal" | "item" | "smoke" | "sound" | "light" | "actor" | "door";
export interface EditDrag {
  kind: EditDragKind;
  index: number;
  door?: Vec2;
  copy: boolean;
  first: boolean;
  id: number;
  at?: [number, number];
  drop?: boolean;
  // a door slid inside its cell, let go of: where it stands there now
  offset?: number;
}

// The map editor (see EDITOR.md): what the pointer is on - a wall to dig
// out (with the open cell it's dug from, whose face was pointed at), or the
// floor / ceiling of a cell to fill, paint or hang a light in.
export interface EditTarget {
  kind: "wall" | "floor" | "ceiling";
  cell: Vec2;
  from?: Vec2;
  // the Light tool: a hand-placed light pointed at (its index in the map's
  // lights - a free-standing one's bulb)
  light?: number;
  // where a free-standing light would go: just off the surface pointed at -
  // its cell and its MapLight.pos there
  spot?: { cell: Vec2; pos: [number, number, number] };
  // the Prop tool: the prop pointed at (its index in the map's props)
  prop?: number;
  // the Decal tool: the decal pointed at (its index in the map's decals)
  decal?: number;
  // the Door tool: the door pointed at (its cell)
  door?: Vec2;
  // the Robot tool: the actor pointed at (its index in the map's actors)
  actor?: number;
  // the Item tool: the loose item pointed at (its index in the map's items)
  item?: number;
  // the Smoke tool: the emitter pointed at (its index in the map's smokes)
  smoke?: number;
  // the Sound tool: the sound emitter's marker pointed at (its index in the map's sounds)
  sound?: number;
  // the point hit, exactly: its cell, and across, up (wall heights above
  // the cell's floor) and along from the cell's center - where an item goes
  point?: { cell: Vec2; pos: [number, number, number] };
  // the surface pointed at as a decal sees it (see DecalSpec): its cell and
  // side, and the point on it in surface pixels (0..255 across a panel;
  // from its top left, a wall's first panel)
  surfacePoint?: { cell: Vec2; surface: Direction | "floor" | "ceiling"; u: number; v: number };
  // where the pointer's ray met a floor or ceiling exactly (grid units: x, z): the fence tools say from it which
  // side of the cell was meant
  at?: [number, number];
  // The step face pointed at (kind is "floor" then: it isn't a wall to dig):
  // a riser (the side of a higher floor) or a header (a lower ceiling's
  // strip), addressed like a wall face - by the open cell it's seen from
  // (the lower floor's / higher ceiling's) and the side toward the other.
  face?: { cell: Vec2; side: Direction; part: "riser" | "header" };
}

export interface ViewportStats {
  // triangles actually drawn last frame (after culling), and draw calls
  renderedTriangles: number;
  drawCalls: number;
  // cells in sight (see updateSight)
  visibleCells: number;
  // frames per second, and the milliseconds a frame takes on average (over half a second)
  fps: number;
  frameMs: number;
  // null unless the relief wall type is active and built
  relief: ReliefStats | null;
}

export interface GameViewportProps {
  map: GameMap;
  doorPreview?: DoorType;
  pos: Vec2;
  dir: Direction;
  // the height stood at: the cell's floor, or a bridge (wall heights)
  elevation: number;
  // door cells ("x,y") that are open
  openDoors: ReadonlySet<string>;
  // a lift ride in progress: the cabin shakes, the shaft's lights sweep by
  ride?: LiftRide | null;
  // a change of map through a gate: the view fades to black, stays black while
  // the next map loads, then fades back in (see useGameState's startTransit);
  // its picture is the loading screen's
  transit?: MapTransit | null;
  // the deck's moving actors (drawn as sprites, see updateActors)
  actors?: readonly ActorState[];
  // a crewmate aiming this weapon: each frame fills aimFrameRef for the
  // aiming overlay
  aiming?: Weapon | null;
  // the whole crew down since (performance.now()): the view drops to the floor
  downAt?: number | null;
  // the ship's livery hue (see variation.ts accentOf; null: as painted)
  shipAccent?: number | null;
  aimFrameRef?: MutableRefObject<AimFrame | null>;
  aimFocusRef?: MutableRefObject<AimFocus | null>;
  // written here: how much of the party each hostile actor sees past cover
  partyCoverRef?: MutableRefObject<Map<number, number>>;
  // an interactive decal (DecalSpec.action) was clicked or tapped within
  // reach
  onTouch?: (action: string) => void;
  onInteraction?: (interaction: ClickEvent) => boolean;
  onEditInteraction?: (target: InteractionTarget | null, remove: boolean) => void;
  interactionUseRef?: MutableRefObject<(() => boolean) | null>;
  interactionOpen?: boolean;
  // the map editor is on: the cell under the pointer is highlighted, and a
  // click or tap edits it (`alt`: the right button)
  editMode?: boolean;
  // the top-down view was left: the cell at the middle of what it looked at (the party goes there)
  onTopdownExit?: (cell: Vec2) => void;
  // the editor's layers hidden from the view ("robot" for the NPCs, "smoke" for the
  // particles, "prop", "decal", "item") - drawing only, the map still has them
  hiddenLayers?: ReadonlySet<string>;
  // the editor's layers locked from picking and editing in the view - they stay
  // visible, and clicks pass through them to what is behind
  lockedLayers?: ReadonlySet<string>;
  // the tool the editor has picked: what the highlight says a click does
  editTool?: EditTool;
  onEdit?: (target: EditTarget, alt: boolean, shift: boolean, ctrl?: boolean) => void;
  // the Event tool's selected event: the target it is attached to
  selectedEvent?: InteractionTarget | null;
  // the Light tool's selected light (its index in the map's lights)
  selectedLight?: number | null;
  // the Prop tool's selected prop (its index in the map's props)
  selectedProp?: number | null;
  // the Decal tool's selected decal (its index in the map's decals)
  selectedDecal?: number | null;
  // the Door tool's selected door (its cell)
  selectedDoor?: Vec2 | null;
  // the selected gate or staircase (its cell): framed in the view
  selectedLink?: Vec2 | null;
  // the Robot tool's selected actor (its index in the map's actors)
  selectedActor?: number | null;
  // the Item tool's selected item (its index in the map's items)
  selectedItem?: number | null;
  // the Smoke tool's selected emitter (its index in the map's smokes)
  selectedSmoke?: number | null;
  // the Sound tool's selected sound emitter (its index in the map's sounds)
  selectedSound?: number | null;
  // the sound emitter (its index) the editor's Listen button plays - the only one heard while editing
  previewSound?: number | null;
  // the surface under the pointer whenever it changes - the editor's
  // texture palette follows it
  onEditHover?: (target: EditTarget | null) => void;
  // an area being pasted (see editor/useAreaClipboard): its size in cells - its outline lies on the floor with its
  // top-left corner on the cell pointed at
  areaGhost?: { w: number; h: number } | null;
  // The editor: something dragged (see App and EditDrag). The first call may
  // copy it (Ctrl held); it returns the index of what is being dragged from
  // then on - for a door dropped, whether the map took it.
  onEditDrag?: (drag: EditDrag, target: EditTarget) => number | boolean | void;
  // The editor, Roof tool: a stroke painting (or, `erase`, taking off) cells - called for each new
  // cell the pointer reaches while a button is held; `first` the stroke's first, `id` the same
  // all along it (one undo step)
  onEditPaint?: (target: EditTarget, stroke: { id: number; first: boolean; erase: boolean; shift: boolean; ctrl: boolean }) => void;
  // The editor: the wheel (or Alt+drag) over the view raises, scales or turns the
  // selected prop or decal by a step
  onEditAdjust?: (adjust: { what: "height" | "scale" | "rotate"; delta: number }) => void;
  // a map's scene is fully built and shown (after the loading screen)
  onReady?: (mapId: string) => void;
  // free movement: called every frame with the frame time (s), returns the
  // camera pose; when absent the camera follows pos/dir on the grid
  freeTick?: (dt: number) => FreePose;
  // grid movement: glance-around yaw offset (see useViewControls); eased
  // back to 0 here once its input goes idle
  peekRef?: MutableRefObject<PeekState>;
  settings: ViewportSettings;
  onStats?: (stats: ViewportStats) => void;
  // loot (see useGameState): the containers emptied and the loose items
  // taken (indices in map.props / map.items), and the spills to show
  lootedProps?: ReadonlySet<number>;
  takenItems?: ReadonlySet<number>;
  spills?: readonly LootSpill[];
}
