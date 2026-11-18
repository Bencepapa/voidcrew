import { useEffect, useState } from "react";
import { createMap, hasUnsavedEdits, mapFile, markSaved } from "./mapStore";
import { t } from "../i18n";
import type { GameMap } from "../game/types";
import type { MapFile } from "../game/mapFormat";
import { SharedLoginForm, sharedButton as button, sharedProject, sharedRequest, useSharedAuth } from "./sharedAuth";
import { loadSharedTextures } from "./sharedTextures";
import { openAssetManager } from "./AssetManager";
import { registerMap } from "./textureLibrary";

import { ConfirmDialog } from "./Dialog";
import { MapList } from "./MapList";

interface Head { id: string; revision: number; title: string; saved_by?: string; saved_at?: string }
// a shared head's title is "Place – Name" (the head table has no place column)
const SEP = " – ";
const splitTitle = (title: string): { place?: string; name: string } => {
  const i = title.indexOf(SEP);
  return i > 0 ? { place: title.slice(0, i), name: title.slice(i + SEP.length) } : { name: title };
};
const origins = new Map<string, Head>();

export function SharedEditor({map, openMap, changed}: {map: GameMap; openMap: (m: GameMap) => void; changed: () => void}) {
  const auth = useSharedAuth();
  // (the Assets window warns before it deletes a texture this map uses)
  useEffect(() => { registerMap(map); return () => registerMap(undefined); }, [map]);
  const [open, setOpen] = useState(false);
  const [heads, setHeads] = useState<Head[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // the newest shared version, offered while the open map has unsaved edits
  const [ask, setAsk] = useState<Head | null>(null);
  const originKey = (id: string) => JSON.stringify([sharedProject, map.world, id]);
  function origin(id: string): Head | undefined {
    const key = originKey(id);
    try { return origins.get(key) ?? JSON.parse(localStorage.getItem("voidcrew:shared:" + key) ?? "null"); }
    catch { return origins.get(key); }
  }
  function remember(id: string, head: Head) {
    const key = originKey(id);
    origins.set(key, head);
    try { localStorage.setItem("voidcrew:shared:" + key, JSON.stringify(head)); } catch { /* Session cache remains available. */ }
  }
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setMessage("");
    try { await fn(); } catch (error) { setMessage(String(error)); } finally { setBusy(false); }
  }
  async function refresh() {
    const [latest] = await Promise.all([
      sharedRequest<Head[]>("/rest/v1/void_map_heads?world=eq." + map.world + "&order=title,id"),
      loadSharedTextures(map.world),
    ]);
    setHeads(latest.sort((a, b) => (b.saved_at ?? "").localeCompare(a.saved_at ?? "")));
    changed();
    return latest;
  }
  async function save(copy: boolean) {
    const body = mapFile(map.id);
    if (!body) throw new Error(t("editorShell.shared.mapFileUnavailable"));
    const previous = copy ? undefined : origin(map.id);
    // (the title is "Place – Name": the place travels with it in the head list, the body has it too)
    const head = { id: previous?.id ?? (copy ? "copy-" + crypto.randomUUID() : map.id), title: map.hasPlace ? `${map.place}${SEP}${map.name}` : map.name, revision: (previous?.revision ?? 0) + 1 };
    await sharedRequest("/rest/v1/void_maps", {method: "POST", body: JSON.stringify({...head, world: map.world, body})});
    remember(map.id, head);
    if (!copy) markSaved(map.id);
    await refresh(); setMessage(t("editorShell.shared.savedVersion", { n: head.revision }));
  }
  async function load(head: Head) {
    const rows = await sharedRequest<{body: MapFile}[]>("/rest/v1/void_maps?select=body&world=eq." + map.world + "&id=eq." + encodeURIComponent(head.id) + "&revision=eq." + head.revision);
    if (!rows.length) throw new Error(t("editorShell.shared.mapVersionUnavailable"));
    const id = "shared-" + crypto.randomUUID();
    // (a version saved before places existed: the place comes from the title, else "Shared")
    const body = { ...rows[0].body };
    if (!body.place) {
      const { place, name } = splitTitle(head.title);
      body.place = place ?? t("mapDialog.sharedPlace");
      body.name = name;
      body.showTitle ??= false;
    }
    const result = createMap(id, body, undefined, map.world);
    if ("error" in result) throw new Error(result.error);
    remember(id, head); openMap(result.map); setOpen(false);
  }
  return <><button className={button} type="button" onClick={() => {setOpen(true); void run(refresh);}}>{t("editorShell.shared.button", { who: auth.token ? auth.signedInName : t("editorShell.shared.guest") })}</button>
    {open && <div role="dialog" aria-modal="true" aria-label={t("editorShell.shared.dialog")} onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") setOpen(false); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <section className="w-[min(30rem,94vw)] max-h-[85vh] overflow-auto rounded-lg border-2 border-neutral-500 bg-neutral-950 p-5 text-left text-sm text-white shadow-2xl">
        <header className="mb-4 flex items-center justify-between border-b border-neutral-700 pb-3">
          <strong>{t("editorShell.shared.title", { world: map.world })}</strong>
          <button type="button" aria-label={t("editorShell.shared.close")} className={button} onClick={()=>setOpen(false)}>×</button>
        </header>
        <fieldset disabled={busy} className="flex min-w-0 flex-col items-start gap-2">
        {!auth.token ? <SharedLoginForm auth={auth} onSubmit={() => void run(async () => {
          await auth.signIn();
          const latest = await refresh();
          const current = origin(map.id);
          const head = latest.find(h => h.id === (current?.id ?? map.id)) ?? latest[0];
          if (head && (head.id !== current?.id || head.revision !== current?.revision)) {
            if (!hasUnsavedEdits(map.id)) await load(head);
            else setAsk(head);
          }
        })} /> : <>
          <strong>{map.hasPlace ? `${map.place}${SEP}${map.name}` : map.name}</strong>
          <button className={button} onClick={()=>void run(()=>save(false))}>{t("editorShell.shared.saveShared")}</button>
          <p className="text-xs text-neutral-300">{t("editorShell.shared.publishHint")}</p>
          <button className={button} onClick={()=>void run(()=>save(true))}>{t("editorShell.shared.saveAsNew")}</button>
          <p className="text-xs text-neutral-300">{t("editorShell.shared.copyHint")}</p>
        </>}
          <button type="button" className="mt-2 text-left underline hover:text-amber-300" onClick={()=>{setOpen(false);openAssetManager("material","");}}>{t("editorShell.shared.texturesInAssets")}</button>
          <strong className="mt-2">{t("editorShell.shared.latestSaves")}</strong>
          <button className={button} onClick={()=>void run(refresh)}>{t("editorShell.shared.refreshList")}</button>
          <p className="text-xs text-neutral-300">{t("editorShell.shared.refreshHint")}</p>
          {!busy && !heads.length && <p>{t("editorShell.shared.noShared")}</p>}
          <MapList itemClass={button + " w-full"} activeClass="" items={heads.map(h => {
            const { place, name } = splitTitle(h.title);
            return { key: h.id, place: place ?? t("mapDialog.noPlace"), name, onPick: () => void run(() => load(h)), node: <>
              <strong>{t("editorShell.shared.open", { title: name })}</strong> · v{h.revision}
              <span className="block text-xs text-neutral-300">{h.saved_by ?? t("editorShell.shared.authorUnrecorded")}{h.saved_at && " · " + new Date(h.saved_at).toLocaleString()} · {h.id.slice(-8)}</span>
            </> };
          })} />
          {auth.token && <button className={button} onClick={()=>{auth.signOut();void run(refresh);}}>{t("editorShell.shared.signOut")}</button>}
        <output aria-live="polite">{busy ? t("editorShell.shared.working") : message}</output>
      </fieldset></section></div>}
    {ask && <ConfirmDialog title={t("editorShell.shared.title", { world: map.world })} message={t("editorShell.shared.confirmOpenLatest")} yes={t("dialog.yes")} no={t("dialog.no")}
      onYes={() => { const h = ask; setAsk(null); void run(() => load(h)); }}
      onNo={() => { setAsk(null); setMessage(t("editorShell.shared.localEditsKept")); }} />}
  </>;
}
