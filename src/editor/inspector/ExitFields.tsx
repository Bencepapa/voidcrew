import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { Section, BUTTON, idle } from "./parts";

export function ExitFields(p: EditorBarProps) {
if (!p.exit) return null;
return <>
<Section kind="exit" section="logic">
<label className="flex items-center gap-1">
              {t("editorBar.name")}<input
                type="text"
                value={p.exit.name}
                placeholder={t("editorBar.airlock")}
                onChange={(e) => p.onExitName(e.target.value || undefined)}
                className="w-32 bg-neutral-800 border border-neutral-700 px-1"
              />
            </label>
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onExitRemove}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onExitDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
