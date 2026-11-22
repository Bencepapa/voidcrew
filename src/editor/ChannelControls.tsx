// The shared channel UI of the Assets window: the controls under one map's thumbnail (Upload / Auto / None / Remove,
// "Normal from depth", the AI depth section) and a row of such cards. Every category with a texture feeds it a
// ChannelEditor (channelEditor.ts): the Textures panel and the props' own textures through useTextureEditor, the pickups,
// decals and NPC sheets through small adapters over their own drafts.

import { useEffect, useRef, useState, type DragEvent } from "react";
import { t, type Key } from "../i18n";
import { AiBadge, AiDepthControls } from "./AiDepthControls";
import { aiChannelOf, canDeriveNormal, normalPixelsFromDepth, type ChannelEditor } from "./channelEditor";
import { decode, encode } from "./imageTools";
import type { MapKey, MapMode } from "./textureDrafts";

const small = "rounded border border-neutral-500 bg-neutral-800 px-2 py-1 text-xs hover:border-amber-400 aria-pressed:border-amber-400 aria-pressed:bg-neutral-700 disabled:opacity-50";
const rowKey = (k: MapKey) => ("assetManager.row." + k) as Key;
const modeKey = (m: MapMode) => ("assetManager.mode." + m) as Key;

// the normal map made from a depth map's PNG (what "Normal from depth" stores as an uploaded normal)
export async function normalBlobFromDepth(depth: Blob): Promise<Blob> {
  const image = await decode(depth);
  return encode(new ImageData(normalPixelsFromDepth(image) as Uint8ClampedArray<ArrayBuffer>, image.width, image.height));
}

// an object URL of a Blob (made when it changes, revoked after); "" for none: the thumbnail of a draft's map
export function useBlobUrl(blob?: Blob | null): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) { setUrl(""); return; }
    const created = URL.createObjectURL(blob);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [blob]);
  return url;
}

// ---- the controls of one channel card (Upload / Auto / None / Remove), under its thumbnail ----

export function ChannelControls({ editor, channel, onAiRunning }: {
  editor: ChannelEditor; channel: MapKey; onAiRunning?: (running: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { view } = editor;
  if (!view) return null;
  const slot = view.slot(channel);
  const required = channel === "diffuse";
  const modes = editor.modes(channel);

  async function normalFromDepth() {
    try {
      const depth = await editor.depthBlob?.();
      if (!depth) return;
      await editor.applyNormal?.(await normalBlobFromDepth(depth));
    } catch (error) { editor.onError(error instanceof Error ? error.message : String(error)); }
  }

  return <div className="mt-1 flex flex-col gap-1" onDragOver={e => e.preventDefault()}
    onDrop={(e: DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && !e.currentTarget.closest("fieldset:disabled")) void editor.chooseFile(channel, f); }}>
    {modes.length > 1 && <div className="flex flex-wrap gap-1" role="group" aria-label={t(rowKey(channel))}>{modes.map(m =>
      <button key={m} className={small} aria-pressed={slot.mode === m} title={m === "auto" ? t("assetManager.autoHint") : undefined} onClick={() => editor.setMode(channel, m, () => input.current?.click())}>{t(modeKey(m))}</button>)}</div>}
    <div className="flex flex-wrap gap-1">
      <button className={small} onClick={() => input.current?.click()}>{t("assetManager.chooseFile")}</button>
      {(slot.has || (modes.includes("none") && slot.mode !== "none")) &&<button className={small} onClick={() => void editor.remove(channel)}>{t("assetManager.remove")}</button>}
      <input ref={input} type="file" accept={editor.accept ?? "image/png"} className="sr-only" aria-label={t("assetManager.chooseFileFor", { map: t(rowKey(channel)) })} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void editor.chooseFile(channel, f); }}/>
    </div>
    {channel === "normal" && canDeriveNormal(editor) &&
      <button className={small + " self-start"} disabled={editor.busy} title={t("assetManager.normalFromDepthHint")} onClick={() => void normalFromDepth()}>{t("assetManager.normalFromDepth")}</button>}
    {required && !slot.has && <p className="text-[10px] text-red-300">{t("assetManager.required")}</p>}
    {channel === aiChannelOf(editor.channels) && <>
      {channel === "depth" && editor.aiDepth && slot.mode === "uploaded" && slot.has && <p className="flex items-center gap-1 text-[10px] text-neutral-300"><AiBadge/>{t("assetManager.ai.status")}</p>}
      <AiDepthControls editor={editor} onRunningChange={onAiRunning} normalOnly={!editor.channels.includes("depth")}/>
    </>}
  </div>;
}

// ---- a row of channel cards: the title, the thumbnail (urls), the controls ----

export function ChannelCards({ editor, urls, channels = editor.channels, onAiRunning }: {
  editor: ChannelEditor;
  // the thumbnails by channel (what the preview shows for it); a missing one says "Empty"
  urls: Partial<Record<MapKey, string | undefined>>;
  channels?: readonly MapKey[];
  onAiRunning?: (running: boolean) => void;
}) {
  return <div className="grid gap-2">
    {channels.map(channel => <div key={channel} className="rounded border border-neutral-700 p-2">
      <strong>{t(("assetManager." + channel) as Key)}</strong>
      {urls[channel] && <img src={urls[channel]} alt={t(("assetManager." + channel) as Key)} className="h-16 w-full object-contain"/>}
      <ChannelControls editor={editor} channel={channel} onAiRunning={onAiRunning}/>
    </div>)}
  </div>;
}
