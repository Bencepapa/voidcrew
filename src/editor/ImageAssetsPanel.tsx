import { useEffect, useState } from "react";
import { t } from "../i18n";
import { activeWorld } from "../game/worlds";
import type { DecalSurfaceKind, ImagePurpose, SharedImage, SharedImageType } from "../render/sharedImages";
import { applyTransparency, type Transparency } from "./imageTools";
import { sharedConfigured, useSharedAuth } from "./sharedAuth";
import {
  checkImagePng, createImageDraft, discardImageDraft, getImageDrafts, publishImage, saveImageDraft, useImageDrafts,
  type ImageDraft,
} from "./sharedImages";
import { errorText, SignInPopover } from "./TexturePanel";
import { active, BUTTON, idle, KindChoice, neutralStyle } from "./inspector/parts";

const field = "block w-full min-w-0 rounded-sm border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-100";

const purposeLabel = (purpose: ImagePurpose | undefined) =>
  purpose === "loading" ? t("assetManager.image.purposeLoading")
    : purpose === "room" ? t("assetManager.image.purposeRoom")
    : t("assetManager.image.purposePortrait");

const surfaceLabel = (surface: DecalSurfaceKind) => t(`editorBar.${surface}`);

// The preview as the game will see it: the colour key / opaque treatment is
// applied to the draft's PNG and the result is an object URL, revoked on change.
export function useImageDraftPreview(draft: ImageDraft | undefined): string {
  const [url, setUrl] = useState("");
  const png = draft?.png;
  const source = draft?.transparency.source;
  const colorKey = draft?.transparency.colorKey;
  useEffect(() => {
    let live = true;
    let created = "";
    setUrl("");
    if (!png) return () => {};
    const transparency: Transparency = { source: source ?? "alpha", colorKey: colorKey ?? "#ff00ff" };
    void applyTransparency(png, transparency).then(processed => {
      if (!live) return;
      created = URL.createObjectURL(processed ?? png);
      setUrl(created);
    }).catch(() => { if (live) setUrl(""); });
    return () => {
      live = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [png, source, colorKey]);
  return url;
}

function PublishedDetails({ image }: { image: SharedImage }) {
  return <div className="flex min-w-0 flex-col gap-2 text-sm" style={neutralStyle}>
    <p className="text-xs text-neutral-400">{t("assetManager.image.readOnly")}</p>
    <img className="max-h-52 max-w-full self-start object-contain" src={image.url} alt={image.name}/>
    <p><span className="text-neutral-400">{t("assetManager.image.name")}: </span>{image.name}</p>
    <p><span className="text-neutral-400">{t("assetManager.image.type")}: </span>{t(`assetManager.image.${image.type}`)}</p>
    {image.type === "portrait"
      ? <p><span className="text-neutral-400">{t("assetManager.image.purpose")}: </span>{purposeLabel(image.purpose)}</p>
      : image.surface && <p><span className="text-neutral-400">{t("assetManager.image.surface")}: </span>{surfaceLabel(image.surface)}</p>}
    <p><span className="text-neutral-400">{t("assetManager.world")}: </span>{t(image.world === "fantasy" ? "assetManager.fantasy" : "assetManager.scifi")}</p>
    <p><span className="text-neutral-400">{t("assetManager.image.size")}: </span>{image.width} × {image.height}</p>
    <p className="min-w-0"><span className="text-neutral-400">{t("assetManager.image.id")}: </span><code className="break-all text-xs text-neutral-400">{image.id}</code></p>
  </div>;
}

export function ImageAssetInspector({ draft, image, onError }: {
  draft?: ImageDraft;
  image?: SharedImage;
  onError: (message: string) => void;
}) {
  const auth = useSharedAuth();
  const drafts = useImageDrafts();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [signIn, setSignIn] = useState(false);
  // Always read the stored copy: a prop from the list can be one edit behind.
  const current = draft ? drafts.find(saved => saved.id === draft.id) : undefined;
  const preview = useImageDraftPreview(current);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try { await action(); }
    catch (error) { onError(errorText(error)); }
    finally { setBusy(false); }
  }

  const latest = () => current ? getImageDrafts().find(saved => saved.id === current.id) ?? current : undefined;
  async function change(patch: Partial<ImageDraft>) {
    const base = latest();
    if (!base) return;
    await saveImageDraft({ ...base, ...patch });
  }
  // Field edits save themselves; they must not disable the input mid-keystroke.
  function autosave(patch: Partial<ImageDraft>) {
    void change(patch).catch(error => onError(errorText(error)));
  }
  function autosaveTransparency(patch: Partial<Transparency>) {
    const base = latest();
    if (base) autosave({ transparency: { ...base.transparency, ...patch } });
  }

  async function chooseFile(file: File) {
    await run(async () => {
      if (!current) return;
      await checkImagePng(file, file.name, current.type);
      const png = file.slice(0, file.size, "image/png");
      const name = current.name.trim() || file.name.replace(/\.png$/i, "").slice(0, 100);
      await change({ png, name });
      setStatus(t("assetManager.image.saved"));
    });
  }

  async function save() {
    const base = latest();
    if (!base) return;
    await run(async () => {
      await saveImageDraft(base);
      setStatus(t("assetManager.image.saved"));
    });
  }

  async function publish() {
    const base = latest();
    if (!base) return;
    await run(async () => {
      await publishImage(base);
      setStatus(t("assetManager.image.published"));
    });
  }

  function startPublish() {
    if (!sharedConfigured) { onError(t("assetManager.notConfigured")); return; }
    if (!auth.token) { setSignIn(true); return; }
    void publish();
  }

  function discard() {
    const base = latest();
    if (!base) return;
    if (!confirm(t("assetManager.image.discardConfirm", { name: base.name || t("assetManager.image.newDraft") }))) return;
    void run(async () => {
      await discardImageDraft(base.id);
      setStatus("");
    });
  }

  if (!current) {
    if (image) return <PublishedDetails image={image}/>;
    return <p className="text-sm text-neutral-400" style={neutralStyle}>{t("assetManager.image.selectHint")}</p>;
  }

  const purpose = current.purpose ?? "portrait";
  return <div className="relative flex min-w-0 flex-col gap-2 text-sm" style={neutralStyle}>
    <label className="flex min-w-0 flex-col gap-1">{t("assetManager.image.file")}
      <input className={field} type="file" accept="image/png,.png" disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void chooseFile(file);
      }}/>
    </label>
    {preview
      ? <img className="max-h-52 max-w-full self-start object-contain" src={preview} alt={current.name}/>
      : <p className="text-xs text-neutral-500">{t("assetManager.image.noPng")}</p>}

    <label className="flex min-w-0 flex-col gap-1">{t("assetManager.image.name")}
      <input className={field} value={current.name} maxLength={100}
        onChange={event => autosave({ name: event.target.value })}/>
    </label>

    {current.type === "decal"
      ? <KindChoice label={t("assetManager.image.surface")} value={current.surface}
          options={(["wall", "floor", "ceiling"] as const).map(value => ({ value, label: surfaceLabel(value) }))}
          onChange={value => autosave({ surface: value as DecalSurfaceKind })}/>
      : <KindChoice label={t("assetManager.image.purpose")} value={purpose}
          options={(["loading", "portrait", "room"] as const).map(value => ({ value, label: purposeLabel(value) }))}
          onChange={value => autosave({ purpose: value as ImagePurpose })}/>}

    <KindChoice label={t("assetManager.image.transparency")} value={current.transparency.source}
      options={[
        { value: "alpha", label: t("assetManager.image.alpha") },
        { value: "colorKey", label: t("assetManager.image.colorKey") },
        { value: "none", label: t("assetManager.image.none") },
      ]}
      onChange={value => autosaveTransparency({ source: value as Transparency["source"] })}/>
    {current.transparency.source === "colorKey" && <label className="flex items-center gap-2">{t("assetManager.image.colorKey")}
      <input type="color" value={current.transparency.colorKey}
        onChange={event => autosaveTransparency({ colorKey: event.target.value })}/>
    </label>}

    <div className="flex flex-wrap gap-1">
      <button type="button" className={`${BUTTON} ${idle}`} disabled={busy} onClick={() => void save()}>{t("assetManager.image.saveDraft")}</button>
      <button type="button" className={`${BUTTON} ${idle}`} disabled={busy} onClick={startPublish}>{t("assetManager.image.publish")}</button>
      <button type="button" className={`${BUTTON} ${idle}`} disabled={busy} onClick={discard}>{t("assetManager.image.discard")}</button>
    </div>

    <output aria-live="polite" className="min-h-5 text-xs text-neutral-300">
      {busy ? t("assetManager.image.working") : status || t("assetManager.image.statusDraft")}
    </output>

    {signIn && <SignInPopover className="fixed left-1/2 top-24 z-30 -translate-x-1/2"
      onDone={() => { setSignIn(false); void publish(); }}
      onCancel={() => setSignIn(false)} onError={onError}/>}
  </div>;
}

// The old full-screen entry point, kept so the Asset Manager keeps compiling
// until its layout mounts the inspector in the properties panel directly.
export function ImageAssetsPanel({ onBack }: { onBack: () => void }) {
  const drafts = useImageDrafts();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = selected ? drafts.find(item => item.id === selected) : undefined;

  async function create(type: SharedImageType) {
    setBusy(true);
    setError("");
    try { setSelected((await createImageDraft(activeWorld(), type)).id); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2" style={neutralStyle}>
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" className={`${BUTTON} ${idle}`} onClick={onBack}>{t("assetManager.image.back")}</button>
      <button type="button" className={`${BUTTON} ${idle}`} disabled={busy} onClick={() => void create("portrait")}>
        {t("assetManager.image.newDraft")} · {t("assetManager.image.portrait")}
      </button>
      <button type="button" className={`${BUTTON} ${idle}`} disabled={busy} onClick={() => void create("decal")}>
        {t("assetManager.image.newDraft")} · {t("assetManager.image.decal")}
      </button>
    </div>
    {drafts.length > 0 && <div className="flex flex-wrap gap-1">
      {drafts.map(item => <button key={item.id} type="button" aria-pressed={item.id === selected}
        className={`${BUTTON} ${item.id === selected ? active : idle}`}
        onClick={() => setSelected(item.id)}>{item.name || t("assetManager.image.newDraft")}</button>)}
    </div>}
    <ImageAssetInspector draft={draft} onError={setError}/>
    <output aria-live="polite" className="text-sm text-neutral-300">{busy ? t("assetManager.image.working") : error}</output>
  </section>;
}
