import { t } from "../../i18n";
import { worldOfMap } from "../../game/worlds";
import type { EditorBarProps } from "../EditorBar";
import { LinkTargetFields } from "./LinkTargetFields";
import { Section, BUTTON, idle } from "./parts";

// An exit's fields: its name and, in the fantasy world, where it leads - an
// exit with a target is a gate to another map (see mapLinks.ts), one without
// ends the run. The arrival defaults to the target's gate back to this map.
export function ExitFields(p: EditorBarProps) {
if (!p.exit) return null;
return <>
<Section kind="exit" section="logic">
<label className="flex items-center gap-1">
              {t("editorBar.name")}<input
                type="text"
                value={p.exit.name}
                placeholder={t("editorBar.airlock")}
                onChange={(e) => p.onExitChange({ name: e.target.value || undefined }, "name")}
                className="w-32 bg-neutral-800 border border-neutral-700 px-1"
              />
            </label>
{worldOfMap(p.mapId) === "fantasy" && <LinkTargetFields to={p.exit.to} mapId={p.mapId} mapIds={p.mapIds} noneLabel="link.targetNone" onChange={(to) => p.onExitChange({ to })} />}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onExitRemove}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onExitDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
