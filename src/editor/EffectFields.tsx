import { NumberField } from "./NumberField";
import { useEffect, useState } from "react";
import { t } from "../i18n";
import type { SmokeSpec, AmbientEffect } from "../game/types";
export function EffectFields({value,onChange,onCommit}:{value:Pick<SmokeSpec,"effect"|"mistStyle"|"sprite"|"spread"|"height">;onChange:(patch:Partial<SmokeSpec>)=>void;onCommit?:()=>void}) {
  const [sprites,setSprites]=useState<string[]>([]);
  useEffect(()=>{let live=true;fetch(`${import.meta.env.BASE_URL}particles/index.json`).then(r=>r.json()).then((s:string[])=>{if(live)setSprites(s);}).catch(()=>{});return()=>{live=false;};},[]);
  return <>
    <label>{t("effects.effect")} <select value={value.effect??"smoke"} onChange={e=>onChange({effect:e.target.value as AmbientEffect})}>
      {(["smoke","fire","mist","groundfog","motes","petals","fireflies"] as const).map(k=><option key={k} value={k}>{t(`effects.${k}`)}</option>)}
    </select></label>
    {value.effect==="groundfog" && <>
      <NumberField label={t("effects.spread")} value={value.spread??3} min={.25} max={12} step={.25} defaultValue={3} slider onChange={spread=>onChange({spread})} onCommit={onCommit}/>
      <NumberField label={t("effects.height")} value={value.height??.6} min={.05} max={2} step={.05} defaultValue={.6} onChange={height=>onChange({height})} onCommit={onCommit}/>
    </>}
    {value.effect==="petals"&&<label>{t("effects.sprite")} <select value={value.sprite??"petal1.png"} onChange={e=>onChange({sprite:e.target.value})}>{sprites.map(s=><option key={s}>{s}</option>)}</select></label>}
  </>;
}
