import { useState } from "react";
import { ACTOR_TYPES } from "../../game/actors";
import { useDialogueLibraries } from "../../game/dialogueCatalog";
import { useShopIds } from "../../game/shopCatalog";
import { useSharedImages } from "../../render/sharedImages";
import { isSharedActorId } from "../../game/actorSheets";
import { assetInWorld } from "../../game/worlds";
import { t, type Key } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { KindChoice, Section, slider, chanceSlider, linkFields, BUTTON, idle, active } from "./parts";
import type { Direction, ActorWake } from "../../game/types";

const WAKE_LABELS: Record<ActorWake["mode"], Record<number, Key>> = {
  "dormant": {
    "1": "editorBar.wake.dormant.1",
    "2": "editorBar.wake.dormant.2",
    "3": "editorBar.wake.dormant.3"
  },
  "fooled": {
    "1": "editorBar.wake.fooled.1",
    "2": "editorBar.wake.fooled.2",
    "3": "editorBar.wake.fooled.3"
  },
  "arrive": {
    "1": "editorBar.wake.arrive.1",
    "2": "editorBar.wake.arrive.2",
    "3": "editorBar.wake.arrive.3"
  }
};
const FIELD = "min-w-0 max-w-full flex-1 bg-neutral-800 border border-neutral-700 px-1 py-0.5";

// A friendly NPC to talk to: its dialogue (library + entry passage), portrait and shop.
// Without a dialogue its shop opens directly (the simple shop, with the greeting).
// Picking a dialogue offers "friendly" (switches it on); it can be switched off again.
function TalkGroup(p: EditorBarProps) {
 const libraries = useDialogueLibraries();
 const images = useSharedImages();
 const shopIds = useShopIds();
 const key = "voidcrew-inspector:actor:talk";
 const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) === "true"; } catch { return false; } });
 const actor = p.actor!;
 const library = libraries.find(l => l.id === actor.dialogue?.library);
 const portraits = images.filter(i => i.type === "portrait" && (i.purpose ?? "portrait") === "portrait");
 const entry = actor.dialogue?.entry;
 const setLibrary = (id: string) => {
  if (!id) return p.onActorChange({ dialogue: undefined });
  const entries = libraries.find(l => l.id === id)?.entries ?? [];
  p.onActorChange({ dialogue: { library: id, entry: entries[0] ?? "" }, ...(actor.friendly ? {} : { friendly: true }) });
 };
 return <details open={open} onToggle={e => { const next = e.currentTarget.open; setOpen(next); try { localStorage.setItem(key, String(next)); } catch { /* storage unavailable */ } }} className="border-t border-neutral-700">
  <summary className="cursor-pointer select-none px-2 py-2 text-neutral-200 hover:bg-neutral-800">{t("talk.group")}</summary>
  <div className="flex min-w-0 flex-col gap-2 px-2 pb-3 [&_label]:flex [&_label]:min-w-0 [&_label]:flex-wrap [&_label]:items-center [&_label]:gap-1">
   <label title={t("talk.friendlyTitle")}>
    <input type="checkbox" checked={actor.friendly} onChange={e => p.onActorChange({ friendly: e.target.checked })}/>
    {t("talk.friendly")}
   </label>
   <label>{t("talk.library")}
    <select value={actor.dialogue?.library ?? ""} onChange={e => setLibrary(e.target.value)} className={FIELD}>
     <option value="">{t("talk.none")}</option>
     {actor.dialogue && !library && <option value={actor.dialogue.library}>{t("talk.missing", { id: actor.dialogue.library })}</option>}
     {libraries.map(l => <option key={l.id} value={l.id}>{l.title === l.id ? l.id : `${l.title} (${l.id})`}</option>)}
    </select>
   </label>
   {actor.dialogue && <label>{t("talk.entry")}
    <select value={entry} onChange={e => p.onActorChange({ dialogue: { library: actor.dialogue!.library, entry: e.target.value } })} className={FIELD}>
     {entry !== undefined && !library?.entries.includes(entry) && <option value={entry}>{t("talk.missing", { id: entry || "-" })}</option>}
     {library?.entries.map(name => <option key={name} value={name}>{name}</option>)}
    </select>
   </label>}
   <label>{t("talk.portrait")}
    <select value={actor.portrait ?? ""} onChange={e => p.onActorChange({ portrait: e.target.value || undefined })} className={FIELD}>
     <option value="">{t("talk.none")}</option>
     {actor.portrait && !portraits.some(i => i.id === actor.portrait) && <option value={actor.portrait}>{t("talk.missing", { id: actor.portrait })}</option>}
     {portraits.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
    </select>
   </label>
   <label title={t("talk.shopTitle")}>{t("talk.shop")}
    <select value={actor.shop ?? ""} onChange={e => p.onActorChange({ shop: e.target.value || undefined, ...(e.target.value && !actor.friendly ? { friendly: true } : {}) })} className={FIELD}>
     <option value="">{t("talk.none")}</option>
     {actor.shop && !shopIds.includes(actor.shop) && <option value={actor.shop}>{t("talk.unknownShop", { id: actor.shop })}</option>}
     {shopIds.map(id => <option key={id} value={id}>{id}</option>)}
    </select>
   </label>
   {!actor.dialogue && <label title={t("talk.greetingTitle")} className="!items-start">{t("talk.greeting")}
    <textarea rows={2} value={actor.greeting ?? ""} onChange={e => p.onActorChange({ greeting: e.target.value || undefined })}
     className="min-w-0 max-w-full flex-1 bg-neutral-800 border border-neutral-700 px-1 py-0.5"/>
   </label>}
   {!actor.dialogue && <p className="text-neutral-400">{actor.shop ? t("talk.directHint") : t("talk.noShopHint")}</p>}
  </div>
 </details>;
}

export function ActorFields(p: EditorBarProps) {
if (!p.actor) return null;
return <>
<Section kind="actor" section="transform">
<span className="flex items-center gap-0.5">{t("editorBar.faces")} {(["N", "E", "S", "W"] as Direction[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`${BUTTON} ${p.actor!.facing === d ? active : idle}`}
                      onClick={() => p.onActorChange({ facing: d })}
                    >
                      {d}
                    </button>
                  ))}</span>
<span className="text-neutral-400">{p.actor.route ? t("editorBar.routeCells", { n: p.actor.route }) : t("editorBar.stands")}</span>
{p.actor.route > 0 && (
                  <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorClearRoute}>{t("editorBar.clearRoute")}</button>
                )}
</Section>
<Section kind="actor" section="look">
<KindChoice label={t("editorBar.npc")} value={p.actor.type} options={Object.entries(ACTOR_TYPES).filter(([id]) => assetInWorld(id)).map(([value, type]) => ({value,label:isSharedActorId(value) ? type.name : value}))} onChange={actor => p.onActorChange({actor})}/>
</Section>
<TalkGroup {...p}/>
<Section kind="actor" section="logic">
{chanceSlider(p.actor.chance, (chance) => p.onActorChange({ chance }))}
{linkFields(p.actor.links, p.linkIds, p.onActorChange)}
</Section>
<Section kind="actor" section="advanced">
<KindChoice label={t("editorBar.untilAlert")} title={t("editorBar.untilTheShipSAlertReachesA")} value={p.actor.wake ? `${p.actor.wake.mode} ${p.actor.wake.level}` : ""} options={[
 {value:"",label:t("editorBar.onGuardFromTheStart")},
 ...(["dormant","fooled","arrive"] as const).flatMap(mode => ([1,2,3] as const).map(level => ({value:`${mode} ${level}`,label:t(WAKE_LABELS[mode][level])})))
]} onChange={v => {
 const [mode,level] = v.split(" ");
 const keep = p.actor!.wake?.mode === "arrive" && mode === "arrive" ? p.actor!.wake : {};
 p.onActorChange({wake:mode ? {...keep,mode,level:Number(level)} as ActorWake : undefined});
}}/>
{p.actor.wake?.mode === "arrive" &&
                  slider(t("editorBar.everyS"), p.actor.wake.every ?? 30, 10, 120, 5, (v) =>
                    p.onActorChange({ wake: { ...p.actor!.wake!, every: v === 30 ? undefined : v } }),
                  )}
{p.actor.wake?.mode === "arrive" &&
                  slider(t("editorBar.max"), p.actor.wake.max ?? 1, 1, 5, 1, (v) => p.onActorChange({ wake: { ...p.actor!.wake!, max: v === 1 ? undefined : v } }))}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorDelete}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
