import { useEffect, useState, type FormEvent } from "react";
import { t } from "../i18n";
import { activeWorld, type WorldId } from "../game/worlds";
import { useSharedImages, type DecalSurfaceKind, type SharedImageType } from "../render/sharedImages";
import { applyTransparency, type Transparency } from "./imageTools";
import { sharedConfigured, useSharedAuth } from "./sharedAuth";
import { checkImagePng, discardImageDraft, imageAssetId, imageDrafts, loadSharedImages, publishImage, saveImageDraft, type ImageDraft } from "./sharedImages";
import { errorText, SignInPopover } from "./TexturePanel";

const button = "rounded border border-neutral-500 bg-neutral-800 px-3 py-1.5 hover:border-amber-400 disabled:opacity-50";
const field = "block w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1";

export function ImageAssetsPanel({ onBack }: { onBack: () => void }) {
  const auth = useSharedAuth();
  const images = useSharedImages();
  const [drafts, setDrafts] = useState<ImageDraft[]>([]);
  const [world, setWorld] = useState<WorldId>(activeWorld);
  const [type, setType] = useState<SharedImageType>("portrait");
  const [editing, setEditing] = useState<ImageDraft | null>(null);
  const [name, setName] = useState("");
  const [png, setPng] = useState<Blob | null>(null);
  const [surface, setSurface] = useState<DecalSurfaceKind>("wall");
  const [transparency, setTransparency] = useState<Transparency>({ source: "alpha", colorKey: "#ff00ff" });
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const refreshDrafts = async () => setDrafts(await imageDrafts());
  useEffect(() => { void refreshDrafts().catch(e => setMessage(errorText(e))); }, []);
  useEffect(() => { void loadSharedImages(world).catch(e => setMessage(errorText(e))); }, [world]);
  useEffect(() => {
    let active = true;
    let url = "";
    setPreview("");
    if (png) void applyTransparency(png, transparency).then(processed => {
      if (active) setPreview(url = URL.createObjectURL(processed ?? png));
    }).catch(e => { if (active) setMessage(errorText(e)); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [png, transparency]);

  function edit(draft: ImageDraft | null) {
    setEditing(draft);
    setName(draft?.name ?? "");
    setPng(draft?.png ?? null);
    setSurface(draft?.surface ?? "wall");
    setTransparency(draft?.transparency ?? { source: "alpha", colorKey: "#ff00ff" });
    setFileInputVersion(value => value + 1);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try { await action(); } catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!png || !name.trim()) return;
    void run(async () => {
      await checkImagePng(png, name, type);
      const uuid = editing?.uuid ?? crypto.randomUUID();
      const draft = { uuid, id: imageAssetId(world, type, uuid), name: name.trim(), world, type, png, surface, transparency };
      await saveImageDraft(draft);
      await refreshDrafts();
      edit(draft);
      setMessage(t("assetManager.image.saved"));
    });
  }

  const published = images.filter(image => image.world === world && image.type === type);
  const local = drafts.filter(draft => draft.world === world && draft.type === type);
  return <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={button} onClick={onBack}>{t("assetManager.image.back")}</button>
      {(["portrait", "decal"] as const).map(value =>
        <button type="button" key={value} className={button} aria-pressed={type === value} disabled={busy}
          onClick={() => { setType(value); edit(null); setMessage(""); }}>{t(`assetManager.image.${value}`)}</button>)}
      <label className="flex items-center gap-2">{t("assetManager.world")}
        <select className={field} value={world} disabled={busy} onChange={event => { setWorld(event.target.value as WorldId); edit(null); setMessage(""); }}>
          <option value="fantasy">Void Fantasy</option>
          <option value="scifi">Void Crew</option>
        </select>
      </label>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={save} className="rounded border border-neutral-700 p-3">
        <div className="mb-3 flex items-center justify-between">
          <strong>{editing ? t("assetManager.image.editDraft") : t("assetManager.image.newDraft")}</strong>
          {editing && <button type="button" className={button} disabled={busy} onClick={() => edit(null)}>{t("assetManager.image.newDraft")}</button>}
        </div>
        <fieldset className="flex flex-col gap-3" disabled={busy}>
          <label>{t("assetManager.image.name")}<input className={field} value={name} required maxLength={100} onChange={e => setName(e.target.value)}/></label>
          <label>PNG<input className={field} key={fileInputVersion} type="file" accept="image/png,.png" onChange={event => {
            const file = event.target.files?.[0];
            if (file) void run(async () => {
              await checkImagePng(file, file.name, type);
              setPng(file);
              setName(current => current.trim() ? current : file.name.replace(/\.png$/i, "").slice(0, 100));
            });
          }}/></label>
          {type === "decal" && <label>{t("assetManager.image.surface")}<select className={field} value={surface} onChange={e => setSurface(e.target.value as DecalSurfaceKind)}>
            {(["wall", "floor", "ceiling"] as const).map(value => <option key={value} value={value}>{t(`editorBar.${value}`)}</option>)}
          </select></label>}
          <label>{t("assetManager.image.transparency")}<select className={field} value={transparency.source} onChange={e => setTransparency({ ...transparency, source: e.target.value as Transparency["source"] })}>
            {(["alpha", "colorKey", "none"] as const).map(value => <option key={value} value={value}>{t(`assetManager.image.${value}`)}</option>)}
          </select></label>
          {transparency.source === "colorKey" && <label>{t("assetManager.image.colorKey")} <input type="color" value={transparency.colorKey} onChange={e => setTransparency({ ...transparency, colorKey: e.target.value })}/></label>}
          {preview && <img className="max-h-52 max-w-full self-start object-contain" src={preview} alt={name}/>}
          <button type="submit" className={button + " self-start"} disabled={!png || !name.trim()}>{t("assetManager.image.saveDraft")}</button>
        </fieldset>
      </form>
      <div className="flex flex-col gap-4">
        <div>
          <strong>{t("assetManager.image.drafts")}</strong>
          {local.length === 0 && <p className="text-sm text-neutral-400">{t("assetManager.image.empty")}</p>}
          {local.map(draft => <div key={draft.id} className="mt-2 flex flex-wrap items-center gap-2 rounded border border-neutral-700 p-2">
            <button type="button" className={button} disabled={busy} onClick={() => edit(draft)}>{draft.name}</button>
            {sharedConfigured && <button type="button" className={button} disabled={busy} onClick={() => {
              if (!auth.token) { setSignIn(true); return; }
              void run(async () => {
                await publishImage(draft);
                if (editing?.id === draft.id) edit(null);
                await refreshDrafts();
                setMessage(t("assetManager.image.published"));
              });
            }}>{t("assetManager.image.publish")}</button>}
            <button type="button" className={button} disabled={busy} onClick={() => {
              if (!confirm(t("assetManager.image.discardConfirm", { name: draft.name }))) return;
              void run(async () => { await discardImageDraft(draft.id); if (editing?.id === draft.id) edit(null); await refreshDrafts(); });
            }}>{t("assetManager.image.discard")}</button>
          </div>)}
        </div>
        <div>
          <strong>{t("assetManager.image.catalog")}</strong>
          {published.length === 0 && <p className="text-sm text-neutral-400">{t("assetManager.image.empty")}</p>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {published.map(image => <figure key={image.id} className="min-w-0 rounded border border-neutral-700 p-2">
              <img src={image.url} alt={image.name} className="mb-2 h-24 w-full object-contain"/>
              <figcaption>{image.name}</figcaption>
              <code className="block break-all text-xs text-neutral-400">{image.id}</code>
            </figure>)}
          </div>
        </div>
      </div>
    </div>
    {signIn && <SignInPopover className="fixed left-1/2 top-24 z-10 -translate-x-1/2" onDone={() => setSignIn(false)} onCancel={() => setSignIn(false)} onError={setMessage}/>}
    <output aria-live="polite" className="text-sm">{busy ? t("assetManager.image.working") : message}</output>
  </section>;
}
