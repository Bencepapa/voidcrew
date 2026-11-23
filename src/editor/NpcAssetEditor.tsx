import { useEffect, useMemo, useState } from "react";
import { ACTOR_ROW_ROLES, sheetLayout, type ActorRowRole } from "../game/actorSheets";
import { t, useLang } from "../i18n";
import { ActorAlignment } from "./ActorAlignment";
import { ChannelCards, useBlobUrl } from "./ChannelControls";
import type { ChannelEditor } from "./channelEditor";
import { decode, MAX_PNG_BYTES } from "./imageTools";
import { sharedConfigured, sharedToken } from "./sharedAuth";
import {
  actorDiffuse, actorGridValid, alignActorFrames, defaultActorDirections, discardActorDraft, importActorSheet,
  MAX_ACTOR_COLUMNS, MAX_ACTOR_ROWS, publishActor, saveActorDraft, type ActorDraft,
} from "./sharedActors";
import { errorText, SignInPopover } from "./TexturePanel";

const button = "rounded-sm border border-neutral-700 bg-neutral-800 px-2 py-1 hover:bg-neutral-700 disabled:opacity-50";
const field = "rounded-sm border border-neutral-700 bg-neutral-900 px-2 py-1";
const sectors = ["front", "frontLeft", "left", "backLeft", "back", "backRight", "right", "frontRight"] as const;

// the height slider's range (the sheet accepts 0.1..4; this is what's sensible to drag)
const NPC_HEIGHT_MIN = 0.2;
const NPC_HEIGHT_MAX = 2.5;

// a live gauge for the height: the figure's bar against the outline of one full wall height
function HeightGauge({ height }: { height: number }) {
  const px = 24; // per wall height
  return <div aria-hidden="true" className="flex items-end gap-1" style={{ height: NPC_HEIGHT_MAX * px }}>
    <div className="w-4 rounded-sm bg-amber-400/70" style={{ height: Math.min(NPC_HEIGHT_MAX, height) * px }}/>
    <div className="w-4 rounded-sm border border-dashed border-neutral-500" style={{ height: px }}/>
  </div>;
}

export function NpcAssetEditor({ initial, onBack, onPublished }: {
  initial: ActorDraft;
  onBack: () => void;
  onPublished: (webpRefused: boolean) => void;
}) {
  useLang();
  const [draft, setDraft] = useState(initial);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const { diffuse, transparency, cols, roles } = draft;
  const layout = useMemo(() => sheetLayout(cols, roles, draft.directions), [cols, roles, draft.directions]);
  const validGrid = actorGridValid(draft.width, draft.height, cols, roles.length);
  const change = (patch: Partial<ActorDraft>) => { setDraft(current => ({ ...current, ...patch })); setStatus(""); };

  useEffect(() => {
    setImage(null);
    if (!diffuse) return;
    let live = true;
    let url: string | undefined;
    void actorDiffuse({ diffuse, transparency }).then(blob => {
      if (!live || !blob) return;
      url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { if (live) setImage(img); };
      img.onerror = () => { if (live) setError(t("assetManager.npcSheet.loadError")); };
      img.src = url;
    }).catch(reason => { if (live) setError(errorText(reason)); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [diffuse, transparency]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("");
    try { await action(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  function importSheet(file: File, normal: boolean) {
    return run(async () => {
      const { png, width, height } = await importActorSheet(file);
      if (normal) {
        if (width !== draft.width || height !== draft.height) throw new Error(t("assetManager.npcSheet.normalSize"));
        change({ normal: png });
      } else {
        change({ diffuse: png, width, height, offsets: [], normal: width === draft.width && height === draft.height ? draft.normal : null });
      }
    });
  }

  // the sheet's normal map for the shared channel UI: a sprite sheet is drawn as a billboard (shaded by its normal map, no
  // relief), so it has a normal only: Uploaded / None, and the AI run makes the normal and drops the depth
  const normalUrl = useBlobUrl(draft.normal);
  const channelEditor: ChannelEditor = {
    view: { pixelArt: false, transparency, slot: key => key === "diffuse" ? { mode: "uploaded", has: !!diffuse } : { mode: draft.normal ? "uploaded" : "none", has: !!draft.normal } },
    busy, aiDepth: false, channels: ["normal"], accept: "image/png,image/webp",
    modes: key => key === "normal" ? ["uploaded", "none"] : ["uploaded"],
    chooseFile: (key, file) => key === "normal" ? importSheet(file, true) : Promise.resolve(),
    setMode: (key, mode, open) => {
      if (key !== "normal") return;
      if (mode === "uploaded") { if (!draft.normal) open?.(); }
      else change({ normal: null });
    },
    remove: async key => { if (key === "normal") change({ normal: null }); },
    diffuseBlob: () => actorDiffuse(draft),
    applyAiMaps: async (_depth, normal) => {
      if (normal && normal.size > MAX_PNG_BYTES) throw new Error(t("assetManager.npcSheet.fileError"));
      if (normal) change({ normal });
    },
    onError: setError,
  };

  function resizeGrid(nextCols: number, nextRows: number) {
    const nextRoles = Array.from({ length: nextRows }, (_, i) => roles[i] ?? "unused");
    if (!nextRoles.includes("idle")) nextRoles[0] = "idle";
    change({
      cols: nextCols, roles: nextRoles, offsets: [],
      directions: cols === nextCols ? draft.directions : defaultActorDirections(nextCols),
    });
  }

  function setRole(row: number, role: ActorRowRole) {
    const unique = role === "idle" || role === "hit" || role === "wreck";
    change({ roles: roles.map((current, i) => i === row ? role : unique && current === role ? "unused" : current) });
  }

  function publish() {
    if (!sharedConfigured) { setError(t("assetManager.notConfigured")); return; }
    if (!sharedToken()) { setSignIn(true); return; }
    void run(async () => {
      await saveActorDraft(draft);
      onPublished((await publishActor(draft)).webpRefused);
    });
  }

  return <div className="flex min-h-0 flex-col gap-3 overflow-auto text-xs">
    <header className="flex flex-wrap items-center gap-2 border-b border-neutral-700 pb-2">
      <button className={button} disabled={busy || signIn} onClick={() => void run(async () => {
        if (draft !== initial) await saveActorDraft(draft);
        onBack();
      })}>{t("assetManager.npcSheet.back")}</button>
      <strong className="mr-auto text-sm">{t("assetManager.npcSheet.title")}</strong>
      <button className={button} disabled={busy || signIn} onClick={() => void run(async () => {
        await saveActorDraft(draft);
        setStatus(t("assetManager.npcSheet.saved"));
      })}>{t("assetManager.image.saveDraft")}</button>
      <button className={button} disabled={busy || signIn || !draft.name.trim() || !validGrid || !roles.includes("idle")} onClick={publish}>
        {t("assetManager.image.publish")}
      </button>
      <button className={button} disabled={busy || signIn} onClick={() => {
        if (window.confirm(t("assetManager.image.discardConfirm", { name: draft.name || t("assetManager.untitled") }))) {
          void run(async () => { await discardActorDraft(draft.id); onBack(); });
        }
      }}>{t("assetManager.image.discard")}</button>
    </header>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {status && <p role="status" className="text-green-300">{status}</p>}
    {signIn && <SignInPopover className="fixed left-1/2 top-24 -translate-x-1/2"
      onDone={() => { setSignIn(false); publish(); }} onCancel={() => setSignIn(false)} onError={setError}/>}
    <fieldset disabled={busy || signIn} className="rounded-sm border border-neutral-800 p-2">
      <legend className="px-1 font-semibold">{t("assetManager.npcSheet.setup")}</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2">{t("assetManager.nameLabel")}
          <input className={field} value={draft.name} maxLength={100} onChange={e => change({ name: e.target.value })}/>
        </label>
        <label className="flex items-center gap-2">{t("assetManager.npcSheet.diffuse")}
          <input type="file" accept="image/png,image/webp" onChange={e => {
            const file = e.target.files?.[0]; e.target.value = "";
            if (file) void importSheet(file, false);
          }}/>
        </label>
        <label className="flex items-center gap-2">{t("assetManager.npcSheet.transparency")}
          <select className={field} value={transparency.source} onChange={e =>
            change({ transparency: { ...transparency, source: e.target.value === "colorKey" ? "colorKey" : "alpha" } })}>
            <option value="alpha">{t("assetManager.npcSheet.alpha")}</option>
            <option value="colorKey">{t("assetManager.npcSheet.colorKey")}</option>
          </select>
        </label>
        {transparency.source === "colorKey" && <input type="color" aria-label={t("assetManager.npcSheet.colorKey")}
          value={transparency.colorKey} onChange={e => change({ transparency: { ...transparency, colorKey: e.target.value } })}/>}
        <label className="flex items-center gap-2">{t("assetManager.npcSheet.columns")}
          <select className={field} value={cols} onChange={e => resizeGrid(Number(e.target.value), roles.length)}>
            {Array.from({ length: MAX_ACTOR_COLUMNS }, (_, i) => <option key={i}>{i + 1}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">{t("assetManager.npcSheet.rows")}
          <select className={field} value={roles.length} onChange={e => resizeGrid(cols, Number(e.target.value))}>
            {Array.from({ length: MAX_ACTOR_ROWS }, (_, i) => <option key={i}>{i + 1}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2" title={t("assetManager.npcSheet.heightHint")}>{t("assetManager.npcSheet.height")}
          <input type="range" className="w-40" min={NPC_HEIGHT_MIN} max={NPC_HEIGHT_MAX} step={0.05}
            value={Math.min(NPC_HEIGHT_MAX, Math.max(NPC_HEIGHT_MIN, draft.worldHeight))}
            onChange={e => change({ worldHeight: e.target.valueAsNumber })}/>
          <input type="number" className={field + " w-20"} min={0.1} max={4} step={0.05} value={draft.worldHeight}
            onChange={e => { if (e.target.valueAsNumber >= 0.1 && e.target.valueAsNumber <= 4) change({ worldHeight: e.target.valueAsNumber }); }}/>
        </label>
        <HeightGauge height={draft.worldHeight}/>
      </div>
      <p className="mt-2 text-neutral-400">{t("assetManager.npcSheet.gridHint")}</p>
      {diffuse && <p className={"mt-1 " + (validGrid ? "text-neutral-400" : "text-amber-300")}>
        {draft.width} × {draft.height} px · {validGrid
          ? t("assetManager.npcSheet.cell", { w: draft.width / cols, h: draft.height / roles.length })
          : t("assetManager.npcSheet.gridError")}
      </p>}
    </fieldset>
    <details open className="max-w-md rounded-sm border border-neutral-800 p-2">
      <summary className="cursor-pointer font-semibold">{t("assetManager.mapsEditable")}</summary>
      <fieldset disabled={busy || signIn || !diffuse} className="mt-2 min-w-0">
        <ChannelCards editor={channelEditor} channels={["normal"]} urls={{ normal: normalUrl }}/>
      </fieldset>
      <p className="mt-1 text-neutral-400">{t("assetManager.npcSheet.mapsHint")}</p>
    </details>
    <div className="flex flex-wrap gap-2">
      <details className="max-w-full flex-1 rounded-sm border border-neutral-800 p-2">
        <summary className="cursor-pointer font-semibold">{t("assetManager.npcSheet.roles")}</summary>
        <fieldset disabled={busy || signIn} className="mt-2 flex flex-wrap gap-2">
          {roles.map((role, i) => <label key={i} className="flex items-center gap-1">
            {t("assetManager.row", { n: i + 1 })}
            <select className={field} value={role} onChange={e => setRole(i, e.target.value as ActorRowRole)}>
              {ACTOR_ROW_ROLES.map(option => <option key={option} value={option}>{t(`assetManager.npcSheet.role.${option}`)}</option>)}
            </select>
          </label>)}
        </fieldset>
      </details>
      <details className="max-w-full flex-1 rounded-sm border border-neutral-800 p-2">
        <summary className="cursor-pointer font-semibold">{t("assetManager.npcSheet.directions")}</summary>
        <fieldset disabled={busy || signIn} className="mt-2 flex flex-wrap items-center gap-2">
          {draft.directions.map((dir, i) => {
            const setView = (patch: Partial<typeof dir>) => change({
              directions: draft.directions.map((view, index) => index === i ? { ...view, ...patch } : view),
            });
            const direction = t(`assetManager.npcSheet.direction.${sectors[i]}`);
            return <div key={i} className="flex items-center gap-2">
              <label className="flex items-center gap-1">{direction}
                <select className={field} value={dir.col} onChange={e => setView({ col: Number(e.target.value) })}>
                  {Array.from({ length: cols }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={dir.mirror} onChange={e => setView({ mirror: e.target.checked })}/>
                {t("assetManager.npcSheet.mirror")}
              </label>
            </div>;
          })}
        </fieldset>
      </details>
    </div>
    {!roles.includes("idle") && <p className="text-amber-300">{t("assetManager.npcSheet.needIdle")}</p>}
    {validGrid && image && <>
      <div><button className={button} disabled={busy || signIn} onClick={() => {
        if (draft.offsets.some(([x, y]) => x || y) && !window.confirm(t("assetManager.npcSheet.alignConfirm"))) return;
        void run(async () => {
          const blob = await actorDiffuse(draft);
          if (blob) change({ offsets: alignActorFrames(await decode(blob), cols, roles.length) });
        });
      }}>{t("assetManager.npcSheet.align")}</button></div>
      <ActorAlignment key={`${cols}x${roles.length}`} image={image} layout={layout} offsets={draft.offsets}
        onOffsetsChange={offsets => { if (!busy && !signIn) change({ offsets }); }}/>
    </>}
  </div>;
}
