import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { LIVERY_HUES, MOOD_LEVELS, moodOf } from "../game/variation";
import type { ShipMood } from "../game/variation";
import type { ViewportSettings, ViewportStats, WallProfileId } from "./GameViewport";
import { downloadMap } from "../editor/mapStore";
import { TEXTURE_SETS, textureSetsOfKind } from "../render/textureSets";
import { LOCKED_WORLD, WORLDS, switchWorld } from "../game/worlds";
import { GRAPHICS_PRESETS, VIEW_DISTANCE_HIGH, VIEW_DISTANCE_MAX, effectiveViewDistance, presetOf } from "../render/graphics";
import type { WorldId } from "../game/worlds";
import { LangSwitch } from "../i18n/LangSwitch";
import { t, formatNumber, type Key } from "../i18n";
import type { TextureSetKind } from "../render/textureSets";

interface DebugPanelProps {
  settings: ViewportSettings;
  onChange: (settings: ViewportSettings) => void;
  stats: ViewportStats | null;
  // translucent, non-scrolling variant for the mobile overlay layout (the
  // overlay container scrolls instead)
  compact?: boolean;
  // the current map, for its download button
  mapId?: string;
  // opens the map editor
  onEditMap?: () => void;
  // the deck variation being played (see variation.ts), and a new one
  seed?: number;
  onReroll?: () => void;
  // the ship's mood (see variation.ts): as played, and the parts set here
  // instead of rolled
  mood?: ShipMood;
  moodOverride?: Partial<ShipMood>;
  onMood?: (override: Partial<ShipMood>) => void;
  // the map's own render values (see renderLook.ts): whether it has any,
  // writing the current ones into it, and removing them
  mapHasRender?: boolean;
  // the world the map belongs to (switching reopens the game in another)
  world?: WorldId;
  onSaveRender?: () => void;
  onClearRender?: () => void;
  // the map's default texture sets (MapFile.textures) and changing one
  mapTextures?: Record<string, string | undefined>;
  onMapTexture?: (slot: string, setId: string | undefined) => void;
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

const VIEW_SLIDERS: SliderConfig[] = [
  { key: "fov", label: "debug.fov", min: 40, max: 100, step: 1 },
  { key: "moveDurationMs", label: "debug.stepDurationMs", min: 60, max: 600, step: 10 },
];

const LIGHT_SLIDERS: SliderConfig[] = [
  { key: "mapLightIntensity", label: "debug.mapLights", min: 0, max: 3, step: 0.05 },
  { key: "pointLightIntensity", label: "debug.headlamp", min: 0, max: 8, step: 0.1 },
  { key: "ambientIntensity", label: "debug.ambientLight", min: 0, max: 2, step: 0.05 },
];

const ACCENT_RATIO_SLIDER: SliderConfig = { key: "accentRatio", label: "debug.accentShareOfWalls", min: 0, max: 1, step: 0.05 };

// how vivid a texture's pixel must be to count as accent (see accent.ts)
const ACCENT_SLIDERS: SliderConfig[] = [{ key: "accentMinSat", label: "debug.accentMinSaturation", min: 0, max: 1, step: 0.05 }];
const LIVERY_NAMES: Record<number, Key> = {"0":"debug.color.red","30":"debug.color.orange","55":"debug.color.yellow","120":"debug.color.green","185":"debug.color.cyan","215":"debug.color.blue","280":"debug.color.purple"};

const CAMERA_SLIDERS: SliderConfig[] = [
  { key: "eyeHeight", label: "debug.eyeHeight", min: 0.1, max: 0.9, step: 0.01 },
  { key: "cameraPullback", label: "debug.cameraPullback", min: 0, max: 0.49, step: 0.01 },
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
const GRAPHICS_LABELS: Record<string, Key> = {"Low":"debug.preset.Low","Medium":"debug.preset.Medium","High":"debug.preset.High","Ultra":"debug.preset.Ultra","Custom":"debug.preset.Custom"};
const MOOD_LABELS: Record<string, Key> = {"light":"debug.mood.light","threat":"debug.mood.threat","clutter":"debug.mood.clutter","smoke":"debug.mood.smoke","fire":"debug.mood.fire","doors":"debug.mood.doors","locks":"debug.mood.locks","robots":"debug.mood.robots","bright":"debug.mood.bright","dim":"debug.mood.dim","dark":"debug.mood.dark","low":"debug.mood.low","medium":"debug.mood.medium","high":"debug.mood.high","sparse":"debug.mood.sparse","normal":"debug.mood.normal","cluttered":"debug.mood.cluttered","clear":"debug.mood.clear","hazy":"debug.mood.hazy","smoky":"debug.mood.smoky","cold":"debug.mood.cold","smouldering":"debug.mood.smouldering","burning":"debug.mood.burning","few":"debug.mood.few","some":"debug.mood.some","many":"debug.mood.many","dormant":"debug.mood.dormant","fooled":"debug.mood.fooled","hostile":"debug.mood.hostile"};
const SELECT = "bg-neutral-800 border border-neutral-700 text-[11px] px-1 py-0.5 rounded-sm";

export function DebugPanel({
  settings,
  onChange,
  stats,
  compact,
  mapId,
  onEditMap,
  seed,
  onReroll,
  mood,
  moodOverride,
  onMood,
  mapHasRender,
  world,
  onSaveRender,
  onClearRender,
  mapTextures,
  onMapTexture,
}: DebugPanelProps) {
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

  const heading = (text: string) => (
    <div className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wide pt-1">{text}</div>
  );
  const select = (label: string, control: ReactNode) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-neutral-300">{label}</span>
      {control}
    </label>
  );

  // the sky images there are (public/skies/index.json)
  const [skies, setSkies] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}skies/index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setSkies(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, []);
  // a map default texture: a drop-down of the sets of one kind
  const textureSelect = (slot: string, label: string, kind: TextureSetKind, accent = false) =>
    select(
      label,
      <select
        value={mapTextures?.[slot] ?? ""}
        onChange={(e) => onMapTexture?.(slot, e.target.value || undefined)}
        className={SELECT}
      >
        <option value="">{accent ? t("debug.noneViewerDefault") : t("debug.default")}</option>
        {textureSetsOfKind(kind).map((id) => (
          <option key={id} value={id}>
            {TEXTURE_SETS[id].label}
          </option>
        ))}
      </select>,
    );

  const beveled = settings.wallProfile === "convex" || settings.wallProfile === "concave";
  const relief = settings.wallProfile === "relief";

  // a collapsible category, closed until opened
  const section = (title: string, children: ReactNode, hint?: string) => (
    <details className="border border-neutral-800 rounded-sm bg-black/20">
      <summary className="text-[10px] font-semibold text-neutral-200 uppercase tracking-wide cursor-pointer px-2 py-1 select-none">
        {title}
        {hint && <span className="ml-2 normal-case font-normal text-neutral-400">{hint}</span>}
      </summary>
      <div className="flex flex-col gap-2 px-2 pb-2 pt-1">{children}</div>
    </details>
  );
  const button = "text-[11px] border border-neutral-600 rounded-sm px-2 py-1 hover:bg-neutral-800 text-left";

  return (
    <div
      className={`w-full flex flex-col gap-1 border border-neutral-700 rounded-sm p-2 text-neutral-200 ${compact ? "bg-neutral-950/95" : "h-full bg-neutral-900/80 overflow-y-auto"}`}
    >
      <div className="text-[11px] font-semibold text-neutral-200 uppercase tracking-wide">{t("debug.debug")}</div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-300">
        <span>{t("common.language")}</span>
        <LangSwitch />
      </div>
      {world && !LOCKED_WORLD &&
        select(
          t("debug.world"),
          <select value={world} onChange={(e) => switchWorld(e.target.value as WorldId)} className={SELECT}>
            {(Object.values(WORLDS) as { id: WorldId; name: string }[]).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>,
        )}

      {section(
        t("debug.mapAttributes"),
        <>
          <div className="text-[10px] text-neutral-300">{t("debug.valuesSavedWithTheMapJsonApplied", { v1: mapId ?? "map" })}</div>
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
          {heading(t("debug.walls"))}
          {relief && RELIEF_SLIDERS.map(slider)}
          {beveled && BEVEL_SLIDERS.map(slider)}
          {!relief && slider(DISPLACEMENT_SLIDER)}
          {slider({ key: "wallHeight", label: "debug.wallHeight", min: 0.6, max: 2, step: 0.05 })}
          {heading(t("debug.floors0AsTheWalls"))}
          {FLOOR_SLIDERS.map(slider)}
          {heading(t("debug.material"))}
          {MATERIAL_SLIDERS.map(slider)}
          {heading(t("debug.light"))}
          {LIGHT_SLIDERS.map(slider)}
          <label className="flex items-center justify-between gap-2 text-[11px]">
            {t("debug.distanceFadesToFogColourSavedWith")}<input
              type="color"
              value={settings.fogColor}
              onChange={(e) => set("fogColor", e.target.value)}
              className="w-8 h-6 bg-transparent border border-neutral-600"
            />
          </label>
          {heading(t("debug.skyLightUnderOpenCeilings"))}
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
          {check("headlamp", t("debug.headlampOnLSavedWithTheMap"))}
          {check("bobEnabled", t("debug.idleHeadBobSavedWithTheMap"))}
          {onSaveRender && (
            <div className="flex gap-1">
              <button type="button" onClick={onSaveRender} className={`${button} flex-1 border-amber-500/60 text-amber-200`}>{t("debug.saveToMap")}</button>
              {mapHasRender && onClearRender && (
                <button type="button" onClick={onClearRender} className={button} title={t("debug.removeTheMapSRenderValues")}>{t("debug.clear")}</button>
              )}
            </div>
          )}
          {onEditMap && (
            <button type="button" onClick={onEditMap} className={`${button} border-amber-500/60 text-amber-200`}>{t("debug.editMapTab")}</button>
          )}
          {mapId && (
            <button type="button" onClick={() => downloadMap(mapId)} className={button}>{t("debug.downloadMapJson", { v1: mapId })}</button>
          )}
        </>,
        t("debug.materialAOReliefWallHeightAmbient"),
      )}

      {section(
        t("debug.lights"),
        <>
          {check("bakedLights", t("debug.bakedLightingOffEveryMapLightReal"))}
          {settings.bakedLights && (
            <>
              {select(
                t("debug.bakedLight"),
                <select
                  value={settings.lightGridMode}
                  onChange={(e) => set("lightGridMode", e.target.value as ViewportSettings["lightGridMode"])}
                  className={SELECT}
                >
                  <option value="directional">{t("debug.directionalMainLightAmbient")}</option>
                  <option value="cube">{t("debug.cubeSixDirections")}</option>
                </select>,
              )}
              {slider({ key: "lightGridDensity", label: "debug.bakedSamplesPerCellUnlessTheMap", min: 2, max: 12, step: 1 })}
              {slider({ key: "lightBounce", label: "debug.lightBounce0UnlitRoomsStayDark", min: 0, max: 3, step: 0.05 })}
            </>
          )}
          {select(
            t("debug.shipLivery"),
            <select
              value={String(settings.shipAccent)}
              onChange={(e) => {
                const v = e.target.value;
                set("shipAccent", v === "rolled" || v === "painted" ? v : Number(v));
              }}
              className={SELECT}
            >
              <option value="rolled">{t("debug.rolledForTheShip")}</option>
              <option value="painted">{t("debug.asPainted")}</option>
              {LIVERY_HUES.map((hue) => (
                <option key={hue} value={hue}>
                  {LIVERY_NAMES[hue] ? t(LIVERY_NAMES[hue]) : hue}
                </option>
              ))}
            </select>,
          )}
          {ACCENT_SLIDERS.map(slider)}
        </>,
      )}

      {section(
        t("debug.textureDefaults"),
        <>
          <div className="text-[10px] text-neutral-300">{t("debug.theMapSDefaultTextureSetsWhat")}</div>
          {onMapTexture && (
            <>
              {textureSelect("wall", t("debug.wallTexture"), "wall")}
              {textureSelect("accent", t("debug.accentTextureSomeWalls"), "wall", true)}
              {mapTextures?.accent && slider(ACCENT_RATIO_SLIDER)}
              {textureSelect("floor", t("debug.floorTexture"), "floor")}
              {textureSelect("ceiling", t("debug.ceilingTexture"), "ceiling")}
              {textureSelect("door", t("debug.door"), "door")}
              {textureSelect("doorFrame", t("debug.doorFrame"), "door")}
              {textureSelect("liftDoor", t("debug.liftDoor"), "door")}
              {textureSelect("window", t("debug.window"), "window")}
              {select(
                t("debug.skyImageOpenAirMaps"),
                <select value={mapTextures?.sky ?? ""} onChange={(e) => onMapTexture("sky", e.target.value || undefined)} className={SELECT}>
                  <option value="">{t("debug.starrySkyGenerated")}</option>
                  {skies.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>,
              )}
            </>
          )}
        </>,
        t("debug.wallAccentFloorCeilingDoors"),
      )}

      {section(
        t("debug.graphics"),
        <>
          <div className="text-[10px] text-neutral-300">{t("debug.forAWeakerDeviceFewerParticlesCoarser")}</div>
          {select(
            t("debug.preset"),
            <select
              value={presetOf(settings)}
              onChange={(e) => {
                const preset = GRAPHICS_PRESETS[e.target.value];
                // (the view distance goes out to the preset's limit: Ultra
                // is for seeing far, and High at 7 cells of its 9 left a
                // lit hall 7 cells off in the dark; Low's and Medium's are
                // their limits anyway)
                if (preset) onChange({ ...settings, ...preset, viewDistance: preset.viewDistanceCap });
              }}
              className={SELECT}
            >
              {presetOf(settings) === "Custom" && <option value="Custom">{t("debug.custom")}</option>}
              {Object.keys(GRAPHICS_PRESETS).map((name) => (
                <option key={name} value={name}>
                  {t(GRAPHICS_LABELS[name])}
                </option>
              ))}
            </select>,
          )}
          {slider({ key: "particleQuality", label: "debug.particlesSmokeFlamesPetals", min: 0.1, max: 1, step: 0.05 })}
          {select(
            t("debug.particleUpdates"),
            <select value={settings.particleEvery} onChange={(e) => set("particleEvery", Number(e.target.value))} className={SELECT}>
              <option value={1}>{t("debug.everyFrame")}</option>
              <option value={2}>{t("debug.every2ndFrame")}</option>
              <option value={3}>{t("debug.every3rdFrame")}</option>
            </select>,
          )}
          {select(
            t("debug.smoothWallPolygons"),
            <select value={settings.wallDetail} onChange={(e) => set("wallDetail", Number(e.target.value))} className={SELECT}>
              <option value={16}>{t("debug.low512TrianglesAWall")}</option>
              <option value={32}>{t("debug.medium2048")}</option>
              <option value={64}>{t("debug.high8192")}</option>
            </select>,
          )}
          {select(
            t("debug.resolutionDevicePixelsPerPixel"),
            <select value={settings.pixelRatioCap} onChange={(e) => set("pixelRatioCap", Number(e.target.value))} className={SELECT}>
              <option value={0.5}>{t("debug.05xBlurryLightest")}</option>
              <option value={0.75}>{t("debug.075xSoft")}</option>
              <option value={1}>{t("debug.1x")}</option>
              <option value={1.25}>{t("debug.125x")}</option>
              <option value={1.5}>{t("debug.15x")}</option>
              <option value={2}>{t("debug.2xSharpest")}</option>
            </select>,
          )}
          {select(
            t("debug.viewDistanceLimitFogClosesIn"),
            <select value={settings.viewDistanceCap} onChange={(e) => set("viewDistanceCap", Number(e.target.value))} className={SELECT}>
              <option value={5}>{t("debug.5Cells")}</option>
              <option value={6}>{t("debug.6Cells")}</option>
              <option value={7}>{t("debug.7Cells")}</option>
              <option value={VIEW_DISTANCE_HIGH}>{t("debug.cells", { v1: VIEW_DISTANCE_HIGH })}</option>
              <option value={VIEW_DISTANCE_MAX}>{t("debug.noneCells", { v1: VIEW_DISTANCE_MAX })}</option>
            </select>,
          )}
          {select(
            t("debug.distantDetailWallsDoorsProps"),
            <select value={settings.lodScale} onChange={(e) => set("lodScale", Number(e.target.value))} className={SELECT}>
              <option value={1}>{t("debug.normalCoarserFrom2Cells")}</option>
              <option value={3}>{t("debug.farCoarserFrom7Cells")}</option>
              <option value={0}>{t("debug.fullDetailEverywhere")}</option>
            </select>,
          )}
          {select(
            t("debug.smoothedEdgesAntialiasing"),
            <select value={settings.antialias} onChange={(e) => set("antialias", Number(e.target.value))} className={SELECT}>
              <option value={0}>{t("debug.off")}</option>
              <option value={1}>{t("debug.on")}</option>
            </select>,
          )}
          {select(
            t("debug.realLightsAtOnceTorchesFiresFlashes"),
            <select value={settings.lightPool} onChange={(e) => set("lightPool", Number(e.target.value))} className={SELECT}>
              <option value={2}>{t("debug.2Lightest")}</option>
              <option value={4}>4</option>
              <option value={6}>6</option>
              <option value={8}>{t("debug.8All")}</option>
            </select>,
          )}
          {select(
            t("debug.surfaceNormalMapsFineBumps"),
            <select value={settings.normalMaps} onChange={(e) => set("normalMaps", Number(e.target.value))} className={SELECT}>
              <option value={0}>{t("debug.off")}</option>
              <option value={1}>{t("debug.on")}</option>
            </select>,
          )}
          {/* (past VIEW_DISTANCE_HIGH only when the limit above allows) */}
          {slider({
            key: "viewDistance",
            label: "debug.viewDistanceCells",
            min: 5,
            max: Math.max(VIEW_DISTANCE_HIGH, settings.viewDistanceCap),
            step: 0.5,
          })}
          {effectiveViewDistance(settings) < settings.viewDistance && (
            <div className="text-[10px] text-neutral-300">{t("debug.limitedToByThisDeviceSSetting", { v1: effectiveViewDistance(settings) })}</div>
          )}
        </>,
        t("debug.particlesWallPolygonsResolutionViewDistanceLights"),
      )}

      {section(
        t("debug.viewCamera"),
        <>
          {VIEW_SLIDERS.map(slider)}
          {CAMERA_SLIDERS.map(slider)}
          {check("decalsEnabled", t("debug.decals"))}
          {select(
            t("debug.geometryView"),
            <select
              value={settings.geometryView}
              onChange={(e) => set("geometryView", e.target.value as ViewportSettings["geometryView"])}
              className={SELECT}
            >
              <option value="textured">{t("debug.textured")}</option>
              <option value="faces">{t("debug.facesOnlyColoredByDirection")}</option>
              <option value="wireframe">{t("debug.wireframe")}</option>
              <option value="normals">{t("debug.normalMapsWhatTheSpritesShowInstead")}</option>
              <option value="depth">{t("debug.depthMaps")}</option>
            </select>,
          )}
          {check("showNormals", t("debug.normalMaps"))}
          {check("showMetal", t("debug.metalGloss"))}
          {check("showGlow", t("debug.glowMaps"))}
          {check("showAO", t("debug.ambientOcclusion"))}
        </>,
      )}

      {section(
        t("debug.smoke"),
        <>
          {select(
            t("debug.smokePuffs"),
            <select
              value={settings.smokeStyle}
              onChange={(e) => set("smokeStyle", e.target.value as ViewportSettings["smokeStyle"])}
              className={SELECT}
            >
              <option value="noise">{t("debug.noiseCloudsMadeInTheGame")}</option>
              <option value="painted">{t("debug.paintedPuffs")}</option>
              <option value="animated">{t("debug.paintedPlayedAsTheyLive")}</option>
              <option value="paintedFew">{t("debug.paintedFewerThickerUpright")}</option>
              <option value="paintedFewAnimated">{t("debug.paintedFewerThickerAll36FramesOnce")}</option>
              <option value="squares">{t("debug.seeThroughSquaresUpright")}</option>
              <option value="turnedSquares">{t("debug.seeThroughSquaresTurning")}</option>
            </select>,
          )}
          {check("smokeWalls", t("debug.smokeBumpsIntoWallsFloorsCeilings"))}
          {check("smokeProps", t("debug.smokeBumpsIntoProps"))}
          {check("smokeActors", t("debug.robotsPushSmokeAside"))}
        </>,
      )}

      {section(
        t("debug.playTesting"),
        <>
          {check("gridMovement", t("debug.gridMovementOffFreeJoysticks"))}
          {check("aimMiniGame", t("debug.aimingMiniGameOffChanceRoll"))}
          {check("immortalCrew", t("debug.immortalCrewHPStopsAt1"))}
          {check("noclip", t("debug.noclipWalkThroughWalls"))}
          {check("wallBacking", t("debug.blackWallPillarBacking"))}
          {check("backingInspect", t("debug.inspectBackingTranslucentWallsColouredPanels"))}
          {check("enemyScanner", t("debug.scannerEnemyOutlinesCrewGear"))}
        </>,
      )}

      {seed !== undefined &&
        section(
          t("debug.variationMood"),
          <>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span>{t("debug.variation", { v1: seed })}</span>
              {onReroll && (
                <button type="button" onClick={onReroll} className="border border-neutral-600 rounded-sm px-2 py-0.5 hover:bg-neutral-800">{t("debug.reroll")}</button>
              )}
            </div>
            {mood && onMood && (
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                {(Object.keys(MOOD_LEVELS) as (keyof ShipMood)[]).map((key) => (
                  <select
                    key={key}
                    value={moodOverride?.[key] ?? ""}
                    title={t("debug.moodHint", { part: t(MOOD_LABELS[key]) })}
                    onChange={(e) => onMood({ ...moodOverride, [key]: e.target.value || undefined })}
                    className={SELECT}
                  >
                    <option value="">{t("debug.rolled", { v1: t(MOOD_LABELS[key]), v2: t(MOOD_LABELS[moodOf(seed ?? 0)[key]]) })}</option>
                    {MOOD_LEVELS[key].map((level) => (
                      <option key={level} value={level}>
                        {t("debug.moodValue", { part: t(MOOD_LABELS[key]), level: t(MOOD_LABELS[level]) })}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            )}
          </>,
        )}

      {stats &&
        section(
          t("debug.stats"),
          <div className="text-[10px] text-neutral-300 flex flex-col">
            <span className={stats.fps < 30 ? "text-red-500 font-semibold" : stats.fps < 50 ? "text-amber-600 font-semibold" : "font-semibold"}>{t("debug.fpsMs", { v1: formatNumber(stats.fps, 0), v2: formatNumber(stats.frameMs, 1) })}</span>
            <span>{t("debug.renderedTriangles", { v1: formatNumber(stats.renderedTriangles, 0) })}</span>
            <span>{t("debug.drawCalls", { v1: stats.drawCalls })}</span>
            <span>{t("debug.cellsInSight", { v1: stats.visibleCells })}</span>
            {relief && stats.relief && (
              <span>{t("debug.reliefTrianglesWallLevels", { v1: formatNumber(stats.relief.trianglesPerWall, 0), v2: stats.relief.levelCount })}</span>
            )}
            <button
              type="button"
              className={`${button} mt-1 self-start`}
              onClick={() => {
                const lines = [
                  t("debug.statsGraphics", { v1: String(mapId), v2: t(GRAPHICS_LABELS[presetOf(settings)]), v3: settings.particleQuality, v4: settings.particleEvery, v5: settings.wallDetail, v6: settings.lodScale, v7: settings.pixelRatioCap, v8: settings.antialias, v9: settings.lightPool, v10: settings.normalMaps, v11: settings.viewDistance }),
                  t("debug.statsScreen", { v1: window.innerWidth, v2: window.innerHeight, v3: window.devicePixelRatio }),
                  t("debug.fpsMs", { v1: formatNumber(stats.fps, 0), v2: formatNumber(stats.frameMs, 1) }),
                  t("debug.renderedTriangles", { v1: stats.renderedTriangles }),
                  t("debug.drawCalls", { v1: stats.drawCalls }),
                  t("debug.cellsInSight", { v1: stats.visibleCells }),
                  ...(stats.relief ? [t("debug.reliefTrianglesWallLevels", { v1: stats.relief.trianglesPerWall, v2: stats.relief.levelCount })] : []),
                ];
                copyText(lines.join("\n"));
              }}
            >{t("debug.copyStats")}</button>
          </div>,
        )}
    </div>
  );
}

// copy text to the clipboard - also over plain http (a phone on the LAN), where
// navigator.clipboard isn't there: a hidden textarea and execCommand then
function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } catch {
    // (nothing to do)
  }
  area.remove();
}
