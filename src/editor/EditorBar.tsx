import type { SmokeSpec, Weather } from "../game/types";
import { t, type Key } from "../i18n";
// The map editor's props and info types, the tool labels and the tool help
// line. The old top bar is gone: tools live in the floating strip (FloatToolbar)
// and the asset tree (AssetTree); this file keeps what they share.

import type { Lock } from "../game/story";
import type { ActorWake } from "../game/types";

import type { TextureSetId } from "../render/textureSets";
import type { ViewportSettings } from "../components/GameViewport";
import type { SharedMapHead } from "./sharedMapHeads";
import type { EditSurface, EditTool } from "./mapEdits";
import type { Direction, LightEffect, Linked, MapLight, MapLinkTarget } from "../game/types";
import type { RoofForm } from "../game/roofAutotile";

export interface MapLook {
  weather?: Weather;
  lightGridDensity?: number;
  lightGridAmbient?: number;
  reliefDepth?: number;
  // the deck's default texture sets (see MapFile.textures)
  textures?: Record<string, string | undefined>;
  // the deck's accent hue (see GameMap.accent)
  accent?: { hue: number; range?: number };
  // the "Place – Name" caption on entering (undefined: by default, on when the map has a place)
  showTitle?: boolean;
}
// what a prop can wear (see PropSpec.texture): the wall and prop face sets
// (a box's top comes with its side)

// the deck's default texture sets: the slot, and which sets are offered for it

import type { Interaction } from "../game/interactions";
import type { WorldId } from "../game/worlds";

export interface EditorBarProps {
  eventKind: Interaction["kind"];
  onEventKind: (kind: Interaction["kind"]) => void;
  selectedEvent?: Interaction;
  onEventChange: (event: Interaction, merge?: string) => void;
  onEventRemove: () => void;
  eventWorld: WorldId;
  assetDock?: HTMLElement | null;
  onAssetEffect: (kind: "smoke" | "light", effect: string | undefined) => void;
  // an element to draw the toolbar into (the right column) instead of over
  // the top of the view
  dock?: HTMLElement | null;
  tool: EditTool;
  onTool: (tool: EditTool) => void;
  // the Texture tool: the surface the pointer is on (its row is marked),
  // and the set each surface is painted with (null: the map's own)
  surface: EditSurface;
  paint: Record<EditSurface, TextureSetId | null>;
  onPaint: (surface: EditSurface, setId: TextureSetId | null) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  unsaved: boolean;
  onSave: () => void;
  onDownload: () => void;
  onExit: () => void;
  // the layers hidden from the view, and hiding or showing one (the tool's)
  hiddenLayers: ReadonlySet<string>;
  onToggleLayer: (layer: string) => void;
  // the layers locked from picking and editing in the view (they stay visible)
  lockedLayers: ReadonlySet<string>;
  onToggleLayerLock: (layer: string) => void;
  // the Prop tool: the prop a click puts in, and its turn (degrees)
  propChoice: string;
  onPropChoice: (prop: string) => void;
  propRotation: number;
  onPropRotate: () => void;
  // the Roof tool: the form it roofs in (see roofAutotile.ts)
  roofForm: RoofForm;
  onRoofForm: (form: RoofForm) => void;
  // the texture set the Roof tool's new pieces wear ("": the roof piece's own)
  roofTexture: string;
  onRoofTexture: (texture: string) => void;
  // the Robot tool: the actor type a click puts in, and the selected actor
  robotChoice: string | null;
  onRobotChoice: (type: string) => void;
  actor: ActorInfo | null;
  onActorChange: (patch: { actor?: string; facing?: Direction; chance?: number; wake?: ActorWake; friendly?: boolean; dialogue?: { library: string; entry: string }; portrait?: string; shop?: string; greeting?: string } & Linked, merge?: string) => void;
  onActorClearRoute: () => void;
  onActorDelete: () => void;
  onActorDeselect: () => void;
  // the Door tool: the selected door, and what the panel does with it
  door: DoorInfo | null;
  doorWorld: WorldId;
  doorTypeChoice?: string;
  onDoorTypeChoice: (id?: string) => void;
  onDoorChange: (patch: { kind?: "standard" | "lift"; type?: string; offset?: number; label?: string; chance?: number; lock?: Lock } & Linked, merge?: string) => void;
  onDoorFlip: () => void;
  onDoorDelete: () => void;
  onDoorDeselect: () => void;
  // the Map tool: this map (its id and size), the others, and what the
  // panel does - grow or cut an edge, open another map, make one, copy this
  mapId: string;
  mapSize: { width: number; height: number };
  mapIds: string[];
  onResize: (edge: Direction, grow: boolean) => void;
  onOpenMap: (id: string) => void;
  // a shared head shown in the map picker (when automatic loading is on)
  onOpenSharedMap?: (head: SharedMapHead) => void;
  onNewMap: () => void;
  onSaveMapAs: () => void;
  onRenameMap: () => void;
  // how the map is drawn (see MapFile.lightGridDensity; undefined: the
  // viewer's default)
  mapLook: MapLook;
  onMapLook: (patch: MapLook, merge?: string) => void;
  // the render values saved with the map (see renderLook.ts): the viewer's
  // current ones, their changes, and writing them into or clearing them from
  // the map
  renderSettings: ViewportSettings;
  onRenderSettings: (settings: ViewportSettings) => void;
  mapHasRender: boolean;
  onSaveRender: () => void;
  onClearRender: () => void;
  // the Decal tool: the decal a click puts on, the turn it gets, and the
  // selected one
  decalChoice: string | null;
  onDecalChoice: (choice: DecalChoice) => void;
  decalRotation: number;
  decal: DecalInfo | null;
  onDecalChange: (patch: { rotation?: number; scale?: number; chance?: number; action?: string } & Linked, merge?: string) => void;
  onDecalDelete: () => void;
  onDecalDeselect: () => void;
  // the selected prop, and what the panel does with it
  prop: PropInfo | null;
  onPropChange: (patch: { prop?: string; rotation?: number; elevation?: number; scale?: number; chance?: number; texture?: string } & Linked, merge?: string) => void;
  // every item's name in the map (see Linked), for the link fields
  linkIds: string[];
  // the Smoke tool: the picked emitter
  smoke: SmokeInfo | null;
  onSmokeChange: (
    patch: {
      effect?: SmokeSpec["effect"];
      mistStyle?: SmokeSpec["mistStyle"];
      sprite?: string;
      spread?: number;
      height?: number;
      density?: number;
      size?: number;
      color?: string;
      chance?: number;
      pos?: [number, number, number];
      blow?: { speed: number; yaw: number; pitch?: number };
      fire?: boolean;
      lightColor?: string;
      lightIntensity?: number;
      lightReach?: number;
      petals?: boolean;
      decorative?: boolean;
      opacity?: number;
      opacityDark?: number;
    } & Linked,
    merge?: string,
  ) => void;
  onSmokeDelete: () => void;
  onSmokeDeselect: () => void;
  // the Exit tool: the picked exit's name and, if it is a gate, where it leads
  exit: { name: string; to?: MapLinkTarget } | null;
  onExitChange: (patch: { name?: string; to?: MapLinkTarget }, merge?: string) => void;
  onExitRemove: () => void;
  onExitDeselect: () => void;
  // the Item tool: the item a click puts down, and the selected one
  itemChoice: string;
  onItemChoice: (item: string) => void;
  item: ItemInfo | null;
  onItemChange: (patch: { count?: number; elevation?: number; chance?: number; item?: string } & Linked, merge?: string) => void;
  onItemDelete: () => void;
  onItemDeselect: () => void;
  // the Chance wall tool: the picked one
  chanceWall: { chance: number; links: Linked } | null;
  onChanceWallChange: (patch: { chance?: number } & Linked, merge?: string) => void;
  onChanceWallRemove: () => void;
  onChanceWallDeselect: () => void;
  onPropStack: () => void;
  // a roof piece of the Roof tool: detach it from (or give it back to) the autotile, take the whole roof away
  onPropRoofDetach: (detached: boolean) => void;
  onPropRoofRemove: () => void;
  onPropDelete: () => void;
  onPropDeselect: () => void;
  // the Light tool: what a click places (see App), and the selected light
  lightPlace: LightPlace;
  onLightPlace: (place: LightPlace) => void;
  light: LightInfo | null;
  onLightChange: (patch: Partial<MapLight>, merge?: string) => void;
  onLightDelete: () => void;
  onLightDeselect: () => void;
  // the phone layout: at the bottom (the minimap and the menu take the top)
  compact?: boolean;
}

export type LightPlace = "ceiling" | "point";

// a decal picked in the palette, and its size in surface pixels (its image's)
export interface DecalChoice {
  name: string;
  width: number;
  height: number;
}

// the selected actor as the panel shows it
export interface ActorInfo {
  type: string;
  facing: Direction;
  chance: number;
  // how many cells its patrol route has (0: it stands)
  route: number;
  links: Linked;
  // waiting for the ship's alert (see ActorWake)
  wake?: ActorWake;
  // the Talk group: friendly (as set, else its type's default), what it says, its picture and shop
  friendly: boolean;
  dialogue?: { library: string; entry: string };
  portrait?: string;
  shop?: string;
  greeting?: string;
}

// a door's lock with a change: none once it has neither a key nor a hack

// the selected door as the panel shows it
export interface DoorInfo {
  // where it stands in its cell, toward its front (see DoorSpec.offset)
  offset: number;
  facing: Direction;
  kind: "standard" | "lift";
  type?: string;
  label: string;
  chance: number;
  links: Linked;
  // locked (see story.ts)
  lock?: Lock;
}

// the selected decal as the panel shows it
export interface DecalInfo {
  name: string;
  rotation: number;
  scale: number;
  // what touching it does (a lift button)
  action?: string;
  chance: number;
  links: Linked;
}

// a smoke emitter's `blow` as the map keeps it: none when it isn't blown,
// no pitch when it's level

// the selected smoke emitter as the panel shows it
export interface SmokeInfo {
  effect?: SmokeSpec["effect"];
  mistStyle?: SmokeSpec["mistStyle"];
  sprite?: string;
  spread?: number;
  effectHeight?: number;
  density: number;
  size: number;
  color: string;
  // its height above the floor, and its cell's floor-to-ceiling height
  height: number;
  roomHeight: number;
  // blown out: how fast (0: it just rises), which way (degrees from north)
  // and how far up from level (degrees)
  blow: { speed: number; yaw: number; pitch: number };
  // a fire (see fire.ts)
  fire: boolean;
  // its light: the color as shown (its own, else the usual one), and its
  // strength and reach as multipliers (see SmokeSpec)
  lightColor?: string;
  lightIntensity: number;
  lightReach: number;
  petals: boolean;
  // a fire that is only decoration: it doesn't burn
  decorative: boolean;
  opacity: number;
  opacityDark: number;
  chance: number;
  links: Linked;
}

// the selected loose item as the panel shows it
export interface ItemInfo {
  item: string;
  count: number;
  elevation: number;
  // its cell's floor-to-ceiling height
  roomHeight: number;
  chance: number;
  links: Linked;
}

// the selected prop as the panel shows it
export interface PropInfo {
  name: string;
  // the texture set it wears instead of its own, and whether it can
  texture?: string;
  retexturable: boolean;
  links: Linked;
  rotation: number;
  scale: number;
  elevation: number;
  // its cell's floor-to-ceiling height, and where a prop on it would stand
  roomHeight: number;
  top: number;
  chance: number;
  // a piece of an autotiled roof (see PropSpec.auto): its roof, and whether it's detached
  auto?: { group: string; detached: boolean };
}

// the selected light as the panel shows it
export interface LightInfo {
  color: string;
  intensity: number;
  range: number;
  // a free-standing one's spot in its cell (see MapLight.pos), and whether
  // its bulb shows in the game
  pos?: [number, number, number];
  bulb?: boolean;
  // its cell's floor-to-ceiling height (wall heights), the most it goes up
  roomHeight: number;
  // its chance to be there in a variation (see variation.ts)
  chance: number;
  effect?: LightEffect;
  links: Linked;
}

// an item's chance of being there in a variation (1: always - left out of
// the map file)

// the fields linking an item to others (see Linked): its name, and the one
// it's only there with / without (a list of the map's names to pick from)

// a labeled slider with its value, for the light panel

// what a click does with each tool (shown in the floating hint over the view)
export const TOOL_HELP: Partial<Record<EditTool, Key>> = {
  select: "editorBar.clickAnObjectToSelectItDrag",
  height: "editorBar.clickAFloorOrCeilingUp0",
  ladder: "editorBar.clickNearAFloorSEdgeOr",
  bridge: "editorBar.clickAFloorABridgeAcrossIt",
  door: "editorBar.clickAFloorADoorThereClick",
  robot: "editorBar.pickATypeThenClickAFloor",
  decal: "editorBar.clickAWallFloorOrCeilingThe",
  prop: "editorBar.clickAFloorNearASideOr",
  roofauto: "roofauto.help",
  smoke: "editorBar.clickAWallFloorOrAnythingSmoke",
  exit: "link.exitHelp",
  restricted: "editorBar.clickAFloorRestrictedShadedRedOn",
  start: "editorBar.clickAFloorThePartyStartsThere",
  item: "editorBar.clickAFloorOrATableBed",
  wall: "editorBar.clickAWallOrAFloorA",
};

const TOOL_LABELS: Partial<Record<EditTool, Key>> = {
  event: "events.group",
  ladder: "editorBar.ladder", bridge: "editorBar.bridge", door: "editorBar.door", prop: "editorBar.prop", roofauto: "roofauto.group", decal: "editorBar.decal",
  robot: "editorBar.npc", item: "editorBar.item", smoke: "editorBar.particles", exit: "editorBar.exit", start: "editorBar.start",
  restricted: "editorBar.restricted", wall: "editorBar.chanceWall", map: "editorBar.map",
};
export function editorToolLabel(tool: EditTool): string {
  if(tool==="select")return t("editorBar.select");
  if(tool==="dig" || tool==="fill")return t("editorBar.digFill");
  if(tool==="height")return t("editorBar.height");
  if(tool==="texture")return t("editorBar.texture");
  if(tool==="light")return t("editorBar.light");
  const label=TOOL_LABELS[tool];
  return label ? t(label) : tool;
}
