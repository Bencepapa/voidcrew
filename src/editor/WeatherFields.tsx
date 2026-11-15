import { NumberField } from "./NumberField";
import { t } from "../i18n";
import type { Weather } from "../game/types";
export function WeatherFields({value,onChange,onCommit}:{value?:Weather;onChange:(value:Weather|undefined)=>void;onCommit?:()=>void}) {
  return <>
    <label>{t("effects.weather")} <select value={value?.type??"none"} onChange={e=>onChange(e.target.value==="none"?undefined:{...value,type:e.target.value as Weather["type"]})}>
      <option value="none">{t("effects.none")}</option><option value="rain">{t("effects.rain")}</option><option value="snow">{t("effects.snow")}</option>
    </select></label>
    {value&&<><NumberField label={t("effects.intensity")} value={value.intensity??1} min={0} max={2} step={.1} defaultValue={1} slider onChange={intensity=>onChange({...value,intensity})} onCommit={onCommit}/><NumberField label={t("effects.wetness")} value={value.wetness??(value.type==="rain"?.6:0)} min={0} max={1} step={.05} defaultValue={.6} slider onChange={wetness=>onChange({...value,wetness})} onCommit={onCommit}/>{value.type==="snow"&&<NumberField label={t("effects.snowCover")} value={value.snowCover??.6} min={0} max={1} step={.05} defaultValue={.6} slider onChange={snowCover=>onChange({...value,snowCover})} onCommit={onCommit}/>}<label><input type="checkbox" checked={!!value.indoors} onChange={e=>onChange({...value,indoors:e.target.checked||undefined})}/>{t("effects.indoors")}</label></>}
  </>;
}
