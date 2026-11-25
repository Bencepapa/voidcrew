import { useContext, useState } from "react";
import { t } from "../../i18n";
import {
  FENCE_EVERY_MAX,
  FENCE_HEIGHT,
  FENCE_HEIGHT_MAX,
  FENCE_HEIGHT_MIN,
  FENCE_JITTER,
  FENCE_JITTER_MAX,
  FENCE_LAYERS_MAX,
  FENCE_SPACING,
  FENCE_SPACING_MAX,
  FENCE_SPACING_MIN,
  FENCE_THICKNESS_MAX,
  type FenceCross,
  type FenceForm,
  type FenceStyle,
} from "../../game/fences";
import type { Direction } from "../../game/types";
import { textureSetsOfKind } from "../../render/textureSets";
import type { EditorBarProps } from "../EditorBar";
import { NumberField } from "../NumberField";
import { fenceEditing, fenceToolForm, type FenceBase, type FenceToolId } from "../fenceEdits";
import { TexturePicker, textureOptions } from "../TexturePicker";
import { useTextureVersion } from "../textureLibrary";
import { BUTTON, CommitContext, KindChoice, idle } from "./parts";

// The inspector's fence and block fields (see game/fences.ts): the settings of the next piece the fence tools put
// down (FenceToolFields), and of the piece selected (FencePieceFields) - the same widgets for both.

// what the fence tools put down
export interface FenceToolState {
  // the texture set ("": the deck's walls)
  texture: string;
  style: FenceStyle;
  // the edge tool: the side of the cell it uses ("auto": the one nearest the click)
  side: "auto" | Direction;
  // the mid tool: how a piece with no neighbour lies (0: east-west, 90: north-south)
  rotation: 0 | 90;
  // the layered fence tool: whether its layers stand on a cell's edge or through its middle
  base: FenceBase;
}
export const FENCE_TOOL_DEFAULT: FenceToolState = { texture: "", style: {}, side: "auto", rotation: 0, base: "edge" };

// the texture sets a fence can wear: whatever has a picture of a wall, a prop or a door (a hedge, a forest strip, a gate)
export function fenceTextureIds(): string[] {
  const ids = new Set<string>();
  for (const kind of ["wall", "propFace", "door"] as const) for (const id of textureSetsOfKind(kind)) ids.add(id);
  return [...ids].filter((id) => id !== "sky" && !id.endsWith("_top"));
}

type Decoration = "none" | "texture" | "post";
const decorationOf = (style: FenceStyle): Decoration => (!style.deco ? "none" : style.deco.post ? "post" : "texture");

// the texture, height, thickness, top, sight and decoration of a piece or of the tool's next ones
function StyleFields({ form, texture, style, onTexture, onStyle }: {
  form: FenceForm;
  texture: string;
  style: FenceStyle;
  onTexture: (texture: string) => void;
  onStyle: (style: FenceStyle | undefined) => void;
}) {
  useTextureVersion();
  const commit = useContext(CommitContext);
  const ids = fenceTextureIds();
  const own = { value: "", label: t("editorBar.itsOwn") };
  const set = (patch: Partial<FenceStyle>) => {
    const next: Record<string, unknown> = { ...style, ...patch };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    onStyle(Object.keys(next).length ? (next as FenceStyle) : undefined);
  };
  const defaultOpaque = form === "block";
  // (foliage - layers, an X - is a single sheet: no thickness, top or decoration)
  const foliage = form !== "block" && ((style.layers ?? 1) > 1 || (form === "mid" && !!style.cross));
  const kind = decorationOf(style);
  const deco = style.deco;
  const decoKind = (next: Decoration) => {
    if (next === "none") return set({ deco: undefined });
    const texture = deco?.texture ?? (next === "texture" ? ids.find((id) => id !== "") : undefined);
    set({ deco: { every: deco?.every ?? 3, ...(texture ? { texture } : {}), ...(next === "post" ? { post: true } : {}) } });
  };
  return (
    <>
      <TexturePicker label={t("fence.texture")} value={texture} options={textureOptions(ids, [own])} onChange={onTexture} />
      <NumberField label={t("fence.height")} title={t("fence.heightHint")} value={style.height ?? FENCE_HEIGHT} min={FENCE_HEIGHT_MIN} max={FENCE_HEIGHT_MAX} step={0.05} defaultValue={FENCE_HEIGHT} slider onChange={(v) => set({ height: v === FENCE_HEIGHT ? undefined : v })} onCommit={commit} />
      {form !== "block" && !foliage && (
        <NumberField label={t("fence.thickness")} title={t("fence.thicknessHint")} value={style.thickness ?? 0} min={0} max={FENCE_THICKNESS_MAX} step={0.02} defaultValue={0} slider onChange={(v) => set({ thickness: v > 0 ? v : undefined })} onCommit={commit} />
      )}
      {!foliage && (
        <TexturePicker
          label={t("fence.top")}
          title={t("fence.topHint")}
          value={style.top ?? ""}
          options={textureOptions(ids, [{ value: "", label: t(form === "block" ? "fence.topOwn" : "fence.topNone") }])}
          onChange={(top) => set({ top: top || undefined })}
        />
      )}
      <label className="flex items-center gap-1" title={t("fence.opaqueHint")}>
        <input type="checkbox" checked={style.opaque ?? defaultOpaque} onChange={(e) => { set({ opaque: e.target.checked === defaultOpaque ? undefined : e.target.checked }); commit(); }} />
        {t("fence.opaque")}
      </label>
      {form !== "block" && (
        <>
          <NumberField label={t("fence.layers")} title={t("fence.layersHint")} value={style.layers ?? 1} min={1} max={FENCE_LAYERS_MAX} step={1} defaultValue={1} slider onChange={(v) => set({ layers: v > 1 ? Math.round(v) : undefined })} onCommit={commit} />
          {(style.layers ?? 1) > 1 || style.cross ? (
            <>
              <NumberField label={t("fence.spacing")} title={t("fence.spacingHint")} value={style.spacing ?? FENCE_SPACING} min={FENCE_SPACING_MIN} max={FENCE_SPACING_MAX} step={0.01} defaultValue={FENCE_SPACING} slider onChange={(v) => set({ spacing: v })} onCommit={commit} />
              <NumberField label={t("fence.jitter")} title={t("fence.jitterHint")} value={style.jitter ?? FENCE_JITTER} min={0} max={FENCE_JITTER_MAX} step={0.01} defaultValue={FENCE_JITTER} slider onChange={(v) => set({ jitter: v })} onCommit={commit} />
            </>
          ) : null}
          {form === "mid" && (
            <KindChoice
              label={t("fence.cross")}
              title={t("fence.crossHint")}
              value={style.cross ?? "none"}
              options={[{ value: "none", label: t("fence.crossNone") }, { value: "axes", label: t("fence.crossAxes") }, { value: "diagonal", label: t("fence.crossDiagonal") }]}
              onChange={(v) => set({ cross: v === "none" ? undefined : (v as FenceCross) })}
            />
          )}
          <label className="flex items-center gap-1" title={t("fence.solidHint")}>
            <input type="checkbox" checked={style.solid !== false} onChange={(e) => { set({ solid: e.target.checked ? undefined : false }); commit(); }} />
            {t("fence.solid")}
          </label>
        </>
      )}
      {form !== "block" && !foliage && (
        <>
          <KindChoice
            label={t("fence.deco")}
            title={t("fence.decoHint")}
            value={kind}
            options={[
              { value: "none", label: t("fence.decoNone") },
              { value: "texture", label: t("fence.decoTexture") },
              { value: "post", label: t("fence.decoPost") },
            ]}
            onChange={(v) => decoKind(v as Decoration)}
          />
          {deco && (
            <>
              <NumberField label={t("fence.every")} value={deco.every} min={1} max={FENCE_EVERY_MAX} step={1} defaultValue={3} slider onChange={(every) => set({ deco: { ...deco, every } })} onCommit={commit} />
              <TexturePicker
                label={t("fence.decoTextureLabel")}
                value={deco.texture ?? ""}
                options={textureOptions(ids, kind === "post" ? [own] : [])}
                onChange={(texture) => {
                  const { texture: _old, ...rest } = deco;
                  set({ deco: { ...rest, ...(texture ? { texture } : {}) } });
                }}
              />
            </>
          )}
        </>
      )}
    </>
  );
}

const SIDES: Direction[] = ["N", "E", "S", "W"];
const sideLabel = (d: Direction) => t(`fence.side${d}`);

// the panel of a fence tool in hand: the settings of the pieces its next stroke puts down
export function FenceToolFields(p: EditorBarProps) {
  const { fence, onFence } = p;
  const form: FenceForm = fenceToolForm(p.tool as FenceToolId, fence.base);
  const help = p.tool === "fencelayer" ? "fence.help.layer" : p.tool === "fencecross" ? "fence.help.cross" : (`fence.help.${form}` as const);
  return (
    <div className="flex min-w-0 flex-col gap-2 border-t border-neutral-700 p-2 [&_select]:min-w-0 [&_select]:max-w-full [&_select]:flex-1 [&_select]:border [&_select]:border-neutral-700 [&_select]:bg-neutral-800">
      <p className="text-neutral-400">{t(help)}</p>
      {p.tool === "fencelayer" && (
        <KindChoice
          label={t("fence.base")}
          title={t("fence.baseHint")}
          value={fence.base}
          options={[{ value: "edge", label: t("fence.baseEdge") }, { value: "mid", label: t("fence.baseMid") }]}
          onChange={(base) => onFence({ base: base as FenceBase })}
        />
      )}
      {form === "edge" && (
        <KindChoice
          label={t("fence.side")}
          title={t("fence.sideHint")}
          value={fence.side}
          options={[{ value: "auto", label: t("fence.sideAuto") }, ...SIDES.map((d) => ({ value: d, label: sideLabel(d) }))]}
          onChange={(side) => onFence({ side: side as FenceToolState["side"] })}
        />
      )}
      {form === "mid" && !fence.style.cross && (
        <KindChoice
          label={t("fence.turn")}
          title={t("fence.turnHint")}
          value={String(fence.rotation)}
          options={[{ value: "0", label: t("fence.turnX") }, { value: "90", label: t("fence.turnZ") }]}
          onChange={(v) => onFence({ rotation: v === "90" ? 90 : 0 })}
        />
      )}
      <StyleFields form={form} texture={fence.texture} style={fence.style} onTexture={(texture) => onFence({ texture })} onStyle={(style) => onFence({ style: style ?? {} })} />
    </div>
  );
}

// the fields of the selected fence piece (PropFields shows them in place of the ordinary prop's)
export function FencePieceFields(p: EditorBarProps) {
  const [spread, setSpread] = useState(fenceEditing.spread);
  const info = p.prop?.fence;
  if (!p.prop || !info) return null;
  const { form } = info;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-1 border border-neutral-700 p-1">
        <strong className="text-neutral-200">{t(`fence.piece.${form}`)}</strong>
        <span className="text-neutral-400">{t("fence.autoInfo")}</span>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropFenceRemoveRun}>{t("fence.removeRun")}</button>
        </div>
      </div>
      {form === "edge" && (
        <KindChoice label={t("fence.side")} title={t("fence.sideHint")} value={info.side} options={SIDES.map((d) => ({ value: d, label: sideLabel(d) }))} onChange={(at) => p.onPropChange({ at: at as Direction })} />
      )}
      {form === "mid" && !info.style.cross && (
        <KindChoice
          label={t("fence.turn")}
          title={t("fence.turnHint")}
          value={p.prop.rotation % 180 >= 45 && p.prop.rotation % 180 < 135 ? "90" : "0"}
          options={[{ value: "0", label: t("fence.turnX") }, { value: "90", label: t("fence.turnZ") }]}
          onChange={(v) => p.onPropChange({ rotation: v === "90" ? 90 : undefined })}
        />
      )}
      <StyleFields
        form={form}
        texture={p.prop.texture ?? ""}
        style={info.style}
        onTexture={(texture) => p.onPropChange({ texture: texture || undefined })}
        onStyle={(fence) => p.onPropChange({ fence })}
      />
      <label className="flex items-center gap-1" title={t("fence.spreadHint")}>
        <input type="checkbox" checked={spread} onChange={(e) => { fenceEditing.spread = e.target.checked; setSpread(e.target.checked); }} />
        {t("fence.spread")}
      </label>
    </div>
  );
}
