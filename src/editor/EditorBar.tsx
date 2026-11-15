import { KindChoice, neutralStyle } from "./inspector/parts";
import type { SmokeSpec, Weather } from "../game/types";
import { t, type Key } from "../i18n";
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
import { PROP_TYPES } from "../game/props";

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

// the deck's default texture sets: the slot, and which sets are offered for it

export interface EditorBarProps {
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
  onActorChange: (patch: { actor?: string; facing?: Direction; chance?: number; wake?: ActorWake } & Linked, merge?: string) => void;
  onActorClearRoute: () => void;
  onActorDelete: () => void;
  onActorDeselect: () => void;
  // the Door tool: the selected door, and what the panel does with it
  door: DoorInfo | null;
  onDoorChange: (patch: { kind?: "standard" | "lift"; offset?: number; label?: string; chance?: number; lock?: Lock } & Linked, merge?: string) => void;
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
  onMapLook: (patch: MapLook, merge?: string) => void;
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
      petals?: boolean;
      decorative?: boolean;
      opacity?: number;
      opacityDark?: number;
    } & Linked,
    merge?: string,
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
  onItemChange: (patch: { count?: number; elevation?: number; chance?: number; item?: string } & Linked, merge?: string) => void;
  onItemDelete: () => void;
  onItemDeselect: () => void;
  // the Chance wall tool: the picked one
  chanceWall: { chance: number; links: Linked } | null;
  onChanceWallChange: (patch: { chance?: number } & Linked, merge?: string) => void;
  onChanceWallRemove: () => void;
  onChanceWallDeselect: () => void;
  onPropStack: () => void;
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
}

// a door's lock with a change: none once it has neither a key nor a hack

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

// the fields linking an item to others (see Linked): its name, and the one
// it's only there with / without (a list of the map's names to pick from)

// a labeled slider with its value, for the light panel

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

export function EditorBar(p: EditorBarProps) {
  const docked = !!p.toolbarDock;
  const toolbar = <div style={neutralStyle} className="voidcrew-editor-controls flex flex-wrap items-center gap-1 font-mono" onPointerDown={e=>e.stopPropagation()}>
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
      style={neutralStyle}
      className={docked ? "voidcrew-editor-controls flex flex-wrap gap-1 font-mono" : `voidcrew-editor-controls absolute ${p.compact ? "bottom-2" : "top-2"} inset-x-2 z-20 flex flex-wrap justify-center gap-1 font-mono`}
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

        </>
      )}

      {p.tool === "decal" && (
        <>
          <span className="basis-full" />
          <DecalPalette choice={p.decalChoice} onChoice={p.onDecalChoice} rotation={p.decalRotation} />

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
            <KindChoice label={t("editorBar.place159")} value={p.lightPlace} onChange={v => p.onLightPlace(v as LightPlace)} buttonClass={BUTTON} activeClass={active} idleClass={idle} options={[
              {value:"ceiling",label:t("editorBar.ceilingLamp"),title:t("editorBar.aClickOnAFloorOrCeiling")},
              {value:"point",label:t("editorBar.pointLight"),title:t("editorBar.aClickPutsALightJustOff")},
            ]}/>
            <span className="text-[10px] text-neutral-500">{t("editorBar.clickPickPlaceRightClickRemove")}</span>
          </div>

        </>
      )}
    </div>
  );
  return p.toolbarDock ? createPortal(<>{toolbar}{bar}</>, p.toolbarDock) : bar;
}

