import { useContext } from "react";
import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { CommitContext, Section, slider, chanceSlider, linkFields, BUTTON, idle, smokeBlow } from "./parts";

import { EffectFields } from "../EffectFields";
export function SmokeFields(p: EditorBarProps) {
const commit=useContext(CommitContext);
if (!p.smoke) return null;
return <>
<Section kind="smoke" section="transform">
{slider(t("editorBar.height"), p.smoke.height, 0, Math.max(0, p.smoke.roomHeight - 0.05), 0.05, (v) => p.onSmokeChange({ pos: [NaN, v, NaN] }))}
</Section>
<Section kind="smoke" section="look">
<EffectFields onCommit={commit} value={{...p.smoke,height:p.smoke.effectHeight}} onChange={p.onSmokeChange}/>
{p.smoke.effect==="fire" && (
              <label className="flex items-center gap-1" title={t("editorBar.onlyDecorationATorchTheFlamesAnd")}>
                <input type="checkbox" checked={p.smoke.decorative} onChange={(e) => p.onSmokeChange({ decorative: e.target.checked || undefined })} />
                {t("editorBar.decoration")}</label>
            )}
{slider(t("editorBar.amount"), p.smoke.density, 0.25, 3, 0.25, (v) => p.onSmokeChange({ density: v === 1 ? undefined : v }))}
{slider(t("editorBar.puffSize"), p.smoke.size, 0.4, 2.5, 0.1, (v) => p.onSmokeChange({ size: v === 1 ? undefined : v }))}
{p.smoke.effect !== "groundfog" && <>
{slider(t("editorBar.opacityLit"), p.smoke.opacity, 0.05, 1.5, 0.05, (v) => p.onSmokeChange({ opacity: v === 1 ? undefined : v }))}
{slider(t("editorBar.opacityDark"), p.smoke.opacityDark, 0, 1, 0.05, (v) => p.onSmokeChange({ opacityDark: Math.abs(v - 0.3) < 0.001 ? undefined : v }))}
</>}
<label className="flex items-center gap-1">
              {t("editorBar.color")}<input
                type="color"
                value={p.smoke.color}
                onChange={(e) => p.onSmokeChange({ color: e.target.value })}
                className="w-7 h-6 bg-transparent border border-neutral-600"
              />
            </label>
</Section>
<Section kind="smoke" section="logic">
{chanceSlider(p.smoke.chance, (chance) => p.onSmokeChange({ chance }))}
{linkFields(p.smoke.links, p.linkIds, p.onSmokeChange)}
</Section>
<Section kind="smoke" section="advanced">
{slider(t("editorBar.blow"), p.smoke.blow.speed, 0, 4, 0.25, (v) => p.onSmokeChange({ blow: smokeBlow({ ...p.smoke!.blow, speed: v }) }))}
{p.smoke.blow.speed > 0 && (
              <>
                {slider(t("editorBar.heading"), p.smoke.blow.yaw, 0, 345, 15, (v) => p.onSmokeChange({ blow: smokeBlow({ ...p.smoke!.blow, yaw: v }) }))}
                {slider(t("editorBar.tilt"), p.smoke.blow.pitch, -90, 90, 15, (v) => p.onSmokeChange({ blow: smokeBlow({ ...p.smoke!.blow, pitch: v }) }))}
              </>
            )}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSmokeDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSmokeDeselect}>{t("editorBar.done")}</button></footer>
</>;
}

