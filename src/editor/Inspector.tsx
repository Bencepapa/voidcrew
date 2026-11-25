import { AssetTree } from "./AssetTree";
import { isTextEntry } from "../keyboardFocus";
import { createPortal } from "react-dom";
import { useCallback, useRef } from "react";
import { editorToolLabel, type EditorBarProps } from "./EditorBar";
import { CommitContext, neutralStyle } from "./inspector/parts";
import { ActorFields } from "./inspector/ActorFields";
import { DoorFields } from "./inspector/DoorFields";
import { PropFields } from "./inspector/PropFields";
import { DecalFields } from "./inspector/DecalFields";
import { ItemFields } from "./inspector/ItemFields";
import { LightFields } from "./inspector/LightFields";
import { SmokeFields } from "./inspector/SmokeFields";
import { SoundFields } from "./inspector/SoundFields";
import { ExitFields } from "./inspector/ExitFields";
import { StairsFields } from "./inspector/StairsFields";
import { ChanceWallFields } from "./inspector/ChanceWallFields";
import { MapFields } from "./inspector/MapFields";
import { EventFields } from "./inspector/EventFields";
import { RoofFields } from "./inspector/RoofFields";
import { FenceToolFields } from "./inspector/FenceFields";
import { isFenceTool } from "./fenceEdits";
import { PROP_TYPES } from "../game/props";
import { ACTOR_TYPES } from "../game/actors";
import { isSharedActorId } from "../game/actorSheets";
import { actorThumbnail } from "../render/actorSheetFiles";
import { useSharedActorVersion } from "./sharedActors";
import { TEXTURE_SETS } from "../render/textureSets";
import { pickupTexture } from "../render/sharedImages";
import { ITEM_TYPES } from "../game/items";
import { t } from "../i18n";

export type InspectedKind = "prop" | "decal" | "item" | "light" | "actor" | "smoke" | "sound" | "exit" | "stairs" | "chanceWall" | "door";
// (placing: nothing is selected and a tool puts things in - what is shown is the settings of the next one)
export interface Inspected { kind: InspectedKind; cell?: {x:number;y:number}; placing?: boolean }
const fields = {prop:PropFields,decal:DecalFields,item:ItemFields,light:LightFields,actor:ActorFields,smoke:SmokeFields,sound:SoundFields,exit:ExitFields,stairs:StairsFields,chanceWall:ChanceWallFields,door:DoorFields};
const icons = {prop:"◇",decal:"▧",item:"◆",light:"☼",actor:"♙",smoke:"≋",sound:"♪",exit:"↗",stairs:"⇅",chanceWall:"▦",door:"▯"};

// This bridge keeps all existing App callbacks in one place while the toolbar
// and inspector are portalled into their separate shell docks.
export function Inspector(p: EditorBarProps & {inspected: Inspected | null}) {
 useSharedActorVersion();
 const transaction=useRef(Date.now());
 const commit=useCallback(()=>{transaction.current++;},[]);
 const kind=p.inspected?.kind;
 const selected=kind ? p[kind] : null;
 const Fields=kind && selected ? fields[kind] : MapFields;
 const props={...p, placing:p.inspected?.placing};
 // Every gesture has a fresh merge suffix. All live updates during the gesture
 // retain App's existing per-object/per-field merge key and preview path.
 const merge = () => `inspector ${transaction.current}`;
 for(const name of ["onActorChange","onDoorChange","onPropChange","onDecalChange","onSmokeChange","onSoundChange","onItemChange","onLightChange","onChanceWallChange","onExitChange","onStairsChange","onMapLook"] as const) {
  // Their patch types differ, but each wrapper forwards precisely its own patch.
  Object.assign(props,{[name]:(patch: never)=>p[name](patch,merge())});
 }
 const type=kind==="prop"?p.prop?.name:kind==="decal"?p.decal?.name:kind==="actor"?p.actor?.type:kind==="item"?p.item?.item:kind==="door"&&p.door?t("editorBar.doorFront", {v1:t(p.door.kind==="lift"?"editorBar.doorKindLift":"editorBar.doorKindStandard"),v2:p.door.facing}):undefined;
 const actor=kind==="actor"&&type?ACTOR_TYPES[type]:undefined;
 const prop=kind==="prop"&&type?PROP_TYPES[type]:undefined;
 const texture=prop && (prop.kind==="fence"?p.prop?.texture:"texture" in prop?prop.texture:"side" in prop?prop.side:"views" in prop?`${prop.views}_front`:undefined);
 const thumbnail=kind==="item"&&type&&ITEM_TYPES[type]?pickupTexture(type).diffuse:kind==="decal"&&type?`${import.meta.env.BASE_URL}decals/${type}/diffuse.png`:texture?(TEXTURE_SETS[texture as keyof typeof TEXTURE_SETS]?.diffuse ?? `${import.meta.env.BASE_URL}textures/${texture}/diffuse.png`):undefined;
 const kindName=kind?editorToolLabel(kind==="actor"?"robot":kind==="chanceWall"?"wall":kind):"";
 const roofing=p.tool==="roofauto" && !(kind && selected);
 const fencing=isFenceTool(p.tool) && !(kind && selected);
 const heading=roofing?t("roofauto.group"):fencing?editorToolLabel(p.tool):p.tool==="event"?t(`events.${p.selectedEvent?.kind ?? p.eventKind}`):kind&&selected?(p.inspected?.placing?t("inspector.next",{kind:kindName}):kindName):t("inspector.mapSettings");
 const panel=<aside aria-label={t("editorShell.properties")} style={neutralStyle} className="voidcrew-editor-controls min-w-0 bg-neutral-900 text-[11px] text-neutral-300" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>{if(e.target instanceof HTMLInputElement && e.target.type==="range")e.target.blur();if(e.currentTarget.contains(e.target as Node))e.stopPropagation();}} onChange={e=>{if(e.target instanceof HTMLElement && !isTextEntry(e.target) && !(e.target instanceof HTMLInputElement && ["color","range"].includes(e.target.type)))e.target.blur();}} onClick={e=>{(e.target as HTMLElement).closest("button")?.blur();}} onKeyUp={e=>{if(e.key==="Enter" && e.target instanceof HTMLElement && !isTextEntry(e.target))e.target.blur();}} onWheel={e=>e.stopPropagation()}>
  <style>{".theme-fantasy .voidcrew-editor-controls .border { box-shadow: none; }"}</style>
  <header className="sticky top-0 z-10 flex min-w-0 items-center gap-2 bg-neutral-950 p-2 border-b border-neutral-700">
   <span aria-hidden="true" className="text-xl text-neutral-200">{kind&&selected?icons[kind]:"▦"}</span>
   {thumbnail&&<img src={thumbnail} alt="" className="h-10 w-10 shrink-0 object-contain" style={{imageRendering:"pixelated"}}/>}
   {actor&&<span aria-hidden="true" className="h-10 w-10 shrink-0" style={actorThumbnail(actor)}/>}
   <div className="min-w-0"><strong className="block text-neutral-100">{heading}</strong>{type&&<span className="block break-words">{kind==="item"?ITEM_TYPES[type]?.name ?? type:actor&&isSharedActorId(type)?actor.name:type}</span>}{p.inspected?.cell&&<span className="text-neutral-400">{t("inspector.cell",p.inspected.cell)}</span>}</div>
  </header>
  <CommitContext.Provider value={commit}><div key={`${p.mapId}:${kind??"map"}`}>{roofing?<RoofFields {...p}/>:fencing?<FenceToolFields {...p}/>:p.tool==="event"?<EventFields {...p} onEventChange={event=>p.onEventChange(event,merge())}/>:<Fields {...props}/>}</div></CommitContext.Provider>
 </aside>;
 return <>{p.assetDock && createPortal(<AssetTree {...p}/>, p.assetDock)}{p.dock ? createPortal(panel,p.dock) : panel}</>;
}
