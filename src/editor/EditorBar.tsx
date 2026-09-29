// The map editor's toolbar, over the top of the game view while editing
// (see EDITOR.md): what a click or tap does - dig a wall out, fill a floor
// in (the right mouse button always fills), paint a surface with a texture
// set (its palette follows the surface under the pointer), or toggle a
// ceiling light - undo and redo, saving to disk (dev server only),
// downloading the file, and leaving edit mode. The Texture tool's palette
// has a row per surface, each with its own pick, so it never changes under
// the pointer on its way to it: a click paints the surface with its row's
// pick. The row of the surface under the pointer is marked.

import { TEXTURE_SETS, textureSetsOfKind } from "../render/textureSets";
import type { TextureSetId } from "../render/textureSets";
import type { EditSurface, EditTool } from "./mapEdits";
import type { MapLight } from "../game/types";

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

// the selected light as the panel shows it
export interface LightInfo {
  color: string;
  intensity: number;
  range: number;
  // a free-standing one's spot in its cell (see MapLight.pos)
  pos?: [number, number, number];
  // its cell's floor-to-ceiling height (wall heights), the most it goes up
  roomHeight: number;
}

const BUTTON = "px-2 py-1 border rounded-sm text-[11px] disabled:opacity-30";

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
                {p.light.pos && (
                  <>
                    {slider("Height", p.light.pos[1], 0.05, p.light.roomHeight - 0.05, 0.05, (v) =>
                      p.onLightChange({ pos: [p.light!.pos![0], v, p.light!.pos![2]] }),
                    )}
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
