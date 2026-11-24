import { useEffect, useState } from "react";
import { t, type Key } from "../../i18n";
import type { MapFile } from "../../game/mapFormat";
import { cleanSkyGradient, skyGradientStops, SKY_GRADIENT_PRESETS, skyTextures, type SkyGradient } from "../../game/skyGradient";
import { activeWorld } from "../../game/worlds";
import { skyOptions } from "../../game/skyImage";
import { useSharedImages } from "../../render/sharedImages";
import { TexturePicker } from "../TexturePicker";
import { BUTTON, idle, KindChoice } from "./parts";

// The map settings' "Égbolt" fields: an image (a built-in one from public/skies/ or an uploaded shared sky), or a
// gradient drawn from three colours. The choice lives in textures.sky / textures.skyGradient.
export function SkyFields({ value, onChange }: { value: MapFile["textures"]; onChange: (textures: MapFile["textures"] | undefined) => void }) {
  const [skies, setSkies] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.BASE_URL}skies/index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => { if (live && Array.isArray(list)) setSkies(list.filter((name): name is string => typeof name === "string")); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // the built-in names, then the loaded shared skies of the map's world (see game/skyImage.ts)
  const shared = useSharedImages().filter((image) => image.type === "sky");
  const options = skyOptions({
    builtins: skies,
    shared,
    world: activeWorld(),
    current: typeof value?.sky === "string" && value.sky ? value.sky : undefined,
    baseUrl: import.meta.env.BASE_URL,
    generatedLabel: t("editorBar.skyGenerated"),
    missingLabel: (id) => t("editorBar.skyNotLoaded", { id }),
  });

  const gradient = cleanSkyGradient(value?.skyGradient);
  const kind = gradient ? "gradient" : "image";
  const change = (textures: MapFile["textures"] | undefined) => onChange(textures);
  const patch = (next: Partial<SkyGradient>) => {
    const base = gradient ?? SKY_GRADIENT_PRESETS[0].gradient;
    change(skyTextures(value, { kind: "gradient", gradient: { ...base, ...next } }));
  };
  const preview = gradient ? `linear-gradient(to bottom, ${skyGradientStops(gradient).map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(", ")})` : undefined;

  return <>
    <KindChoice
      label={t("editorBar.sky")}
      value={kind}
      options={[
        { value: "image", label: t("editorBar.skyImageChoice") },
        { value: "gradient", label: t("editorBar.skyGradientChoice") },
      ]}
      onChange={(next) => change(skyTextures(value, next === "gradient" ? { kind: "gradient", gradient: SKY_GRADIENT_PRESETS[0].gradient } : { kind: "image", image: typeof value?.sky === "string" ? value.sky : undefined }))}
    />
    {kind === "image" ? <TexturePicker
      label={t("editorBar.skyImage")}
      title={t("editorBar.skyImageHint")}
      value={typeof value?.sky === "string" ? value.sky : ""}
      options={options}
      onChange={(next) => change(skyTextures(value, { kind: "image", image: next || undefined }))}
    /> : <>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <span>{t("editorBar.skyPreset")}</span>
        {SKY_GRADIENT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`${BUTTON} ${idle}`}
            title={t(preset.label as Key)}
            onClick={() => change(skyTextures(value, { kind: "gradient", gradient: preset.gradient }))}
          >
            {t(preset.label as Key)}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1">
        <span>{t("editorBar.skyTop")}</span>
        <input type="color" value={gradient?.top ?? "#3b78d8"} onChange={(e) => patch({ top: e.target.value })} className="h-5 w-10 border border-neutral-700 bg-neutral-800 p-0" />
      </label>
      <label className="flex items-center gap-1">
        <span>{t("editorBar.skyHorizon")}</span>
        <input type="color" value={gradient?.horizon ?? "#cfe6ff"} onChange={(e) => patch({ horizon: e.target.value })} className="h-5 w-10 border border-neutral-700 bg-neutral-800 p-0" />
      </label>
      <label className="flex items-center gap-1" title={t("editorBar.skyBottomHint")}>
        <input type="checkbox" checked={!!gradient?.bottom} onChange={(e) => patch({ bottom: e.target.checked ? (gradient?.horizon ?? "#1b2a4a") : undefined })} />
        <span>{t("editorBar.skyBottom")}</span>
        <input type="color" disabled={!gradient?.bottom} value={gradient?.bottom ?? "#1b2a4a"} onChange={(e) => patch({ bottom: e.target.value })} className="h-5 w-10 border border-neutral-700 bg-neutral-800 p-0 disabled:opacity-30" />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-neutral-400">{t("editorBar.skyPreview")}</span>
        <div className="h-8 w-full rounded-sm border border-neutral-700" style={{ background: preview }} />
      </div>
    </>}
  </>;
}
