import { ACTOR_TYPES } from "../../game/actors";
import { assetInWorld } from "../../game/worlds";
import { t, type Key } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { KindChoice, Section, slider, chanceSlider, linkFields, BUTTON, idle, active } from "./parts";
import type { Direction, ActorWake } from "../../game/types";

const WAKE_LABELS: Record<ActorWake["mode"], Record<number, Key>> = {
  "dormant": {
    "1": "editorBar.wake.dormant.1",
    "2": "editorBar.wake.dormant.2",
    "3": "editorBar.wake.dormant.3"
  },
  "fooled": {
    "1": "editorBar.wake.fooled.1",
    "2": "editorBar.wake.fooled.2",
    "3": "editorBar.wake.fooled.3"
  },
  "arrive": {
    "1": "editorBar.wake.arrive.1",
    "2": "editorBar.wake.arrive.2",
    "3": "editorBar.wake.arrive.3"
  }
};
export function ActorFields(p: EditorBarProps) {
if (!p.actor) return null;
return <>
<Section kind="actor" section="transform">
<span className="flex items-center gap-0.5">{t("editorBar.faces")} {(["N", "E", "S", "W"] as Direction[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`${BUTTON} ${p.actor!.facing === d ? active : idle}`}
                      onClick={() => p.onActorChange({ facing: d })}
                    >
                      {d}
                    </button>
                  ))}</span>
<span className="text-neutral-400">{p.actor.route ? t("editorBar.routeCells", { n: p.actor.route }) : t("editorBar.stands")}</span>
{p.actor.route > 0 && (
                  <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorClearRoute}>{t("editorBar.clearRoute")}</button>
                )}
</Section>
<Section kind="actor" section="look">
<KindChoice label={t("editorBar.npc")} value={p.actor.type} options={Object.keys(ACTOR_TYPES).filter(id => assetInWorld(id)).map(value => ({value,label:value}))} onChange={actor => p.onActorChange({actor})}/>
</Section>
<Section kind="actor" section="logic">
{chanceSlider(p.actor.chance, (chance) => p.onActorChange({ chance }))}
{linkFields(p.actor.links, p.linkIds, p.onActorChange)}
</Section>
<Section kind="actor" section="advanced">
<KindChoice label={t("editorBar.untilAlert")} title={t("editorBar.untilTheShipSAlertReachesA")} value={p.actor.wake ? `${p.actor.wake.mode} ${p.actor.wake.level}` : ""} options={[
 {value:"",label:t("editorBar.onGuardFromTheStart")},
 ...(["dormant","fooled","arrive"] as const).flatMap(mode => ([1,2,3] as const).map(level => ({value:`${mode} ${level}`,label:t(WAKE_LABELS[mode][level])})))
]} onChange={v => {
 const [mode,level] = v.split(" ");
 const keep = p.actor!.wake?.mode === "arrive" && mode === "arrive" ? p.actor!.wake : {};
 p.onActorChange({wake:mode ? {...keep,mode,level:Number(level)} as ActorWake : undefined});
}}/>
{p.actor.wake?.mode === "arrive" &&
                  slider(t("editorBar.everyS"), p.actor.wake.every ?? 30, 10, 120, 5, (v) =>
                    p.onActorChange({ wake: { ...p.actor!.wake!, every: v === 30 ? undefined : v } }),
                  )}
{p.actor.wake?.mode === "arrive" &&
                  slider(t("editorBar.max"), p.actor.wake.max ?? 1, 1, 5, 1, (v) => p.onActorChange({ wake: { ...p.actor!.wake!, max: v === 1 ? undefined : v } }))}
</Section>
<footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2"><button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorDelete}>{t("editorBar.remove")}</button>
<button type="button" className={`${BUTTON} ${idle}`} onClick={p.onActorDeselect}>{t("editorBar.done")}</button></footer>
</>;
}
