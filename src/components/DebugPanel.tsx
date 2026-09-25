import type { TextureSetId, ViewportSettings, ViewportStats, WallProfileId } from "./GameViewport";

interface DebugPanelProps {
  settings: ViewportSettings;
  onChange: (settings: ViewportSettings) => void;
  stats: ViewportStats | null;
  // translucent, non-scrolling variant for the mobile overlay layout (the
  // overlay container scrolls instead)
  compact?: boolean;
}

const TEXTURE_SET_OPTIONS: { id: TextureSetId; label: string }[] = [
  { id: "wall1", label: "wall1 - photo" },
  { id: "wall2", label: "wall2 - pixel art" },
  { id: "wall3", label: "wall3 - pixel art (5x)" },
  { id: "wall4", label: "wall4 - pixel art (processed)" },
  { id: "wall5", label: "wall5 - pixel art (processed)" },
];

const ACCENT_RATIO_SLIDER: SliderConfig = {
  key: "accentRatio",
  label: "Accent share of walls",
  min: 0,
  max: 1,
  step: 0.05,
};

const WALL_PROFILE_OPTIONS: { id: WallProfileId; label: string }[] = [
  { id: "flat", label: "Flat" },
  { id: "convex", label: "Beveled - convex (bulges out)" },
  { id: "concave", label: "Beveled - concave (recedes in)" },
  { id: "relief", label: "Relief mesh (from depth map)" },
];

interface SliderConfig {
  key: keyof ViewportSettings;
  label: string;
  min: number;
  max: number;
  step: number;
}

const DISPLACEMENT_SLIDER: SliderConfig = {
  key: "displacementScale",
  label: "Depth displacement",
  min: 0,
  max: 0.06,
  step: 0.005,
};

const RELIEF_SLIDERS: SliderConfig[] = [
  { key: "reliefDepth", label: "Relief depth", min: 0.005, max: 0.12, step: 0.005 },
  { key: "reliefLevels", label: "Relief height levels", min: 2, max: 16, step: 1 },
  { key: "reliefMinIsland", label: "Min feature size (px, 1 = off)", min: 1, max: 16, step: 1 },
  { key: "aoIntensity", label: "AO strength (ambient)", min: 0, max: 1.5, step: 0.05 },
  { key: "aoDirect", label: "AO on direct light", min: 0, max: 1, step: 0.05 },
  { key: "aoRadius", label: "AO radius (px)", min: 1, max: 16, step: 1 },
];

const MATERIAL_SLIDERS: SliderConfig[] = [
  { key: "roughness", label: "Roughness", min: 0.05, max: 1, step: 0.05 },
  { key: "metalness", label: "Metalness", min: 0, max: 1, step: 0.05 },
  { key: "normalStrength", label: "Normal map strength", min: 0, max: 3, step: 0.1 },
];

const SLIDERS: SliderConfig[] = [
  { key: "eyeHeight", label: "Eye height", min: 0.1, max: 0.9, step: 0.01 },
  { key: "wallHeight", label: "Wall height", min: 0.6, max: 2, step: 0.05 },
  { key: "cameraPullback", label: "Camera pullback", min: 0, max: 0.49, step: 0.01 },
  { key: "moveDurationMs", label: "Move duration (ms)", min: 60, max: 600, step: 10 },
  { key: "fov", label: "FOV", min: 40, max: 100, step: 1 },
  { key: "pointLightIntensity", label: "Point light", min: 0, max: 8, step: 0.1 },
  { key: "mapLightIntensity", label: "Map lights", min: 0, max: 3, step: 0.05 },
  { key: "ambientIntensity", label: "Ambient light", min: 0, max: 2, step: 0.05 },
];

const BEVEL_SLIDERS: SliderConfig[] = [
  { key: "bevelFraction", label: "Bevel fraction", min: 0.05, max: 0.45, step: 0.01 },
  { key: "bevelAngleDeg", label: "Bevel angle (deg, from floor)", min: 15, max: 75, step: 1 },
];

export function DebugPanel({ settings, onChange, stats, compact }: DebugPanelProps) {
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

  const beveled = settings.wallProfile === "convex" || settings.wallProfile === "concave";
  const relief = settings.wallProfile === "relief";

  return (
    <div
      className={`w-full flex flex-col gap-3 border border-neutral-700 rounded-sm p-2 text-neutral-300 ${compact ? "bg-black/40" : "h-full bg-neutral-900/80 overflow-y-auto"}`}
    >
      <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">Debug</div>

      <label className="flex items-center gap-2 text-[11px] cursor-pointer">
        <input
          type="checkbox"
          checked={settings.gridMovement}
          onChange={(e) => set("gridMovement", e.target.checked)}
        />
        Grid movement (off: free, joysticks)
      </label>

      <label className="flex items-center gap-2 text-[11px] cursor-pointer">
        <input
          type="checkbox"
          checked={settings.decalsEnabled}
          onChange={(e) => set("decalsEnabled", e.target.checked)}
        />
        Decals
      </label>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] text-neutral-500">Texture set</div>
        {TEXTURE_SET_OPTIONS.map((opt) => (
          <label key={opt.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
            <input
              type="radio"
              name="textureSet"
              checked={settings.textureSet === opt.id}
              onChange={() => set("textureSet", opt.id)}
            />
            {opt.label}
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-neutral-500">Accent texture (some walls)</span>
        <select
          value={settings.accentTextureSet}
          onChange={(e) => set("accentTextureSet", e.target.value as ViewportSettings["accentTextureSet"])}
          className="bg-neutral-800 border border-neutral-700 text-[11px] px-1 py-0.5 rounded-sm"
        >
          <option value="none">none</option>
          {TEXTURE_SET_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {settings.accentTextureSet !== "none" && slider(ACCENT_RATIO_SLIDER)}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-neutral-500">Floor texture</span>
        <select
          value={settings.floorTextureSet}
          onChange={(e) => set("floorTextureSet", e.target.value as ViewportSettings["floorTextureSet"])}
          className="bg-neutral-800 border border-neutral-700 text-[11px] px-1 py-0.5 rounded-sm"
        >
          <option value="map">per map (floor1 / floor2)</option>
          <option value="none">none (plain)</option>
          <option value="floor1">floor1 - grate</option>
          <option value="floor2">floor2 - diamond plate</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-neutral-500">Ceiling texture</span>
        <select
          value={settings.ceilingTextureSet}
          onChange={(e) => set("ceilingTextureSet", e.target.value as ViewportSettings["ceilingTextureSet"])}
          className="bg-neutral-800 border border-neutral-700 text-[11px] px-1 py-0.5 rounded-sm"
        >
          <option value="none">none (plain)</option>
          <option value="ceiling1">ceiling1 - panels with light</option>
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] text-neutral-500">Wall type</div>
        {WALL_PROFILE_OPTIONS.map((opt) => (
          <label key={opt.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
            <input
              type="radio"
              name="wallProfile"
              checked={settings.wallProfile === opt.id}
              onChange={() => set("wallProfile", opt.id)}
            />
            {opt.label}
          </label>
        ))}
      </div>

      {beveled && BEVEL_SLIDERS.map(slider)}
      {relief ? RELIEF_SLIDERS.map(slider) : slider(DISPLACEMENT_SLIDER)}
      {MATERIAL_SLIDERS.map(slider)}

      {stats && (
        <div className="text-[10px] text-neutral-500 flex flex-col">
          <span>Rendered triangles: {stats.renderedTriangles.toLocaleString()}</span>
          {relief && stats.relief && (
            <>
              <span>Relief triangles / wall: {stats.relief.trianglesPerWall.toLocaleString()}</span>
              <span>
                Height levels: {stats.relief.levelCount}{" "}
                {stats.relief.baked ? "(baked in map - levels slider ignored)" : "(quantized)"}
              </span>
            </>
          )}
        </div>
      )}

      {SLIDERS.map(slider)}

      <label className="flex items-center gap-2 text-[11px] cursor-pointer">
        <input type="checkbox" checked={settings.bobEnabled} onChange={(e) => set("bobEnabled", e.target.checked)} />
        Idle head-bob
      </label>
    </div>
  );
}
