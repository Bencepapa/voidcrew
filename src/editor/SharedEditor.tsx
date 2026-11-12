import { useState } from "react";
import { createMap, mapFile } from "./mapStore";
import type { GameMap } from "../game/types";
import type { MapFile } from "../game/mapFormat";
import { TEXTURE_SETS, type TextureSetPaths } from "../render/textureSets";

const project = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const sharedConfigured = Boolean(project && key);
interface Head { id: string; revision: number; title: string }
let token = "";
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
  for (let offset = 0; ; offset += 100) {
    const files = await request<{ name: string }[]>("/storage/v1/object/list/void-textures", {
      method: "POST", body: JSON.stringify({ prefix: world, limit: 100, offset, sortBy: {column: "name", order: "asc"} }),
    });
    for (const {name} of files) {
      if (!/^[a-z0-9-]+\.png$/.test(name)) continue;
      const id = world + "_shared_" + name.slice(0,-4);
      (TEXTURE_SETS as Record<string, TextureSetPaths>)[id] = {
        kind: ["floor","wall"], label: name.slice(37,-4) || "Shared texture",
        diffuse: project + "/storage/v1/object/public/void-textures/" + world + "/" + name,
        normal: TEXTURE_SETS.wall2.normal, depth: TEXTURE_SETS.wall2.depth, pixelArt: true,
      };
    }
    if (files.length < 100) break;
  }
}

export function SharedEditor({map, openMap, changed}: {map: GameMap; openMap: (m: GameMap) => void; changed: () => void}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [heads, setHeads] = useState<Head[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await fn(); } catch (error) { setMessage(String(error)); } finally { setBusy(false); }
  }
  async function refresh() {
    await textures(map.world);
    setHeads(await request<Head[]>("/rest/v1/void_map_heads?world=eq." + map.world + "&order=title"));
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
  return <><button type="button" onClick={() => {setOpen(true); if(token) void run(refresh);}}>Shared maps</button>
    {open && <div role="dialog" aria-modal="true" aria-label="Shared maps" onKeyDown={e => e.stopPropagation()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <fieldset disabled={busy} className="flex w-96 max-h-[85vh] overflow-auto flex-col gap-3 rounded bg-neutral-900 p-5 text-sm text-white">
        <strong>Shared maps · {map.world}</strong>
        {!token ? <form className="flex flex-col gap-2" onSubmit={e => {e.preventDefault(); void run(async () => {
          const auth = await request<{access_token:string}>("/auth/v1/token?grant_type=password", {method:"POST",body:JSON.stringify({email,password})});
          token = auth.access_token; setPassword("");
          const membership = await request<unknown[]>("/rest/v1/void_editors?select=user_id");
          if (!membership.length) { token = ""; throw new Error("Editor access required"); }
          await refresh();
        });}}>
          <input aria-label="Email" type="email" placeholder="Email" required value={email} onChange={e=>setEmail(e.target.value)}/>
          <input aria-label="Password" type="password" placeholder="Password" required value={password} onChange={e=>setPassword(e.target.value)}/>
          <button>Sign in</button></form> : <>
          <button onClick={()=>void run(()=>save(false))}>Save {map.name}</button>
          <button onClick={()=>void run(()=>save(true))}>Save as separate copy</button>
          <label>Add wall / floor PNG<input type="file" accept="image/png" onChange={e=>{
            const f=e.target.files?.[0]; if(!f) return; e.target.value="";
            void run(async()=>{
              if(f.type!=="image/png" || f.size>8388608) throw new Error("Choose a PNG up to 8 MB");
              const name=crypto.randomUUID()+"-"+(f.name.slice(0,-4).toLowerCase().replace(/[^a-z0-9-]/g,"-") || "texture")+".png";
              await request("/storage/v1/object/void-textures/"+map.world+"/"+name,{method:"POST",headers:{"Content-Type":"image/png"},body:f});
              await refresh(); setMessage("Texture added to the wall and floor palettes.");
            });
          }}/></label>
          <button onClick={()=>void run(refresh)}>Refresh shared maps and textures</button>
          {heads.map(h=><button key={h.id} onClick={()=>void run(()=>load(h))}>{h.title} · v{h.revision} · {h.id.slice(-8)}</button>)}
          <button onClick={()=>{token="";setHeads([]);setMessage("");}}>Sign out</button>
        </>}
        <output>{busy ? "Working…" : message}</output><button onClick={()=>setOpen(false)}>Close</button>
      </fieldset></div>}
  </>;
}
