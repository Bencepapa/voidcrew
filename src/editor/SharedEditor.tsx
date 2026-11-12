import { useRef, useState } from "react";
import { createMap, mapFile } from "./mapStore";
import type { GameMap } from "../game/types";
import type { MapFile } from "../game/mapFormat";
import { TEXTURE_SETS, type TextureSetPaths } from "../render/textureSets";

const project = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const sharedConfigured = Boolean(project && key);
interface Head { id: string; revision: number; title: string; saved_by?: string; saved_at?: string }
let token = "";
let signedInName = "";
const button = "w-fit rounded border border-neutral-500 bg-neutral-800 px-3 py-2 text-left text-white hover:border-amber-400 hover:bg-neutral-700 focus-visible:outline-amber-400 disabled:opacity-50";
const origins = new Map<string, Head>();

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(project + path, { ...init, headers: {
    apikey: key, ...(token ? { Authorization: "Bearer " + token } : {}),
    "Content-Type": "application/json", ...init.headers,
  } });
  if (!res.ok) {
    if (res.status === 409) throw new Error("This map has a newer version. Save a copy to keep your edits.");
    if (res.status === 401) token = "";
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.message || detail.msg || res.statusText);
  }
  const text = await res.text();
  return JSON.parse(text || "null");
}

async function textures(world: GameMap["world"]) {
  const listed = new Set<string>();
  for (let offset = 0; ; offset += 100) {
    const files = await request<{ name: string }[]>("/storage/v1/object/list/void-textures", {
      method: "POST", body: JSON.stringify({ prefix: world, limit: 100, offset, sortBy: {column: "name", order: "asc"} }),
    });
    for (const {name} of files) {
      if (!/^[a-z0-9-]+\.png$/.test(name)) continue;
      const id = world + "_shared_" + name.slice(0,-4);
      listed.add(id);
      (TEXTURE_SETS as Record<string, TextureSetPaths>)[id] = {
        kind: ["floor","wall"], label: name.slice(37,-4) || "Shared texture",
        diffuse: project + "/storage/v1/object/public/void-textures/" + world + "/" + name,
        normal: TEXTURE_SETS.wall2.normal, depth: TEXTURE_SETS.wall2.depth, pixelArt: true,
      };
    }
    if (files.length < 100) break;
  }
  const registry: Record<string, TextureSetPaths> = TEXTURE_SETS;
  for (const id of Object.keys(registry)) {
    if (id.startsWith(world + "_shared_") && !listed.has(id)) delete registry[id];
  }
}

export function SharedEditor({map, openMap, changed}: {map: GameMap; openMap: (m: GameMap) => void; changed: () => void}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<File | null>(null);
  const [heads, setHeads] = useState<Head[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await fn(); } catch (error) { setMessage(String(error)); } finally { setBusy(false); }
  }
  async function refresh() {
    await textures(map.world);
    const latest = await request<Head[]>("/rest/v1/void_map_heads?world=eq." + map.world + "&order=title,id");
    setHeads(latest.sort((a, b) => (b.saved_at ?? "").localeCompare(a.saved_at ?? "")));
    changed();
  }
  async function save(copy: boolean) {
    const body = mapFile(map.id);
    if (!body) throw new Error("Map file unavailable");
    const previous = copy ? undefined : origins.get(map.id);
    const head = { id: previous?.id ?? (copy ? "copy-" + crypto.randomUUID() : map.id), title: map.name, revision: (previous?.revision ?? 0) + 1 };
    await request("/rest/v1/void_maps", {method: "POST", body: JSON.stringify({...head, world: map.world, body})});
    origins.set(map.id, head);
    await refresh(); setMessage("Saved version " + head.revision);
  }
  async function load(head: Head) {
    const rows = await request<{body: MapFile}[]>("/rest/v1/void_maps?select=body&world=eq." + map.world + "&id=eq." + encodeURIComponent(head.id) + "&revision=eq." + head.revision);
    if (!rows.length) throw new Error("Map version unavailable");
    const id = "shared-" + crypto.randomUUID();
    const result = createMap(id, rows[0].body, undefined, map.world);
    if ("error" in result) throw new Error(result.error);
    origins.set(id, head); openMap(result.map); setOpen(false);
  }
  return <><button className={button} type="button" onClick={() => {setOpen(true); if(token) void run(refresh);}}>Shared maps ({token ? signedInName : "Log In"})</button>
    {open && <div role="dialog" aria-modal="true" aria-label="Shared maps" onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") setOpen(false); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <section className="w-[min(30rem,94vw)] max-h-[85vh] overflow-auto rounded-lg border-2 border-neutral-500 bg-neutral-950 p-5 text-left text-sm text-white shadow-2xl">
        <header className="mb-4 flex items-center justify-between border-b border-neutral-700 pb-3">
          <strong>Shared maps · {map.world}</strong>
          <button type="button" aria-label="Close shared maps" className={button} onClick={()=>setOpen(false)}>×</button>
        </header>
        <fieldset disabled={busy} className="flex min-w-0 flex-col items-start gap-2">
        {!token ? <form className="flex flex-col gap-2" onSubmit={e => {e.preventDefault(); void run(async () => {
          const auth = await request<{access_token:string; user: {email: string}}>("/auth/v1/token?grant_type=password", {method:"POST",body:JSON.stringify({email,password})});
          token = auth.access_token; signedInName = auth.user.email.split("@")[0]; setPassword("");
          const membership = await request<unknown[]>("/rest/v1/void_editors?select=user_id");
          if (!membership.length) { token = ""; throw new Error("Editor access required"); }
          await refresh();
        });}}>
          <input className="rounded border border-neutral-500 bg-neutral-800 px-3 py-2" aria-label="Email" type="email" placeholder="Email" required value={email} onChange={e=>setEmail(e.target.value)}/>
          <input className="rounded border border-neutral-500 bg-neutral-800 px-3 py-2" aria-label="Password" type="password" placeholder="Password" required value={password} onChange={e=>setPassword(e.target.value)}/>
          <button className={button}>Log in</button></form> : <>
          <strong>{map.name}</strong>
          <button className={button} onClick={()=>void run(()=>save(false))}>Save shared map</button>
          <p className="text-xs text-neutral-300">Publish this map or add its next revision.</p>
          <button className={button} onClick={()=>void run(()=>save(true))}>Save as new map</button>
          <p className="text-xs text-neutral-300">Create a separate map at v1. Further saves go to that copy.</p>
          <label className="mt-2 block">Shared texture (PNG)<input ref={picker} className="block file:mr-2 file:rounded file:border file:border-neutral-500 file:bg-neutral-800 file:px-3 file:py-1 file:text-white" type="file" accept="image/png" onChange={e=>setUpload(e.target.files?.[0] ?? null)} /></label>
          <p className="text-xs text-neutral-300">Upload adds one image to this world’s shared wall and floor palettes immediately. Save the map after painting it.</p>
          <button className={button} disabled={!upload} onClick={()=>{
            const f = upload;
            if (!f) return;
            void run(async()=>{
              if(f.type!=="image/png" || f.size>8388608) throw new Error("Choose a PNG up to 8 MB");
              const name=crypto.randomUUID()+"-"+(f.name.slice(0,-4).toLowerCase().replace(/[^a-z0-9-]/g,"-") || "texture")+".png";
              await request("/storage/v1/object/void-textures/"+map.world+"/"+name,{method:"POST",headers:{"Content-Type":"image/png"},body:f});
              setUpload(null);
              if (picker.current) picker.current.value = "";
              await refresh(); setMessage("Uploaded. Available in both palettes.");
            });
          }}>Upload to shared library</button>
          <strong className="mt-2">Latest save of each map</strong>
          <button className={button} onClick={()=>void run(refresh)}>Refresh list and textures</button>
          <p className="text-xs text-neutral-300">Check for other editors’ saves and uploaded textures.</p>
          {!busy && !heads.length && <p>No shared maps yet.</p>}
          {heads.map(h=><button className={button + " w-full"} key={h.id} onClick={()=>void run(()=>load(h))}>
            <strong>Open {h.title}</strong> · v{h.revision}
            <span className="block text-xs text-neutral-300">{h.saved_by ?? "Author unrecorded"}{h.saved_at && " · " + new Date(h.saved_at).toLocaleString()} · {h.id.slice(-8)}</span>
          </button>)}
          <button className={button} onClick={()=>{token="";setHeads([]);setMessage("");}}>Sign out</button>
        </>}
        <output aria-live="polite">{busy ? "Working…" : message}</output>
      </fieldset></section></div>}
  </>;
}
