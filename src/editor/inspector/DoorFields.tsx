import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { Section, slider, chanceSlider, linkFields, BUTTON, idle, doorLock } from "./parts";

import { DOOR_EDGE_OFFSET } from "../../game/map";
export function DoorFields(p: EditorBarProps) {
if (!p.door) return null;
return <>
<Section kind="door" section="transform">
{slider(t("editorBar.place"), p.door.offset, -DOOR_EDGE_OFFSET, DOOR_EDGE_OFFSET, 0.02, (v) =>
              p.onDoorChange({ offset: v || undefined }),
            )}
<button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onDoorChange({ offset: -DOOR_EDGE_OFFSET })}>{t("editorBar.backEdge")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onDoorChange({ offset: undefined })}>{t("editorBar.middle")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={() => p.onDoorChange({ offset: DOOR_EDGE_OFFSET })}>{t("editorBar.frontEdge")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDoorFlip} title={t("editorBar.turnItRoundItStaysWhereIt")}>{t("editorBar.flipFront")}</button>
</Section>
<Section kind="door" section="logic">
{chanceSlider(p.door.chance, (chance) => p.onDoorChange({ chance }))}
{linkFields(p.door.links, p.linkIds, p.onDoorChange)}
</Section>
<Section kind="door" section="advanced">
<label className="flex items-center gap-1">
              {t("editorBar.label")}<input
                type="text"
                value={p.door.label}
                onChange={(e) => p.onDoorChange({ label: e.target.value || undefined })}
                className="w-16 bg-neutral-800 border border-neutral-700 px-1"
              />
            </label>
<label className="flex items-center gap-1" title={t("editorBar.theFlagThatOpensItACode")}>
              {t("editorBar.lockKey")}<input
                type="text"
                value={p.door.lock?.key ?? ""}
                onChange={(e) => p.onDoorChange({ lock: doorLock(p.door!.lock, { key: e.target.value || undefined }) })}
                className="w-20 bg-neutral-800 border border-neutral-700 px-1"
              />
            </label>
<label className="flex items-center gap-1" title={t("editorBar.whetherTheCrewSHackerCanBreak")}>
              {t("editorBar.hack")}<select
                value={p.door.lock?.hack ?? 0}
                onChange={(e) => p.onDoorChange({ lock: doorLock(p.door!.lock, { hack: Number(e.target.value) || undefined }) })}
                className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
              >
                <option value={0}>{t("editorBar.no")}</option>
                <option value={1}>{t("editorBar.easy")}</option>
                <option value={2}>{t("editorBar.hard")}</option>
                <option value={3}>{t("editorBar.veryHard")}</option>
              </select>
            </label>
<label className="flex items-center gap-1" title={t("editorBar.aKeypadItsCodeANewOne")}>
              <input
                type="checkbox"
                checked={!!p.door.lock?.code}
                onChange={(e) => p.onDoorChange({ lock: doorLock(p.door!.lock, { code: e.target.checked || undefined }) })}
              />
              {t("editorBar.code")}</label>
{p.door.lock &&
              slider(t("editorBar.locked"), p.door.lock.chance ?? 1, 0, 1, 0.05, (v) =>
                p.onDoorChange({ lock: doorLock(p.door!.lock, { chance: v >= 1 ? undefined : v }) }),
              )}
{p.door.lock && (
              <label className="flex items-center gap-1" title={t("editorBar.whatThePartyIsToldAtThe")}>
                {t("editorBar.says")}<input
                  type="text"
                  value={p.door.lock.message ?? ""}
                  placeholder={t("editorBar.itSLocked")}
                  onChange={(e) => p.onDoorChange({ lock: doorLock(p.door!.lock, { message: e.target.value || undefined }) })}
                  className="w-32 bg-neutral-800 border border-neutral-700 px-1"
                />
              </label>
            )}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDoorDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDoorDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
