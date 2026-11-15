import { KindChoice } from "./inspector/parts";
import { NumberField } from "./NumberField";
import { t } from "../i18n";
import type { Weather } from "../game/types";
export function WeatherFields({value,onChange,onCommit}:{value?:Weather;onChange:(value:Weather|undefined)=>void;onCommit?:()=>void}) {
  return <>
    <KindChoice label={t("effects.weather")} value={value?.type ?? "none"} options={(["none","rain","snow"] as const).map(value => ({value,label:t(`effects.${value}`)}))} onChange={type => onChange(type === "none" ? undefined : {...value,type:type as Weather["type"]})}/>
    {value&&<><NumberField label={t("effects.intensity")} value={value.intensity??1} min={0} max={2} step={.1} defaultValue={1} slider onChange={intensity=>onChange({...value,intensity})} onCommit={onCommit}/><label><input type="checkbox" checked={!!value.indoors} onChange={e=>onChange({...value,indoors:e.target.checked||undefined})}/>{t("effects.indoors")}</label></>}
  </>;
}
