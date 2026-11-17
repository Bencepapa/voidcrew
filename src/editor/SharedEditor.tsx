import { useRef, useState } from "react";
import { createMap, hasUnsavedEdits, mapFile } from "./mapStore";
import { t } from "../i18n";
import type { GameMap } from "../game/types";
import type { MapFile } from "../game/mapFormat";
import { TEXTURE_SETS, type TextureSetPaths } from "../render/textureSets";
import { SharedLoginForm, sharedButton as button, sharedProject, sharedRequest, useSharedAuth } from "./sharedAuth";

interface Head { id: string; revision: number; title: string; saved_by?: string; saved_at?: string }
const origins = new Map<string, Head>();

async function textures(world: GameMap["world"]) {
  const listed = new Set<string>();
  for (let offset = 0; ; offset += 100) {
    const files = await sharedRequest<{ name: string }[]>("/storage/v1/object/list/void-textures", {
      method: "POST", body: JSON.stringify({ prefix: world, limit: 100, offset, sortBy: {column: "name", order: "asc"} }),
    });
    for (const {name} of files) {
      if (!/^[a-z0-9-]+\.png$/.test(name)) continue;
      const id = world + "_shared_" + name.slice(0,-4);
      listed.add(id);
      (TEXTURE_SETS as Record<string, TextureSetPaths>)[id] = {
        kind: ["floor","wall"], label: name.slice(37,-4) || "Shared texture",
        diffuse: sharedProject + "/storage/v1/object/public/void-textures/" + world + "/" + name,
        normal: `${import.meta.env.BASE_URL}textures/flat/normal.png`, depth: `${import.meta.env.BASE_URL}textures/flat/depth.png`, pixelArt: true,
      };
    }
    if (files.length < 100) break;
  }
  const registry = TEXTURE_SETS as Record<string, TextureSetPaths>;
  for (const id of Object.keys(registry)) {
    if (id.startsWith(world + "_shared_") && !listed.has(id)) delete registry[id];
  }
}

export function SharedEditor({map, openMap, changed}: {map: GameMap; openMap: (m: GameMap) => void; changed: () => void}) {
  const auth = useSharedAuth();
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<File | null>(null);
  const [heads, setHeads] = useState<Head[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
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
    await textures(map.world);
    const latest = await sharedRequest<Head[]>("/rest/v1/void_map_heads?world=eq." + map.world + "&order=title,id");
    setHeads(latest.sort((a, b) => (b.saved_at ?? "").localeCompare(a.saved_at ?? "")));
    changed();
    return latest;
  }
  async function save(copy: boolean) {
    const body = mapFile(map.id);
    if (!body) throw new Error(t("editorShell.shared.mapFileUnavailable"));
    const previous = copy ? undefined : origin(map.id);
    const head = { id: previous?.id ?? (copy ? "copy-" + crypto.randomUUID() : map.id), title: map.name, revision: (previous?.revision ?? 0) + 1 };
    await sharedRequest("/rest/v1/void_maps", {method: "POST", body: JSON.stringify({...head, world: map.world, body})});
    remember(map.id, head);
    await refresh(); setMessage(t("editorShell.shared.savedVersion", { n: head.revision }));
  }
  async function load(head: Head) {
    const rows = await sharedRequest<{body: MapFile}[]>("/rest/v1/void_maps?select=body&world=eq." + map.world + "&id=eq." + encodeURIComponent(head.id) + "&revision=eq." + head.revision);
    if (!rows.length) throw new Error(t("editorShell.shared.mapVersionUnavailable"));
    const id = "shared-" + crypto.randomUUID();
    const result = createMap(id, rows[0].body, undefined, map.world);
    if ("error" in result) throw new Error(result.error);
    remember(id, head); openMap(result.map); setOpen(false);
  }
  return <><button className={button} type="button" onClick={() => {setOpen(true); if(auth.token) void run(refresh);}}>{t("editorShell.shared.button", { who: auth.token ? auth.signedInName : t("editorShell.shared.logInShort") })}</button>
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
            if (!hasUnsavedEdits(map.id) || window.confirm(t("editorShell.shared.confirmOpenLatest"))) {
              await load(head);
            } else {
              setMessage(t("editorShell.shared.localEditsKept"));
            }
          }
        })} /> : <>
          <strong>{map.name}</strong>
          <button className={button} onClick={()=>void run(()=>save(false))}>{t("editorShell.shared.saveShared")}</button>
          <p className="text-xs text-neutral-300">{t("editorShell.shared.publishHint")}</p>
          <button className={button} onClick={()=>void run(()=>save(true))}>{t("editorShell.shared.saveAsNew")}</button>
          <p className="text-xs text-neutral-300">{t("editorShell.shared.copyHint")}</p>
          <label className="mt-2 block">{t("editorShell.shared.sharedTexture")}<input ref={picker} className="block file:mr-2 file:rounded file:border file:border-neutral-500 file:bg-neutral-800 file:px-3 file:py-1 file:text-white" type="file" accept="image/png" onChange={e=>setUpload(e.target.files?.[0] ?? null)} /></label>
          <p className="text-xs text-neutral-300">{t("editorShell.shared.uploadHint")}</p>
          <button className={button} disabled={!upload} onClick={()=>{
            const f = upload;
            if (!f) return;
            void run(async()=>{
              if(f.type!=="image/png" || f.size>8388608) throw new Error(t("editorShell.shared.pngTooBig"));
              const name=crypto.randomUUID()+"-"+(f.name.slice(0,-4).toLowerCase().replace(/[^a-z0-9-]/g,"-") || "texture")+".png";
              await sharedRequest("/storage/v1/object/void-textures/"+map.world+"/"+name,{method:"POST",headers:{"Content-Type":"image/png"},body:f});
              setUpload(null);
              if (picker.current) picker.current.value = "";
              await refresh(); setMessage(t("editorShell.shared.uploaded"));
            });
          }}>{t("editorShell.shared.uploadButton")}</button>
          <strong className="mt-2">{t("editorShell.shared.latestSaves")}</strong>
          <button className={button} onClick={()=>void run(refresh)}>{t("editorShell.shared.refreshList")}</button>
          <p className="text-xs text-neutral-300">{t("editorShell.shared.refreshHint")}</p>
          {!busy && !heads.length && <p>{t("editorShell.shared.noShared")}</p>}
          {heads.map(h=><button className={button + " w-full"} key={h.id} onClick={()=>void run(()=>load(h))}>
            <strong>{t("editorShell.shared.open", { title: h.title })}</strong> · v{h.revision}
            <span className="block text-xs text-neutral-300">{h.saved_by ?? t("editorShell.shared.authorUnrecorded")}{h.saved_at && " · " + new Date(h.saved_at).toLocaleString()} · {h.id.slice(-8)}</span>
          </button>)}
          <button className={button} onClick={()=>{auth.signOut();setHeads([]);setMessage("");}}>{t("editorShell.shared.signOut")}</button>
        </>}
        <output aria-live="polite">{busy ? t("editorShell.shared.working") : message}</output>
      </fieldset></section></div>}
  </>;
}
