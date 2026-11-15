import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { Section, slider, chanceSlider, linkFields, BUTTON, idle } from "./parts";

export function DecalFields(p: EditorBarProps) {
if (!p.decal) return null;
return <>
<Section kind="decal" section="transform">
{slider(t("editorBar.turn"), p.decal.rotation, 0, 345, 15, (v) => p.onDecalChange({ rotation: v || undefined }))}
{slider(t("editorBar.scale"), p.decal.scale, 0.25, 4, 0.05, (v) => p.onDecalChange({ scale: v === 1 ? undefined : v }))}
</Section>
<Section kind="decal" section="logic">
<label className="flex items-center gap-1" title={t("editorBar.whatTouchingItDoesTerminalIdOpens")}>
                  {t("editorBar.action")}<input
                    type="text"
                    value={p.decal.action ?? ""}
                    placeholder="terminal:log1"
                    onChange={(e) => p.onDecalChange({ action: e.target.value || undefined })}
                    className="w-28 bg-neutral-800 border border-neutral-700 px-1"
                  />
                </label>
{chanceSlider(p.decal.chance, (chance) => p.onDecalChange({ chance }))}
{linkFields(p.decal.links, p.linkIds, p.onDecalChange)}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDecalDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDecalDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
