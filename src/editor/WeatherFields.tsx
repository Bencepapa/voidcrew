import { NumberField } from "./NumberField";
import { t } from "../i18n";
import type { Weather } from "../game/types";
export function WeatherFields({value,onChange,onCommit}:{value?:Weather;onChange:(value:Weather|undefined)=>void;onCommit?:()=>void}) {
  return <>
    <label>{t("effects.weather")} <select value={value?.type??"none"} onChange={e=>onChange(e.target.value==="none"?undefined:{...value,type:e.target.value as Weather["type"]})}>
      <option value="none">{t("effects.none")}</option><option value="rain">{t("effects.rain")}</option><option value="snow">{t("effects.snow")}</option>
    </select></label>
    {value&&<><NumberField label={t("effects.intensity")} value={value.intensity??1} min={0} max={2} step={.1} defaultValue={1} slider onChange={intensity=>onChange({...value,intensity})} onCommit={onCommit}/><label><input type="checkbox" checked={!!value.indoors} onChange={e=>onChange({...value,indoors:e.target.checked||undefined})}/>{t("effects.indoors")}</label></>}
  </>;
}
