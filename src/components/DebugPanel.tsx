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
  { key: "fov", label: "FOV", min: 40, max: 100, step: 1 },
  { key: "moveDurationMs", label: "Step duration (ms)", min: 60, max: 600, step: 10 },
];

const LIGHT_SLIDERS: SliderConfig[] = [
  { key: "mapLightIntensity", label: "Map lights", min: 0, max: 3, step: 0.05 },
  { key: "pointLightIntensity", label: "Headlamp", min: 0, max: 8, step: 0.1 },
  { key: "ambientIntensity", label: "Ambient light", min: 0, max: 2, step: 0.05 },
];

const ACCENT_RATIO_SLIDER: SliderConfig = { key: "accentRatio", label: "Accent share of walls", min: 0, max: 1, step: 0.05 };

// how vivid a texture's pixel must be to count as accent (see accent.ts)
const ACCENT_SLIDERS: SliderConfig[] = [{ key: "accentMinSat", label: "Accent: min saturation", min: 0, max: 1, step: 0.05 }];
const LIVERY_NAMES: Record<number, string> = { 0: "red", 30: "orange", 55: "yellow", 120: "green", 185: "cyan", 215: "blue", 280: "purple" };

const CAMERA_SLIDERS: SliderConfig[] = [
  { key: "eyeHeight", label: "Eye height", min: 0.1, max: 0.9, step: 0.01 },
  { key: "cameraPullback", label: "Camera pullback", min: 0, max: 0.49, step: 0.01 },
];

const RELIEF_SLIDERS: SliderConfig[] = [
  { key: "reliefDepth", label: "Relief depth (unless the map sets it)", min: 0.005, max: 0.12, step: 0.005 },
  { key: "reliefMinIsland", label: "Min feature size (px, 1 = off)", min: 1, max: 16, step: 1 },
  { key: "aoIntensity", label: "AO strength (ambient)", min: 0, max: 1.5, step: 0.05 },
  { key: "aoDirect", label: "AO on direct light", min: 0, max: 1, step: 0.05 },
  { key: "aoRadius", label: "AO radius (px)", min: 1, max: 16, step: 1 },
];

// the floors' own relief depth and normal strength (0: as the walls')
const FLOOR_SLIDERS: SliderConfig[] = [
  { key: "floorReliefDepth", label: "Floor relief depth", min: 0, max: 0.12, step: 0.005 },
  { key: "floorNormalStrength", label: "Floor normal strength", min: 0, max: 3, step: 0.1 },
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

// times of day for the sky's light: strength, colour, where from, how high
const SKY_PRESETS: Record<string, Partial<ViewportSettings>> = {
  "Night (moon)": { skyLightIntensity: 0.6, skyLightColor: "#8fa8ff", skyLightAzimuth: 200, skyLightElevation: 45 },
  "Dawn": { skyLightIntensity: 1.0, skyLightColor: "#ffc08a", skyLightAzimuth: 95, skyLightElevation: 12 },
  "Noon": { skyLightIntensity: 1.6, skyLightColor: "#fff4d6", skyLightAzimuth: 180, skyLightElevation: 75 },
  "Afternoon": { skyLightIntensity: 1.3, skyLightColor: "#ffe6b0", skyLightAzimuth: 235, skyLightElevation: 40 },
  "Dusk": { skyLightIntensity: 1.0, skyLightColor: "#ff8f5a", skyLightAzimuth: 265, skyLightElevation: 10 },
  "Off": { skyLightIntensity: 0 },
};

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
        <option value="">{accent ? "none (viewer default)" : "default"}</option>
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
      <div className="text-[11px] font-semibold text-neutral-200 uppercase tracking-wide">Debug</div>
      {world && !LOCKED_WORLD &&
        select(
          "World",
          <select value={world} onChange={(e) => switchWorld(e.target.value as WorldId)} className={SELECT}>
            {(Object.values(WORLDS) as { id: WorldId; name: string }[]).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>,
        )}

      {section(
        "Map attributes",
        <>
          <div className="text-[10px] text-neutral-300">
            Values saved with the map ({mapId ?? "map"}.json): applied when it opens, over the viewer defaults.
          </div>
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
          {relief &&
            select(
              "Relief shape (props follow the wall type)",
              <select
                value={settings.reliefMode}
                onChange={(e) => set("reliefMode", e.target.value as ViewportSettings["reliefMode"])}
                className={SELECT}
              >
                <option value="steps">Steps - distinct levels (machinery, panels)</option>
                <option value="smooth">Smooth - slopes (stone, hedges, trees)</option>
              </select>,
            )}
          {heading("Walls")}
          {relief && RELIEF_SLIDERS.map(slider)}
          {beveled && BEVEL_SLIDERS.map(slider)}
          {!relief && slider(DISPLACEMENT_SLIDER)}
          {slider({ key: "wallHeight", label: "Wall height", min: 0.6, max: 2, step: 0.05 })}
          {heading("Floors (0 = as the walls)")}
          {FLOOR_SLIDERS.map(slider)}
          {heading("Material")}
          {MATERIAL_SLIDERS.map(slider)}
          {heading("Light")}
          {LIGHT_SLIDERS.map(slider)}
          <label className="flex items-center justify-between gap-2 text-[11px]">
            Distance fades to (fog colour) - saved with the map
            <input
              type="color"
              value={settings.fogColor}
              onChange={(e) => set("fogColor", e.target.value)}
              className="w-8 h-6 bg-transparent border border-neutral-600"
            />
          </label>
          {heading("Sky light (under open ceilings)")}
          {select(
            "Time of day",
            <select
              value=""
              onChange={(e) => {
                const p = SKY_PRESETS[e.target.value];
                if (p) onChange({ ...settings, ...p });
              }}
              className={SELECT}
            >
              <option value="">set from a preset...</option>
              {Object.keys(SKY_PRESETS).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>,
          )}
          {slider({ key: "skyLightIntensity", label: "Sky light strength (0 = none)", min: 0, max: 3, step: 0.05 })}
          {slider({ key: "skyLightAzimuth", label: "Sky light from (compass, 0 = north)", min: 0, max: 359, step: 1 })}
          {slider({ key: "skyLightElevation", label: "Sky light height (degrees)", min: 5, max: 90, step: 1 })}
          <label className="flex items-center justify-between gap-2 text-[11px]">
            Sky light colour
            <input
              type="color"
              value={settings.skyLightColor}
              onChange={(e) => set("skyLightColor", e.target.value)}
              className="w-8 h-6 bg-transparent border border-neutral-600"
            />
          </label>
          {check("headlamp", "Headlamp on (L) - saved with the map")}
          {check("bobEnabled", "Idle head-bob - saved with the map")}
          {onSaveRender && (
            <div className="flex gap-1">
              <button type="button" onClick={onSaveRender} className={`${button} flex-1 border-amber-500/60 text-amber-200`}>
                Save to map
              </button>
              {mapHasRender && onClearRender && (
                <button type="button" onClick={onClearRender} className={button} title="Remove the map's render values">
                  Clear
                </button>
              )}
            </div>
          )}
          {onEditMap && (
            <button type="button" onClick={onEditMap} className={`${button} border-amber-500/60 text-amber-200`}>
              Edit map (Tab)
            </button>
          )}
          {mapId && (
            <button type="button" onClick={() => downloadMap(mapId)} className={button}>
              Download map ({mapId}.json)
            </button>
          )}
        </>,
        "material, AO, relief, wall height, ambient",
      )}

      {section(
        "Lights",
        <>
          {check("bakedLights", "Baked lighting (off: every map light real)")}
          {settings.bakedLights && (
            <>
              {select(
                "Baked light",
                <select
                  value={settings.lightGridMode}
                  onChange={(e) => set("lightGridMode", e.target.value as ViewportSettings["lightGridMode"])}
                  className={SELECT}
                >
                  <option value="directional">directional (main light + ambient)</option>
                  <option value="cube">cube (six directions)</option>
                </select>,
              )}
              {slider({ key: "lightGridDensity", label: "Baked samples per cell (unless the map sets it)", min: 2, max: 12, step: 1 })}
              {slider({ key: "lightBounce", label: "Light bounce (0 = unlit rooms stay dark)", min: 0, max: 3, step: 0.05 })}
            </>
          )}
          {select(
            "Ship livery",
            <select
              value={String(settings.shipAccent)}
              onChange={(e) => {
                const v = e.target.value;
                set("shipAccent", v === "rolled" || v === "painted" ? v : Number(v));
              }}
              className={SELECT}
            >
              <option value="rolled">rolled for the ship</option>
              <option value="painted">as painted</option>
              {LIVERY_HUES.map((hue) => (
                <option key={hue} value={hue}>
                  {LIVERY_NAMES[hue] ?? hue}
                </option>
              ))}
            </select>,
          )}
          {ACCENT_SLIDERS.map(slider)}
        </>,
      )}

      {section(
        "Texture defaults",
        <>
          <div className="text-[10px] text-neutral-300">
            The map's default texture sets (what isn't painted over): saved in the map file with Save to map.
          </div>
          {onMapTexture && (
            <>
              {textureSelect("wall", "Wall texture", "wall")}
              {textureSelect("accent", "Accent texture (some walls)", "wall", true)}
              {mapTextures?.accent && slider(ACCENT_RATIO_SLIDER)}
              {textureSelect("floor", "Floor texture", "floor")}
              {textureSelect("ceiling", "Ceiling texture", "ceiling")}
              {textureSelect("door", "Door", "door")}
              {textureSelect("doorFrame", "Door frame", "door")}
              {textureSelect("liftDoor", "Lift door", "door")}
              {textureSelect("window", "Window", "window")}
              {select(
                "Sky image (open-air maps)",
                <select value={mapTextures?.sky ?? ""} onChange={(e) => onMapTexture("sky", e.target.value || undefined)} className={SELECT}>
                  <option value="">starry sky (generated)</option>
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
        "wall, accent, floor, ceiling, doors",
      )}

      {section(
        "Graphics",
        <>
          <div className="text-[10px] text-neutral-300">
            For a weaker device: fewer particles, coarser walls, a lower resolution, a shorter view. Kept on this device. Some of these
            rebuild the scene.
          </div>
          {select(
            "Preset",
            <select
              value={presetOf(settings)}
              onChange={(e) => {
                const preset = GRAPHICS_PRESETS[e.target.value];
                // (Ultra is for seeing far: the view distance goes out to
                // its limit; back from it, in to what the others allow)
                const viewDistance =
                  preset && preset.viewDistanceCap > VIEW_DISTANCE_HIGH
                    ? preset.viewDistanceCap
                    : Math.min(settings.viewDistance, VIEW_DISTANCE_HIGH);
                if (preset) onChange({ ...settings, ...preset, viewDistance });
              }}
              className={SELECT}
            >
              {presetOf(settings) === "Custom" && <option value="Custom">Custom</option>}
              {Object.keys(GRAPHICS_PRESETS).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>,
          )}
          {slider({ key: "particleQuality", label: "Particles (smoke, flames, petals)", min: 0.1, max: 1, step: 0.05 })}
          {select(
            "Particle updates",
            <select value={settings.particleEvery} onChange={(e) => set("particleEvery", Number(e.target.value))} className={SELECT}>
              <option value={1}>every frame</option>
              <option value={2}>every 2nd frame</option>
              <option value={3}>every 3rd frame</option>
            </select>,
          )}
          {select(
            "Smooth wall polygons",
            <select value={settings.wallDetail} onChange={(e) => set("wallDetail", Number(e.target.value))} className={SELECT}>
              <option value={16}>low (512 triangles a wall)</option>
              <option value={32}>medium (2 048)</option>
              <option value={64}>high (8 192)</option>
            </select>,
          )}
          {select(
            "Resolution (device pixels per pixel)",
            <select value={settings.pixelRatioCap} onChange={(e) => set("pixelRatioCap", Number(e.target.value))} className={SELECT}>
              <option value={1}>1x (lowest)</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x (sharpest)</option>
            </select>,
          )}
          {select(
            "View distance limit (fog closes in)",
            <select value={settings.viewDistanceCap} onChange={(e) => set("viewDistanceCap", Number(e.target.value))} className={SELECT}>
              <option value={5}>5 cells</option>
              <option value={6}>6 cells</option>
              <option value={7}>7 cells</option>
              <option value={VIEW_DISTANCE_HIGH}>{VIEW_DISTANCE_HIGH} cells</option>
              <option value={VIEW_DISTANCE_MAX}>none ({VIEW_DISTANCE_MAX} cells)</option>
            </select>,
          )}
          {select(
            "Distant detail (walls, doors, props)",
            <select value={settings.lodScale} onChange={(e) => set("lodScale", Number(e.target.value))} className={SELECT}>
              <option value={1}>normal (coarser from 2 cells)</option>
              <option value={3}>far (coarser from 7 cells)</option>
              <option value={0}>full detail everywhere</option>
            </select>,
          )}
          {/* (past VIEW_DISTANCE_HIGH only when the limit above allows) */}
          {slider({
            key: "viewDistance",
            label: "View distance (cells)",
            min: 5,
            max: Math.max(VIEW_DISTANCE_HIGH, settings.viewDistanceCap),
            step: 0.5,
          })}
          {effectiveViewDistance(settings) < settings.viewDistance && (
            <div className="text-[10px] text-neutral-300">Limited to {effectiveViewDistance(settings)} by this device's setting above.</div>
          )}
        </>,
        "particles, wall polygons, resolution, view distance",
      )}

      {section(
        "View & camera",
        <>
          {VIEW_SLIDERS.map(slider)}
          {CAMERA_SLIDERS.map(slider)}
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
        </>,
      )}

      {section(
        "Smoke",
        <>
          {select(
            "Smoke puffs",
            <select
              value={settings.smokeStyle}
              onChange={(e) => set("smokeStyle", e.target.value as ViewportSettings["smokeStyle"])}
              className={SELECT}
            >
              <option value="noise">noise clouds (made in the game)</option>
              <option value="painted">painted puffs</option>
              <option value="animated">painted, played as they live</option>
              <option value="paintedFew">painted, fewer, thicker, upright</option>
              <option value="paintedFewAnimated">painted, fewer, thicker, all 36 frames once</option>
              <option value="squares">see-through squares, upright</option>
              <option value="turnedSquares">see-through squares, turning</option>
            </select>,
          )}
          {check("smokeWalls", "Smoke bumps into walls, floors, ceilings")}
          {check("smokeProps", "Smoke bumps into props")}
          {check("smokeActors", "Robots push smoke aside")}
        </>,
      )}

      {section(
        "Play & testing",
        <>
          {check("gridMovement", "Grid movement (off: free, joysticks)")}
          {check("aimMiniGame", "Aiming mini-game (off: chance roll)")}
          {check("immortalCrew", "Immortal crew (HP stops at 1)")}
          {check("noclip", "Noclip (walk through walls)")}
          {check("wallBacking", "Black wall / pillar backing")}
          {check("backingInspect", "Inspect backing: translucent walls + coloured panels")}
          {check("enemyScanner", "Scanner: enemy outlines (crew gear)")}
        </>,
      )}

      {seed !== undefined &&
        section(
          "Variation & mood",
          <>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span>Variation {seed}</span>
              {onReroll && (
                <button type="button" onClick={onReroll} className="border border-neutral-600 rounded-sm px-2 py-0.5 hover:bg-neutral-800">
                  Reroll
                </button>
              )}
            </div>
            {mood && onMood && (
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                {(Object.keys(MOOD_LEVELS) as (keyof ShipMood)[]).map((key) => (
                  <select
                    key={key}
                    value={moodOverride?.[key] ?? ""}
                    title={`The ship's ${key}: rolled from the variation, or set`}
                    onChange={(e) => onMood({ ...moodOverride, [key]: e.target.value || undefined })}
                    className={SELECT}
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
          </>,
        )}

      {stats &&
        section(
          "Stats",
          <div className="text-[10px] text-neutral-300 flex flex-col">
            <span className={stats.fps < 30 ? "text-red-500 font-semibold" : stats.fps < 50 ? "text-amber-600 font-semibold" : "font-semibold"}>
              FPS: {stats.fps.toFixed(0)} ({stats.frameMs.toFixed(1)} ms)
            </span>
            <span>Rendered triangles: {stats.renderedTriangles.toLocaleString()}</span>
            <span>Draw calls: {stats.drawCalls}</span>
            <span>Cells in sight: {stats.visibleCells}</span>
            {relief && stats.relief && (
              <span>
                Relief triangles / wall: {stats.relief.trianglesPerWall.toLocaleString()} ({stats.relief.levelCount} levels)
              </span>
            )}
            <button
              type="button"
              className={`${button} mt-1 self-start`}
              onClick={() => {
                const lines = [
                  `Map: ${mapId}  Graphics: ${presetOf(settings)} (particles ${settings.particleQuality}, every ${settings.particleEvery}, wall cells ${settings.wallDetail}, LOD scale ${settings.lodScale}, pixel ratio cap ${settings.pixelRatioCap}, view distance ${settings.viewDistance})`,
                  `Screen: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
                  `FPS: ${stats.fps.toFixed(0)} (${stats.frameMs.toFixed(1)} ms)`,
                  `Rendered triangles: ${stats.renderedTriangles}`,
                  `Draw calls: ${stats.drawCalls}`,
                  `Cells in sight: ${stats.visibleCells}`,
                  ...(stats.relief ? [`Relief triangles / wall: ${stats.relief.trianglesPerWall} (${stats.relief.levelCount} levels)`] : []),
                ];
                copyText(lines.join("\n"));
              }}
            >
              Copy stats
            </button>
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
