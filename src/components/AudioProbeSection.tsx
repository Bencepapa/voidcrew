import { useState } from "react";
import { t } from "../i18n";
import { playAt, playMany, playOrbit, probeStatus, relative, stopAllProbes, type ProbeStatus } from "../audio/audioProbe";
import { isHrtf, setHrtf } from "../audio/engine";
import { searchAnchor } from "../search/searchAnchor";

// The Debug panel's "Sound (probe)" section: test voices put at places round the listener (see src/audio/audioProbe.ts).
// Each stays where it was put in the world, so turning and walking should move it in the stereo field.
const BUTTON = "text-[11px] border border-neutral-600 rounded-sm px-2 py-1 hover:bg-neutral-800 text-left";

export function AudioProbeSection() {
  const [status, setStatus] = useState<ProbeStatus | null>(null);
  const [hrtf, setHrtfState] = useState(isHrtf());
  const refresh = () => setStatus(probeStatus());
  const run = (action: () => void) => () => {
    try {
      action();
    } catch (error) {
      console.warn("[audio probe]", error);
    }
    refresh();
  };
  return (
    <>
      <p className="text-[10px] text-neutral-400">{t("debug.audioProbeHint")}</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" {...searchAnchor("debug.audio.probe")} className={BUTTON} onClick={run(() => playAt(relative(3, 0)))}>{t("debug.audioAhead")}</button>
        <button type="button" className={BUTTON} onClick={run(() => playAt(relative(0, 3)))}>{t("debug.audioRight")}</button>
        <button type="button" className={BUTTON} onClick={run(() => playAt(relative(0, -3)))}>{t("debug.audioLeft")}</button>
        <button type="button" className={BUTTON} onClick={run(() => playAt(relative(-3, 0)))}>{t("debug.audioBehind")}</button>
        <button type="button" className={BUTTON} onClick={run(() => playOrbit())}>{t("debug.audioOrbit")}</button>
        <button type="button" className={BUTTON} onClick={run(() => playAt({ ...relative(3, 0), walls: 3 }))}>{t("debug.audioMuffled")}</button>
        <button type="button" className={BUTTON} onClick={run(() => playAt({ ...relative(3, 0), cackle: true }, 6000))}>{t("debug.audioCackleAhead")}</button>
        <button type="button" className={BUTTON} onClick={run(() => playAt({ ...relative(-3, 0), cackle: true }, 6000))}>{t("debug.audioCackleBehind")}</button>
        <button type="button" className={BUTTON} onClick={run(() => playAt({ ...relative(3, 0), cackle: true, walls: 2 }, 6000))}>{t("debug.audioCackleMuffled")}</button>
        <button type="button" className={BUTTON} onClick={run(() => playMany(20))}>{t("debug.audioMany")}</button>
        <button type="button" className={BUTTON} onClick={run(() => stopAllProbes())}>{t("debug.audioStop")}</button>
      </div>
      <label className="flex items-center gap-2 text-[11px] cursor-pointer">
        <input type="checkbox" {...searchAnchor("debug.audio.hrtf")} checked={hrtf} onChange={(e) => { setHrtf(e.target.checked); setHrtfState(e.target.checked); }} />
        {t("debug.audioHrtf")}
      </label>
      {status && <p className="text-[10px] text-neutral-300">{t("debug.audioStatus", { state: status.state, rate: status.sampleRate, active: status.active })}</p>}
    </>
  );
}
