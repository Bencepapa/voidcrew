import { ColorField } from "../ColorField";
import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { Section, slider, chanceSlider, linkFields, BUTTON, idle } from "./parts";
import type { LightEffect } from "../../game/types";

export function LightFields(p: EditorBarProps) {
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
<label className="flex items-center gap-1" title={t("editorBar.anUnsteadyLightIsnTBakedOne")}>
                  {t("editorBar.effect")}<select
                    value={p.light.effect ?? ""}
                    onChange={(e) => p.onLightChange({ effect: (e.target.value || undefined) as LightEffect | undefined })}
                    className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
                  >
                    <option value="">{t("editorBar.steady")}</option>
                    <option value="flicker">{t("editorBar.flicker")}</option>
                    <option value="spark">{t("editorBar.spark")}</option>
                    <option value="pulse">{t("editorBar.pulse")}</option>
                  </select>
                </label>
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onLightDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onLightDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
