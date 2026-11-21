import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { LinkTargetFields } from "./LinkTargetFields";
import { KindChoice, Section, BUTTON, idle } from "./parts";

// A staircase's fields (see StairsSpec): up or down, straight or spiral, its
// name (what another map's link can arrive at) and where it leads.
export function StairsFields(p: EditorBarProps) {
if (!p.stairs) return null;
return <>
<Section kind="stairs" section="logic">
<KindChoice label={t("link.stairsDirection")} value={p.stairs.direction} options={[{ value: "up", label: t("link.up") }, { value: "down", label: t("link.down") }]} onChange={(direction) => p.onStairsChange({ direction: direction as "up" | "down" })} />
<KindChoice label={t("link.stairsStyle")} value={p.stairs.style} options={[{ value: "straight", label: t("link.straight") }, { value: "spiral", label: t("link.spiral") }]} onChange={(style) => p.onStairsChange({ style: style === "spiral" ? "spiral" : undefined })} />
<label className="flex items-center gap-1">
              {t("editorBar.name")}<input
                type="text"
                value={p.stairs.name}
                onChange={(e) => p.onStairsChange({ name: e.target.value || undefined }, "name")}
                className="w-32 bg-neutral-800 border border-neutral-700 px-1"
              />
            </label>
<LinkTargetFields to={p.stairs.to} mapId={p.mapId} mapIds={p.mapIds} noneLabel="link.targetNoneStairs" onChange={(to) => p.onStairsChange({ to })} />
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onStairsRemove}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onStairsDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
