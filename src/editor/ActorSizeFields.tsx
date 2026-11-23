import { useState, useSyncExternalStore } from "react";
import { ACTOR_TYPES } from "../game/actors";
import {
  ACTOR_SIZE_MAX, ACTOR_SIZE_MIN, ACTOR_SIZE_STEP, actorSizes, actorSizesJson, resetActorSizes, setActorSize,
  subscribeActorSizes,
} from "../game/actorSize";
import { t, useLang } from "../i18n";

const button = "rounded-sm border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700 disabled:opacity-50";
const dev = import.meta.env.DEV;

// the size factors as the game now has them (re-rendering when they change)
export const useActorSizes = () => useSyncExternalStore(subscribeActorSizes, actorSizes);

// writes the whole table (dev server only; a build can only download it)
async function saveActorSizes(): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}__voidcrew/actor-sizes`, { method: "POST", body: actorSizesJson(actorSizes()) });
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

// A built-in NPC type's size slider (Asset Manager, NPCs): a factor on the size actors.ts gives it - see
// src/game/actorSize.ts. It changes live (the preview and the game follow); Save writes src/game/actorSizes.json.
export function ActorSizeFields({ typeName }: { typeName: string }) {
  useLang();
  const sizes = useActorSizes();
  const [note, setNote] = useState("");
  const type = ACTOR_TYPES[typeName];
  if (!type) return null;
  const factor = sizes[typeName] ?? 1;
  const changed = Object.keys(sizes).sort();
  const act = (action: () => void) => { action(); setNote(""); };

  async function save() {
    try { setNote(t("assetManager.saved", { path: await saveActorSizes() })); }
    catch { setNote(t("assetManager.saveError")); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([actorSizesJson(sizes)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "actorSizes.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(actorSizesJson(sizes)); setNote(t("assetManager.copied")); }
    catch { setNote(t("assetManager.copyError")); }
  }

  return <details open className="rounded border border-neutral-800 p-2">
    <summary className="cursor-pointer font-semibold">{t("assetManager.npcSize.title")}</summary>
    <p className="my-1 text-xs text-neutral-400">{t("assetManager.npcSize.hint")}</p>
    <label className="my-1 block text-sm">{t("assetManager.npcSize.factor")}: <strong>{factor.toFixed(2)}×</strong>
      <input className="block w-full" type="range" min={ACTOR_SIZE_MIN} max={ACTOR_SIZE_MAX} step={ACTOR_SIZE_STEP} value={factor}
        onChange={e => act(() => setActorSize(typeName, e.target.valueAsNumber))}/>
    </label>
    <p className="text-xs text-neutral-300">{t("assetManager.npcSize.height", { h: (type.height * factor).toFixed(2), base: type.height.toFixed(2) })}</p>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button className={button} onClick={dev ? () => void save() : download}>{t(dev ? "assetManager.save" : "assetManager.npcSize.download")}</button>
      {!dev && <button className={button} onClick={() => void copy()}>{t("assetManager.copy")}</button>}
      <button className={button} disabled={factor === 1} onClick={() => act(() => setActorSize(typeName, undefined))}>{t("assetManager.reset")}</button>
      <button className={button} disabled={!changed.length} onClick={() => act(resetActorSizes)}>{t("assetManager.npcSize.resetAll")}</button>
    </div>
    {changed.length > 0 && <p className="mt-1 text-xs text-neutral-300">{t("assetManager.npcSize.changed", {
      list: changed.map(name => `${name} ${sizes[name].toFixed(2)}×`).join(", "),
    })}</p>}
    {note && <p className="mt-1 text-xs text-neutral-300">{note}</p>}
    {!dev && <p className="mt-1 text-xs text-neutral-400">{t("assetManager.npcSize.downloadHint")}</p>}
  </details>;
}
