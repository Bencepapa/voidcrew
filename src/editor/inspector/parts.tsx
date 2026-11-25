import { createContext, useContext, useEffect, useState, useId, type ReactNode, type CSSProperties } from "react";
import type { Lock } from "../../game/story";
import type { Linked } from "../../game/types";
import { t } from "../../i18n";
import { NumberField } from "../NumberField";
export const BUTTON = "px-2 py-1 border rounded-sm text-[11px] disabled:opacity-30";
export const idle = "border-neutral-600 bg-neutral-800 text-neutral-200 hover:bg-neutral-700";
export const active = "border-amber-400 bg-amber-400/20 text-amber-200";
// Completing a number gesture advances the callback's undo merge key.
export const CommitContext = createContext<() => void>(() => {});
export function Section({kind, section, children, openWhen}: {kind: string; section: "transform" | "look" | "logic" | "advanced" | "light" | "fireType" | "trap" | "acoustics"; children: ReactNode; openWhen?: boolean}) {
 const key = "voidcrew-inspector:" + kind + ":" + section;
 const [open, setOpen] = useState(() => { try { const saved = localStorage.getItem(key); return saved === "true"; } catch { return false; } });
 // (a section that has something to say opens itself: the sound zones' one when cells are picked on the minimap)
 useEffect(() => { if (openWhen) setOpen(true); }, [openWhen]);
 return <details open={open} onToggle={e => { const next=e.currentTarget.open; setOpen(next); try { localStorage.setItem(key,String(next)); } catch { /* storage unavailable */ } }} className="border-t border-neutral-700">
 <summary className="cursor-pointer select-none px-2 py-2 text-neutral-200 hover:bg-neutral-800">{t(`inspector.${section}`)}</summary>
 <div className="flex min-w-0 flex-col gap-2 px-2 pb-3 [&_label]:flex [&_label]:min-w-0 [&_label]:flex-wrap [&_label]:items-center [&_label]:gap-1 [&_select]:min-w-0 [&_select]:max-w-full [&_select]:flex-1 [&_select]:bg-neutral-800 [&_select]:border [&_select]:border-neutral-700 [&_input[type=text]]:min-w-0 [&_input[type=text]]:flex-1">{children}</div>
 </details>;
}
function Chance({value,onChange}: {value:number;onChange:(value:number|undefined)=>void}) {
 const commit=useContext(CommitContext);
 return <NumberField label={t("editorBar.chance")} value={value*100} min={0} max={100} step={5} defaultValue={100} unit="%" slider onChange={v=>onChange(v>=100?undefined:v/100)} onCommit={commit}/>;
}
export function doorLock(lock: Lock | undefined, patch: Partial<Lock>): Lock | undefined {
  const next: Lock = { ...lock, ...patch };
  for (const key of Object.keys(next) as (keyof Lock)[]) if (next[key] === undefined) delete next[key];
  return next.key || next.hack || next.code ? next : undefined;
}

export function smokeBlow(blow: { speed: number; yaw: number; pitch: number }) {
  if (!blow.speed) return undefined;
  return blow.pitch ? blow : { speed: blow.speed, yaw: blow.yaw };
}

export function chanceSlider(value: number, onChange: (chance: number | undefined) => void) {
  return <Chance value={value} onChange={onChange} />;
}

export function linkFields(links: Linked, ids: string[], onChange: (patch: Linked) => void) {
  const field = (key: keyof Linked, label: string, title: string) => (
    <label className="flex items-center gap-1" title={title}>
      {label}
      <input
        type="text"
        list={key === "id" ? undefined : "link-ids"}
        value={links[key] ?? ""}
        placeholder="-"
        onChange={(e) => onChange({ [key]: e.target.value.trim() || undefined })}
        className="min-w-0 flex-1 bg-neutral-800 border border-neutral-700 px-1"
      />
    </label>
  );
  return (
    <>
      <datalist id="link-ids">
        {ids.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
      {field("id", t("editorBar.name"), t("editorBar.itsNameForOtherItemsToLink"))}
      {field("with", t("editorBar.with"), t("editorBar.onlyThereWhenTheItemOfThis"))}
      {field("without", t("editorBar.without"), t("editorBar.onlyThereWhenTheItemOfThis14"))}
    </>
  );
}

// Same callbacks and limits as the old sliders; open transforms have no bar.
export function slider(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) {
 return <Numeric label={label} value={value} min={min} max={max} step={step} onChange={onChange}/>;
}
function Numeric({label,value,min,max,step,onChange}: {label:string;value:number;min:number;max:number;step:number;onChange:(v:number)=>void}) {
 const commit=useContext(CommitContext);
 const degrees=[t("editorBar.turn"),t("editorBar.heading"),t("editorBar.tilt"),t("editorBar.hue")].includes(label);
 const open=[t("editorBar.turn"),t("editorBar.scale"),t("editorBar.height"),t("editorBar.place"),t("editorBar.heading")].includes(label);
 const percent=[t("editorBar.chance"),t("editorBar.locked")].includes(label);
 const defaults:Record<string,number>={ [t("editorBar.scale")]:1,[t("editorBar.amount")]:1,[t("editorBar.puffSize")]:1,[t("editorBar.count")]:1,[t("editorBar.everyS")]:30,[t("editorBar.max")]:1,[t("editorBar.locked")]:1,[t("editorBar.intensity")]:1,[t("editorBar.range")]:3,[t("editorBar.lightStrength")]:1,[t("editorBar.lightReach")]:1,["+-"]:30 };
 const factor=percent?100:1;
 return <NumberField label={label} value={value*factor} min={min*factor} max={max*factor} step={step*factor} digits={percent||degrees?0:undefined} defaultValue={(defaults[label]??0)*factor} unit={percent?"%":degrees?"°":label===t("editorBar.scale")?"×":undefined} slider={!open} onChange={v=>onChange(v/factor)} onCommit={commit}/>;
}

// Undefined retains the map's inherited renderer default, as the old select did.
export function OptionalNumber({value,onChange,label,title,min,max,step,defaultValue}: {value?:number;onChange:(v:number|undefined)=>void;label:string;title:string;min:number;max:number;step:number;defaultValue:number}) {
 const commit=useContext(CommitContext);
 return <div className="flex flex-col gap-1" title={title}>
 <NumberField label={label} value={value??defaultValue} min={min} max={max} step={step} defaultValue={defaultValue} slider disabled={value===undefined} onChange={onChange} onCommit={commit}/>
 <label className="text-neutral-400"><input type="checkbox" checked={value===undefined} onChange={e=>{onChange(e.target.checked?undefined:defaultValue);commit();}}/>{t("editorBar.defaultLower")}</label>
 </div>;
}

// The game's fantasy theme changes Tailwind tokens globally. Editor controls
// keep their neutral palette in either world.
export const neutralStyle = {
 "--color-neutral-950":"#0a0a0a", "--color-neutral-900":"#171717",
 "--color-neutral-800":"#262626", "--color-neutral-700":"#404040",
 "--color-neutral-600":"#525252", "--color-neutral-500":"#737373",
 "--color-neutral-400":"#a3a3a3", "--color-neutral-300":"#d4d4d4",
 "--color-neutral-200":"#e5e5e5", "--color-neutral-100":"#f5f5f5",
 "--color-black":"#000000", "--color-amber-400":"#fbbf24", "--color-amber-200":"#fde68a"
} as CSSProperties;

export type ChoiceOption = { value: string; label: string; title?: string };
export function KindChoice({label, title, value, options, onChange, buttonClass = BUTTON, activeClass = active, idleClass = idle}: {
 label?: string; title?: string; value: string; options: ChoiceOption[];
 onChange: (value: string) => void; buttonClass?: string; activeClass?: string; idleClass?: string;
}) {
 const id = useId();
 const commit = useContext(CommitContext);
 const choose = (next: string, control: HTMLElement) => {
  if (next !== value) { onChange(next); commit(); }
  control.blur();
 };
 return <div className="flex min-w-0 flex-wrap items-center gap-1" title={title}>
  {label && <label id={id} htmlFor={options.length > 4 ? `${id}-select` : undefined}>{label}</label>}
  {options.length <= 4 ? <div role="radiogroup" aria-labelledby={label ? id : undefined} aria-label={label ? undefined : title} className="flex min-w-0 flex-wrap gap-1">
   {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} title={option.title} className={`${buttonClass} ${value === option.value ? activeClass : idleClass}`} onClick={e => choose(option.value, e.currentTarget)}>{option.label}</button>)}
  </div> : <select id={`${id}-select`} value={value} onChange={e => choose(e.currentTarget.value, e.currentTarget)} className="min-w-0 max-w-full flex-1 bg-neutral-800 border border-neutral-700 px-1 py-0.5">
   {options.map(option => <option key={option.value} value={option.value} title={option.title}>{option.label}</option>)}
  </select>}
 </div>;
}
