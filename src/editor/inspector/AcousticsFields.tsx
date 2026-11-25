import { useContext, useRef } from "react";
import { t } from "../../i18n";
import { NumberField } from "../NumberField";
import { ZONE_LIMITS, ZONE_PRESETS, type Acoustics, type ZonePreset } from "../../game/acousticZones";
import type { AcousticsPanel } from "../acousticsPanel";
import type { AreaEstimate } from "../../audio/acoustics";
import { BUTTON, CommitContext, active, idle } from "./parts";

const autoLine = (e: AreaEstimate) =>
  t("acoustics.auto", { decay: e.acoustics.decay.toFixed(2), volume: e.volume, outdoor: e.outdoor ? t("acoustics.autoOutdoor") : "" });

// The sound zones' panel (a section of the map settings): the cells picked on the minimap, the zones of the map, and the
// selected zone's settings - a preset and four sliders.
export function AcousticsFields({ panel: a }: { panel: AcousticsPanel }) {
  const commit = useContext(CommitContext);
  // (a slider gesture is one undo step: its edits share a key, which changes when the gesture ends)
  const gesture = useRef(0);
  const done = () => {
    gesture.current++;
    commit();
  };
  const zone = a.selected !== null ? a.zones[a.selected] : null;
  const value = (key: keyof Acoustics, step: number, digits?: number) => {
    const limits = ZONE_LIMITS[key];
    return (
      <NumberField
        label={t(`acoustics.value.${key}`)}
        title={t(`acoustics.value.${key}Hint`)}
        value={zone!.values[key]}
        min={limits.min}
        max={limits.max}
        step={step}
        digits={digits}
        slider
        unit={key === "decay" ? "s" : undefined}
        onChange={(v) => a.onValues({ [key]: v }, String(gesture.current))}
        onCommit={done}
      />
    );
  };
  return (
    <>
      <p className="text-neutral-400">{t("acoustics.hint")}</p>
      <div className="flex flex-wrap items-center gap-1">
        <span className={a.pickCount ? "text-amber-200" : "text-neutral-500"}>{a.pickCount ? t("acoustics.selected", { cells: a.pickCount }) : t("acoustics.noSelection")}</span>
        {a.pickCount > 0 && (
          <button type="button" className={`${BUTTON} ${idle}`} onClick={a.onClearPick}>
            {t("acoustics.clear")}
          </button>
        )}
        {a.hasBlock && (
          <button type="button" className={`${BUTTON} ${idle}`} onClick={a.onAddBlock} title={t("acoustics.addBlockHint")}>
            {t("acoustics.addBlock")}
          </button>
        )}
      </div>
      {a.pickEstimate && <span className="text-neutral-300">{autoLine(a.pickEstimate)}</span>}
      <div className="flex flex-wrap gap-1">
        <button type="button" className={`${BUTTON} ${idle}`} disabled={!a.pickCount} onClick={a.onCreate}>
          {t("acoustics.create")}
        </button>
        {zone && (
          <>
            <button type="button" className={`${BUTTON} ${idle}`} disabled={!a.pickCount} onClick={a.onAddCells}>
              {t("acoustics.addCells")}
            </button>
            <button type="button" className={`${BUTTON} ${idle}`} disabled={!a.pickCount} onClick={a.onRemoveCells}>
              {t("acoustics.removeCells")}
            </button>
          </>
        )}
      </div>
      <strong className="text-neutral-200">{t("acoustics.zones")}</strong>
      {a.zones.length === 0 && <span className="text-neutral-500">{t("acoustics.noZones")}</span>}
      <div className="flex flex-col gap-1">
        {a.zones.map((z) => (
          <button
            key={z.index}
            type="button"
            aria-pressed={z.index === a.selected}
            title={t("acoustics.selectZone")}
            className={`${BUTTON} flex items-center gap-2 text-left ${z.index === a.selected ? active : idle}`}
            onClick={() => a.onSelect(z.index === a.selected ? null : z.index)}
          >
            <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: z.color }} />
            <span className="min-w-0 flex-1 truncate">{z.name}</span>
            <span className="text-neutral-400">
              {t(`acoustics.preset.${z.preset}`)} · {t("acoustics.zoneCells", { cells: z.cells })}
            </span>
          </button>
        ))}
      </div>
      {zone && (
        <div className="flex min-w-0 flex-col gap-2 border-t border-neutral-700 pt-2">
          <label>
            {t("acoustics.name")}
            <input
              type="text"
              value={zone.ownName ?? ""}
              placeholder={t("acoustics.zoneN", { n: zone.index + 1 })}
              onChange={(e) => a.onName(e.target.value)}
              className="min-w-0 flex-1 bg-neutral-800 border border-neutral-700 px-1"
            />
          </label>
          <label>
            {t("acoustics.preset")}
            <select value={zone.preset} onChange={(e) => a.onPreset(e.target.value as ZonePreset)}>
              {ZONE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {t(`acoustics.preset.${p}`)}
                </option>
              ))}
            </select>
          </label>
          {value("reverb", 0.05)}
          {value("decay", 0.1)}
          {value("softness", 0.05)}
          {value("insulation", 0.05)}
          {a.zoneEstimate && <span className="text-neutral-400">{autoLine(a.zoneEstimate)}</span>}
          <div className="flex flex-wrap gap-1">
            <button type="button" className={`${BUTTON} ${idle}`} onClick={a.onUseAuto} title={t("acoustics.useAutoHint")}>
              {t("acoustics.useAuto")}
            </button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={a.onDelete}>
              {t("acoustics.delete")}
            </button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={() => a.onSelect(null)}>
              {t("acoustics.deselect")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
