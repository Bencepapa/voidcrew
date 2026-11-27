import { useEffect, useState } from "react";
import { AudioWaveform } from "lucide-react";
import { SAMPLES, SAMPLE_IDS, isSampleId, sampleSource } from "../audio/samples";
import { SOUND_CATEGORIES, SOUND_MIME, isSoundCategory, readSoundDefinition, type SharedSample } from "../audio/sharedSamples";
import type { WorldId } from "../game/worlds";
import { t } from "../i18n";
import { idb } from "./idb";
import { SharedHttpError, sharedConfigured, sharedToken } from "./sharedAuth";
import { publishSharedSound, useSharedSounds } from "./sharedSounds";
import { newSoundId, readSoundFile, type SoundDraft } from "./soundDraft";
import { searchAnchor } from "../search/searchAnchor";
import { SoundPreview } from "./SoundPreview";
import { SignInPopover } from "./TexturePanel";

const button = "rounded border border-neutral-700 bg-neutral-800 px-2 py-1 disabled:opacity-50";
const input = "min-w-0 rounded border border-neutral-700 bg-neutral-900 px-2 py-1";
const worldLabel = (world: WorldId) => t(world === "fantasy" ? "assetManager.fantasy" : "assetManager.scifi");
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function useAudioBlob(blob: Blob | undefined) {
  const [source, setSource] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) { setSource(undefined); return; }
    const url = URL.createObjectURL(blob);
    setSource({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return source?.blob === blob ? source?.url : undefined;
}

export function SoundAssetsPanel({ world, targetWorld, category, initialId, searchTargetId, onNotice, onError }: {
  world: WorldId | "All"; targetWorld: WorldId; category: string; initialId?: string; searchTargetId?: string;
  onNotice: (message: string) => void; onError: (message: string) => void;
}) {
  const published = useSharedSounds();
  const [drafts, setDrafts] = useState<SoundDraft[]>([]);
  const [selected, select] = useState(initialId ?? "");
  const [query, search] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const [builtinDuration, setBuiltinDuration] = useState<{ id: string; seconds: number }>();
  useEffect(() => {
    let live = true;
    void idb.all<SoundDraft>("soundDrafts").then(items => { if (live) setDrafts(items); },
      error => { if (live) onError(errorText(error)); });
    return () => { live = false; };
  }, [onError]);
  const draft = drafts.find(item => item.id === selected);
  const remote = published.find(item => item.id === selected);
  const builtin = isSampleId(selected) ? selected : undefined;
  const item = draft ?? remote;
  const blobUrl = useAudioBlob(draft?.blob);
  const src = blobUrl ?? (draft?.blob ? undefined : remote?.url ?? draft?.originalUrl ?? sampleSource(builtin, import.meta.env.BASE_URL)?.url);
  const duration = item?.duration ?? (builtinDuration?.id === selected ? builtinDuration.seconds : undefined);
  const definition = draft && readSoundDefinition(draft);
  const matches = (item: SoundDraft | SharedSample) =>
    (world === "All" || item.world === world) && (category === "All" || item.category === category);
  const entries = [
    ...[...drafts, ...published.filter(item => !drafts.some(draft => draft.id === item.id))].filter(matches)
      .map(item => ({ id: item.id, name: item.name || t("sound.assets.newName"), kind: t(`sound.assets.category.${item.category}`) })),
    ...(category === "All" || category === "effect" ? SAMPLE_IDS : []).map(id => ({
      id, name: t(`sound.sample.${id}`), kind: t(`sound.cat.${SAMPLES[id].category}`),
    })),
  ].filter(item => `${item.name} ${item.kind}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  async function save(next: SoundDraft) {
    setDrafts(items => [...items.filter(item => item.id !== next.id), next]);
    try { await idb.put("soundDrafts", next); }
    catch (error) { onError(t("assetManager.draftSaveError", { error: errorText(error) })); }
  }
  function create() {
    const id = newSoundId(targetWorld);
    select(id);
    search("");
    onError("");
    void save({ id, world: targetWorld, name: t("sound.assets.newName"),
      category: isSoundCategory(category) ? category : "effect", volume: 0.6, rate: 1 });
  }
  async function upload(file: File) {
    if (!draft) return;
    onError("");
    setBusy(true);
    try { await save({ ...draft, ...await readSoundFile(file) }); }
    catch { onError(t("sound.assets.badFile")); }
    finally { setBusy(false); }
  }
  async function discard() {
    if (!draft || !window.confirm(t("assetManager.image.discardConfirm", { name: draft.name }))) return;
    try {
      await idb.del("soundDrafts", draft.id);
      setDrafts(items => items.filter(item => item.id !== draft.id));
      if (!remote) select("");
    } catch (error) { onError(errorText(error)); }
  }
  async function publish() {
    if (!draft || !definition) return;
    if (!sharedConfigured) { onError(t("assetManager.sharedNotConfigured")); return; }
    if (!sharedToken()) { setLogin(true); return; }
    setBusy(true);
    onError("");
    try {
      let blob = draft.blob;
      if (!blob && draft.originalUrl) {
        const response = await fetch(draft.originalUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const original = await response.blob();
        blob = original.slice(0, original.size, SOUND_MIME[definition.format]);
      }
      if (!blob) throw new Error("Missing audio");
      await publishSharedSound(draft.world, draft.id, definition, blob);
      await idb.del("soundDrafts", draft.id);
      setDrafts(items => items.filter(item => item.id !== draft.id));
      onNotice(t("sound.assets.published"));
    } catch (error) {
      const mime = error instanceof SharedHttpError && (error.status === 415 || /mime/i.test(error.message));
      onError(mime ? t("sound.assets.mimeError") : errorText(error));
    } finally { setBusy(false); }
  }

  return <div className="flex min-h-0 flex-1 gap-3 overflow-hidden text-xs">
    <aside className="flex w-[36%] min-w-32 max-w-64 shrink-0 flex-col gap-2 border-r border-neutral-800 pr-2">
      <div className="flex flex-wrap gap-1">
        <input className={input + " flex-1"} value={query} onChange={event => search(event.target.value)} aria-label={t("assetManager.searchAssets")} placeholder={t("assetManager.searchAssets")} />
        <button className={button} type="button" disabled={busy || login} onClick={create}>{t("sound.assets.new")}</button>
      </div>
      {drafts.length > 0 && <div className="rounded border border-yellow-700 px-2 py-1 text-yellow-200">{t("sound.assets.drafts", { n: drafts.length })}</div>}
      <div className="min-h-0 overflow-auto">
        {entries.map(entry => <button key={entry.id} type="button" disabled={busy || login} aria-pressed={entry.id === selected}
          className={`flex w-full items-center gap-2 rounded border px-2 py-2 text-start ${entry.id === selected ? "border-yellow-500 bg-yellow-950" : "border-transparent hover:bg-neutral-800"}`}
          onClick={() => { select(entry.id); onError(""); }}>
          <AudioWaveform size={16} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{entry.name}<small className="block text-neutral-400">{entry.kind}</small></span>
          {drafts.some(draft => draft.id === entry.id) && <span aria-label={t("assetManager.draftTitle")} className="text-yellow-400">●</span>}
        </button>)}
      </div>
    </aside>
    {(item || builtin) && <section className="min-w-0 max-w-lg flex-1 space-y-3 overflow-auto pr-2" aria-label={t("assetManager.properties")}>
      <h2 {...(searchTargetId && initialId === selected ? searchAnchor(searchTargetId) : {})} tabIndex={-1} className="text-base font-semibold">{item?.name || (builtin ? t(`sound.sample.${builtin}`) : t("sound.assets.newName"))}</h2>
      {item && <p className="text-neutral-400">{worldLabel(item.world)} · {t(`sound.assets.category.${item.category}`)}</p>}
      {src && <SoundPreview src={src} volume={item?.volume ?? 0.6} rate={item?.rate ?? 1} label={t("sound.assets.preview")}
        onDuration={builtin ? seconds => setBuiltinDuration({ id: builtin, seconds }) : undefined} />}
      {(item?.bytes || duration) && <dl className="flex flex-wrap gap-x-4 gap-y-1">
        {item?.bytes && <div><dt className="text-neutral-400">{t("sound.assets.size")}</dt>
          <dd>{(item.bytes / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 3, minimumFractionDigits: 3 })} MB</dd></div>}
        {duration && Number.isFinite(duration) && <div><dt className="text-neutral-400">{t("sound.assets.duration")}</dt>
          <dd>{duration.toLocaleString(undefined, { maximumFractionDigits: 2 })} s</dd></div>}
      </dl>}
      {draft ? <fieldset disabled={busy || login} className="min-w-0 space-y-3">
        <label className="grid gap-1">{t("sound.assets.file")}
          <input type="file" accept=".mp3,.ogg,.wav" onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void upload(file);
          }} />
        </label>
        <label className="grid gap-1">{t("assetManager.nameLabel")}<input className={input} maxLength={100} value={draft.name}
          onChange={event => void save({ ...draft, name: event.target.value })} /></label>
        <label className="grid gap-1">{t("assetManager.subCategory")}
          <select className={input} value={draft.category} onChange={event => {
            const category = event.target.value;
            if (isSoundCategory(category)) void save({ ...draft, category });
          }}>
            {SOUND_CATEGORIES.map(category => <option key={category} value={category}>{t(`sound.assets.category.${category}`)}</option>)}
          </select>
        </label>
        <label className="grid gap-1">{t("sound.assets.defaultVolume")} · {Math.round(draft.volume * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={draft.volume} onChange={event => void save({ ...draft, volume: Number(event.target.value) })} />
        </label>
        <label className="grid gap-1">{t("sound.assets.defaultRate")} · {draft.rate.toLocaleString()}×
          <input type="range" min={0.5} max={2} step={0.05} value={draft.rate} onChange={event => void save({ ...draft, rate: Number(event.target.value) })} />
        </label>
        <button className={button} type="button" disabled={!definition} onClick={() => void publish()}>{t("assetManager.publish")}</button>{" "}
        <button className={button} type="button" onClick={() => void discard()}>{t("assetManager.discard")}</button>
      </fieldset> : remote && <>
        <p>{t("sound.assets.defaultVolume")} · {Math.round(remote.volume * 100)}%</p>
        <p>{t("sound.assets.defaultRate")} · {remote.rate.toLocaleString()}×</p>
        <button className={button} type="button" onClick={() => void save({ ...remote, originalUrl: remote.url })}>{t("sound.assets.edit")}</button>
      </>}
      {login && <SignInPopover className="fixed left-1/2 top-24 -translate-x-1/2" onDone={() => { setLogin(false); void publish(); }}
        onCancel={() => setLogin(false)} onError={onError} />}
    </section>}
  </div>;
}
