import { useContext } from "react";
import { t, type Key } from "../../i18n";
import { MAPS } from "../../game/map";
import { namedPlaces } from "../../game/mapLinks";
import type { Direction, MapLinkTarget } from "../../game/types";
import { CommitContext } from "./parts";

const FIELD = "min-w-0 max-w-full flex-1 bg-neutral-800 border border-neutral-700 px-1 py-0.5";
const FACINGS: Direction[] = ["N", "E", "S", "W"];

// The fields of where a link between maps leads (a gate's, a staircase's - see
// mapLinks.ts): the target map, where in it the party arrives and which way it
// faces. `noneLabel`: what no target means (a gate: it ends the run).
export function LinkTargetFields({ to, mapId, mapIds, noneLabel, onChange }: {
  to: MapLinkTarget | undefined;
  mapId: string;
  mapIds: string[];
  noneLabel: Key;
  onChange: (to: MapLinkTarget | undefined) => void;
}) {
  const commit = useContext(CommitContext);
  const targetIds = mapIds.filter((id) => id !== mapId && MAPS[id]);
  const target = to ? MAPS[to.map] : undefined;
  const places = target ? namedPlaces(target) : [];
  // the arrival, as the dropdown's value: "" the default, "name:<name>", "cell"
  const arrival = to?.arrival;
  const arrivalValue = arrival === undefined ? "" : typeof arrival === "string" ? "name:" + arrival : "cell";
  // the target with a part changed (a part set to undefined is left out of the file)
  const change = (next: Partial<MapLinkTarget>) => onChange(JSON.parse(JSON.stringify({ ...to!, ...next })) as MapLinkTarget);
  return <>
    <label>{t("link.target")}
      <select className={FIELD} value={to?.map ?? ""} onFocus={commit} onChange={(e) => onChange(e.target.value ? { map: e.target.value } : undefined)}>
        <option value="">{t(noneLabel)}</option>
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
  </>;
}
