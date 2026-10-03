import type { ReactNode } from "react";
import { MOOD_LEVELS, moodOf } from "../game/variation";
import type { ShipMood } from "../game/variation";
import type { TextureSetId, ViewportSettings, ViewportStats, WallProfileId } from "./GameViewport";
import { downloadMap } from "../editor/mapStore";

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
}

// the wall texture sets still in use (a map can name its own instead)
const TEXTURE_SET_OPTIONS: { id: TextureSetId; label: string }[] = [
  { id: "wall4", label: "wall4" },
  { id: "wall5", label: "wall5" },
];

const WALL_PROFILE_OPTIONS: { id: WallProfileId; label: string }[] = [
  { id: "relief", label: "Relief mesh (from depth map)" },
  { id: "flat", label: "Flat" },
  { id: "convex", label: "Beveled - convex (bulges out)" },
  { id: "concave", label: "Beveled - concave (recedes in)" },
];

interface SliderConfig {
  key: keyof ViewportSettings;
  label: string;
  min: number;
  max: number;
  step: number;
}

const VIEW_SLIDERS: SliderConfig[] = [
  { key: "viewDistance", label: "View distance (cells)", min: 5, max: 9, step: 0.5 },
  { key: "fov", label: "FOV", min: 40, max: 100, step: 1 },
  { key: "moveDurationMs", label: "Step duration (ms)", min: 60, max: 600, step: 10 },
];

const LIGHT_SLIDERS: SliderConfig[] = [
  { key: "mapLightIntensity", label: "Map lights", min: 0, max: 3, step: 0.05 },
  { key: "pointLightIntensity", label: "Headlamp", min: 0, max: 8, step: 0.1 },
  { key: "ambientIntensity", label: "Ambient light", min: 0, max: 2, step: 0.05 },
];

const ACCENT_RATIO_SLIDER: SliderConfig = { key: "accentRatio", label: "Accent share of walls", min: 0, max: 1, step: 0.05 };

const CAMERA_SLIDERS: SliderConfig[] = [
  { key: "eyeHeight", label: "Eye height", min: 0.1, max: 0.9, step: 0.01 },
  { key: "wallHeight", label: "Wall height", min: 0.6, max: 2, step: 0.05 },
  { key: "cameraPullback", label: "Camera pullback", min: 0, max: 0.49, step: 0.01 },
];

const RELIEF_SLIDERS: SliderConfig[] = [
  { key: "reliefDepth", label: "Relief depth (unless the map sets it)", min: 0.005, max: 0.12, step: 0.005 },
  { key: "reliefMinIsland", label: "Min feature size (px, 1 = off)", min: 1, max: 16, step: 1 },
  { key: "aoIntensity", label: "AO strength (ambient)", min: 0, max: 1.5, step: 0.05 },
  { key: "aoDirect", label: "AO on direct light", min: 0, max: 1, step: 0.05 },
  { key: "aoRadius", label: "AO radius (px)", min: 1, max: 16, step: 1 },
];

const BEVEL_SLIDERS: SliderConfig[] = [
  { key: "bevelFraction", label: "Bevel fraction", min: 0.05, max: 0.45, step: 0.01 },
  { key: "bevelAngleDeg", label: "Bevel angle (deg, from floor)", min: 15, max: 75, step: 1 },
];

// (non-relief walls only)
const DISPLACEMENT_SLIDER: SliderConfig = {
  key: "displacementScale",
  label: "Depth displacement",
  min: 0,
  max: 0.06,
  step: 0.005,
};

const MATERIAL_SLIDERS: SliderConfig[] = [
  { key: "roughness", label: "Roughness", min: 0.05, max: 1, step: 0.05 },
  { key: "metalness", label: "Metalness", min: 0, max: 1, step: 0.05 },
  { key: "normalStrength", label: "Normal map strength", min: 0, max: 3, step: 0.1 },
];

const SELECT = "bg-neutral-800 border border-neutral-700 text-[11px] px-1 py-0.5 rounded-sm";

export function DebugPanel({ settings, onChange, stats, compact, mapId, onEditMap, seed, onReroll, mood, moodOverride, onMood }: DebugPanelProps) {
  function set<K extends keyof ViewportSettings>(key: K, value: ViewportSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  function slider(s: SliderConfig) {
    return (
      <div key={s.key} className="flex flex-col gap-0.5">
        <div className="flex justify-between text-[10px] text-neutral-500">
          <span>{s.label}</span>
          <span>{(settings[s.key] as number).toFixed(s.step >= 1 ? 0 : s.step >= 0.01 ? 2 : 3)}</span>
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
    <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide pt-1">{text}</div>
  );
  const select = (label: string, control: ReactNode) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-neutral-500">{label}</span>
      {control}
    </label>
  );

  const beveled = settings.wallProfile === "convex" || settings.wallProfile === "concave";
  const relief = settings.wallProfile === "relief";

  return (
    <div
      className={`w-full flex flex-col gap-2 border border-neutral-700 rounded-sm p-2 text-neutral-300 ${compact ? "bg-black/40" : "h-full bg-neutral-900/80 overflow-y-auto"}`}
    >
      <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">Debug</div>

      {heading("Play & testing")}
      {check("gridMovement", "Grid movement (off: free, joysticks)")}
      {check("aimMiniGame", "Aiming mini-game (off: chance roll)")}
      {check("immortalCrew", "Immortal crew (HP stops at 1)")}
      {check("noclip", "Noclip (walk through walls)")}
      {check("enemyScanner", "Scanner: enemy outlines (crew gear)")}
      {check("headlamp", "Headlamp (L)")}
      {check("bakedLights", "Baked lighting (off: every map light real)")}
      {settings.bakedLights && (
        <>
          <label className="flex items-center justify-between gap-2 text-[11px]">
            Baked light
            <select
              value={settings.lightGridMode}
              onChange={(e) => set("lightGridMode", e.target.value as ViewportSettings["lightGridMode"])}
              className="bg-neutral-800 border border-neutral-700 text-[11px] px-1 py-0.5 rounded-sm"
            >
              <option value="directional">directional (main light + ambient)</option>
              <option value="cube">cube (six directions)</option>
            </select>
          </label>
          {slider({ key: "lightGridDensity", label: "Baked samples per cell (unless the map sets it)", min: 2, max: 12, step: 1 })}
        </>
      )}
      <label className="flex items-center justify-between gap-2 text-[11px]">
        Smoke puffs
        <select
          value={settings.smokeStyle}
          onChange={(e) => set("smokeStyle", e.target.value as ViewportSettings["smokeStyle"])}
          className="bg-neutral-800 border border-neutral-700 text-[11px] px-1 py-0.5 rounded-sm"
        >
          <option value="noise">noise clouds (made in the game)</option>
          <option value="painted">painted puffs</option>
          <option value="animated">painted, played as they live</option>
          <option value="paintedFew">painted, fewer, thicker, upright</option>
          <option value="paintedFewAnimated">painted, fewer, thicker, all 36 frames once</option>
          <option value="squares">see-through squares, upright</option>
          <option value="turnedSquares">see-through squares, turning</option>
        </select>
      </label>
      {check("smokeWalls", "Smoke bumps into walls, floors, ceilings")}
      {check("smokeProps", "Smoke bumps into props")}
      {check("smokeActors", "Robots push smoke aside")}
      {seed !== undefined && (
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span>Variation {seed}</span>
          {onReroll && (
            <button type="button" onClick={onReroll} className="border border-neutral-600 rounded-sm px-2 py-0.5 hover:bg-neutral-800">
              Reroll
            </button>
          )}
        </div>
      )}
      {mood && onMood && (
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {(Object.keys(MOOD_LEVELS) as (keyof ShipMood)[]).map((key) => (
            <select
              key={key}
              value={moodOverride?.[key] ?? ""}
              title={`The ship's ${key}: rolled from the variation, or set`}
              onChange={(e) => onMood({ ...moodOverride, [key]: e.target.value || undefined })}
              className="bg-neutral-800 border border-neutral-700 text-[11px] px-1 py-0.5 rounded-sm"
            >
              <option value="">
                {key}: {moodOf(seed ?? 0)[key]} (rolled)
              </option>
              {MOOD_LEVELS[key].map((level) => (
                <option key={level} value={level}>
                  {key}: {level}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}
      {onEditMap && (
        <button
          type="button"
          onClick={onEditMap}
          className="text-[11px] border border-amber-500/60 text-amber-200 rounded-sm px-2 py-1 hover:bg-neutral-800 text-left"
        >
          Edit map (Tab)
        </button>
      )}
      {mapId && (
        <button
          type="button"
          onClick={() => downloadMap(mapId)}
          className="text-[11px] border border-neutral-600 rounded-sm px-2 py-1 hover:bg-neutral-800 text-left"
        >
          Download map ({mapId}.json)
        </button>
      )}

      {heading("View")}
      {VIEW_SLIDERS.map(slider)}
      {check("bobEnabled", "Idle head-bob")}
      {check("decalsEnabled", "Decals")}
      {select(
        "Geometry view",
        <select
          value={settings.geometryView}
          onChange={(e) => set("geometryView", e.target.value as ViewportSettings["geometryView"])}
          className={SELECT}
        >
          <option value="textured">textured</option>
          <option value="faces">faces only (colored by direction)</option>
          <option value="wireframe">wireframe</option>
        </select>,
      )}

      {heading("Lights")}
      {LIGHT_SLIDERS.map(slider)}

      {stats && (
        <div className="text-[10px] text-neutral-500 flex flex-col">
          <span>Rendered triangles: {stats.renderedTriangles.toLocaleString()}</span>
          <span>Draw calls: {stats.drawCalls}</span>
          <span>Cells in sight: {stats.visibleCells}</span>
          {relief && stats.relief && (
            <span>
              Relief triangles / wall: {stats.relief.trianglesPerWall.toLocaleString()} ({stats.relief.levelCount} levels)
            </span>
          )}
        </div>
      )}

      <details className="flex flex-col gap-2">
        <summary className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide cursor-pointer pt-1">
          Rendering
        </summary>
        <div className="flex flex-col gap-2 pt-2">
          {select(
            "Wall texture (maps without their own)",
            <select
              value={settings.textureSet}
              onChange={(e) => set("textureSet", e.target.value as TextureSetId)}
              className={SELECT}
            >
              {TEXTURE_SET_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>,
          )}
          {select(
            "Accent texture (some walls)",
            <select
              value={settings.accentTextureSet}
              onChange={(e) => set("accentTextureSet", e.target.value as ViewportSettings["accentTextureSet"])}
              className={SELECT}
            >
              <option value="none">none</option>
              {TEXTURE_SET_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>,
          )}
          {settings.accentTextureSet !== "none" && slider(ACCENT_RATIO_SLIDER)}
          {select(
            "Floor texture",
            <select
              value={settings.floorTextureSet}
              onChange={(e) => set("floorTextureSet", e.target.value as ViewportSettings["floorTextureSet"])}
              className={SELECT}
            >
              <option value="map">per map</option>
              <option value="none">none (plain)</option>
              <option value="floor1">floor1 - grate</option>
              <option value="floor2">floor2 - diamond plate</option>
            </select>,
          )}
          {select(
            "Ceiling texture",
            <select
              value={settings.ceilingTextureSet}
              onChange={(e) => set("ceilingTextureSet", e.target.value as ViewportSettings["ceilingTextureSet"])}
              className={SELECT}
            >
              <option value="ceiling1">per map (else ceiling1)</option>
              <option value="none">none (plain)</option>
            </select>,
          )}
          {select(
            "Wall type",
            <select
              value={settings.wallProfile}
              onChange={(e) => set("wallProfile", e.target.value as WallProfileId)}
              className={SELECT}
            >
              {WALL_PROFILE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>,
          )}
          {relief && RELIEF_SLIDERS.map(slider)}
          {beveled && BEVEL_SLIDERS.map(slider)}
          {!relief && slider(DISPLACEMENT_SLIDER)}
          {MATERIAL_SLIDERS.map(slider)}
          {CAMERA_SLIDERS.map(slider)}
        </div>
      </details>
    </div>
  );
}
