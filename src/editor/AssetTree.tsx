import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AlignJustify, ArrowUpFromLine, Ban, BrickWall, Dices, Fence, Eye, EyeOff, Flag, Footprints, House, Image, Library, Lock, LockOpen, LogOut, MessageSquare, Minus, Store, Tent, Triangle } from "lucide-react";
import { ROOF_FORMS, type RoofForm } from "../game/roofAutotile";
import { hasKey, t, type Key } from "../i18n";
import { assetInWorld, worldOfMap } from "../game/worlds";
import { PROP_TYPES } from "../game/props";
import { ITEM_TYPES } from "../game/items";
import { ACTOR_TYPES } from "../game/actors";
import { actorThumbnail } from "../render/actorSheetFiles";
import { useSharedActorVersion } from "./sharedActors";
import { TEXTURE_SETS, textureFolder, textureSetsOfKind } from "../render/textureSets";
import { fetchDecalManifest } from "../render/decals";
import { pickupTexture, useSharedImages } from "../render/sharedImages";
import { useSharedPropVersion } from "./sharedProps";
import { useDoorCatalog } from "./sharedDoorTypes";
import { neutralStyle } from "./inspector/parts";
import { openAssetManager, type Sample } from "./AssetManager";
import { useTextureVersion } from "./textureLibrary";
import type { EditorBarProps } from "./EditorBar";
import type { EditSurface, EditTool } from "./mapEdits";

// (a shared texture has no translated name: its own name shows)
const assetName = (name: string) => t(("assetTree.name."+name) as Key) ?? name;
// a prop's translated name, when it has one (else its id)
const propName = (id: string) => hasKey("assetTree.name."+id) ? assetName(id) : id;

type Entry = {search?: string; id: string; label: string; kind: string; image?: string; icon?: ReactNode; tool?: EditTool; style?: CSSProperties; active?: boolean; pick: (button: HTMLButtonElement) => void; manager?: Sample; managerId?: string};
export function AssetTree(p: EditorBarProps) {
  useTextureVersion();
  useSharedActorVersion();
  const [query, search] = useState("");
  const [surface, setSurface] = useState<EditSurface>("wall");
  const [propTab, setPropTab] = useState("3D");
  const [collapsed, collapse] = useState<Set<string>>(() => new Set());
  const [decals, setDecals] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const sharedImages = useSharedImages();
  useSharedPropVersion();
  const doorTypes = useDoorCatalog().filter(type => type.world === p.doorWorld);
  useEffect(() => { let live = true; fetchDecalManifest(import.meta.env.BASE_URL, "").then(m => {if(live)setDecals(Object.keys(m));}).catch(() => {if(live)setError(true);}); return () => {live = false;}; }, []);
  const choose = (tool: EditTool, callback: () => void) => { p.onTool(tool); callback(); };
  const toolEntry = (tool: EditTool, label: string, icon: ReactNode, image?: string): Entry => ({id:tool,tool,label,kind:"",icon,image,active:true,pick:()=>p.onTool(tool),manager:image?"material":undefined});
  const textures: Entry[] = (query ? ["wall", "floor", "ceiling"] as const : [surface]).flatMap(s => [
    {id:`${s}:default`,label:t("editorBar.default"),kind:t(`editorBar.${s}`),active:p.paint[s]===null,pick:()=>choose("texture",()=>p.onPaint(s,null)),manager:p.mapLook.textures?.[s] ? "material" as const : undefined,managerId:p.mapLook.textures?.[s]},
    ...textureSetsOfKind(s).map(id => ({id:`${s}:${id}`,label:assetName(TEXTURE_SETS[id].label),search:TEXTURE_SETS[id].label,kind:t(`editorBar.${s}`),image:TEXTURE_SETS[id].diffuse,active:p.paint[s]===id,pick:()=>choose("texture",()=>p.onPaint(s,id)),manager:"material" as const,managerId:id}))
  ]);
  const props: Entry[] = Object.entries(PROP_TYPES).filter(([id,v])=>assetInWorld(id) && v.kind!=="fence").flatMap(([id,v])=>{
    const kind = ["pillar","chamfer"].includes(v.kind) ? "pillar" : ["billboard","cross"].includes(v.kind) ? "billboard" : "3D";
    if (!query && kind!==propTab) return [];
    const tex = v.kind==="views" ? v.views+"_front" : v.kind==="box" ? v.side : v.kind==="cabin" ? v.door : "texture" in v && v.texture || p.mapLook.textures?.wall || "wall4";
    return [{id,label:v.name ?? propName(id),kind:kind==="pillar"?t("assetTree.pillar"):kind,image:(TEXTURE_SETS[tex as keyof typeof TEXTURE_SETS] ?? textureFolder(tex)).diffuse,active:p.propChoice===id,pick:()=>choose("prop",()=>p.onPropChoice(id)),manager:"prop" as const}];
  });
  // the door entry shows the map's own door (a fantasy map's gate, a ship's sliding door), else the default one
  const doorSet = (TEXTURE_SETS as Record<string,{diffuse:string}>)[p.mapLook.textures?.door ?? ""] ? p.mapLook.textures!.door! : "door1";
  const traverse: Entry[] = [toolEntry("ladder",t("editorBar.ladder"),<ArrowUpFromLine size={28}/>), toolEntry("bridge",t("editorBar.bridge"),<AlignJustify size={28}/>), {...toolEntry("door",t("editorBar.door"),null,(TEXTURE_SETS as Record<string,{diffuse:string}>)[doorSet].diffuse),managerId:doorSet}];
  // stairs to other maps: the fantasy world's way between levels
  if (worldOfMap(p.mapId) === "fantasy") traverse.push(toolEntry("stairs", t("link.stairsTool"), <Footprints size={28}/>));
  // (the way off the map belongs here too: a gate or - on a ship - the airlock)
  traverse.push(toolEntry("exit", t("editorBar.exit"), <LogOut size={28}/>));
  const defaultDoor = traverse[2];
  defaultDoor.active = !p.doorTypeChoice;
  defaultDoor.pick = () => choose("door", () => p.onDoorTypeChoice());
  for (const { id, definition } of doorTypes) {
    traverse.push({
      id, label: definition.name, kind: t("assetManager.doorType.title"),
      image: (TEXTURE_SETS as Record<string, { diffuse: string }>)[definition.leaf]?.diffuse,
      tool: "door", active: p.doorTypeChoice === id, manager: "door",
      pick: () => choose("door", () => p.onDoorTypeChoice(id)),
    });
  }
  const events: Entry[] = [toolEntry("start",t("editorBar.start"),<Flag size={28}/>), toolEntry("restricted",t("editorBar.restricted"),<Ban size={28}/>), toolEntry("wall",t("editorBar.chanceWall"),<Dices size={28}/>)];
  for (const kind of ["message", "image", "shop"] as const) {
    events.push({
      ...toolEntry("event", t(`events.${kind}`), kind === "message" ? <MessageSquare size={28}/> : kind === "shop" ? <Store size={28}/> : <Image size={28}/>),
      id: kind,
      active: p.eventKind === kind,
      pick: () => choose("event", () => p.onEventKind(kind)),
    });
  }
  // the Roof tool: one entry per form (the tool paints roofs in the form picked)
  const roofIcons: Record<RoofForm, ReactNode> = {slope: <Triangle size={28}/>, flat: <House size={28}/>, bent: <Tent size={28}/>};
  const roofs: Entry[] = ROOF_FORMS.map(form => ({
    ...toolEntry("roofauto", t(`roofauto.${form}`), roofIcons[form]),
    id: `roof:${form}`, search: t("roofauto.formHint"), active: p.roofForm === form, pick: () => choose("roofauto", () => p.onRoofForm(form)),
  }));
  // the fence and block tools, beside the roof's: a block, a fence on a cell's edge, a fence through its middle
  const fenceTools: [EditTool, "block" | "edge" | "mid", ReactNode][] = [["fenceblock", "block", <BrickWall size={28}/>], ["fenceedge", "edge", <Fence size={28}/>], ["fencemid", "mid", <Minus size={28}/>]];
  const fences: Entry[] = fenceTools.map(([tool, form, icon]) => ({
    ...toolEntry(tool, t(`fence.${form}`), icon),
    id: `fence:${form}`, search: t(`fence.hint.${form}`),
  }));
  const groups: {id:string; label:string; entries:Entry[]; bare?:boolean}[] = [
    {id:"traverse",label:t("traverse.group"),entries:traverse,bare:true},
    {id:"texture",label:t("assetManager.textures"),entries:textures},
    {id:"prop",label:t("assetManager.props"),entries:props},
    {id:"roof",label:t("roofauto.group"),entries:roofs,bare:true},
    {id:"fence",label:t("fence.group"),entries:fences,bare:true},
    {id:"decal",label:t("assetTree.decals"),entries:[
      ...decals.filter(id=>assetInWorld(id)).map(id=>({id,label:id,kind:t("assetManager.decal"),image:`${import.meta.env.BASE_URL}decals/${id}/diffuse.png`,active:p.decalChoice===id,pick:(button:HTMLButtonElement)=>{const img=button.querySelector("img");choose("decal",()=>p.onDecalChoice({name:id,width:img?.naturalWidth||64,height:img?.naturalHeight||64}));},manager:"prop" as const,managerId:`decal:${id}`})),
      ...sharedImages.filter(image=>image.type==="decal" && assetInWorld(image.id)).map(image=>({
        id:image.id,label:image.name,kind:t("assetManager.decal"),image:image.url,active:p.decalChoice===image.id,
        pick:()=>choose("decal",()=>p.onDecalChoice({name:image.id,width:image.width,height:image.height})),
        manager:"prop" as const,managerId:`decal:${image.id}`,
      })),
    ]},
    {id:"item",label:t("assetManager.items"),entries:Object.entries(ITEM_TYPES).filter(([id])=>assetInWorld(id)).map(([id,v])=>({id,label:hasKey("assetTree.name."+v.name)?assetName(v.name):v.name,search:v.name,kind:v.category,image:pickupTexture(id).diffuse,active:p.itemChoice===id,pick:()=>choose("item",()=>p.onItemChoice(id)),manager:"item"}))},
    {id:"robot",label:t("assetManager.npcs"),entries:Object.entries(ACTOR_TYPES).filter(([id])=>assetInWorld(id)).map(([id,v])=>({id,label:assetName(v.name),search:v.name,kind:id,style:actorThumbnail(v),active:p.robotChoice===id,pick:()=>choose("robot",()=>p.onRobotChoice(id)),manager:"actor"}))},
    {id:"light",label:t("assetTree.lights"),entries:(["ceiling","point"] as const).flatMap(place=>[undefined,"flicker","spark","pulse"].map(effect=>({id:`${place}:${effect??""}`,label:`${t(place==="ceiling"?"editorBar.ceilingLamp":"editorBar.pointLight")}${effect?` · ${t(`editorBar.${effect}` as "editorBar.flicker")}`:""}`,kind:t("assetTree.lights"),active:p.lightPlace===place && p.light?.effect===effect,pick:()=>choose("light",()=>{p.onLightPlace(place);p.onAssetEffect("light",effect);})})))},
    {id:"smoke",label:t("editorBar.particles"),entries:(["smoke","fire","mist","groundfog","motes","petals","fireflies"] as const).map(effect=>({id:effect,label:t(`effects.${effect}`),kind:t("editorBar.particles"),active:(p.smoke?.effect??"smoke")===effect,pick:()=>choose("smoke",()=>p.onAssetEffect("smoke",effect))}))},
    {id:"events",label:t("events.group"),entries:events,bare:true}
  ];
  const term=query.trim().toLocaleLowerCase();
  return <aside style={neutralStyle} className="voidcrew-editor-controls flex h-full min-h-0 flex-col border border-neutral-700 bg-neutral-900 text-[11px] text-neutral-200" aria-label={t("assetTree.title")} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onClick={e=>(e.target as HTMLElement).closest<HTMLElement>("button, summary")?.blur()}>
    <button type="button" className="shrink-0 p-2 text-left font-semibold" aria-expanded={!collapsed.has("panel")} onClick={()=>collapse(prev=>{const next=new Set(prev);next.has("panel")?next.delete("panel"):next.add("panel");return next;})}>{t("assetTree.title")}</button>
    {!collapsed.has("panel")&&
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1 pr-1">
        <input type="search" value={query} onChange={e=>search(e.target.value)} placeholder={t("assetTree.search")} aria-label={t("assetTree.search")} className="m-1 min-w-0 flex-1 border border-neutral-600 bg-neutral-950 p-1" onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape"||e.key==="Enter")e.currentTarget.blur();}}/>
        <button type="button" className="shrink-0 rounded border border-neutral-600 p-1 text-neutral-300 hover:border-amber-400 hover:text-amber-300" title={t("assetManager.open")} aria-label={t("assetManager.open")} onClick={()=>openAssetManager("material","")}><Library size={16} aria-hidden="true"/></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map(group=>{const entries=group.entries.filter(e=>!term||`${e.label} ${e.search??""} ${e.id} ${e.kind} ${group.label}`.toLocaleLowerCase().includes(term));return <section key={group.id} className={group.id==="events"?"mt-2 border-t-2 border-neutral-600":undefined}>
        <div className="flex items-center border-y border-neutral-800 bg-neutral-950">
          <button type="button" className="min-w-0 flex-1 p-1 text-left" aria-expanded={!collapsed.has(group.id)} onClick={()=>collapse(prev=>{const next=new Set(prev);next.has(group.id)?next.delete(group.id):next.add(group.id);return next;})}>{collapsed.has(group.id)?"▸":"▾"} {group.label}</button>
          {!group.bare&&<button type="button" className="p-1" aria-label={`${t(p.hiddenLayers.has(group.id)?"editorBar.show":"editorBar.hide")} ${group.label}`} aria-pressed={p.hiddenLayers.has(group.id)} onClick={()=>p.onToggleLayer(group.id)}>{p.hiddenLayers.has(group.id)?<EyeOff size={14}/>:<Eye size={14}/>}</button>}
          {!group.bare&&<button type="button" className={`p-1 rounded ${p.lockedLayers.has(group.id)?"bg-amber-500/25 text-amber-300":"text-neutral-500 hover:text-neutral-300"}`} title={`${t(p.lockedLayers.has(group.id)?"assetTree.unlock":"assetTree.lock")} ${group.label}`} aria-label={`${t(p.lockedLayers.has(group.id)?"assetTree.unlock":"assetTree.lock")} ${group.label}`} aria-pressed={p.lockedLayers.has(group.id)} onClick={()=>p.onToggleLayerLock(group.id)}>{p.lockedLayers.has(group.id)?<Lock size={14}/>:<LockOpen size={14}/>}</button>}
        </div>
        {(!collapsed.has(group.id)||!!term)&&<>
          {group.id==="texture"&&<div className="flex flex-wrap gap-1 p-1">{(["wall","floor","ceiling"] as const).map(s=><button type="button" key={s} aria-pressed={surface===s} className="border border-neutral-600 px-1 aria-pressed:bg-neutral-700" onClick={()=>setSurface(s)}>{t(`editorBar.${s}`)}</button>)}</div>}
          {group.id==="prop"&&<div className="flex flex-wrap gap-1 p-1">{["3D","billboard","pillar"].map(k=><button type="button" key={k} aria-pressed={propTab===k} className="border border-neutral-600 px-1 aria-pressed:bg-neutral-700" onClick={()=>setPropTab(k)}>{t(k==="3D"?"assetManager.threeD":k==="billboard"?"assetManager.billboard":"assetTree.pillar")}</button>)}</div>}
          {entries.map(e=><button key={e.id} type="button" title={e.id.includes("_shared_") ? e.label : `${e.label} (${e.id})`} aria-pressed={p.tool===(e.tool??group.id)&&!!e.active} className="flex w-full items-center gap-1 border border-transparent p-1 text-left hover:bg-neutral-800 aria-pressed:border-amber-400" onClick={event=>e.pick(event.currentTarget)} onDoubleClick={()=>{if(e.manager)openAssetManager(e.manager,e.managerId??e.id);}}>
            {(e.image||e.style||e.icon)&&<span className="flex h-12 w-12 shrink-0 items-center justify-center bg-contain bg-center bg-no-repeat" style={{...e.style,imageRendering:"auto"}}>{e.icon}{e.image&&<img src={e.image} alt="" loading="lazy" className="h-full w-full object-contain"/>}</span>}<span className="min-w-0 break-words">{e.label}</span>
          </button>)}
          {!entries.length&&<p className="p-1 text-neutral-500">{t("assetTree.empty")}</p>}
          {group.id==="decal"&&error&&<p className="p-1 text-red-300">{t("assetManager.loadDecals")}</p>}
        </>}
      </section>;})}
      </div>
    </div>}
  </aside>;
}
