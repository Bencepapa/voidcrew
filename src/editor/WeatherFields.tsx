import { t } from "../i18n";
import type { Weather } from "../game/types";
export function WeatherFields({value,onChange}:{value?:Weather;onChange:(value:Weather|undefined)=>void}) {
  return <>
    <label>{t("effects.weather")} <select value={value?.type??"none"} onChange={e=>onChange(e.target.value==="none"?undefined:{...value,type:e.target.value as Weather["type"]})}>
      <option value="none">{t("effects.none")}</option><option value="rain">{t("effects.rain")}</option><option value="snow">{t("effects.snow")}</option>
    </select></label>
    {value&&<><label>{t("effects.intensity")} <input aria-label={t("effects.intensity")} type="range" min="0" max="2" step="0.1" value={value.intensity??1} onChange={e=>onChange({...value,intensity:Number(e.target.value)})}/></label><label><input type="checkbox" checked={!!value.indoors} onChange={e=>onChange({...value,indoors:e.target.checked||undefined})}/>{t("effects.indoors")}</label></>}
  </>;
}
