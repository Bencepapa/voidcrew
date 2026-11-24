import { useEffect, useState } from "react";
import { t } from "../i18n";
import { activeWorld } from "../game/worlds";
import { DEFAULT_PICKUP, ITEM_CATEGORIES, type PickupAppearance } from "../game/items";
import { MAX_PICKUP_VALUE, categoryValue, pickupValue } from "../game/pickupValue";
import type { DecalSurfaceKind, ImagePurpose, SharedImage, SharedImageType } from "../render/sharedImages";
import { applyTransparency, decode, type Transparency } from "./imageTools";
import { sharedConfigured, useSharedAuth } from "./sharedAuth";
import {
  checkImagePng, createImageDraft, discardImageDraft, getImageDrafts, publishImage, resolvePickupMaps, reviseSharedImage, saveImageDraft, useImageDrafts,
  type ImageDraft,
} from "./sharedImages";
import { canReviseImage } from "./imageDraftLogic";
import { errorText, SignInPopover } from "./TexturePanel";
import { active, BUTTON, idle, KindChoice, neutralStyle } from "./inspector/parts";
import { NumberField } from "./NumberField";
import { SkyDraftFields, SkyWrapPreview } from "./SkyDraftFields";
import { ChannelCards, useBlobUrl } from "./ChannelControls";
import type { ChannelEditor } from "./channelEditor";
import type { MapKey } from "./textureDrafts";
import type { MaterialMaps } from "./materialMaps";

const field = "block w-full min-w-0 rounded-sm border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-100";

const purposeLabel = (purpose: ImagePurpose | undefined) =>
  purpose === "loading" ? t("assetManager.image.purposeLoading")
    : purpose === "room" ? t("assetManager.image.purposeRoom")
    : t("assetManager.image.purposePortrait");

const surfaceLabel = (surface: DecalSurfaceKind) => t(`editorBar.${surface}`);

export function usePickupDraftMaps(draft: ImageDraft | undefined, onError: (message: string) => void): MaterialMaps | undefined {
  const png = draft?.png;
  const source = draft?.transparency.source ?? "alpha";
  const colorKey = draft?.transparency.colorKey ?? "#ff00ff";
  const depth = draft?.pickupMaps?.depth;
  const normal = draft?.pickupMaps?.normal;
  const [maps, setMaps] = useState<MaterialMaps>();
  useEffect(() => {
    setMaps(undefined);
    if (!png) return;
    let active = true;
    const urls: string[] = [];
    const url = (blob: Blob) => {
      const next = URL.createObjectURL(blob);
      urls.push(next);
      return next;
    };
    void resolvePickupMaps(png, { source, colorKey }, depth, normal).then(result => {
      if (!active) return;
      setMaps({
        diffuse: url(result.diffuse),
        depth: result.depth && url(result.depth),
        normal: result.normal && url(result.normal),
      });
    }).catch(error => { if (active) onError(errorText(error)); });
    return () => {
      active = false;
      urls.forEach(value => URL.revokeObjectURL(value));
    };
  }, [png, source, colorKey, depth, normal, onError]);
  return maps;
}

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

function PublishedDetails({ image, onError, onRevised }: { image: SharedImage; onError: (message: string) => void; onRevised?: (id: string) => void }) {
  const [reviving, setReviving] = useState(false);
  async function revise() {
    setReviving(true);
    try { onRevised?.((await reviseSharedImage(image)).id); }
    catch (error) { onError(errorText(error)); }
    finally { setReviving(false); }
  }
  return <div className="flex min-w-0 flex-col gap-2 text-sm" style={neutralStyle}>
    <p className="text-xs text-neutral-400">{t("assetManager.image.readOnly")}</p>
    {canReviseImage(image) && <button type="button" className={`${BUTTON} ${idle} self-start`} disabled={reviving} title={t("assetManager.image.editHint")} onClick={() => void revise()}>{t("assetManager.image.edit")}</button>}
    <img className="max-h-52 max-w-full self-start object-contain" src={image.url} alt={image.name}/>
    {image.type === "sky" && <SkyWrapPreview url={image.url}/>}
    <p><span className="text-neutral-400">{t("assetManager.image.name")}: </span>{image.name}</p>
    <p><span className="text-neutral-400">{t("assetManager.image.type")}: </span>{t(`assetManager.image.${image.type}`)}</p>
    {image.type === "portrait"
      ? <p><span className="text-neutral-400">{t("assetManager.image.purpose")}: </span>{purposeLabel(image.purpose)}</p>
      : image.surface && <p><span className="text-neutral-400">{t("assetManager.image.surface")}: </span>{surfaceLabel(image.surface)}</p>}
    {image.pickup && <>
      <p>{t("assetManager.pickup.category")}: {t(`assetManager.pickup.${image.pickup.category}`)}</p>
      <p>{t("assetManager.pickup.height")}: {image.pickup.height}</p>
      <p>{t("assetManager.pickup.glow")}: {image.pickup.glow}</p>
      <p>{t("assetManager.pickup.value")}: {pickupValue(image.pickup.value, image.pickup.category)} cr</p>
      <div className="grid grid-cols-2 gap-2">
        {(["normal", "depth"] as const).map(channel => <div key={channel}>
          <strong>{t(`assetManager.row.${channel}`)}</strong>
          <img className="h-20 w-full object-contain" src={channel === "normal" ? image.pickup!.normalUrl : image.pickup!.depthUrl} alt=""/>
        </div>)}
      </div>
    </>}
    {image.normalUrl && <div>
      <strong>{t("assetManager.row.normal")}</strong>
      <img className="h-20 w-full object-contain" src={image.normalUrl} alt=""/>
    </div>}
    <p><span className="text-neutral-400">{t("assetManager.world")}: </span>{t(image.world === "fantasy" ? "assetManager.fantasy" : "assetManager.scifi")}</p>
    <p><span className="text-neutral-400">{t("assetManager.image.size")}: </span>{image.width} × {image.height}</p>
    <p className="min-w-0"><span className="text-neutral-400">{t("assetManager.image.id")}: </span><code className="break-all text-xs text-neutral-400">{image.id}</code></p>
  </div>;
}

export function ImageAssetInspector({ draft, image, pickupPreview, onError, onRevised }: {
  draft?: ImageDraft;
  image?: SharedImage;
  pickupPreview?: MaterialMaps;
  onError: (message: string) => void;
  // a published pickup / decal was turned into a draft to edit (the list selects it)
  onRevised?: (id: string) => void;
}) {
  const auth = useSharedAuth();
  const drafts = useImageDrafts();
  const [busy, setBusy] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [signIn, setSignIn] = useState(false);
  // Always read the stored copy: a prop from the list can be one edit behind.
  const current = draft ? drafts.find(saved => saved.id === draft.id) : undefined;
  const preview = useImageDraftPreview(current);
  const decalNormalUrl = useBlobUrl(current?.decalNormal);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try { await action(); }
    catch (error) { onError(errorText(error)); }
    finally { setBusy(false); }
  }

  const latest = () => current ? getImageDrafts().find(saved => saved.id === current.id) : undefined;
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
  function autosavePickup(patch: Partial<PickupAppearance>) {
    const base = latest();
    if (base) autosave({ pickup: { ...(base.pickup ?? DEFAULT_PICKUP), ...patch } });
  }

  async function chooseFile(file: File) {
    await run(async () => {
      if (!current) return;
      await checkImagePng(file, file.name, current.type);
      const png = file.slice(0, file.size, "image/png");
      const name = current.name.trim() || file.name.replace(/\.png$/i, "").slice(0, 100);
      await change({ png, name, pickupMaps: undefined, decalNormal: undefined });
      setStatus(t("assetManager.image.saved"));
    });
  }

  function choosePickupMap(channel: "normal" | "depth", file: File) {
    return run(async () => {
      const base = latest();
      if (!base?.png || base.type !== "item") return;
      const [map, diffuse] = await Promise.all([
        checkImagePng(file, file.name, "item"), decode(base.png),
      ]);
      if (map.width !== diffuse.width || map.height !== diffuse.height) {
        throw new Error(t("assetManager.pickup.mapSize", { width: diffuse.width, height: diffuse.height }));
      }
      if (latest()?.png !== base.png) return;
      await change({ pickupMaps: {
        ...base.pickupMaps,
        [channel]: file.slice(0, file.size, "image/png"),
        ...(channel === "depth" ? { aiDepth: false } : {}),
      } });
    });
  }

  // a decal's normal map: it must be the size of the picture
  function chooseDecalNormal(file: File) {
    return run(async () => {
      const base = latest();
      if (!base?.png || base.type !== "decal") return;
      const [map, diffuse] = await Promise.all([checkImagePng(file, file.name, "decal"), decode(base.png)]);
      if (map.width !== diffuse.width || map.height !== diffuse.height) {
        throw new Error(t("assetManager.pickup.mapSize", { width: diffuse.width, height: diffuse.height }));
      }
      if (latest()?.png !== base.png) return;
      await change({ decalNormal: file.slice(0, file.size, "image/png") });
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
    if (image) return <PublishedDetails image={image} onError={onError} onRevised={onRevised}/>;
    return <p className="text-sm text-neutral-400" style={neutralStyle}>{t("assetManager.image.selectHint")}</p>;
  }

  const purpose = current.purpose ?? "portrait";
  const pickup = current.pickup ?? DEFAULT_PICKUP;
  const locked = busy || aiRunning;
  // the pickup's normal and depth for the shared channel UI: an uploaded map overrides, no map = Auto (made from the diffuse)
  const pickupMapOf = (key: MapKey) => key === "normal" || key === "depth" ? current.pickupMaps?.[key] : undefined;
  const clearPickupMap = async (key: MapKey) => {
    if (key !== "normal" && key !== "depth") return;
    const base = latest();
    if (base) await change({ pickupMaps: { ...base.pickupMaps, [key]: undefined, ...(key === "depth" ? { aiDepth: false } : {}) } });
  };
  // a decal has a normal map only (it is projected onto the wall / floor, which has the relief): no depth card;
  // the AI run makes the normal and drops the depth. Auto = no file: the game makes one from the picture's brightness
  const clearDecalNormal = async () => { if (latest()) await change({ decalNormal: undefined }); };
  const decalEditor: ChannelEditor = {
    view: { pixelArt: true, transparency: current.transparency,
      slot: key => key === "diffuse" ? { mode: "uploaded", has: !!current.png } : { mode: current.decalNormal ? "uploaded" : "auto", has: !!current.decalNormal } },
    busy, aiDepth: false, channels: ["normal"],
    modes: key => key === "normal" ? ["uploaded", "auto"] : ["uploaded"],
    chooseFile: (key, file) => key === "normal" ? chooseDecalNormal(file) : Promise.resolve(),
    setMode: (key, mode, open) => {
      if (key !== "normal") return;
      if (mode === "uploaded") { if (!current.decalNormal) open?.(); }
      else void run(clearDecalNormal);
    },
    remove: key => key === "normal" ? run(clearDecalNormal) : Promise.resolve(),
    diffuseBlob: async () => current.png,
    applyAiMaps: async (_depth, normal) => {
      const base = latest();
      if (!normal || !base || base.png !== current.png) return;
      await change({ decalNormal: normal });
    },
    onError,
  };
  const pickupEditor: ChannelEditor = {
    view: { pixelArt: true, transparency: current.transparency,
      slot: key => key === "diffuse" ? { mode: "uploaded", has: !!current.png } : { mode: pickupMapOf(key) ? "uploaded" : "auto", has: !!pickupMapOf(key) } },
    busy, aiDepth: !!current.pickupMaps?.aiDepth, channels: ["normal", "depth"],
    modes: key => key === "normal" || key === "depth" ? ["uploaded", "auto"] : ["uploaded"],
    chooseFile: (key, file) => key === "normal" || key === "depth" ? choosePickupMap(key, file) : Promise.resolve(),
    setMode: (key, mode, open) => {
      if (mode === "uploaded") { if (!pickupMapOf(key)) open?.(); }
      else void run(() => clearPickupMap(key));
    },
    remove: key => run(() => clearPickupMap(key)),
    diffuseBlob: async () => current.png,
    applyAiMaps: async (depth, normal) => {
      const base = latest();
      if (!base || base.png !== current.png) return;
      await change({ pickupMaps: { ...base.pickupMaps, depth, aiDepth: true, ...(normal ? { normal } : {}) } });
    },
    depthBlob: async () => latest()?.pickupMaps?.depth,
    applyNormal: async normal => {
      const base = latest();
      if (base) await change({ pickupMaps: { ...base.pickupMaps, normal } });
    },
    onError,
  };
  return <div className="relative flex min-w-0 flex-col gap-2 text-sm" style={neutralStyle}>
    <fieldset className="flex min-w-0 flex-col gap-2" disabled={locked}>
    {current.type === "sky"
      ? <SkyDraftFields draft={current} busy={busy} change={change} run={run} onStatus={setStatus}/>
      : <>
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
      </>}

    <label className="flex min-w-0 flex-col gap-1">{t("assetManager.image.name")}
      <input className={field} value={current.name} maxLength={100}
        onChange={event => autosave({ name: event.target.value })}/>
    </label>

    {current.type === "decal"
      ? <KindChoice label={t("assetManager.image.surface")} value={current.surface}
          options={(["wall", "floor", "ceiling"] as const).map(value => ({ value, label: surfaceLabel(value) }))}
          onChange={value => autosave({ surface: value as DecalSurfaceKind })}/>
      : current.type === "portrait" && <KindChoice label={t("assetManager.image.purpose")} value={purpose}
          options={(["loading", "portrait", "room"] as const).map(value => ({ value, label: purposeLabel(value) }))}
          onChange={value => autosave({ purpose: value as ImagePurpose })}/>}

    {current.type === "item" && <>
      <KindChoice label={t("assetManager.pickup.category")} value={pickup.category}
        options={ITEM_CATEGORIES.map(value => ({ value, label: t(`assetManager.pickup.${value}`) }))}
        onChange={category => autosavePickup({ category: category as PickupAppearance["category"] })}/>
      <NumberField label={t("assetManager.pickup.height")} min={0.03} max={2} step={0.01}
        value={pickup.height} defaultValue={DEFAULT_PICKUP.height} onChange={height => autosavePickup({ height })}/>
      <NumberField label={t("assetManager.pickup.glow")} min={0} max={2} step={0.05}
        value={pickup.glow} defaultValue={DEFAULT_PICKUP.glow} onChange={glow => autosavePickup({ glow })}/>
      <div className="flex min-w-0 flex-col gap-1" title={t("assetManager.pickup.valueHint")}>
        <NumberField label={t("assetManager.pickup.value")} min={0} max={MAX_PICKUP_VALUE} step={1} unit="cr"
          value={pickupValue(pickup.value, pickup.category)} defaultValue={categoryValue(pickup.category)}
          disabled={pickup.value === undefined} onChange={value => autosavePickup({ value })}/>
        <label className="flex items-center gap-1 text-xs text-neutral-300">
          <input type="checkbox" checked={pickup.value === undefined}
            onChange={event => autosavePickup({ value: event.target.checked ? undefined : categoryValue(pickup.category) })}/>
          {t("assetManager.pickup.valueAuto", { n: categoryValue(pickup.category) })}
        </label>
      </div>
    </>}

    {current.type !== "sky" && <KindChoice label={t("assetManager.image.transparency")} value={current.transparency.source}
      options={[
        { value: "alpha", label: t("assetManager.image.alpha") },
        { value: "colorKey", label: t("assetManager.image.colorKey") },
        { value: "none", label: t("assetManager.image.none") },
      ]}
      onChange={value => autosaveTransparency({ source: value as Transparency["source"] })}/>}
    {current.type !== "sky" && current.transparency.source === "colorKey" && <label className="flex items-center gap-2">{t("assetManager.image.colorKey")}
      <input type="color" value={current.transparency.colorKey}
        onChange={event => autosaveTransparency({ colorKey: event.target.value })}/>
    </label>}
    </fieldset>

    {current.type === "item" && <details open className="min-w-0 rounded border border-neutral-800 p-2">
      <summary className="cursor-pointer font-semibold">{t("assetManager.mapsEditable")}</summary>
      <fieldset className="mt-2 min-w-0" disabled={busy || !current.png}>
        <ChannelCards editor={pickupEditor} channels={["normal", "depth"]} urls={pickupPreview ?? {}} onAiRunning={setAiRunning}/>
      </fieldset>
    </details>}

    {current.type === "decal" && <details open className="min-w-0 rounded border border-neutral-800 p-2">
      <summary className="cursor-pointer font-semibold">{t("assetManager.mapsEditable")}</summary>
      <fieldset className="mt-2 min-w-0" disabled={busy || !current.png}>
        <ChannelCards editor={decalEditor} channels={["normal"]} urls={{ normal: decalNormalUrl }} onAiRunning={setAiRunning}/>
      </fieldset>
    </details>}

    <div className="flex flex-wrap gap-1">
      <button type="button" className={`${BUTTON} ${idle}`} disabled={locked} onClick={() => void save()}>{t("assetManager.image.saveDraft")}</button>
      <button type="button" className={`${BUTTON} ${idle}`} disabled={locked} onClick={startPublish}>{t("assetManager.image.publish")}</button>
      <button type="button" className={`${BUTTON} ${idle}`} disabled={locked} onClick={discard}>{t("assetManager.image.discard")}</button>
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
