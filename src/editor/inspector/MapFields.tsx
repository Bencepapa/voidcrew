import { useContext } from "react";
import { t, type Key } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { OptionalNumber, CommitContext, Section, slider, BUTTON, idle, active } from "./parts";
import { MAPS } from "../../game/map";
import { worldOfMap } from "../../game/worlds";
import { parsePickupMode } from "../../game/pickupMode";
import { MapList } from "../MapList";
import { LoadingImageField } from "./LoadingImageField";
import type { Direction } from "../../game/types";
import { useAutoLoadShared } from "../autoSharedPrefs";
import { useSharedMapHeads } from "../sharedMapHeads";
import { splitSharedTitle } from "../sharedMaps";

import { textureSetsOfKind } from "../../render/textureSets";
import { TexturePicker, textureOptions } from "../TexturePicker";
import { SkyFields } from "./SkyFields";
import { LookFields } from "./LookFields";
import { AcousticsFields } from "./AcousticsFields";

import { WeatherFields } from "../WeatherFields";
import { MapRenderSettings } from "../../components/MapRenderSettings";
const TEXTURE_SLOTS: { slot: string; label: Key; kind: "wall" | "floor" | "ceiling" | "door" | "window" }[] = [
  { slot: "wall", label: "editorBar.wall", kind: "wall" },
  { slot: "floor", label: "editorBar.floor", kind: "floor" },
  { slot: "ceiling", label: "editorBar.ceiling", kind: "ceiling" },
  { slot: "door", label: "editorBar.door", kind: "door" },
  { slot: "doorFrame", label: "editorBar.doorFrame", kind: "door" },
  { slot: "liftDoor", label: "editorBar.liftDoor", kind: "door" },
  { slot: "window", label: "editorBar.window", kind: "window" },
];
export function MapFields(p: EditorBarProps) {
const commit=useContext(CommitContext);
const world = worldOfMap(p.mapId);
const autoShared = useAutoLoadShared();
const sharedHeads = useSharedMapHeads(world);
const localItems = p.mapIds.filter((id) => MAPS[id]).map((id) => ({ key: id, place: MAPS[id].place, name: MAPS[id].name, active: id === p.mapId, onPick: () => p.onOpenMap(id) }));
const sharedItems = autoShared && p.onOpenSharedMap ? sharedHeads.map((head) => {
  const { place, name } = splitSharedTitle(head.title);
  return {
    key: "shared:" + head.id,
    place: place ?? t("mapDialog.sharedPlace"),
    name,
    onPick: () => p.onOpenSharedMap?.(head),
    node: <span className="flex items-center gap-1"><span>{name}</span><span className="rounded bg-amber-400/20 px-1 text-[9px] uppercase tracking-wide text-amber-200">{t("editorBar.sharedBadge")}</span></span>,
  };
}) : [];

return <>
<Section kind="map" section="transform">
<span className="text-neutral-400">{t("editorBar.x", { v1: p.mapSize.width, v2: p.mapSize.height })}</span>
<div className="flex flex-wrap gap-1">{(["N", "S", "W", "E"] as Direction[]).map((edge) => (
              <span key={edge} className="flex items-center gap-0.5">
                <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onResize(edge, true)} title={t("editorBar.growEdge", { edge })}>
                  +{edge}
                </button>
                <button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onResize(edge, false)} title={t("editorBar.cutEdge", { edge })}>
                  −{edge}
                </button>
              </span>
            ))}</div>
</Section>
<Section kind="map" section="look">
<span className="text-neutral-400">{t("editorBar.map")}</span>
<MapList
  itemClass={`${BUTTON} ${idle}`}
  activeClass={active}
  items={[...localItems, ...sharedItems]}
/>
<div className="flex flex-wrap gap-1">
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onNewMap}>{t("editorBar.newMap")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSaveMapAs}>{t("editorBar.saveAs")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onRenameMap}>{t("mapDialog.rename")}</button>
</div>
<label className="flex items-center gap-1" title={t("mapDialog.showTitleHint")}>
  <input type="checkbox" checked={p.mapLook.showTitle ?? false} onChange={(e) => p.onMapLook({ showTitle: e.target.checked })} />
  {t("mapDialog.showTitle")}</label>
<label className="flex items-center gap-1" title={t("pickup.mapHint")}>
  {t("pickup.mode")}
  <select className="bg-neutral-800 border border-neutral-700 text-[11px] px-1 py-0.5 rounded-sm" value={p.mapLook.pickup ?? ""} onChange={(e) => p.onMapLook({ pickup: parsePickupMode(e.target.value) })}>
    <option value="">{t("pickup.mapDefault")}</option>
    <option value="auto">{t("pickup.auto")}</option>
    <option value="click">{t("pickup.click")}</option>
  </select></label>
<LoadingImageField value={p.mapLook.loadingImage} world={world} label="link.mapLoadingImage" hint="link.mapLoadingImageHint" onChange={(loadingImage) => p.onMapLook({ loadingImage })} />
<WeatherFields onCommit={commit} value={p.mapLook.weather} onChange={weather=>p.onMapLook({weather})}/>
<OptionalNumber label={t("editorBar.bakedLight")} title={t("editorBar.fewSofterLightSpillsToTheCells")} value={p.mapLook.lightGridDensity} min={2} max={12} step={1} defaultValue={3} onChange={v=>p.onMapLook({lightGridDensity:v})}/>
<OptionalNumber label={t("editorBar.ambient")} title={t("editorBar.theAmbientPartOfTheBakedLight")} value={p.mapLook.lightGridAmbient} min={2} max={4} step={1} defaultValue={3} onChange={v=>p.onMapLook({lightGridAmbient:v})}/>
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
              <TexturePicker key={slot} label={t(label)} title={t("editorBar.defaultTexture", {surface:t(label).toLowerCase()})} value={typeof p.mapLook.textures?.[slot] === "string" ? p.mapLook.textures[slot] as string : ""} options={textureOptions(textureSetsOfKind(kind), [{value:"",label:t("editorBar.defaultLower")}])} onChange={v => {
 const textures = {...p.mapLook.textures,[slot]:v || undefined};
 for (const k of Object.keys(textures)) if (!textures[k]) delete textures[k];
 p.onMapLook({textures:Object.keys(textures).length ? textures : undefined});
}}/>
            ))}
<SkyFields value={p.mapLook.textures} onChange={(textures) => p.onMapLook({textures}, "sky")} />
<OptionalNumber label={t("editorBar.relief")} title={t("editorBar.howDeepTheWallsReliefIsRebuilds")} value={p.mapLook.reliefDepth} min={0.01} max={0.12} step={0.01} defaultValue={0.04} onChange={v=>p.onMapLook({reliefDepth:v})}/>
<LookFields value={p.mapLook.look} onChange={(look, merge) => p.onMapLook({ look }, merge)} viewOff={p.renderSettings.postLookOff} onViewOff={(postLookOff) => p.onRenderSettings({ ...p.renderSettings, postLookOff })} />
</Section>
<Section kind="map" section="acoustics" openWhen={p.acoustics.pickCount > 0}>
<AcousticsFields panel={p.acoustics}/>
</Section>
<MapRenderSettings settings={p.renderSettings} onChange={p.onRenderSettings} mapId={p.mapId} mapHasRender={p.mapHasRender} onSaveRender={p.onSaveRender} onClearRender={p.onClearRender}/>
</>;
}
