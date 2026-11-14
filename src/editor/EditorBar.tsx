import { EffectFields } from "./EffectFields";
import { WeatherFields } from "./WeatherFields";
import type { SmokeSpec, Weather } from "../game/types";
import { t, formatNumber, type Key } from "../i18n";
// The map editor's toolbar, over the top of the game view while editing
// (see EDITOR.md): what a click or tap does - dig a wall out, fill a floor
// in (the right mouse button always fills), paint a surface with a texture
// set (its palette follows the surface under the pointer), or toggle a
// ceiling light - undo and redo, saving to disk (dev server only),
// downloading the file, and leaving edit mode. The Texture tool's palette
// has a row per surface, each with its own pick, so it never changes under
// the pointer on its way to it: a click paints the surface with its row's
// pick. The row of the surface under the pointer is marked.

import type { Lock } from "../game/story";
import type { ActorWake } from "../game/types";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TEXTURE_SETS, textureSetsOfKind } from "../render/textureSets";
import { assetInWorld } from "../game/worlds";
import { fetchDecalManifest } from "../render/decals";
import type { TextureSetId } from "../render/textureSets";
import type { EditSurface, EditTool } from "./mapEdits";
import type { Direction, LightEffect, Linked, MapLight } from "../game/types";
import { PROP_TYPES, propEditable } from "../game/props";
import { propEdit } from "./propEditState";
import { DOOR_EDGE_OFFSET } from "../game/map";
import { ACTOR_TYPES } from "../game/actors";
import { ITEM_TYPES } from "../game/items";

export interface MapLook {
  weather?: Weather;
  lightGridDensity?: number;
  lightGridAmbient?: number;
  reliefDepth?: number;
  // the deck's default texture sets (see MapFile.textures)
  textures?: Record<string, string | undefined>;
  // the deck's accent hue (see GameMap.accent)
  accent?: { hue: number; range?: number };
}
// what a prop can wear (see PropSpec.texture): the wall and prop face sets
// (a box's top comes with its side)
const PROP_TEXTURES = [...textureSetsOfKind("wall"), ...textureSetsOfKind("propFace")].filter((id) => !id.endsWith("_top"));
// the deck's default texture sets: the slot, and which sets are offered for it
const TEXTURE_SLOTS: { slot: string; label: Key; kind: "wall" | "floor" | "ceiling" | "door" | "window" }[] = [
  { slot: "wall", label: "editorBar.wall", kind: "wall" },
  { slot: "floor", label: "editorBar.floor", kind: "floor" },
  { slot: "ceiling", label: "editorBar.ceiling", kind: "ceiling" },
  { slot: "door", label: "editorBar.door", kind: "door" },
  { slot: "doorFrame", label: "editorBar.doorFrame", kind: "door" },
  { slot: "liftDoor", label: "editorBar.liftDoor", kind: "door" },
  { slot: "window", label: "editorBar.window", kind: "window" },
];
const DENSITIES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
const RELIEF_DEPTHS = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12];

interface Props {
  shared?: React.ReactNode;
  // an element to draw the toolbar into (the right column) instead of over
  // the top of the view
  dock?: HTMLElement | null;
  toolbarDock?: HTMLElement | null;
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
  // takes everything of the current tool's layer off the map (NPCs, particles, props...)
  onClearLayer: (tool: EditTool) => void;
  // the layers hidden from the view, and hiding or showing one (the tool's)
  hiddenLayers: ReadonlySet<string>;
  onToggleLayer: (layer: string) => void;
  // the Prop tool: the prop a click puts in, and its turn (degrees)
  propChoice: string;
  onPropChoice: (prop: string) => void;
  propRotation: number;
  onPropRotate: () => void;
  // the Robot tool: the actor type a click puts in, and the selected actor
  robotChoice: string | null;
  onRobotChoice: (type: string) => void;
  actor: ActorInfo | null;
  onActorChange: (patch: { facing?: Direction; chance?: number; wake?: ActorWake } & Linked) => void;
  onActorClearRoute: () => void;
  onActorDelete: () => void;
  onActorDeselect: () => void;
  // the Door tool: the selected door, and what the panel does with it
  door: DoorInfo | null;
  onDoorChange: (patch: { offset?: number; label?: string; chance?: number; lock?: Lock } & Linked) => void;
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
  onNewMap: () => void;
  onSaveMapAs: () => void;
  // how the map is drawn (see MapFile.lightGridDensity; undefined: the
  // viewer's default)
  mapLook: MapLook;
  onMapLook: (patch: MapLook) => void;
  // the Decal tool: the decal a click puts on, the turn it gets, and the
  // selected one
  decalChoice: string | null;
  onDecalChoice: (choice: DecalChoice) => void;
  decalRotation: number;
  decal: DecalInfo | null;
  onDecalChange: (patch: { rotation?: number; scale?: number; chance?: number; action?: string } & Linked) => void;
  onDecalDelete: () => void;
  onDecalDeselect: () => void;
  // the selected prop, and what the panel does with it
  prop: PropInfo | null;
  onPropChange: (patch: { rotation?: number; elevation?: number; scale?: number; chance?: number; texture?: string } & Linked) => void;
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
      petals?: boolean;
      decorative?: boolean;
    } & Linked,
  ) => void;
  onSmokeDelete: () => void;
  onSmokeDeselect: () => void;
  // the Exit tool: the picked exit's name
  exit: { name: string } | null;
  onExitName: (name: string | undefined) => void;
  onExitRemove: () => void;
  onExitDeselect: () => void;
  // the Item tool: the item a click puts down, and the selected one
  itemChoice: string;
  onItemChoice: (item: string) => void;
  item: ItemInfo | null;
  onItemChange: (patch: { count?: number; elevation?: number; chance?: number; item?: string } & Linked) => void;
  onItemDelete: () => void;
  onItemDeselect: () => void;
  // the Chance wall tool: the picked one
  chanceWall: { chance: number; links: Linked } | null;
  onChanceWallChange: (patch: { chance?: number } & Linked) => void;
  onChanceWallRemove: () => void;
  onChanceWallDeselect: () => void;
  onPropStack: () => void;
  onPropDelete: () => void;
  onPropDeselect: () => void;
  // the Light tool: what a click places (see App), and the selected light
  lightPlace: LightPlace;
  onLightPlace: (place: LightPlace) => void;
  light: LightInfo | null;
  onLightChange: (patch: Partial<MapLight>) => void;
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
}

// a door's lock with a change: none once it has neither a key nor a hack
function doorLock(lock: Lock | undefined, patch: Partial<Lock>): Lock | undefined {
  const next: Lock = { ...lock, ...patch };
  for (const key of Object.keys(next) as (keyof Lock)[]) if (next[key] === undefined) delete next[key];
  return next.key || next.hack || next.code ? next : undefined;
}

// the selected door as the panel shows it
export interface DoorInfo {
  // where it stands in its cell, toward its front (see DoorSpec.offset)
  offset: number;
  facing: Direction;
  kind: "standard" | "lift";
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
function smokeBlow(blow: { speed: number; yaw: number; pitch: number }) {
  if (!blow.speed) return undefined;
  return blow.pitch ? blow : { speed: blow.speed, yaw: blow.yaw };
}

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
  petals: boolean;
  // a fire that is only decoration: it doesn't burn
  decorative: boolean;
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

const BUTTON = "px-2 py-1 border rounded-sm text-[11px] disabled:opacity-30";

// The decals there are (public/decals/index.json), as thumbnails; a click
// picks one (with its image's size, which placing it needs).
function DecalPalette(p: { choice: string | null; onChoice: (choice: DecalChoice) => void; rotation: number }) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    fetchDecalManifest(import.meta.env.BASE_URL, "")
      .then((manifest) => live && setNames(Object.keys(manifest).filter((id) => assetInWorld(id))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 bg-black/60 px-2 py-1 rounded-sm max-w-[640px]">
      {names.map((name) => (
        <button
          key={name}
          type="button"
          title={name}
          className={`w-9 h-9 border flex items-center justify-center bg-neutral-900 ${
            p.choice === name ? "border-amber-400" : "border-neutral-700 hover:border-neutral-400"
          }`}
          onClick={(e) => {
            const img = e.currentTarget.querySelector("img");
            p.onChoice({ name, width: img?.naturalWidth || 64, height: img?.naturalHeight || 64 });
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}decals/${name}/diffuse.png`}
            alt={name}
            className="max-w-full max-h-full"
            style={{ imageRendering: "pixelated" }}
          />
        </button>
      ))}
      <span className="text-[10px] text-neutral-400 px-1">{t("editorBar.turnR", { v1: p.rotation })}</span>
    </div>
  );
}

// an item's chance of being there in a variation (1: always - left out of
// the map file)
function chanceSlider(value: number, onChange: (chance: number | undefined) => void) {
  return slider(t("editorBar.chance"), value, 0, 1, 0.05, (v) => onChange(v >= 1 ? undefined : v));
}

// the fields linking an item to others (see Linked): its name, and the one
// it's only there with / without (a list of the map's names to pick from)
function linkFields(links: Linked, ids: string[], onChange: (patch: Linked) => void) {
  const field = (key: keyof Linked, label: string, title: string) => (
    <label className="flex items-center gap-1" title={title}>
      {label}
      <input
        type="text"
        list={key === "id" ? undefined : "link-ids"}
        value={links[key] ?? ""}
        placeholder="-"
        onChange={(e) => onChange({ [key]: e.target.value.trim() || undefined })}
        className="w-16 bg-neutral-800 border border-neutral-700 px-1"
      />
    </label>
  );
  return (
    <>
      <datalist id="link-ids">
        {ids.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
      {field("id", t("editorBar.name"), t("editorBar.itsNameForOtherItemsToLink"))}
      {field("with", t("editorBar.with"), t("editorBar.onlyThereWhenTheItemOfThis"))}
      {field("without", t("editorBar.without"), t("editorBar.onlyThereWhenTheItemOfThis14"))}
    </>
  );
}

// a labeled slider with its value, for the light panel
function slider(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) {
  return (
    <label className="flex items-center gap-1">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.round(parseFloat(e.target.value) * 100) / 100)}
        className="w-20"
      />
      <span className="w-8 text-neutral-400">{formatNumber(value)}</span>
    </label>
  );
}
// the tools after Light
const MORE_TOOLS: { tool: EditTool; label: Key; title: Key }[] = [
  { tool: "ladder", label: "editorBar.ladder", title: "editorBar.putALadderUpToAHigher" },
  { tool: "bridge", label: "editorBar.bridge", title: "editorBar.spanACellWithABridge" },
  { tool: "door", label: "editorBar.door", title: "editorBar.makeACellADoorOrBack" },
  { tool: "prop", label: "editorBar.prop", title: "editorBar.putInOrTakeOutProps" },
  { tool: "decal", label: "editorBar.decal", title: "editorBar.putDecalsOnWallsFloorsAndCeilings" },
  { tool: "robot", label: "editorBar.npc", title: "editorBar.putInNPCsRobotsMonstersTheirFacing" },
  { tool: "item", label: "editorBar.item", title: "editorBar.putLootOnFloorsTablesBedsAnd" },
  { tool: "smoke", label: "editorBar.particles", title: "editorBar.smokeEmittersPuffsRisingFromAPoint" },
  { tool: "exit", label: "editorBar.exit", title: "editorBar.waysOffTheShipStandingThereUse" },
  { tool: "start", label: "editorBar.start", title: "editorBar.whereThePartyStartsTheDeckAnd" },
  { tool: "restricted", label: "editorBar.restricted", title: "editorBar.whereTheCrewMustnTBeCameras" },
  { tool: "wall", label: "editorBar.chanceWall", title: "editorBar.wallsLeftToChanceThereInSome" },
  { tool: "map", label: "editorBar.map", title: "editorBar.theMapSSizeOpenMakeOr" },
];
// the tools whose layer can be hidden from the view: the layer's name
const HIDEABLE_LAYERS: Partial<Record<EditTool, string>> = { robot: "robot", smoke: "smoke", prop: "prop", decal: "decal", item: "item" };
// the tools with a layer of their own that "Clear all" can empty
const CLEARABLE_TOOLS = new Set<EditTool>(["robot", "smoke", "prop", "decal", "item", "light", "exit", "restricted", "wall", "bridge", "ladder"]);
// what a click does with each (where the toolbar doesn't say otherwise)
const TOOL_HELP: Partial<Record<EditTool, Key>> = {
  height: "editorBar.clickAFloorOrCeilingUp0",
  ladder: "editorBar.clickNearAFloorSEdgeOr",
  bridge: "editorBar.clickAFloorABridgeAcrossIt",
  door: "editorBar.clickAFloorADoorThereClick",
  robot: "editorBar.pickATypeThenClickAFloor",
  decal: "editorBar.clickAWallFloorOrCeilingThe",
  prop: "editorBar.clickAFloorNearASideOr",
  smoke: "editorBar.clickAWallFloorOrAnythingSmoke",
  exit: "editorBar.clickAFloorAWayOffThe",
  restricted: "editorBar.clickAFloorRestrictedShadedRedOn",
  start: "editorBar.clickAFloorThePartyStartsThere",
  item: "editorBar.clickAFloorOrATableBed",
  wall: "editorBar.clickAWallOrAFloorA",
};
const SURFACES: { surface: EditSurface; label: Key }[] = [
  { surface: "wall", label: "editorBar.wall" },
  { surface: "floor", label: "editorBar.floor" },
  { surface: "ceiling", label: "editorBar.ceiling" },
];
const WAKE_LABELS: Record<ActorWake["mode"], Record<number, Key>> = {
  "dormant": {
    "1": "editorBar.wake.dormant.1",
    "2": "editorBar.wake.dormant.2",
    "3": "editorBar.wake.dormant.3"
  },
  "fooled": {
    "1": "editorBar.wake.fooled.1",
    "2": "editorBar.wake.fooled.2",
    "3": "editorBar.wake.fooled.3"
  },
  "arrive": {
    "1": "editorBar.wake.arrive.1",
    "2": "editorBar.wake.arrive.2",
    "3": "editorBar.wake.arrive.3"
  }
};
export function editorToolLabel(tool: EditTool): string {
  if(tool==="dig" || tool==="fill")return t("editorBar.digFill");
  if(tool==="height")return t("editorBar.height");
  if(tool==="texture")return t("editorBar.texture");
  if(tool==="light")return t("editorBar.light");
  const item=MORE_TOOLS.find(item=>item.tool===tool);
  return item ? t(item.label) : tool;
}
const idle = "border-neutral-600 bg-black/60 text-neutral-200 hover:bg-neutral-800";
const active = "border-amber-400 bg-amber-400/20 text-amber-200";

export function EditorBar(p: Props) {
  const docked = !!p.dock;
  const toolbar = <div className="flex flex-wrap items-center gap-1 font-mono" onPointerDown={e=>e.stopPropagation()}>
      {p.shared && <div className="flex flex-wrap gap-1 text-left">{p.shared}</div>}
      <button
        type="button"
        className={`${BUTTON} ${p.tool === "dig" || p.tool === "fill" ? active : idle}`}
        onClick={() => p.onTool("dig")}
        title={t("editorBar.leftClickDigAWallOutRight")}
      >{t("editorBar.digFill")}</button>
      <button
        type="button"
        className={`${BUTTON} ${p.tool === "height" ? active : idle}`}
        onClick={() => p.onTool("height")}
        title={t("editorBar.raiseLeftClickOrLowerRightClick")}
      >{t("editorBar.height")}</button>
      <button
        type="button"
        className={`${BUTTON} ${p.tool === "texture" ? active : idle}`}
        onClick={() => p.onTool("texture")}
        title={t("editorBar.paintASurface")}
      >{t("editorBar.texture")}</button>
      <button
        type="button"
        className={`${BUTTON} ${p.tool === "light" ? active : idle}`}
        onClick={() => p.onTool("light")}
        title={t("editorBar.addOrRemoveACeilingLight")}
      >{t("editorBar.light")}</button>
      {MORE_TOOLS.map(({ tool, label, title }) => (
        <button
          key={tool}
          type="button"
          className={`${BUTTON} ${p.tool === tool ? active : idle}`}
          onClick={() => p.onTool(tool)}
          title={t(title)}
        >
          {t(label)}
        </button>
      ))}
      <span className="w-2" />
      <button type="button" className={`${BUTTON} ${idle}`} disabled={!p.canUndo} onClick={p.onUndo} title="Z">{t("editorBar.undo")}</button>
      <button type="button" className={`${BUTTON} ${idle}`} disabled={!p.canRedo} onClick={p.onRedo} title="Y">{t("editorBar.redo")}</button>
      {HIDEABLE_LAYERS[p.tool] && (
        <button
          type="button"
          className={`${BUTTON} ${p.hiddenLayers.has(HIDEABLE_LAYERS[p.tool]!) ? active : idle}`}
          onClick={() => p.onToggleLayer(HIDEABLE_LAYERS[p.tool]!)}
          title={t("editorBar.hideThisLayerFromTheViewTo")}
        >
          {p.hiddenLayers.has(HIDEABLE_LAYERS[p.tool]!) ? t("editorBar.show") : t("editorBar.hide")}
        </button>
      )}
      {CLEARABLE_TOOLS.has(p.tool) && (
        <button
          type="button"
          className={`${BUTTON} border-red-700/70 bg-black/60 text-red-300 hover:bg-red-900/30`}
          onClick={() => p.onClearLayer(p.tool)}
          title={t("editorBar.takeEverythingOfThisToolSLayer")}
        >{t("editorBar.clearAll")}</button>
      )}
      <span className="w-2" />
      {import.meta.env.DEV && (
        <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSave} title="Ctrl+S">{t("editorBar.save", { v1: p.unsaved ? " •" : "" })}</button>
      )}
      <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDownload}>{t("editorBar.download")}</button>
      <span className="w-2" />
      <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onExit} title="Tab">{t("editorBar.exitEditor")}</button>
  </div>;
  const bar = (
    <div
      className={docked ? "flex flex-wrap gap-1 font-mono" : `absolute ${p.compact ? "bottom-2" : "top-2"} inset-x-2 z-20 flex flex-wrap justify-center gap-1 font-mono`}
      // the view underneath mustn't take these as peeks or steps
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => {
        // Portalled dialogs bubble through this React parent too. Their
        // OrbitControls must receive pointerup on the native document.
        if (e.currentTarget.contains(e.target as Node)) e.stopPropagation();
      }}
    >
      {!p.toolbarDock && toolbar}
      {p.tool === "texture" && (
        <>
          <span className="basis-full" />
          <div className="flex flex-col items-center gap-1">
            {SURFACES.map(({ surface, label }) => (
              <div
                key={surface}
                className={`flex flex-wrap items-center justify-center gap-1 px-1 py-0.5 rounded-sm ${
                  p.surface === surface ? "bg-amber-400/15 ring-1 ring-amber-400/40" : "bg-black/40"
                }`}
              >
                <span className="w-12 text-[10px] text-neutral-400 text-right">{t(label)}</span>
                <button
                  type="button"
                  className={`${BUTTON} ${p.paint[surface] === null ? active : idle}`}
                  onClick={() => p.onPaint(surface, null)}
                  title={t("editorBar.theTextureTheMapGivesThisSurface")}
                >{t("editorBar.default")}</button>
                {textureSetsOfKind(surface).map((id) => (
                  <button
                    key={id}
                    type="button"
                    title={`${TEXTURE_SETS[id].label} (${id})`}
                    aria-label={TEXTURE_SETS[id].label}
                    className={`w-7 h-7 border bg-cover bg-center ${
                      p.paint[surface] === id ? "border-amber-400" : "border-neutral-600 hover:border-neutral-400"
                    }`}
                    style={{ backgroundImage: `url(${TEXTURE_SETS[id].diffuse})` }}
                    onClick={() => p.onPaint(surface, id)}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
      {p.tool === "robot" && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-1 bg-black/60 px-2 py-1 rounded-sm">
            {!(p.robotChoice && assetInWorld(p.robotChoice)) && <span className="text-[10px] text-amber-200">{t("editorBar.pickATypeToPutIn")}</span>}
            {Object.keys(ACTOR_TYPES).filter((id) => assetInWorld(id)).map((type) => (
              <button
                key={type}
                type="button"
                className={`${BUTTON} ${p.robotChoice === type ? active : idle}`}
                onClick={() => p.onRobotChoice(type)}
              >
                {type}
              </button>
            ))}
          </div>
          {p.actor && (
            <>
              <span className="basis-full" />
              <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
                <span className="text-amber-200">{p.actor.type}</span>
                <span className="flex items-center gap-0.5">{t("editorBar.faces")} {(["N", "E", "S", "W"] as Direction[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`${BUTTON} ${p.actor!.facing === d ? active : idle}`}
                      onClick={() => p.onActorChange({ facing: d })}
                    >
                      {d}
                    </button>
                  ))}</span>
                {chanceSlider(p.actor.chance, (chance) => p.onActorChange({ chance }))}
                <label
                  className="flex items-center gap-1"
                  title={t("editorBar.untilTheShipSAlertReachesA")}
                >
                  {t("editorBar.untilAlert")}<select
                    value={p.actor.wake ? `${p.actor.wake.mode} ${p.actor.wake.level}` : ""}
                    onChange={(e) => {
                      const [mode, level] = e.target.value.split(" ");
                      const keep = p.actor!.wake?.mode === "arrive" && mode === "arrive" ? p.actor!.wake : {};
                      p.onActorChange({
                        wake: mode ? ({ ...keep, mode, level: Number(level) } as ActorWake) : undefined,
                      });
                    }}
                    className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
                  >
                    <option value="">{t("editorBar.onGuardFromTheStart")}</option>
                    {(["dormant", "fooled", "arrive"] as const).flatMap((mode) =>
                      ([1, 2, 3] as const).map((level) => (
                        <option key={`${mode} ${level}`} value={`${mode} ${level}`}>{t(WAKE_LABELS[mode][level])}</option>
                      )),
                    )}
                  </select>
                </label>
                {p.actor.wake?.mode === "arrive" &&
                  slider(t("editorBar.everyS"), p.actor.wake.every ?? 30, 10, 120, 5, (v) =>
                    p.onActorChange({ wake: { ...p.actor!.wake!, every: v === 30 ? undefined : v } }),
                  )}
                {p.actor.wake?.mode === "arrive" &&
                  slider(t("editorBar.max"), p.actor.wake.max ?? 1, 1, 5, 1, (v) => p.onActorChange({ wake: { ...p.actor!.wake!, max: v === 1 ? undefined : v } }))}
                {linkFields(p.actor.links, p.linkIds, p.onActorChange)}
                <span className="text-neutral-400">{p.actor.route ? t("editorBar.routeCells", { n: p.actor.route }) : t("editorBar.stands")}</span>
                {p.actor.route > 0 && (
                  <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorClearRoute}>{t("editorBar.clearRoute")}</button>
                )}
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorDelete}>{t("editorBar.remove")}</button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorDeselect}>{t("editorBar.done")}</button>
              </div>
            </>
          )}
        </>
      )}
      {p.tool === "door" && p.door && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
            <span className="text-amber-200">{t("editorBar.doorFront", { v1: t(p.door.kind === "lift" ? "editorBar.doorKindLift" : "editorBar.doorKindStandard"), v2: p.door.facing })}</span>
            {slider(t("editorBar.place"), p.door.offset, -DOOR_EDGE_OFFSET, DOOR_EDGE_OFFSET, 0.02, (v) =>
              p.onDoorChange({ offset: v || undefined }),
            )}
            <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onDoorChange({ offset: -DOOR_EDGE_OFFSET })}>{t("editorBar.backEdge")}</button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onDoorChange({ offset: undefined })}>{t("editorBar.middle")}</button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onDoorChange({ offset: DOOR_EDGE_OFFSET })}>{t("editorBar.frontEdge")}</button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDoorFlip} title={t("editorBar.turnItRoundItStaysWhereIt")}>{t("editorBar.flipFront")}</button>
            {chanceSlider(p.door.chance, (chance) => p.onDoorChange({ chance }))}
            {linkFields(p.door.links, p.linkIds, p.onDoorChange)}
            <label className="flex items-center gap-1">
              {t("editorBar.label")}<input
                type="text"
                value={p.door.label}
                onChange={(e) => p.onDoorChange({ label: e.target.value || undefined })}
                className="w-16 bg-neutral-800 border border-neutral-700 px-1"
              />
            </label>
            <label className="flex items-center gap-1" title={t("editorBar.theFlagThatOpensItACode")}>
              {t("editorBar.lockKey")}<input
                type="text"
                value={p.door.lock?.key ?? ""}
                onChange={(e) => p.onDoorChange({ lock: doorLock(p.door!.lock, { key: e.target.value || undefined }) })}
                className="w-20 bg-neutral-800 border border-neutral-700 px-1"
              />
            </label>
            <label className="flex items-center gap-1" title={t("editorBar.whetherTheCrewSHackerCanBreak")}>
              {t("editorBar.hack")}<select
                value={p.door.lock?.hack ?? 0}
                onChange={(e) => p.onDoorChange({ lock: doorLock(p.door!.lock, { hack: Number(e.target.value) || undefined }) })}
                className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
              >
                <option value={0}>{t("editorBar.no")}</option>
                <option value={1}>{t("editorBar.easy")}</option>
                <option value={2}>{t("editorBar.hard")}</option>
                <option value={3}>{t("editorBar.veryHard")}</option>
              </select>
            </label>
            <label className="flex items-center gap-1" title={t("editorBar.aKeypadItsCodeANewOne")}>
              <input
                type="checkbox"
                checked={!!p.door.lock?.code}
                onChange={(e) => p.onDoorChange({ lock: doorLock(p.door!.lock, { code: e.target.checked || undefined }) })}
              />
              {t("editorBar.code")}</label>
            {p.door.lock &&
              slider(t("editorBar.locked"), p.door.lock.chance ?? 1, 0, 1, 0.05, (v) =>
                p.onDoorChange({ lock: doorLock(p.door!.lock, { chance: v >= 1 ? undefined : v }) }),
              )}
            {p.door.lock && (
              <label className="flex items-center gap-1" title={t("editorBar.whatThePartyIsToldAtThe")}>
                {t("editorBar.says")}<input
                  type="text"
                  value={p.door.lock.message ?? ""}
                  placeholder={t("editorBar.itSLocked")}
                  onChange={(e) => p.onDoorChange({ lock: doorLock(p.door!.lock, { message: e.target.value || undefined }) })}
                  className="w-32 bg-neutral-800 border border-neutral-700 px-1"
                />
              </label>
            )}
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDoorDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDoorDeselect}>{t("editorBar.done")}</button>
            <span className="text-neutral-500">{t("editorBar.arrowsMoveShiftMore")}</span>
          </div>
        </>
      )}
      {p.tool === "map" && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-1 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
            <label className="flex items-center gap-1">
              {t("editorBar.map")}<select value={p.mapId} onChange={(e) => p.onOpenMap(e.target.value)} className="bg-neutral-800 border border-neutral-700 px-1 py-0.5">
                {p.mapIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-neutral-400">{t("editorBar.x", { v1: p.mapSize.width, v2: p.mapSize.height })}</span>
            {(["N", "S", "W", "E"] as Direction[]).map((edge) => (
              <span key={edge} className="flex items-center gap-0.5">
                <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onResize(edge, true)} title={t("editorBar.growEdge", { edge })}>
                  +{edge}
                </button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onResize(edge, false)} title={t("editorBar.cutEdge", { edge })}>
                  −{edge}
                </button>
              </span>
            ))}
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onNewMap}>{t("editorBar.newMap")}</button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSaveMapAs}>{t("editorBar.saveAs")}</button>
            <WeatherFields value={p.mapLook.weather} onChange={weather=>p.onMapLook({weather})}/>
            <label className="flex items-center gap-1" title={t("editorBar.fewSofterLightSpillsToTheCells")}>
              {t("editorBar.bakedLight")}<select
                value={p.mapLook.lightGridDensity ?? ""}
                onChange={(e) => p.onMapLook({ lightGridDensity: e.target.value ? Number(e.target.value) : undefined })}
                className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
              >
                <option value="">{t("editorBar.defaultLower")}</option>
                {DENSITIES.map((d) => (
                  <option key={d} value={d}>{t("editorBar.perCell", { v1: d })}</option>
                ))}
              </select>
            </label>
            <label
              className="flex items-center gap-1"
              title={t("editorBar.theAmbientPartOfTheBakedLight")}
            >
              {t("editorBar.ambient")}<select
                value={p.mapLook.lightGridAmbient ?? ""}
                onChange={(e) => p.onMapLook({ lightGridAmbient: e.target.value ? Number(e.target.value) : undefined })}
                className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
              >
                <option value="">{t("editorBar.sameGrid")}</option>
                {[2, 3, 4].map((d) => (
                  <option key={d} value={d}>{t("editorBar.perCell", { v1: d })}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1" title={t("editorBar.theHueTheDeckSTrimIs")}>
              <input
                type="checkbox"
                checked={!!p.mapLook.accent}
                onChange={(e) => p.onMapLook({ accent: e.target.checked ? { hue: 0 } : undefined })}
              />
              {t("editorBar.accent")}</label>
            {p.mapLook.accent &&
              slider(t("editorBar.hue"), p.mapLook.accent.hue, 0, 359, 1, (v) => p.onMapLook({ accent: { ...p.mapLook.accent!, hue: v } }))}
            {p.mapLook.accent &&
              slider("+-", p.mapLook.accent.range ?? 30, 5, 90, 1, (v) =>
                p.onMapLook({ accent: { ...p.mapLook.accent!, range: v === 30 ? undefined : v } }),
              )}
            {TEXTURE_SLOTS.map(({ slot, label, kind }) => (
              <label key={slot} className="flex items-center gap-1" title={t("editorBar.defaultTexture", { surface: t(label).toLowerCase() })}>
                {t(label)}
                <select
                  value={p.mapLook.textures?.[slot] ?? ""}
                  onChange={(e) => {
                    const textures = { ...p.mapLook.textures, [slot]: e.target.value || undefined };
                    for (const k of Object.keys(textures)) if (!textures[k]) delete textures[k];
                    p.onMapLook({ textures: Object.keys(textures).length ? textures : undefined });
                  }}
                  className="bg-neutral-800 border border-neutral-700 px-1 py-0.5 max-w-[7rem]"
                >
                  <option value="">{t("editorBar.defaultLower")}</option>
                  {textureSetsOfKind(kind).map((id) => (
                    <option key={id} value={id}>
                      {TEXTURE_SETS[id].label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="flex items-center gap-1" title={t("editorBar.howDeepTheWallsReliefIsRebuilds")}>
              {t("editorBar.relief")}<select
                value={p.mapLook.reliefDepth ?? ""}
                onChange={(e) => p.onMapLook({ reliefDepth: e.target.value ? Number(e.target.value) : undefined })}
                className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
              >
                <option value="">{t("editorBar.defaultLower")}</option>
                {RELIEF_DEPTHS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
      {p.tool === "decal" && (
        <>
          <span className="basis-full" />
          <DecalPalette choice={p.decalChoice} onChoice={p.onDecalChoice} rotation={p.decalRotation} />
          {p.decal && (
            <>
              <span className="basis-full" />
              <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
                <span className="text-amber-200">
                  {p.decal.name}
                  {p.decal.action ? ` (${p.decal.action})` : ""}
                </span>
                {slider(t("editorBar.turn"), p.decal.rotation, 0, 345, 15, (v) => p.onDecalChange({ rotation: v || undefined }))}
                {slider(t("editorBar.scale"), p.decal.scale, 0.25, 4, 0.05, (v) => p.onDecalChange({ scale: v === 1 ? undefined : v }))}
                <label className="flex items-center gap-1" title={t("editorBar.whatTouchingItDoesTerminalIdOpens")}>
                  {t("editorBar.action")}<input
                    type="text"
                    value={p.decal.action ?? ""}
                    placeholder="terminal:log1"
                    onChange={(e) => p.onDecalChange({ action: e.target.value || undefined })}
                    className="w-28 bg-neutral-800 border border-neutral-700 px-1"
                  />
                </label>
                {chanceSlider(p.decal.chance, (chance) => p.onDecalChange({ chance }))}
                {linkFields(p.decal.links, p.linkIds, p.onDecalChange)}
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDecalDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDecalDeselect}>{t("editorBar.done")}</button>
                <span className="text-neutral-500">{t("editorBar.arrowsMoveShiftMoreRTurn")}</span>
              </div>
            </>
          )}
        </>
      )}
      {p.tool === "prop" && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-1 bg-black/60 px-2 py-1 rounded-sm">
            {Object.keys(PROP_TYPES).filter((id) => assetInWorld(id)).map((name) => (
              <button
                key={name}
                type="button"
                className={`${BUTTON} ${p.propChoice === name ? active : idle}`}
                onClick={() => p.onPropChoice(name)}
              >
                {name}
              </button>
            ))}
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropRotate} title="R">{t("editorBar.rotationDegrees", { v1: p.propRotation })}</button>
          </div>
          {p.prop && (
            <>
              <span className="basis-full" />
              <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
                <span className="text-amber-200">{p.prop.name}</span>
                {slider(t("editorBar.turn"), p.prop.rotation, 0, 345, 15, (v) => p.onPropChange({ rotation: v || undefined }))}
                {slider(t("editorBar.scale"), p.prop.scale, 0.25, 4, 0.05, (v) => p.onPropChange({ scale: v === 1 ? undefined : v }))}
                {slider(t("editorBar.height"), p.prop.elevation, -0.5, Math.max(0, p.prop.roomHeight - 0.05), 0.05, (v) =>
                  p.onPropChange({ elevation: v || undefined }),
                )}
                {chanceSlider(p.prop.chance, (chance) => p.onPropChange({ chance }))}
                {linkFields(p.prop.links, p.linkIds, p.onPropChange)}
                {p.prop.retexturable && (
                  <label className="flex items-center gap-1">
                    {t("editorBar.texture")}<select
                      value={p.prop.texture ?? ""}
                      onChange={(e) => p.onPropChange({ texture: e.target.value || undefined })}
                      className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
                    >
                      <option value="">{t("editorBar.itsOwn")}</option>
                      {PROP_TEXTURES.map((id) => (
                        <option key={id} value={id}>
                          {TEXTURE_SETS[id].label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {propEditable(PROP_TYPES[p.prop.name]) && (
                  <button
                    type="button"
                    className={`${BUTTON} ${idle}`}
                    onClick={() => propEdit.set({ name: p.prop!.name, part: 0 })}
                    title={t("editorBar.editItsTypeSizeReliefNormalStrength")}
                  >{t("editorBar.editType")}</button>
                )}
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropStack} title={t("editorBar.thePaletteSPropOnTopOf")}>{t("editorBar.stackOnTop", { v1: p.propChoice })}</button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropDeselect}>{t("editorBar.done")}</button>
                <span className="text-neutral-500">{t("editorBar.arrowsNudgePgUpPgDnHeightRTurn")}</span>
              </div>
            </>
          )}
        </>
      )}
      {p.tool === "smoke" && p.smoke && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
            <EffectFields value={{...p.smoke,height:p.smoke.effectHeight}} onChange={p.onSmokeChange}/>
            {p.smoke.effect==="fire" && (
              <label className="flex items-center gap-1" title={t("editorBar.onlyDecorationATorchTheFlamesAnd")}>
                <input type="checkbox" checked={p.smoke.decorative} onChange={(e) => p.onSmokeChange({ decorative: e.target.checked || undefined })} />
                {t("editorBar.decoration")}</label>
            )}
            {slider(t("editorBar.amount"), p.smoke.density, 0.25, 3, 0.25, (v) => p.onSmokeChange({ density: v === 1 ? undefined : v }))}
            {slider(t("editorBar.puffSize"), p.smoke.size, 0.4, 2.5, 0.1, (v) => p.onSmokeChange({ size: v === 1 ? undefined : v }))}
            {slider(t("editorBar.height"), p.smoke.height, 0, Math.max(0, p.smoke.roomHeight - 0.05), 0.05, (v) => p.onSmokeChange({ pos: [NaN, v, NaN] }))}
            {slider(t("editorBar.blow"), p.smoke.blow.speed, 0, 4, 0.25, (v) => p.onSmokeChange({ blow: smokeBlow({ ...p.smoke!.blow, speed: v }) }))}
            {p.smoke.blow.speed > 0 && (
              <>
                {slider(t("editorBar.heading"), p.smoke.blow.yaw, 0, 345, 15, (v) => p.onSmokeChange({ blow: smokeBlow({ ...p.smoke!.blow, yaw: v }) }))}
                {slider(t("editorBar.tilt"), p.smoke.blow.pitch, -90, 90, 15, (v) => p.onSmokeChange({ blow: smokeBlow({ ...p.smoke!.blow, pitch: v }) }))}
              </>
            )}
            <label className="flex items-center gap-1">
              {t("editorBar.color")}<input
                type="color"
                value={p.smoke.color}
                onChange={(e) => p.onSmokeChange({ color: e.target.value })}
                className="w-7 h-6 bg-transparent border border-neutral-600"
              />
            </label>
            {chanceSlider(p.smoke.chance, (chance) => p.onSmokeChange({ chance }))}
            {linkFields(p.smoke.links, p.linkIds, p.onSmokeChange)}
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSmokeDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSmokeDeselect}>{t("editorBar.done")}</button>
            <span className="text-neutral-500">{t("editorBar.arrowsPgUpPgDnMove")}</span>
          </div>
        </>
      )}
      {p.tool === "exit" && p.exit && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
            <span className="text-amber-200">{t("editorBar.exitLower")}</span>
            <label className="flex items-center gap-1">
              {t("editorBar.name")}<input
                type="text"
                value={p.exit.name}
                placeholder={t("editorBar.airlock")}
                onChange={(e) => p.onExitName(e.target.value || undefined)}
                className="w-32 bg-neutral-800 border border-neutral-700 px-1"
              />
            </label>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onExitRemove}>{t("editorBar.remove")}</button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onExitDeselect}>{t("editorBar.done")}</button>
          </div>
        </>
      )}
      {p.tool === "item" && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-1 bg-black/60 px-2 py-1 rounded-sm">
            {Object.entries(ITEM_TYPES).filter(([id]) => assetInWorld(id)).map(([id, type]) => (
              <button key={id} type="button" className={`${BUTTON} ${p.itemChoice === id ? active : idle}`} onClick={() => p.onItemChoice(id)}>
                {type.name}
              </button>
            ))}
          </div>
          {p.item && (
            <>
              <span className="basis-full" />
              <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
                <label className="flex items-center gap-1">
                  {t("editorBar.item")}<select
                    value={p.item.item}
                    onChange={(e) => p.onItemChange({ item: e.target.value })}
                    className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
                  >
                    {Object.entries(ITEM_TYPES).filter(([id]) => assetInWorld(id)).map(([id, type]) => (
                      <option key={id} value={id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </label>
                {slider(t("editorBar.count"), p.item.count, 1, 20, 1, (v) => p.onItemChange({ count: v > 1 ? v : undefined }))}
                {slider(t("editorBar.height"), p.item.elevation, 0, Math.max(0, p.item.roomHeight - 0.05), 0.01, (v) =>
                  p.onItemChange({ elevation: v || undefined }),
                )}
                {chanceSlider(p.item.chance, (chance) => p.onItemChange({ chance }))}
                {linkFields(p.item.links, p.linkIds, p.onItemChange)}
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onItemDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onItemDeselect}>{t("editorBar.done")}</button>
                <span className="text-neutral-500">{t("editorBar.arrowsNudgePgUpPgDnHeight")}</span>
              </div>
            </>
          )}
        </>
      )}
      {p.tool === "wall" && p.chanceWall && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
            <span className="text-amber-200">{t("editorBar.chanceWallLower")}</span>
            {slider(t("editorBar.chance"), p.chanceWall.chance, 0, 1, 0.05, (chance) => p.onChanceWallChange({ chance }))}
            {linkFields(p.chanceWall.links, p.linkIds, p.onChanceWallChange)}
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onChanceWallRemove} title={t("editorBar.alwaysAWall")}>{t("editorBar.plainWall")}</button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onChanceWallDeselect}>{t("editorBar.done")}</button>
          </div>
        </>
      )}
      {TOOL_HELP[p.tool] && (
        <>
          <span className="basis-full" />
          <span className="text-[10px] text-neutral-400 bg-black/60 px-2 py-0.5 rounded-sm">{t(TOOL_HELP[p.tool]!)}</span>
        </>
      )}
      {p.tool === "light" && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-1 bg-black/60 px-2 py-1 rounded-sm">
            <span className="text-[10px] text-neutral-400">{t("editorBar.place159")}</span>
            <button
              type="button"
              className={`${BUTTON} ${p.lightPlace === "ceiling" ? active : idle}`}
              onClick={() => p.onLightPlace("ceiling")}
              title={t("editorBar.aClickOnAFloorOrCeiling")}
            >{t("editorBar.ceilingLamp")}</button>
            <button
              type="button"
              className={`${BUTTON} ${p.lightPlace === "point" ? active : idle}`}
              onClick={() => p.onLightPlace("point")}
              title={t("editorBar.aClickPutsALightJustOff")}
            >{t("editorBar.pointLight")}</button>
            <span className="text-[10px] text-neutral-500">{t("editorBar.clickPickPlaceRightClickRemove")}</span>
          </div>
          {p.light && (
            <>
              <span className="basis-full" />
              <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
                <label className="flex items-center gap-1">
                  {t("editorBar.color")}<input
                    type="color"
                    value={p.light.color}
                    onChange={(e) => p.onLightChange({ color: e.target.value })}
                    className="w-7 h-6 bg-transparent border border-neutral-600"
                  />
                </label>
                {slider(t("editorBar.intensity"), p.light.intensity, 0, 4, 0.05, (v) => p.onLightChange({ intensity: v }))}
                {slider(t("editorBar.range"), p.light.range, 0.5, 6, 0.1, (v) => p.onLightChange({ range: v }))}
                {chanceSlider(p.light.chance, (chance) => p.onLightChange({ chance }))}
                {linkFields(p.light.links, p.linkIds, p.onLightChange)}
                <label className="flex items-center gap-1" title={t("editorBar.anUnsteadyLightIsnTBakedOne")}>
                  {t("editorBar.effect")}<select
                    value={p.light.effect ?? ""}
                    onChange={(e) => p.onLightChange({ effect: (e.target.value || undefined) as LightEffect | undefined })}
                    className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
                  >
                    <option value="">{t("editorBar.steady")}</option>
                    <option value="flicker">{t("editorBar.flicker")}</option>
                    <option value="spark">{t("editorBar.spark")}</option>
                    <option value="pulse">{t("editorBar.pulse")}</option>
                  </select>
                </label>
                {p.light.pos && (
                  <>
                    {slider(t("editorBar.height"), p.light.pos[1], 0.05, p.light.roomHeight - 0.05, 0.05, (v) =>
                      p.onLightChange({ pos: [p.light!.pos![0], v, p.light!.pos![2]] }),
                    )}
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={!!p.light.bulb}
                        onChange={(e) => p.onLightChange({ bulb: e.target.checked || undefined })}
                      />
                      {t("editorBar.bulbInGame")}</label>
                    <span className="text-neutral-500">{t("editorBar.arrowsPgUpPgDnMove")}</span>
                  </>
                )}
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onLightDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onLightDeselect}>{t("editorBar.done")}</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
  return <>{p.toolbarDock && createPortal(toolbar,p.toolbarDock)}{p.dock ? createPortal(bar, p.dock) : bar}</>;
}
