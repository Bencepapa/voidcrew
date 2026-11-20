import { assetInWorld } from "../../game/worlds";
import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { KindChoice, Section, slider, chanceSlider, linkFields, BUTTON, idle } from "./parts";

import { PROP_TYPES, propEditable } from "../../game/props";
import { propEdit } from "../propEditState";
import { useTextureVersion } from "../textureLibrary";
import { useSharedPropVersion } from "../sharedProps";
import { TEXTURE_SETS, textureSetsOfKind } from "../../render/textureSets";

export function PropFields(p: EditorBarProps) {
useTextureVersion();
useSharedPropVersion();
if (!p.prop) return null;
// (the sets as they are now: a shared one loaded since counts)
const PROP_TEXTURES = [...textureSetsOfKind("wall"), ...textureSetsOfKind("propFace")].filter(id => !id.endsWith("_top"));
return <>
<Section kind="prop" section="transform">
{slider(t("editorBar.turn"), p.prop.rotation, 0, 345, 15, (v) => p.onPropChange({ rotation: v || undefined }))}
{slider(t("editorBar.scale"), p.prop.scale, 0.25, 4, 0.05, (v) => p.onPropChange({ scale: v === 1 ? undefined : v }))}
{slider(t("editorBar.height"), p.prop.elevation, -0.5, Math.max(0, p.prop.roomHeight - 0.05), 0.05, (v) =>
                  p.onPropChange({ elevation: v || undefined }),
                )}
</Section>
<Section kind="prop" section="look">
<KindChoice label={t("editorBar.prop")} value={p.prop.name} options={Object.keys(PROP_TYPES).filter(id => assetInWorld(id)).map(value => ({value,label:PROP_TYPES[value].name ?? value}))} onChange={prop => p.onPropChange({prop})}/>

{p.prop.retexturable && (
                  // (a roof wears any wall-kind set - the user's shared ones too; the other props
                  // also the sets made for props)
                  <KindChoice
                    label={t("editorBar.texture")}
                    value={p.prop.texture ?? ""}
                    options={[
                      { value: "", label: t("editorBar.itsOwn") },
                      ...(PROP_TYPES[p.prop.name]?.kind === "roof" ? textureSetsOfKind("wall").filter(id => id !== "sky") : PROP_TEXTURES).map((id) => ({ value: id, label: TEXTURE_SETS[id].label })),
                    ]}
                    onChange={(texture) => p.onPropChange({ texture: texture || undefined })}
                  />
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
