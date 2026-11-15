import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { Section, slider, linkFields, BUTTON, idle } from "./parts";

export function ChanceWallFields(p: EditorBarProps) {
if (!p.chanceWall) return null;
return <>
<Section kind="chanceWall" section="logic">
{slider(t("editorBar.chance"), p.chanceWall.chance, 0, 1, 0.05, (chance) => p.onChanceWallChange({ chance }))}
{linkFields(p.chanceWall.links, p.linkIds, p.onChanceWallChange)}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onChanceWallRemove} title={t("editorBar.alwaysAWall")}>{t("editorBar.plainWall")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onChanceWallDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
