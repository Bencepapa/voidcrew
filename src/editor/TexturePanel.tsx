// The Assets window's texture editor: the properties of one shared texture (a
// local draft of a new one, or of a published one) with a row per channel, and
// the yellow "unsaved changes" bar with Publish and Discard.

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Lock } from "lucide-react";
import { t, type Key } from "../i18n";
import type { WorldId } from "../game/worlds";
import { StorageFullError } from "./idb";
import { hasAlpha, validatePng, type TransparencySource } from "./imageTools";
import type { MaterialMaps } from "./materialMaps";
import { SharedLoginForm, sharedConfigured, sharedToken, useSharedAuth } from "./sharedAuth";
import { publishDrafts } from "./sharedTextures";
import { draftById, draftCounts, draftId, discardAllDrafts, discardDraft, MAP_KEYS, saveDraft, useDrafts, type MapKey, type MapMode, type SurfaceKind, type TextureDraft } from "./textureDrafts";
import { ensureDraft, sharedInfo, textureStatus, useTextureVersion } from "./textureLibrary";

const small = "rounded border border-neutral-500 bg-neutral-800 px-2 py-1 text-xs hover:border-amber-400 aria-pressed:border-amber-400 aria-pressed:bg-neutral-700 disabled:opacity-50";
const rowKey = (k: MapKey) => ("assetManager.row." + k) as Key;
const modeKey = (m: MapMode) => ("assetManager.mode." + m) as Key;
const modesOf = (k: MapKey): MapMode[] => k === "diffuse" ? ["uploaded"] : k === "normal" || k === "depth" ? ["uploaded", "auto", "none"] : ["uploaded", "none"];

export function AutoBadge({ className = "" }: { className?: string }) {
  return <span className={"rounded bg-amber-500 px-1 text-[10px] font-bold leading-4 text-black " + className} title={t("assetManager.autoHint")}>AUTO</span>;
}

export const errorText = (error: unknown) => error instanceof StorageFullError ? t("assetManager.storageFull") : error instanceof Error ? error.message : String(error);

// a copy to edit (the Blobs stay the same objects, so what was derived from them is kept)
function cloneDraft(d: TextureDraft): TextureDraft {
  return { ...d, kinds: [...d.kinds], transparency: { ...d.transparency }, maps: Object.fromEntries(MAP_KEYS.map(k => [k, { ...d.maps[k] }])) as TextureDraft["maps"] };
}

// ---- the panel for one texture ----

export function TexturePanel({ id, maps, onError, onSelect }: { id: string; maps: MaterialMaps; onError: (message: string) => void; onSelect: (id: string) => void }) {
  const drafts = useDrafts();
  useTextureVersion();
  const status = textureStatus(id);
  const draft = drafts.find(d => draftId(d) === id);
  const info = sharedInfo(id);
  const meta = info?.meta;
  const [busy, setBusy] = useState(false);
  const [dragKey, setDragKey] = useState<MapKey | null>(null);

  // the state to show: the draft, or the published texture
  const view = draft
    ? { name: draft.name, kinds: draft.kinds, pixelArt: draft.pixelArt, transparency: draft.transparency, diffuseAlpha: draft.diffuseAlpha, world: draft.world,
        slot: (k: MapKey) => ({ mode: draft.maps[k].mode, has: !!draft.maps[k].blob }) }
    : meta && info ? { name: meta.name, kinds: meta.kinds, pixelArt: meta.pixelArt, transparency: meta.transparency, diffuseAlpha: undefined, world: info.world,
        slot: (k: MapKey) => ({ mode: meta.maps[k], has: meta.maps[k] === "uploaded" }) }
    : undefined;

  const [nameText, setNameText] = useState(view?.name ?? "");
  const nameTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setNameText(view?.name ?? ""); }, [id, view?.name]);
  useEffect(() => () => clearTimeout(nameTimer.current), [id]);

  // changes a draft (making one from the published texture first)
  async function change(fn: (d: TextureDraft) => TextureDraft | Promise<TextureDraft>) {
    setBusy(true);
    try {
      const base = draftById(id) ?? await ensureDraft(id);
      await saveDraft(await fn(cloneDraft(base)));
    } catch (error) { onError(errorText(error)); }
    finally { setBusy(false); }
  }

  async function chooseFile(key: MapKey, file: File) {
    try {
      await validatePng(file, file.name);
      const blob = file.slice(0, file.size, "image/png");
      const alpha = key === "diffuse" ? await hasAlpha(blob) : false;
      await change(d => {
        d.maps[key] = { mode: "uploaded", blob };
        if (key === "diffuse") {
          d.diffuseAlpha = alpha;
          if (alpha) d.transparency.source = "alpha";
          else if (d.transparency.source === "alpha") d.transparency.source = "none";
        }
        return d;
      });
    } catch (error) { onError(errorText(error)); }
  }

  function setMode(key: MapKey, mode: MapMode, open?: () => void) {
    const has = view?.slot(key).has;
    if (mode === "uploaded" && !has) { open?.(); return; }
    void change(d => { d.maps[key] = { ...d.maps[key], mode }; return d; });
  }

  function drop(key: MapKey, event: DragEvent) {
    event.preventDefault();
    setDragKey(null);
    const file = event.dataTransfer.files[0];
    if (file) void chooseFile(key, file);
  }

  if (status === "builtin") return <p className="my-1 flex items-center gap-1 text-xs text-neutral-300"><Lock size={14} aria-hidden="true"/>{t("assetManager.builtinHint")}</p>;
  if (status === "legacy") return <p className="my-1 text-xs text-neutral-300">{t("assetManager.legacyHint")}</p>;
  if (!view) return null;

  const isNew = status === "new";
  const autoKeys = (["normal", "depth"] as const).filter(k => view.slot(k).mode === "auto");
  const colorOk = /^#[0-9a-f]{6}$/i.test(view.transparency.colorKey);
  const setSource = (source: TransparencySource) => void change(d => { d.transparency.source = source; return d; });

  return <div className="mt-1 flex flex-col gap-2 text-sm" aria-busy={busy}>
    <p className={"text-xs " + (draft ? "text-yellow-300" : "text-neutral-300")}>
      {isNew ? t("assetManager.statusNew") : draft ? t("assetManager.statusChanged", { rev: draft.baseRev }) : t("assetManager.statusShared", { rev: info?.rev ?? 0 })}
      {autoKeys.length > 0 && <> · <AutoBadge/> {autoKeys.map(k => t(rowKey(k))).join(", ")}</>}
    </p>
    <label className="block">{t("assetManager.nameLabel")}
      <input className="mt-1 block w-full rounded border border-neutral-500 bg-neutral-900 px-2 py-1" value={nameText} maxLength={60}
        onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }}
        onChange={e => { const v = e.target.value; setNameText(v); clearTimeout(nameTimer.current); if (draft) nameTimer.current = setTimeout(() => void change(d => { d.name = v; return d; }), 350); }}
        onBlur={() => { clearTimeout(nameTimer.current); if (nameText !== view.name) void change(d => { d.name = nameText; return d; }); }}/>
    </label>
    <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1"><legend className="mb-1 text-xs text-neutral-300">{t("assetManager.useLabel")}</legend>
      {(["wall", "floor", "ceiling"] as SurfaceKind[]).map(kind => {
        const on = view.kinds.includes(kind);
        return <label key={kind}><input type="checkbox" checked={on} disabled={on && view.kinds.length === 1} onChange={e => void change(d => { d.kinds = (["wall", "floor", "ceiling"] as SurfaceKind[]).filter(k => k === kind ? e.target.checked : d.kinds.includes(k)); return d; })}/> {t(("assetManager." + kind) as Key)}</label>;
      })}
    </fieldset>
    <label><input type="checkbox" checked={view.pixelArt} onChange={e => void change(d => { d.pixelArt = e.target.checked; return d; })}/> {t("assetManager.pixelArt")}</label>
    <label>{t("assetManager.world")} {isNew
      ? <select className={small} value={view.world} onChange={e => { const world = e.target.value as WorldId; void change(d => { d.world = world; return d; }).then(() => { if (draft) onSelect(world + "_shared_" + draft.uuid); }); }}><option value="fantasy">{t("assetManager.fantasy")}</option><option value="scifi">{t("assetManager.scifi")}</option></select>
      : <strong>{t(view.world === "fantasy" ? "assetManager.fantasy" : "assetManager.scifi")}</strong>}</label>

    <fieldset className="rounded border border-neutral-800 p-2"><legend className="px-1 text-xs text-neutral-300">{t("assetManager.transparency")}</legend>
      <div className="flex flex-col gap-1">
        <label><input type="radio" name={"tr-" + id} checked={view.transparency.source === "alpha"} onChange={() => setSource("alpha")}/> {t("assetManager.tr.alpha")}</label>
        {view.transparency.source === "alpha" && view.diffuseAlpha === false && <p className="ml-5 text-xs text-yellow-300">{t("assetManager.tr.noAlpha")}</p>}
        {view.diffuseAlpha && <p className="ml-5 text-xs text-neutral-400">{t("assetManager.tr.alphaFound")}</p>}
        <label><input type="radio" name={"tr-" + id} checked={view.transparency.source === "colorKey"} onChange={() => setSource("colorKey")}/> {t("assetManager.tr.colorKey")}</label>
        {view.transparency.source === "colorKey" && <div className="ml-5 flex flex-wrap items-center gap-1">
          <input type="color" aria-label={t("assetManager.tr.colorKey")} value={colorOk ? view.transparency.colorKey : "#ff00ff"} onChange={e => void change(d => { d.transparency.colorKey = e.target.value; return d; })}/>
          <input key={view.transparency.colorKey} className={"w-20 " + small} aria-invalid={!colorOk} onKeyDown={e => e.stopPropagation()} onChange={e => { const v = e.target.value; if (/^#[0-9a-f]{6}$/i.test(v)) void change(d => { d.transparency.colorKey = v; return d; }); }} defaultValue={view.transparency.colorKey}/>
          <button className={small} onClick={() => void change(d => { d.transparency.colorKey = "#ff00ff"; return d; })}>{t("assetManager.tr.magenta")}</button>
          <button className={small} onClick={() => void change(d => { d.transparency.colorKey = "#ffffff"; return d; })}>{t("assetManager.tr.white")}</button>
        </div>}
        <label><input type="radio" name={"tr-" + id} checked={view.transparency.source === "none"} onChange={() => setSource("none")}/> {t("assetManager.tr.none")}</label>
      </div>
    </fieldset>

    <div className="flex flex-col gap-2">{MAP_KEYS.map(key => <ChannelRow key={key} k={key} slot={view.slot(key)} url={maps[key]}
      required={key === "diffuse"} dragging={dragKey === key} onDragState={s => setDragKey(s ? key : null)} onDrop={e => drop(key, e)}
      onFile={f => void chooseFile(key, f)} onMode={(m, open) => setMode(key, m, open)}
      onRemove={() => void change(d => { d.maps[key] = { mode: key === "diffuse" ? "uploaded" : "none" }; return d; })}/>)}</div>
    {draft && <button className={small + " self-start"} onClick={() => { if (!isNew || window.confirm(t("assetManager.confirmDeleteDraft"))) void discardDraft(draft.uuid); }}>{isNew ? t("assetManager.deleteDraft") : t("assetManager.discardChanges")}</button>}
  </div>;
}

function ChannelRow({ k, slot, url, required, dragging, onDragState, onDrop, onFile, onMode, onRemove }: {
  k: MapKey; slot: { mode: MapMode; has: boolean }; url?: string; required: boolean; dragging: boolean;
  onDragState: (on: boolean) => void; onDrop: (e: DragEvent) => void; onFile: (f: File) => void; onMode: (m: MapMode, open: () => void) => void; onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const showThumb = !!url && (slot.mode === "auto" || (slot.mode === "uploaded" && slot.has));
  const auto = slot.mode === "auto";
  return <div className={"flex gap-2 rounded border p-1 " + (dragging ? "border-amber-400 bg-neutral-800" : "border-neutral-700")}
    onDragOver={e => { e.preventDefault(); onDragState(true); }} onDragLeave={() => onDragState(false)} onDrop={onDrop} data-channel={k}>
    <div className={"relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded bg-neutral-900 " + (auto ? "border border-dashed border-amber-500/70 opacity-80" : "border border-neutral-700")}>
      {showThumb ? <img src={url} alt={t(rowKey(k))} className="h-full w-full object-contain"/> : <span className="text-[10px] text-neutral-500">{t("assetManager.empty")}</span>}
      {auto && <AutoBadge className="absolute bottom-0 left-0"/>}
    </div>
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <strong className="text-xs">{t(rowKey(k))}{required && <span className="text-red-300" title={t("assetManager.required")}> *</span>}{auto && <> <AutoBadge/></>}</strong>
      {modesOf(k).length > 1 && <div className="flex gap-1" role="group" aria-label={t(rowKey(k))}>{modesOf(k).map(m => <button key={m} className={small} aria-pressed={slot.mode === m} onClick={() => onMode(m, () => input.current?.click())}>{t(modeKey(m))}</button>)}</div>}
      <div className="flex flex-wrap gap-1">
        <button className={small} onClick={() => input.current?.click()}>{t(auto ? "assetManager.overrideOwn" : "assetManager.chooseFile")}</button>
        {(slot.has || (!required && slot.mode !== "none")) && <button className={small} onClick={onRemove}>{t("assetManager.remove")}</button>}
        <input ref={input} type="file" accept="image/png" className="sr-only" aria-label={t("assetManager.chooseFileFor", { map: t(rowKey(k)) })} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }}/>
      </div>
    </div>
  </div>;
}

// ---- the yellow bar ----

export function UnsavedBar({ onError }: { onError: (message: string) => void }) {
  const drafts = useDrafts();
  useSharedAuth();
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const [message, setMessage] = useState("");
  // a result message fades after a while
  useEffect(() => { if (!message || busy) return; const timer = setTimeout(() => setMessage(""), 8000); return () => clearTimeout(timer); }, [message, busy]);
  const { added, changed } = draftCounts(drafts);
  if (!drafts.length && !message) return null;

  async function publish() {
    setBusy(true); setMessage("");
    try {
      const report = await publishDrafts([...drafts], (d, theirs) => window.confirm(t("assetManager.conflict", { name: d.name || t("assetManager.untitled"), theirs, mine: d.baseRev })), setMessage);
      setMessage(t("assetManager.publishedN", { n: report.published.length, skipped: report.skipped.length }));
    } catch (error) { setMessage(""); onError(errorText(error)); }
    finally { setBusy(false); }
  }
  function start() {
    if (!sharedConfigured) { onError(t("assetManager.notConfigured")); return; }
    if (!sharedToken()) { setLogin(true); return; }
    void publish();
  }
  return <div role="status" className="relative mb-2 flex shrink-0 flex-wrap items-center gap-2 rounded border border-yellow-500 bg-yellow-900/40 px-3 py-1 text-sm text-yellow-100">
    {drafts.length > 0 ? <span>{t("assetManager.unsaved", { n: added, m: changed })}</span> : <span>{message}</span>}
    {drafts.length > 0 && message && <span className="text-yellow-200/80">{message}</span>}
    {drafts.length > 0 && <>
      <button className={small + " !border-yellow-400"} disabled={busy} onClick={start}>{t("assetManager.publish")}</button>
      <button className={small} disabled={busy} onClick={() => { if (window.confirm(t("assetManager.confirmDiscard", { n: added, m: changed }))) void discardAllDrafts(); }}>{t("assetManager.discard")}</button>
    </>}
    {login && <SignInPopover className="absolute right-2 top-full mt-1" onDone={() => { setLogin(false); void publish(); }} onCancel={() => setLogin(false)} onError={onError}/>}
  </div>;
}

// The sign-in for the shared store (what Publish, or loading the shared library, needs); onDone runs after it worked.
export function SignInPopover({ onDone, onCancel, onError, className = "" }: { onDone: () => void; onCancel: () => void; onError: (message: string) => void; className?: string }) {
  const auth = useSharedAuth();
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try { await auth.signIn(); } catch (error) { setBusy(false); onError(errorText(error)); return; }
    setBusy(false);
    onDone();
  }
  return <div role="dialog" aria-label={t("assetManager.loginTitle")} aria-busy={busy} className={"z-20 w-72 rounded border border-neutral-500 bg-neutral-950 p-3 text-white shadow-xl " + className} onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") onCancel(); }}>
    <p className="mb-2 text-xs text-neutral-300">{t("assetManager.loginTitle")}</p>
    <SharedLoginForm auth={auth} onSubmit={() => void submit()}/>
    <button className={small + " mt-2"} onClick={onCancel}>{t("assetManager.cancel")}</button>
  </div>;
}
