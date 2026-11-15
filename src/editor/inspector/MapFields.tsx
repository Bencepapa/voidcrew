import { useContext } from "react";
import { t, type Key } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { OptionalNumber, CommitContext, Section, slider, BUTTON, idle } from "./parts";
import type { Direction } from "../../game/types";

import { TEXTURE_SETS, textureSetsOfKind } from "../../render/textureSets";

import { WeatherFields } from "../WeatherFields";
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
<label className="flex items-center gap-1">
              {t("editorBar.map")}<select value={p.mapId} onChange={(e) => p.onOpenMap(e.target.value)} className="bg-neutral-800 border border-neutral-700 px-1 py-0.5">
                {p.mapIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onNewMap}>{t("editorBar.newMap")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSaveMapAs}>{t("editorBar.saveAs")}</button>
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
<OptionalNumber label={t("editorBar.relief")} title={t("editorBar.howDeepTheWallsReliefIsRebuilds")} value={p.mapLook.reliefDepth} min={0.01} max={0.12} step={0.01} defaultValue={0.04} onChange={v=>p.onMapLook({reliefDepth:v})}/>
</Section>

</>;
}
