// The "AI depth" button of the Depth channel: runs Depth Anything V2 Small in the browser (src/render/aiDepth.ts) and stores the
// result as an uploaded depth PNG on the draft (optionally the normal map made from it). Editor-only; nothing runs without a click.

import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { AiDepthAborted, defaultAiDepthOptions, generateAiDepth, isAiDepthCached, type AiDepthOptions } from "../render/aiDepth";
import type { AiDepthDevice } from "../render/aiDepthWorker";
import { generateNormal } from "../render/depthNormal";
import { applyTransparency, decode, encode, type Transparency } from "./imageTools";

const small = "rounded border border-neutral-500 bg-neutral-800 px-2 py-1 text-xs hover:border-amber-400 disabled:opacity-50";

// a small neutral pill with a subtle accent: this feature runs an AI model
export function AiBadge({ className = "" }: { className?: string }) {
  return <span className={"rounded border border-sky-400/60 bg-neutral-700 px-1 text-[10px] font-bold leading-4 text-sky-200 " + className} title={t("assetManager.ai.licence")}>AI</span>;
}

type AiDepthEditor = {
  view?: { pixelArt: boolean; transparency: Transparency; slot: (channel: "diffuse") => { has: boolean } };
  busy: boolean;
  diffuseBlob: () => Promise<Blob | null | undefined>;
  applyAiMaps: (depth: Blob, normal?: Blob) => Promise<void>;
  onError: (message: string) => void;
};

export function AiDepthControls({ editor, onRunningChange, normalOnly = false }: {
  editor: AiDepthEditor;
  onRunningChange?: (running: boolean) => void;
  // the category stores no depth map (a decal, an NPC sheet): the run always makes the normal map, and the depth is only a step
  normalOnly?: boolean;
}) {
  const { view } = editor;
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState("");
  const [fraction, setFraction] = useState<number | undefined>();
  const [device, setDevice] = useState<AiDepthDevice | undefined>();
  const [options, setOptions] = useState<AiDepthOptions>(defaultAiDepthOptions);
  const [alsoNormal, setAlsoNormal] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const runningCallback = useRef(onRunningChange);
  runningCallback.current = onRunningChange;
  useEffect(() => () => {
    if (abort.current) runningCallback.current?.(false);
    abort.current?.abort();
    abort.current = null;
  }, []);
  if (!view) return null;
  const hasDiffuse = view.slot("diffuse").has;
  const cached = isAiDepthCached();
  const set = <K extends keyof AiDepthOptions>(key: K, value: AiDepthOptions[K]) => setOptions(o => ({ ...o, [key]: value }));

  async function start() {
    if (!view || abort.current || editor.busy) return;
    const controller = new AbortController();
    abort.current = controller;
    onRunningChange?.(true);
    setRunning(true); setDevice(undefined); setLabel(t("assetManager.ai.preparing"));
    try {
      const raw = await editor.diffuseBlob();
      if (!raw) throw new Error(t("assetManager.required"));
      const image = await decode((await applyTransparency(raw, view.transparency)) ?? raw);
      const depth = await generateAiDepth(image, { ...options, pixelArt: view.pixelArt }, p => {
        if (p.stage === "backend") setDevice(p.device);
        setFraction(p.stage === "download" ? p.fraction : undefined);
        setLabel(p.stage === "download" ? t("assetManager.ai.downloading", { percent: Math.round(p.fraction * 100) })
          : p.stage === "run" ? t("assetManager.ai.running") : p.stage === "post" ? t("assetManager.ai.finishing")
          : p.stage === "load" ? t("assetManager.ai.loading") : t("assetManager.ai.preparing"));
      }, controller.signal);
      const depthBlob = await encode(depth);
      const normalBlob = alsoNormal || normalOnly ? await encode(new ImageData(generateNormal(depth.data, depth.width, depth.height), depth.width, depth.height)) : undefined;
      controller.signal.throwIfAborted();
      await editor.applyAiMaps(depthBlob, normalBlob);
    } catch (error) {
      if (!controller.signal.aborted && !(error instanceof AiDepthAborted)) editor.onError(error instanceof Error ? error.message : String(error));
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        onRunningChange?.(false);
        setRunning(false); setLabel(""); setFraction(undefined);
      }
    }
  }

  return <details className="mt-1 border-t border-neutral-700 pt-1 text-[11px]">
    <summary className="flex cursor-pointer select-none items-center gap-1 text-neutral-200">
      <AiBadge/>{t(normalOnly ? "assetManager.ai.sectionNormal" : "assetManager.ai.section")}
    </summary>
    {running && <div role="status" className="mt-1">
      <div className="whitespace-normal break-words text-[10px] text-sky-200">{label}</div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-neutral-700">
        {fraction === undefined
          ? <div className="h-full w-1/3 animate-pulse rounded bg-sky-400"/>
          : <div className="h-full rounded bg-sky-400 transition-[width]" style={{ width: `${Math.round(fraction * 100)}%` }}/>}
      </div>
    </div>}
    <div className="mt-1 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <button className={small} disabled={running || editor.busy || !hasDiffuse} title={t("assetManager.ai.hint", { size: t("assetManager.ai.size") })} onClick={() => void start()}>
          {t("assetManager.ai.button")}
        </button>
        {running && <button className={small} onClick={() => abort.current?.abort()}>{t("assetManager.cancel")}</button>}
      </div>
      {running && device === "wasm" && <p className="text-[10px] text-yellow-300">{t("assetManager.ai.slow")}</p>}
      <p className="text-[10px] text-neutral-400">{cached ? t("assetManager.ai.cached") : t("assetManager.ai.hint", { size: t("assetManager.ai.size") })}</p>
      {!normalOnly && <label><input type="checkbox" checked={alsoNormal} disabled={running} onChange={e => setAlsoNormal(e.target.checked)}/> {t("assetManager.ai.alsoNormal")}</label>}
      <label><input type="checkbox" checked={options.invert} disabled={running} onChange={e => set("invert", e.target.checked)}/> {t("assetManager.ai.invert")}</label>
      <label>{t("assetManager.ai.detail")}: <strong>{options.detail.toFixed(2)}</strong>
        <input className="block w-full" type="range" min="0" max="1" step="0.05" value={options.detail} disabled={running} onChange={e => set("detail", +e.target.value)}/></label>
      <label><input type="checkbox" checked={options.keepAlpha} disabled={running} onChange={e => set("keepAlpha", e.target.checked)}/> {t("assetManager.ai.keepAlpha")}</label>
    </div>
  </details>;
}
