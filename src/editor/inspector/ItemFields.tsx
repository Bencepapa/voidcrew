import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { Section, slider, chanceSlider, linkFields, BUTTON, idle } from "./parts";

import { assetInWorld } from "../../game/worlds";
import { ITEM_TYPES } from "../../game/items";

export function ItemFields(p: EditorBarProps) {
if (!p.item) return null;
return <>
<Section kind="item" section="transform">
{slider(t("editorBar.height"), p.item.elevation, 0, Math.max(0, p.item.roomHeight - 0.05), 0.01, (v) =>
                  p.onItemChange({ elevation: v || undefined }),
                )}
</Section>
<Section kind="item" section="look">
<label className="flex items-center gap-1">
                  {t("editorBar.item")}<select
                    value={p.item.item}
                    onChange={(e) => p.onItemChange({ item: e.target.value })}
                    className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
                  >
                    {Object.entries(ITEM_TYPES).filter(([id]) => assetInWorld(id)).map(([id, type]) => (
                      <option key={id} value={id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </label>
{slider(t("editorBar.count"), p.item.count, 1, 20, 1, (v) => p.onItemChange({ count: v > 1 ? v : undefined }))}
</Section>
<Section kind="item" section="logic">
{chanceSlider(p.item.chance, (chance) => p.onItemChange({ chance }))}
{linkFields(p.item.links, p.linkIds, p.onItemChange)}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onItemDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onItemDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
