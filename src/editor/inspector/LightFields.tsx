import { ColorField } from "../ColorField";
import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { KindChoice, Section, slider, chanceSlider, linkFields, BUTTON, idle } from "./parts";
import type { LightEffect } from "../../game/types";

export function LightFields(p: EditorBarProps & { placing?: boolean }) {
if (!p.light) return null;
return <>
<Section kind="light" section="transform">
{p.light.pos && (
                  <>
                    {slider(t("editorBar.height"), p.light.pos[1], 0.05, p.light.roomHeight - 0.05, 0.05, (v) =>
                      p.onLightChange({ pos: [p.light!.pos![0], v, p.light!.pos![2]] }),
                    )}
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={!!p.light.bulb}
                        onChange={(e) => p.onLightChange({ bulb: e.target.checked || undefined })}
                      />
                      {t("editorBar.bulbInGame")}</label>
                    <span className="text-neutral-500">{t("editorBar.arrowsPgUpPgDnMove")}</span>
                  </>
                )}
</Section>
<Section kind="light" section="look">
<KindChoice label={t("editorBar.place159")} value={p.placing ? p.lightPlace : p.light.pos ? "point" : "ceiling"} options={[
 {value:"ceiling",label:t("editorBar.ceilingLamp")},{value:"point",label:t("editorBar.pointLight")}
]} onChange={v => p.onLightChange(v === "point" ? {pos:p.light!.pos ?? [0, Math.max(0.05, Math.min(p.light!.roomHeight - 0.05, p.light!.roomHeight / 2)), 0], bulb:p.light!.bulb} : {pos:undefined,bulb:undefined})}/>

<label className="flex items-center gap-1">
                  {t("editorBar.color")}<ColorField value={p.light.color} onChange={color => p.onLightChange({color})}/>
                </label>
{slider(t("editorBar.intensity"), p.light.intensity, 0, 4, 0.05, (v) => p.onLightChange({ intensity: v }))}
{slider(t("editorBar.range"), p.light.range, 0.5, 6, 0.1, (v) => p.onLightChange({ range: v }))}
</Section>
<Section kind="light" section="logic">
{chanceSlider(p.light.chance, (chance) => p.onLightChange({ chance }))}
{linkFields(p.light.links, p.linkIds, p.onLightChange)}
</Section>
<Section kind="light" section="advanced">
<KindChoice label={t("editorBar.effect")} title={t("editorBar.anUnsteadyLightIsnTBakedOne")} value={p.light.effect ?? ""} options={[
 {value:"",label:t("editorBar.steady")}, ...(["flicker","spark","pulse"] as const).map(value => ({value,label:t(`editorBar.${value}`)}))
]} onChange={v => p.onLightChange({effect:(v || undefined) as LightEffect | undefined})}/>
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onLightDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onLightDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
