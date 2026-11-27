import { assetInWorld } from "../../game/worlds";
import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { KindChoice, Section, slider, chanceSlider, linkFields, BUTTON, idle } from "./parts";

import { PROP_TYPES, propEditable } from "../../game/props";
import { PUDDLE_PROP } from "../../game/puddle";
import { propEdit } from "../propEditState";
import { useTextureVersion } from "../textureLibrary";
import { useSharedPropVersion } from "../sharedProps";
import { textureSetsOfKind } from "../../render/textureSets";
import { TexturePicker, textureOptions } from "../TexturePicker";
import { FencePieceFields } from "./FenceFields";
import { OperableFields } from "./OperableFields";
import { LockFields } from "./LockFields";

export function PropFields(p: EditorBarProps) {
useTextureVersion();
useSharedPropVersion();
if (!p.prop) return null;
// (the sets as they are now: a shared one loaded since counts)
const PROP_TEXTURES = [...textureSetsOfKind("wall"), ...textureSetsOfKind("propFace")].filter(id => !id.endsWith("_top"));
return <>
{/* a lever, button, plate or trap: what it does comes first, not folded away */}
{p.prop.operable && <div className="px-2 pt-2"><OperableFields info={p.prop.operable} onChange={(operable) => p.onPropChange({ operable })}/></div>}
{/* a container, lever or button can be locked (see game/propLocks.ts) */}
{p.prop.lock && <div className="px-2 pt-2"><LockFields info={p.prop.lock} onChange={(lock) => p.onPropChange({ lock })}/></div>}
<Section kind="prop" section="transform">
{!p.prop.fence && slider(t("editorBar.turn"), p.prop.rotation, 0, 345, 15, (v) => p.onPropChange({ rotation: v || undefined }))}
{!p.prop.fence && slider(t("editorBar.scale"), p.prop.scale, 0.25, 4, 0.05, (v) => p.onPropChange({ scale: v === 1 ? undefined : v }))}
{slider(t("editorBar.height"), p.prop.elevation, -0.5, Math.max(0, p.prop.roomHeight - 0.05), 0.05, (v) =>
                  p.onPropChange({ elevation: v || undefined }),
                )}
</Section>
<Section kind="prop" section="look">
{p.prop.auto && <div className="flex flex-col gap-1 border border-neutral-700 p-1">
<strong className="text-neutral-200">{t("roofauto.piece", { group: p.prop.auto.group })}</strong>
<span className="text-neutral-400">{t(p.prop.auto.detached ? "roofauto.detachedInfo" : "roofauto.attached")}</span>
<div className="flex flex-wrap gap-1">
<button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onPropRoofDetach(!p.prop!.auto!.detached)}>{t(p.prop.auto.detached ? "roofauto.attach" : "roofauto.detach")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropRoofRemove}>{t("roofauto.removeRoof")}</button>
</div>
</div>}
{p.prop.fence ? <FencePieceFields {...p}/> : <>
<KindChoice label={t("editorBar.prop")} value={p.prop.name} options={Object.keys(PROP_TYPES).filter(id => assetInWorld(id) && PROP_TYPES[id].kind !== "fence").map(value => ({value,label:value === PUDDLE_PROP ? t("assetTree.name.puddle_prop") : PROP_TYPES[value].name ?? value}))} onChange={prop => p.onPropChange({prop})}/>

{p.prop.retexturable && (
                  // (a roof wears any wall-kind set - the user's shared ones too; the other props
                  // also the sets made for props)
                  <TexturePicker
                    label={t("editorBar.texture")}
                    value={p.prop.texture ?? ""}
                    options={textureOptions(PROP_TYPES[p.prop.name]?.kind === "roof" ? textureSetsOfKind("wall").filter(id => id !== "sky") : PROP_TEXTURES, [{ value: "", label: t("editorBar.itsOwn") }])}
                    onChange={(texture) => p.onPropChange({ texture: texture || undefined })}
                  />
                )}
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onPropStack} title={t("editorBar.thePaletteSPropOnTopOf")}>{t("editorBar.stackOnTop", { v1: p.propChoice })}</button>
</>}
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
