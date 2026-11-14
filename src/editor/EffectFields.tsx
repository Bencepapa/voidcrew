import { useEffect, useState } from "react";
import { t } from "../i18n";
import type { SmokeSpec, AmbientEffect } from "../game/types";
export function EffectFields({value,onChange}:{value:Pick<SmokeSpec,"effect"|"mistStyle"|"sprite"|"spread"|"height">;onChange:(patch:Partial<SmokeSpec>)=>void}) {
  const [sprites,setSprites]=useState<string[]>([]);
  useEffect(()=>{let live=true;fetch(`${import.meta.env.BASE_URL}particles/index.json`).then(r=>r.json()).then((s:string[])=>{if(live)setSprites(s);}).catch(()=>{});return()=>{live=false;};},[]);
  return <>
    <label>{t("effects.effect")} <select value={value.effect??"smoke"} onChange={e=>onChange({effect:e.target.value as AmbientEffect})}>
      {(["smoke","fire","mist","groundfog","motes","petals","fireflies"] as const).map(k=><option key={k} value={k}>{t(`effects.${k}`)}</option>)}
    </select></label>
    {value.effect==="groundfog" && <>
      <label>{t("effects.spread")} <input type="number" min=".25" max="12" step=".25" value={value.spread??3} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))onChange({spread:Math.max(.25,Math.min(12,n))});}}/></label>
      <label>{t("effects.height")} <input type="number" min=".05" max="2" step=".05" value={value.height??.6} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))onChange({height:Math.max(.05,Math.min(2,n))});}}/></label>
    </>}
    {value.effect==="petals"&&<label>{t("effects.sprite")} <select value={value.sprite??"petal1.png"} onChange={e=>onChange({sprite:e.target.value})}>{sprites.map(s=><option key={s}>{s}</option>)}</select></label>}
  </>;
}
