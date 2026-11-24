import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { KindChoice, Section, slider, chanceSlider, linkFields, BUTTON, idle } from "./parts";

import { assetInWorld } from "../../game/worlds";
import { ITEM_TYPES } from "../../game/items";
import { keyFlagFor } from "../../game/keys";

export function ItemFields(p: EditorBarProps) {
if (!p.item) return null;
return <>
<Section kind="item" section="transform">
{slider(t("editorBar.height"), p.item.elevation, 0, Math.max(0, p.item.roomHeight - 0.05), 0.01, (v) =>
                  p.onItemChange({ elevation: v || undefined }),
                )}
</Section>
<Section kind="item" section="look">
<KindChoice label={t("editorBar.item")} value={p.item.item} options={Object.entries(ITEM_TYPES).filter(([id]) => assetInWorld(id)).map(([value,type]) => ({value,label:type.name}))} onChange={item => p.onItemChange({item})}/>
{slider(t("editorBar.count"), p.item.count, 1, 20, 1, (v) => p.onItemChange({ count: v > 1 ? v : undefined }))}
</Section>
<Section kind="item" section="logic">
<label className="flex items-center gap-1" title={t("operable.item.keyNameTitle")}>
  {t("operable.item.keyName")}<input type="text" value={p.item.name ?? ""} placeholder="-" onChange={(e) => p.onItemChange({ name: e.target.value || undefined })} className="min-w-0 flex-1 bg-neutral-800 border border-neutral-700 px-1"/>
</label>
<label className="flex items-center gap-1" title={t("operable.item.keyFlagTitle")}>
  {t("operable.item.keyFlag")}<input type="text" value={p.item.sets ?? ""} placeholder={keyFlagFor(p.item.item)} onChange={(e) => p.onItemChange({ sets: e.target.value.trim() || undefined })} className="min-w-0 flex-1 bg-neutral-800 border border-neutral-700 px-1"/>
</label>
<button type="button" className={`${BUTTON} ${idle}`} title={t("operable.item.keyFlagTitle")} onClick={() => p.onItemChange({ name: p.item!.name ?? ITEM_TYPES[p.item!.item]?.name, sets: p.item!.sets ?? keyFlagFor(p.item!.item) })}>{t("operable.item.makeKey")}</button>
{chanceSlider(p.item.chance, (chance) => p.onItemChange({ chance }))}
{linkFields(p.item.links, p.linkIds, p.onItemChange)}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onItemDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onItemDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
