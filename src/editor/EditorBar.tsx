// The map editor's toolbar, over the top of the game view while editing
// (see EDITOR.md): what a click or tap does - dig a wall out, fill a floor
// in (the right mouse button always fills), paint a surface with a texture
// set (its palette follows the surface under the pointer), or toggle a
// ceiling light - undo and redo, saving to disk (dev server only),
// downloading the file, and leaving edit mode. The Texture tool's palette
// has a row per surface, each with its own pick, so it never changes under
// the pointer on its way to it: a click paints the surface with its row's
// pick. The row of the surface under the pointer is marked.

import { useEffect, useState } from "react";
import { TEXTURE_SETS, textureSetsOfKind } from "../render/textureSets";
import { fetchDecalManifest } from "../render/decals";
import type { TextureSetId } from "../render/textureSets";
import type { EditSurface, EditTool } from "./mapEdits";
import type { Direction, LightEffect, Linked, MapLight } from "../game/types";
import { PROP_TYPES } from "../game/props";
import { DOOR_EDGE_OFFSET } from "../game/map";
import { ACTOR_TYPES } from "../game/actors";

export interface MapLook {
  lightGridDensity?: number;
  lightGridAmbient?: number;
  reliefDepth?: number;
}
// what a prop can wear (see PropSpec.texture): the wall and prop face sets
// (a box's top comes with its side)
const PROP_TEXTURES = [...textureSetsOfKind("wall"), ...textureSetsOfKind("propFace")].filter((id) => !id.endsWith("_top"));
const DENSITIES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
const RELIEF_DEPTHS = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12];

interface Props {
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
  // the Prop tool: the prop a click puts in, and its turn (degrees)
  propChoice: string;
  onPropChoice: (prop: string) => void;
  propRotation: number;
  onPropRotate: () => void;
  // the Robot tool: the actor type a click puts in, and the selected actor
  robotChoice: string;
  onRobotChoice: (type: string) => void;
  actor: ActorInfo | null;
  onActorChange: (patch: { facing?: Direction; chance?: number } & Linked) => void;
  onActorClearRoute: () => void;
  onActorDelete: () => void;
  onActorDeselect: () => void;
  // the Door tool: the selected door, and what the panel does with it
  door: DoorInfo | null;
  onDoorChange: (patch: { offset?: number; label?: string; chance?: number } & Linked) => void;
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
  onDecalChange: (patch: { rotation?: number; chance?: number } & Linked) => void;
  onDecalDelete: () => void;
  onDecalDeselect: () => void;
  // the selected prop, and what the panel does with it
  prop: PropInfo | null;
  onPropChange: (patch: { rotation?: number; elevation?: number; chance?: number; texture?: string } & Linked) => void;
  // every item's name in the map (see Linked), for the link fields
  linkIds: string[];
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
}

// the selected decal as the panel shows it
export interface DecalInfo {
  name: string;
  rotation: number;
  // what touching it does (a lift button)
  action?: string;
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
      .then((manifest) => live && setNames(Object.keys(manifest)))
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
      <span className="text-[10px] text-neutral-400 px-1">Turn: {p.rotation}° (R)</span>
    </div>
  );
}

// an item's chance of being there in a variation (1: always - left out of
// the map file)
function chanceSlider(value: number, onChange: (chance: number | undefined) => void) {
  return slider("Chance", value, 0, 1, 0.05, (v) => onChange(v >= 1 ? undefined : v));
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
      {field("id", "Name", "Its name, for other items to link to")}
      {field("with", "With", "Only there when the item of this name is")}
      {field("without", "Without", "Only there when the item of this name isn't")}
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
      <span className="w-8 text-neutral-400">{value.toFixed(2)}</span>
    </label>
  );
}
// the tools after Light
const MORE_TOOLS: { tool: EditTool; label: string; title: string }[] = [
  { tool: "height", label: "Height", title: "Raise or lower a floor or ceiling" },
  { tool: "ladder", label: "Ladder", title: "Put a ladder up to a higher cell" },
  { tool: "bridge", label: "Bridge", title: "Span a cell with a bridge" },
  { tool: "door", label: "Door", title: "Make a cell a door, or back" },
  { tool: "prop", label: "Prop", title: "Put in or take out props" },
  { tool: "decal", label: "Decal", title: "Put decals on walls, floors and ceilings" },
  { tool: "robot", label: "Robot", title: "Put in robots, their facing, route and chance" },
  { tool: "wall", label: "Chance wall", title: "Walls left to chance: there in some variations, open floor in others" },
  { tool: "map", label: "Map", title: "The map's size; open, make or copy maps" },
];
// what a click does with each (where the toolbar doesn't say otherwise)
const TOOL_HELP: Partial<Record<EditTool, string>> = {
  height: "click a floor or ceiling: up 0.25 · right-click: down",
  ladder: "click near a floor's edge (or a step's face): a ladder up that side · again: take it out",
  bridge: "click a floor: a bridge across it the way you face, at the ledges' height · again: take it out",
  door: "click a floor: a door there · click a door: pick it · right-click a door: back to floor",
  robot: "click a floor: a robot there (facing you) · click a robot: pick it · Shift+click a floor: add it to the picked one's route · right-click: take it out",
  decal: "click a wall, floor or ceiling: the decal there · click a decal: pick it · right-click: take it off",
  prop: "click a floor (near a side or corner to push it there): put it in · click a prop: pick it · right-click: take it out",
  wall: "click a wall or a floor: a wall left to chance there (picked) · click one: pick it · right-click one: a plain wall again",
};
const SURFACES: { surface: EditSurface; label: string }[] = [
  { surface: "wall", label: "Wall" },
  { surface: "floor", label: "Floor" },
  { surface: "ceiling", label: "Ceiling" },
];
const idle = "border-neutral-600 bg-black/60 text-neutral-200 hover:bg-neutral-800";
const active = "border-amber-400 bg-amber-400/20 text-amber-200";

export function EditorBar(p: Props) {
  return (
    <div
      className={`absolute ${p.compact ? "bottom-2" : "top-2"} inset-x-2 z-20 flex flex-wrap justify-center gap-1 font-mono`}
      // the view underneath mustn't take these as peeks or steps
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <button type="button" className={`${BUTTON} ${p.tool === "dig" ? active : idle}`} onClick={() => p.onTool("dig")}>
        Dig
      </button>
      <button type="button" className={`${BUTTON} ${p.tool === "fill" ? active : idle}`} onClick={() => p.onTool("fill")}>
        Fill
      </button>
      <button
        type="button"
        className={`${BUTTON} ${p.tool === "texture" ? active : idle}`}
        onClick={() => p.onTool("texture")}
        title="Paint a surface"
      >
        Texture
      </button>
      <button
        type="button"
        className={`${BUTTON} ${p.tool === "light" ? active : idle}`}
        onClick={() => p.onTool("light")}
        title="Add or remove a ceiling light"
      >
        Light
      </button>
      {MORE_TOOLS.map(({ tool, label, title }) => (
        <button
          key={tool}
          type="button"
          className={`${BUTTON} ${p.tool === tool ? active : idle}`}
          onClick={() => p.onTool(tool)}
          title={title}
        >
          {label}
        </button>
      ))}
      <span className="w-2" />
      <button type="button" className={`${BUTTON} ${idle}`} disabled={!p.canUndo} onClick={p.onUndo} title="Z">
        Undo
      </button>
      <button type="button" className={`${BUTTON} ${idle}`} disabled={!p.canRedo} onClick={p.onRedo} title="Y">
        Redo
      </button>
      <span className="w-2" />
      {import.meta.env.DEV && (
        <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSave} title="Ctrl+S">
          Save{p.unsaved ? " •" : ""}
        </button>
      )}
      <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDownload}>
        Download
      </button>
      <span className="w-2" />
      <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onExit} title="Tab">
        Exit editor
      </button>
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
                <span className="w-12 text-[10px] text-neutral-400 text-right">{label}</span>
                <button
                  type="button"
                  className={`${BUTTON} ${p.paint[surface] === null ? active : idle}`}
                  onClick={() => p.onPaint(surface, null)}
                  title="The texture the map gives this surface"
                >
                  Default
                </button>
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
            {Object.keys(ACTOR_TYPES).map((type) => (
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
                <span className="flex items-center gap-0.5">
                  Faces
                  {(["N", "E", "S", "W"] as Direction[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`${BUTTON} ${p.actor!.facing === d ? active : idle}`}
                      onClick={() => p.onActorChange({ facing: d })}
                    >
                      {d}
                    </button>
                  ))}
                </span>
                {chanceSlider(p.actor.chance, (chance) => p.onActorChange({ chance }))}
                {linkFields(p.actor.links, p.linkIds, p.onActorChange)}
                <span className="text-neutral-400">{p.actor.route ? `route: ${p.actor.route} cells` : "stands"}</span>
                {p.actor.route > 0 && (
                  <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorClearRoute}>
                    Clear route
                  </button>
                )}
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorDelete}>
                  Remove
                </button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorDeselect}>
                  Done
                </button>
              </div>
            </>
          )}
        </>
      )}
      {p.tool === "door" && p.door && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
            <span className="text-amber-200">
              {p.door.kind} door, front {p.door.facing}
            </span>
            {slider("Place", p.door.offset, -DOOR_EDGE_OFFSET, DOOR_EDGE_OFFSET, 0.02, (v) =>
              p.onDoorChange({ offset: v || undefined }),
            )}
            <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onDoorChange({ offset: -DOOR_EDGE_OFFSET })}>
              Back edge
            </button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onDoorChange({ offset: undefined })}>
              Middle
            </button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onDoorChange({ offset: DOOR_EDGE_OFFSET })}>
              Front edge
            </button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDoorFlip} title="Turn it round (it stays where it is)">
              Flip front
            </button>
            {chanceSlider(p.door.chance, (chance) => p.onDoorChange({ chance }))}
            {linkFields(p.door.links, p.linkIds, p.onDoorChange)}
            <label className="flex items-center gap-1">
              Label
              <input
                type="text"
                value={p.door.label}
                onChange={(e) => p.onDoorChange({ label: e.target.value || undefined })}
                className="w-16 bg-neutral-800 border border-neutral-700 px-1"
              />
            </label>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDoorDelete} title="Delete">
              Remove
            </button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDoorDeselect}>
              Done
            </button>
            <span className="text-neutral-500">arrows: move (Shift: more)</span>
          </div>
        </>
      )}
      {p.tool === "map" && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-1 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
            <label className="flex items-center gap-1">
              Map
              <select value={p.mapId} onChange={(e) => p.onOpenMap(e.target.value)} className="bg-neutral-800 border border-neutral-700 px-1 py-0.5">
                {p.mapIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-neutral-400">
              {p.mapSize.width} x {p.mapSize.height}
            </span>
            {(["N", "S", "W", "E"] as Direction[]).map((edge) => (
              <span key={edge} className="flex items-center gap-0.5">
                <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onResize(edge, true)} title={`Add a row/column at the ${edge} edge`}>
                  +{edge}
                </button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onResize(edge, false)} title={`Cut the ${edge} edge (all wall only)`}>
                  −{edge}
                </button>
              </span>
            ))}
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onNewMap}>
              New map…
            </button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSaveMapAs}>
              Save as…
            </button>
            <label className="flex items-center gap-1" title="Few: softer, light spills to the cells around. Many: sharper shadows.">
              Baked light
              <select
                value={p.mapLook.lightGridDensity ?? ""}
                onChange={(e) => p.onMapLook({ lightGridDensity: e.target.value ? Number(e.target.value) : undefined })}
                className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
              >
                <option value="">default</option>
                {DENSITIES.map((d) => (
                  <option key={d} value={d}>
                    {d} per cell
                  </option>
                ))}
              </select>
            </label>
            <label
              className="flex items-center gap-1"
              title="The ambient part of the baked light from a coarser grid: a lit room's light spreads into the cells around it, the main light keeps the sharp shadows"
            >
              Ambient
              <select
                value={p.mapLook.lightGridAmbient ?? ""}
                onChange={(e) => p.onMapLook({ lightGridAmbient: e.target.value ? Number(e.target.value) : undefined })}
                className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
              >
                <option value="">same grid</option>
                {[2, 3, 4].map((d) => (
                  <option key={d} value={d}>
                    {d} per cell
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1" title="How deep the walls' relief is (rebuilds the deck)">
              Relief
              <select
                value={p.mapLook.reliefDepth ?? ""}
                onChange={(e) => p.onMapLook({ reliefDepth: e.target.value ? Number(e.target.value) : undefined })}
                className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
              >
                <option value="">default</option>
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
                {slider("Turn", p.decal.rotation, 0, 345, 15, (v) => p.onDecalChange({ rotation: v || undefined }))}
                {chanceSlider(p.decal.chance, (chance) => p.onDecalChange({ chance }))}
                {linkFields(p.decal.links, p.linkIds, p.onDecalChange)}
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDecalDelete} title="Delete">
                  Remove
                </button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDecalDeselect}>
                  Done
                </button>
                <span className="text-neutral-500">arrows: move (Shift: more) · R: turn</span>
              </div>
            </>
          )}
        </>
      )}
      {p.tool === "prop" && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-1 bg-black/60 px-2 py-1 rounded-sm">
            {Object.keys(PROP_TYPES).map((name) => (
              <button
                key={name}
                type="button"
                className={`${BUTTON} ${p.propChoice === name ? active : idle}`}
                onClick={() => p.onPropChoice(name)}
              >
                {name}
              </button>
            ))}
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropRotate} title="R">
              Turn: {p.propRotation}°
            </button>
          </div>
          {p.prop && (
            <>
              <span className="basis-full" />
              <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
                <span className="text-amber-200">{p.prop.name}</span>
                {slider("Turn", p.prop.rotation, 0, 345, 15, (v) => p.onPropChange({ rotation: v || undefined }))}
                {slider("Height", p.prop.elevation, 0, Math.max(0, p.prop.roomHeight - 0.05), 0.05, (v) =>
                  p.onPropChange({ elevation: v || undefined }),
                )}
                {chanceSlider(p.prop.chance, (chance) => p.onPropChange({ chance }))}
                {linkFields(p.prop.links, p.linkIds, p.onPropChange)}
                {p.prop.retexturable && (
                  <label className="flex items-center gap-1">
                    Texture
                    <select
                      value={p.prop.texture ?? ""}
                      onChange={(e) => p.onPropChange({ texture: e.target.value || undefined })}
                      className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
                    >
                      <option value="">its own</option>
                      {PROP_TEXTURES.map((id) => (
                        <option key={id} value={id}>
                          {TEXTURE_SETS[id].label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropStack} title="The palette's prop, on top of this one">
                  Stack {p.propChoice} on top
                </button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropDelete} title="Delete">
                  Remove
                </button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropDeselect}>
                  Done
                </button>
                <span className="text-neutral-500">arrows: nudge · PgUp/PgDn: height · R: turn</span>
              </div>
            </>
          )}
        </>
      )}
      {p.tool === "wall" && p.chanceWall && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
            <span className="text-amber-200">chance wall</span>
            {slider("Chance", p.chanceWall.chance, 0, 1, 0.05, (chance) => p.onChanceWallChange({ chance }))}
            {linkFields(p.chanceWall.links, p.linkIds, p.onChanceWallChange)}
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onChanceWallRemove} title="Always a wall">
              Plain wall
            </button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onChanceWallDeselect}>
              Done
            </button>
          </div>
        </>
      )}
      {TOOL_HELP[p.tool] && (
        <>
          <span className="basis-full" />
          <span className="text-[10px] text-neutral-400 bg-black/60 px-2 py-0.5 rounded-sm">{TOOL_HELP[p.tool]}</span>
        </>
      )}
      {p.tool === "light" && (
        <>
          <span className="basis-full" />
          <div className="flex flex-wrap items-center justify-center gap-1 bg-black/60 px-2 py-1 rounded-sm">
            <span className="text-[10px] text-neutral-400">Place:</span>
            <button
              type="button"
              className={`${BUTTON} ${p.lightPlace === "ceiling" ? active : idle}`}
              onClick={() => p.onLightPlace("ceiling")}
              title="A click on a floor or ceiling hangs a lamp in the cell"
            >
              Ceiling lamp
            </button>
            <button
              type="button"
              className={`${BUTTON} ${p.lightPlace === "point" ? active : idle}`}
              onClick={() => p.onLightPlace("point")}
              title="A click puts a light just off the surface pointed at (Shift+click too)"
            >
              Point light
            </button>
            <span className="text-[10px] text-neutral-500">click: pick / place · right-click: remove</span>
          </div>
          {p.light && (
            <>
              <span className="basis-full" />
              <div className="flex flex-wrap items-center justify-center gap-2 bg-black/70 px-2 py-1 rounded-sm text-[10px] text-neutral-300">
                <label className="flex items-center gap-1">
                  Color
                  <input
                    type="color"
                    value={p.light.color}
                    onChange={(e) => p.onLightChange({ color: e.target.value })}
                    className="w-7 h-6 bg-transparent border border-neutral-600"
                  />
                </label>
                {slider("Intensity", p.light.intensity, 0, 4, 0.05, (v) => p.onLightChange({ intensity: v }))}
                {slider("Range", p.light.range, 0.5, 6, 0.1, (v) => p.onLightChange({ range: v }))}
                {chanceSlider(p.light.chance, (chance) => p.onLightChange({ chance }))}
                {linkFields(p.light.links, p.linkIds, p.onLightChange)}
                <label className="flex items-center gap-1" title="An unsteady light isn't baked: one of the few real lights serves it">
                  Effect
                  <select
                    value={p.light.effect ?? ""}
                    onChange={(e) => p.onLightChange({ effect: (e.target.value || undefined) as LightEffect | undefined })}
                    className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
                  >
                    <option value="">steady</option>
                    <option value="flicker">flicker</option>
                    <option value="spark">spark</option>
                    <option value="pulse">pulse</option>
                  </select>
                </label>
                {p.light.pos && (
                  <>
                    {slider("Height", p.light.pos[1], 0.05, p.light.roomHeight - 0.05, 0.05, (v) =>
                      p.onLightChange({ pos: [p.light!.pos![0], v, p.light!.pos![2]] }),
                    )}
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={!!p.light.bulb}
                        onChange={(e) => p.onLightChange({ bulb: e.target.checked || undefined })}
                      />
                      bulb in game
                    </label>
                    <span className="text-neutral-500">arrows / PgUp PgDn: move</span>
                  </>
                )}
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onLightDelete} title="Delete">
                  Remove
                </button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onLightDeselect}>
                  Done
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
