// The "AI depth" button of the Depth channel: runs Depth Anything V2 Small in the browser (src/render/aiDepth.ts) and stores the
// result as an uploaded depth PNG on the draft (optionally the normal map made from it). Editor-only; nothing runs without a click.

import { useRef, useState } from "react";
import { t } from "../i18n";
import { AiDepthAborted, defaultAiDepthOptions, generateAiDepth, isAiDepthCached, type AiDepthOptions } from "../render/aiDepth";
import type { AiDepthDevice } from "../render/aiDepthWorker";
import { generateNormal } from "../render/depthNormal";
import { applyTransparency, decode, encode } from "./imageTools";
import type { TextureEditor } from "./TexturePanel";

const small = "rounded border border-neutral-500 bg-neutral-800 px-2 py-1 text-xs hover:border-amber-400 disabled:opacity-50";

// a small neutral pill with a subtle accent: this feature runs an AI model
export function AiBadge({ className = "" }: { className?: string }) {
  return <span className={"rounded border border-sky-400/60 bg-neutral-700 px-1 text-[10px] font-bold leading-4 text-sky-200 " + className} title={t("assetManager.ai.hint", { size: t("assetManager.ai.size") })}>AI</span>;
}

export function AiDepthControls({ editor }: { editor: TextureEditor }) {
  const { view } = editor;
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState("");
  const [device, setDevice] = useState<AiDepthDevice | undefined>();
  const [options, setOptions] = useState<AiDepthOptions>(defaultAiDepthOptions);
  const [alsoNormal, setAlsoNormal] = useState(true);
  const abort = useRef<AbortController | null>(null);
  if (!view) return null;
  const hasDiffuse = view.slot("diffuse").has;
  const cached = isAiDepthCached();
  const set = <K extends keyof AiDepthOptions>(key: K, value: AiDepthOptions[K]) => setOptions(o => ({ ...o, [key]: value }));

  async function start() {
    if (!view) return;
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true); setDevice(undefined); setLabel(t("assetManager.ai.preparing"));
    try {
      const raw = await editor.diffuseBlob();
      if (!raw) throw new Error(t("assetManager.required"));
      const image = await decode((await applyTransparency(raw, view.transparency)) ?? raw);
      const depth = await generateAiDepth(image, { ...options, pixelArt: view.pixelArt }, p => {
        if (p.stage === "backend") setDevice(p.device);
        setLabel(p.stage === "download" ? t("assetManager.ai.downloading", { percent: Math.round(p.fraction * 100) })
          : p.stage === "run" ? t("assetManager.ai.running") : p.stage === "post" ? t("assetManager.ai.finishing")
          : p.stage === "load" ? t("assetManager.ai.loading") : t("assetManager.ai.preparing"));
      }, controller.signal);
      const depthBlob = await encode(depth);
      const normalBlob = alsoNormal ? await encode(new ImageData(generateNormal(depth.data, depth.width, depth.height), depth.width, depth.height)) : undefined;
      await editor.applyAiMaps(depthBlob, normalBlob);
    } catch (error) {
      if (!(error instanceof AiDepthAborted)) editor.onError(error instanceof Error ? error.message : String(error));
    } finally {
      abort.current = null;
      setRunning(false); setLabel("");
    }
  }

  return <div className="mt-1 flex flex-col gap-1 border-t border-neutral-700 pt-1">
    <div className="flex flex-wrap items-center gap-1">
      <button className={small + " inline-flex items-center gap-1"} disabled={running || editor.busy || !hasDiffuse} title={t("assetManager.ai.hint", { size: t("assetManager.ai.size") })} onClick={() => void start()}>
        <AiBadge/>{t("assetManager.ai.button")}
      </button>
      {running && <button className={small} onClick={() => abort.current?.abort()}>{t("assetManager.cancel")}</button>}
    </div>
    {running && <p role="status" className="text-[10px] text-sky-200">{label}</p>}
    {running && device === "wasm" && <p className="text-[10px] text-yellow-300">{t("assetManager.ai.slow")}</p>}
    <p className="text-[10px] text-neutral-400">{cached ? t("assetManager.ai.cached") : t("assetManager.ai.hint", { size: t("assetManager.ai.size") })}</p>
    <p className="text-[10px] text-neutral-400">{t("assetManager.ai.licence")}</p>
    <label className="text-[11px]"><input type="checkbox" checked={alsoNormal} disabled={running} onChange={e => setAlsoNormal(e.target.checked)}/> {t("assetManager.ai.alsoNormal")}</label>
    <details className="text-[11px]"><summary className="cursor-pointer">{t("assetManager.ai.options")}</summary>
      <div className="mt-1 flex flex-col gap-1">
        <label><input type="checkbox" checked={options.invert} disabled={running} onChange={e => set("invert", e.target.checked)}/> {t("assetManager.ai.invert")}</label>
        <label>{t("assetManager.ai.detail")}: <strong>{options.detail.toFixed(2)}</strong>
          <input className="block w-full" type="range" min="0" max="1" step="0.05" value={options.detail} disabled={running} onChange={e => set("detail", +e.target.value)}/></label>
        <label><input type="checkbox" checked={options.keepAlpha} disabled={running} onChange={e => set("keepAlpha", e.target.checked)}/> {t("assetManager.ai.keepAlpha")}</label>
      </div>
    </details>
  </div>;
}
