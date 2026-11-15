import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { Section, slider, chanceSlider, linkFields, BUTTON, idle } from "./parts";

import { PROP_TYPES, propEditable } from "../../game/props";
import { propEdit } from "../propEditState";
import { TEXTURE_SETS, textureSetsOfKind } from "../../render/textureSets";

const PROP_TEXTURES = [...textureSetsOfKind("wall"), ...textureSetsOfKind("propFace")].filter(id => !id.endsWith("_top"));
export function PropFields(p: EditorBarProps) {
if (!p.prop) return null;
return <>
<Section kind="prop" section="transform">
{slider(t("editorBar.turn"), p.prop.rotation, 0, 345, 15, (v) => p.onPropChange({ rotation: v || undefined }))}
{slider(t("editorBar.scale"), p.prop.scale, 0.25, 4, 0.05, (v) => p.onPropChange({ scale: v === 1 ? undefined : v }))}
{slider(t("editorBar.height"), p.prop.elevation, -0.5, Math.max(0, p.prop.roomHeight - 0.05), 0.05, (v) =>
                  p.onPropChange({ elevation: v || undefined }),
                )}
</Section>
<Section kind="prop" section="look">
{p.prop.retexturable && (
                  <label className="flex items-center gap-1">
                    {t("editorBar.texture")}<select
                      value={p.prop.texture ?? ""}
                      onChange={(e) => p.onPropChange({ texture: e.target.value || undefined })}
                      className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
                    >
                      <option value="">{t("editorBar.itsOwn")}</option>
                      {PROP_TEXTURES.map((id) => (
                        <option key={id} value={id}>
                          {TEXTURE_SETS[id].label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropStack} title={t("editorBar.thePaletteSPropOnTopOf")}>{t("editorBar.stackOnTop", { v1: p.propChoice })}</button>
</Section>
<Section kind="prop" section="logic">
{chanceSlider(p.prop.chance, (chance) => p.onPropChange({ chance }))}
{linkFields(p.prop.links, p.linkIds, p.onPropChange)}
</Section>
<Section kind="prop" section="advanced">
{propEditable(PROP_TYPES[p.prop.name]) && (
                  <button
                    type="button"
                    className={`${BUTTON} ${idle}`}
                    onClick={() => propEdit.set({ name: p.prop!.name, part: 0 })}
                    title={t("editorBar.editItsTypeSizeReliefNormalStrength")}
                  >{t("editorBar.editType")}</button>
                )}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
