import { useContext } from "react";
import { t } from "../../i18n";
import { MAPS } from "../../game/map";
import { worldOfMap } from "../../game/worlds";
import { namedPlaces } from "../../game/mapLinks";
import type { Direction, MapLinkTarget } from "../../game/types";
import type { EditorBarProps } from "../EditorBar";
import { CommitContext, Section, BUTTON, idle } from "./parts";

const FIELD = "min-w-0 max-w-full flex-1 bg-neutral-800 border border-neutral-700 px-1 py-0.5";
const FACINGS: Direction[] = ["N", "E", "S", "W"];

// An exit's fields: its name and, in the fantasy world, where it leads - an
// exit with a target is a gate to another map (see mapLinks.ts), one without
// ends the run. The arrival defaults to the target's gate back to this map.
export function ExitFields(p: EditorBarProps) {
const commit = useContext(CommitContext);
if (!p.exit) return null;
const to = p.exit.to;
const targetIds = p.mapIds.filter((id) => id !== p.mapId && MAPS[id]);
const target = to ? MAPS[to.map] : undefined;
const places = target ? namedPlaces(target) : [];
// a gate's arrival, as the dropdown's value: "" the default, "name:<name>", "cell"
const arrival = to?.arrival;
const arrivalValue = arrival === undefined ? "" : typeof arrival === "string" ? "name:" + arrival : "cell";
// the target with a part changed (a part set to undefined is left out of the file)
const change = (next: Partial<MapLinkTarget>) => p.onExitChange({ to: JSON.parse(JSON.stringify({ ...to!, ...next })) as MapLinkTarget });
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
{worldOfMap(p.mapId) === "fantasy" && <>
<label>{t("link.target")}
  <select className={FIELD} value={to?.map ?? ""} onFocus={commit} onChange={(e) => p.onExitChange({ to: e.target.value ? { map: e.target.value } : undefined })}>
    <option value="">{t("link.targetNone")}</option>
    {to && !target && <option value={to.map}>{t("link.targetMissing", { id: to.map })}</option>}
    {targetIds.map((id) => <option key={id} value={id}>{`${MAPS[id].place} - ${MAPS[id].name}`}</option>)}
  </select>
</label>
{to && <>
<label>{t("link.arrival")}
  <select className={FIELD} value={arrivalValue} onFocus={commit} onChange={(e) => {
    const v = e.target.value;
    change({ arrival: v === "" ? undefined : v.startsWith("name:") ? v.slice(5) : arrival });
  }}>
    <option value="">{t("link.arrivalAuto")}</option>
    {typeof arrival === "string" && !places.some((place) => place.name.toLowerCase() === arrival.toLowerCase()) && <option value={"name:" + arrival}>{t("link.arrivalMissing", { id: arrival })}</option>}
    {places.map((place) => <option key={place.name} value={"name:" + place.name}>{place.name}</option>)}
    {arrival !== undefined && typeof arrival !== "string" && <option value="cell">{t("link.arrivalCell", { x: arrival.x, y: arrival.y })}</option>}
  </select>
</label>
<label>{t("link.facing")}
  <select className={FIELD} value={to.facing ?? ""} onFocus={commit} onChange={(e) => change({ facing: (e.target.value || undefined) as Direction | undefined })}>
    <option value="">{t("link.facingAuto")}</option>
    {FACINGS.map((d) => <option key={d} value={d}>{d}</option>)}
  </select>
</label>
</>}
</>}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onExitRemove}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onExitDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
