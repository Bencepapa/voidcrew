import { useState, type ReactNode } from "react";
import type { ViewportSettings, WallProfileId } from "./GameViewport";
import { t, formatNumber, type Key } from "../i18n";

interface MapRenderSettingsProps {
  settings: ViewportSettings;
  onChange: (settings: ViewportSettings) => void;
  mapId?: string;
  mapHasRender?: boolean;
  onSaveRender?: () => void;
  onClearRender?: () => void;
}

const WALL_PROFILE_OPTIONS: { id: WallProfileId; label: Key }[] = [
  { id: "relief", label: "debug.reliefMeshFromDepthMap" },
  { id: "flat", label: "debug.flat" },
  { id: "convex", label: "debug.beveledConvexBulgesOut" },
  { id: "concave", label: "debug.beveledConcaveRecedesIn" },
];

interface SliderConfig {
  key: keyof ViewportSettings;
  label: Key;
  min: number;
  max: number;
  step: number;
}

const LIGHT_SLIDERS: SliderConfig[] = [
  { key: "mapLightIntensity", label: "debug.mapLights", min: 0, max: 3, step: 0.05 },
  { key: "pointLightIntensity", label: "debug.headlamp", min: 0, max: 8, step: 0.1 },
  { key: "ambientIntensity", label: "debug.ambientLight", min: 0, max: 2, step: 0.05 },
];

const RELIEF_SLIDERS: SliderConfig[] = [
  { key: "reliefDepth", label: "debug.reliefDepthUnlessTheMapSetsIt", min: 0.005, max: 0.12, step: 0.005 },
  { key: "reliefMinIsland", label: "debug.minFeatureSizePx1Off", min: 1, max: 16, step: 1 },
  { key: "aoIntensity", label: "debug.aOStrengthAmbient", min: 0, max: 1.5, step: 0.05 },
  { key: "aoDirect", label: "debug.aOOnDirectLight", min: 0, max: 1, step: 0.05 },
  { key: "aoRadius", label: "debug.aORadiusPx", min: 1, max: 16, step: 1 },
];

// the floors' own relief depth and normal strength (0: as the walls')
const FLOOR_SLIDERS: SliderConfig[] = [
  { key: "floorReliefDepth", label: "debug.floorReliefDepth", min: 0, max: 0.12, step: 0.005 },
  { key: "floorNormalStrength", label: "debug.floorNormalStrength", min: 0, max: 3, step: 0.1 },
];

const BEVEL_SLIDERS: SliderConfig[] = [
  { key: "bevelFraction", label: "debug.bevelFraction", min: 0.05, max: 0.45, step: 0.01 },
  { key: "bevelAngleDeg", label: "debug.bevelAngleDegFromFloor", min: 15, max: 75, step: 1 },
];

// (non-relief walls only)
const DISPLACEMENT_SLIDER: SliderConfig = {
  key: "displacementScale",
  label: "debug.depthDisplacement",
  min: 0,
  max: 0.06,
  step: 0.005,
};

const MATERIAL_SLIDERS: SliderConfig[] = [
  { key: "roughness", label: "debug.roughness", min: 0.05, max: 1, step: 0.05 },
  { key: "metalness", label: "debug.metalness", min: 0, max: 1, step: 0.05 },
  { key: "normalStrength", label: "debug.normalMapStrength", min: 0, max: 3, step: 0.1 },
];

// times of day for the sky's light: strength, colour, where from, how high
const SKY_PRESETS: Record<string, Partial<ViewportSettings>> = {
  "Night (moon)": { skyLightIntensity: 0.6, skyLightColor: "#8fa8ff", skyLightAzimuth: 200, skyLightElevation: 45 },
  "Dawn": { skyLightIntensity: 1.0, skyLightColor: "#ffc08a", skyLightAzimuth: 95, skyLightElevation: 12 },
  "Noon": { skyLightIntensity: 1.6, skyLightColor: "#fff4d6", skyLightAzimuth: 180, skyLightElevation: 75 },
  "Afternoon": { skyLightIntensity: 1.3, skyLightColor: "#ffe6b0", skyLightAzimuth: 235, skyLightElevation: 40 },
  "Dusk": { skyLightIntensity: 1.0, skyLightColor: "#ff8f5a", skyLightAzimuth: 265, skyLightElevation: 10 },
  "Off": { skyLightIntensity: 0 },
};

const SKY_LABELS: Record<string, Key> = {"Night (moon)":"debug.sky.Nightmoon","Dawn":"debug.sky.Dawn","Noon":"debug.sky.Noon","Afternoon":"debug.sky.Afternoon","Dusk":"debug.sky.Dusk","Off":"debug.sky.Off"};
const SELECT = "bg-neutral-800 border border-neutral-700 text-[11px] px-1 py-0.5 rounded-sm";

export function MapRenderSettings({
  settings,
  onChange,
  mapId,
  mapHasRender,
  onSaveRender,
  onClearRender,
}: MapRenderSettingsProps) {
  function set<K extends keyof ViewportSettings>(key: K, value: ViewportSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  function slider(s: SliderConfig) {
    return (
      <div key={s.key} className="flex flex-col gap-0.5">
        <div className="flex justify-between text-[10px] text-neutral-300">
          <span>{t(s.label)}</span>
          <span>{formatNumber(settings[s.key] as number, s.step >= 1 ? 0 : s.step >= 0.01 ? 2 : 3)}</span>
        </div>
        <input
          type="range"
          min={s.min}
          max={s.max}
          step={s.step}
          value={settings[s.key] as number}
          onChange={(e) => set(s.key, parseFloat(e.target.value) as ViewportSettings[typeof s.key])}
          className="w-full"
        />
      </div>
    );
  }

  function check(key: keyof ViewportSettings, label: string) {
    return (
      <label key={key} className="flex items-center gap-2 text-[11px] cursor-pointer">
        <input
          type="checkbox"
          checked={settings[key] as boolean}
          onChange={(e) => set(key, e.target.checked as ViewportSettings[typeof key])}
        />
        {label}
      </label>
    );
  }

  const select = (label: string, control: ReactNode) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-neutral-300">{label}</span>
      {control}
    </label>
  );

  const beveled = settings.wallProfile === "convex" || settings.wallProfile === "concave";
  const relief = settings.wallProfile === "relief";

  const group = (id: string, title: Key, children: ReactNode) => (
    <Group id={id} title={title}>
      {children}
    </Group>
  );

  const button = "text-[11px] border border-neutral-600 rounded-sm px-2 py-1 hover:bg-neutral-800 text-left";

  return (
    <>
      <div className="border-t border-neutral-700 px-2 pt-2 text-[10px] text-neutral-400">
        {t("debug.valuesSavedWithTheMapJsonApplied", { v1: mapId ?? "map" })}
      </div>
      {group(
        "walls",
        "inspector.walls",
        <>
          {select(
            t("debug.wallType"),
            <select
              value={settings.wallProfile}
              onChange={(e) => set("wallProfile", e.target.value as WallProfileId)}
              className={SELECT}
            >
              {WALL_PROFILE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {t(opt.label)}
                </option>
              ))}
            </select>,
          )}
          {relief &&
            select(
              t("debug.reliefShapePropsFollowTheWallType"),
              <select
                value={settings.reliefMode}
                onChange={(e) => set("reliefMode", e.target.value as ViewportSettings["reliefMode"])}
                className={SELECT}
              >
                <option value="steps">{t("debug.stepsDistinctLevelsMachineryPanels")}</option>
                <option value="smooth">{t("debug.smoothSlopesStoneHedgesTrees")}</option>
              </select>,
            )}
          {relief && RELIEF_SLIDERS.map(slider)}
          {beveled && BEVEL_SLIDERS.map(slider)}
          {!relief && slider(DISPLACEMENT_SLIDER)}
          {slider({ key: "wallHeight", label: "debug.wallHeight", min: 0.6, max: 2, step: 0.05 })}
        </>,
      )}
      {group("floors", "inspector.floors", <>{FLOOR_SLIDERS.map(slider)}</>)}
      {group("material", "inspector.material", <>{MATERIAL_SLIDERS.map(slider)}</>)}
      {group(
        "light",
        "inspector.light",
        <>
          {LIGHT_SLIDERS.map(slider)}
          <label className="flex items-center justify-between gap-2 text-[11px]">
            {t("debug.distanceFadesToFogColourSavedWith")}<input
              type="color"
              value={settings.fogColor}
              onChange={(e) => set("fogColor", e.target.value)}
              className="w-8 h-6 bg-transparent border border-neutral-600"
            />
          </label>
        </>,
      )}
      {group(
        "skyLight",
        "inspector.skyLight",
        <>
          {select(
            t("debug.timeOfDay"),
            <select
              value=""
              onChange={(e) => {
                const p = SKY_PRESETS[e.target.value];
                if (p) onChange({ ...settings, ...p });
              }}
              className={SELECT}
            >
              <option value="">{t("debug.setFromAPreset")}</option>
              {Object.keys(SKY_PRESETS).map((name) => (
                <option key={name} value={name}>
                  {t(SKY_LABELS[name])}
                </option>
              ))}
            </select>,
          )}
          {slider({ key: "skyLightIntensity", label: "debug.skyLightStrength0None", min: 0, max: 3, step: 0.05 })}
          {slider({ key: "skyLightAzimuth", label: "debug.skyLightFromCompass0North", min: 0, max: 359, step: 1 })}
          {slider({ key: "skyLightElevation", label: "debug.skyLightHeightDegrees", min: 5, max: 90, step: 1 })}
          <label className="flex items-center justify-between gap-2 text-[11px]">
            {t("debug.skyLightColour")}<input
              type="color"
              value={settings.skyLightColor}
              onChange={(e) => set("skyLightColor", e.target.value)}
              className="w-8 h-6 bg-transparent border border-neutral-600"
            />
          </label>
        </>,
      )}
      {group(
        "gameplay",
        "inspector.gameplay",
        <>
          {check("headlamp", t("debug.headlampOnLSavedWithTheMap"))}
          {check("bobEnabled", t("debug.idleHeadBobSavedWithTheMap"))}
        </>,
      )}
      {onSaveRender && (
        <div className="flex gap-1 border-t border-neutral-700 px-2 py-2">
          <button type="button" onClick={onSaveRender} className={`${button} flex-1 border-amber-500/60 text-amber-200`}>{t("debug.saveToMap")}</button>
          {mapHasRender && onClearRender && (
            <button type="button" onClick={onClearRender} className={button} title={t("debug.removeTheMapSRenderValues")}>{t("debug.clear")}</button>
          )}
        </div>
      )}
    </>
  );
}

function Group({ id, title, children }: { id: string; title: Key; children: ReactNode }) {
  const key = "voidcrew-inspector:mapRender:" + id;
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === "true";
    } catch {
      return false;
    }
  });
  return (
    <details
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        try {
          localStorage.setItem(key, String(next));
        } catch {
          /* storage unavailable */
        }
      }}
      className="border-t border-neutral-700"
    >
      <summary className="cursor-pointer select-none px-2 py-2 text-neutral-200 hover:bg-neutral-800">
        {t(title)}
      </summary>
      <div className="flex min-w-0 flex-col gap-2 px-2 pb-3 [&_label]:flex [&_label]:min-w-0 [&_label]:flex-wrap [&_label]:items-center [&_label]:gap-1 [&_select]:min-w-0 [&_select]:max-w-full [&_select]:flex-1 [&_select]:bg-neutral-800 [&_select]:border [&_select]:border-neutral-700">{children}</div>
    </details>
  );
}
