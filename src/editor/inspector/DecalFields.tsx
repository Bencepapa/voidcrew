import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { KindChoice, Section, slider, chanceSlider, linkFields, BUTTON, idle } from "./parts";
import { OperableFields } from "./OperableFields";

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
<label className="flex items-center gap-1">
                  <input type="checkbox" checked={!!p.decal.operable} onChange={(e) => p.onDecalChange({ operable: e.target.checked ? { kind: "button" } : undefined })}/>
                  {t("operable.decal.on")}
                </label>
{p.decal.operable && <>
<KindChoice label={t("operable.decal.kind")} value={p.decal.operable.kind} options={[{ value: "lever", label: t("operable.kind.lever") }, { value: "button", label: t("operable.kind.button") }]}
  onChange={(kind) => p.onDecalChange({ operable: { ...p.decal!.operable!.spec, kind: kind as "lever" | "button" } })}/>
<OperableFields info={p.decal.operable} onChange={(operable) => p.onDecalChange({ operable })}/>
</>}
{chanceSlider(p.decal.chance, (chance) => p.onDecalChange({ chance }))}
{linkFields(p.decal.links, p.linkIds, p.onDecalChange)}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDecalDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDecalDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
