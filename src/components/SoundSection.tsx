import { useEffect, useState, useSyncExternalStore } from "react";
import { t } from "../i18n";
import { engineStatus, getSoundSettings, outputLevels, setMasterVolume, setMuted, setRearStrength, subscribeSoundSettings } from "../audio/engine";
import { dbText } from "../audio/meter";

// The Debug panel's "Sound" section: the master volume and the mute switch for everything that plays (the map's
// sound emitters and the test voices below), kept between sessions (see src/audio/engine.ts).
export function SoundSection() {
  const settings = useSyncExternalStore(subscribeSoundSettings, getSoundSettings);
  const [status, setStatus] = useState(engineStatus);
  const [levels, setLevels] = useState(outputLevels);
  // (a line that follows the voices: a few times a second while the panel is open)
  useEffect(() => {
    const timer = setInterval(() => {
      setStatus(engineStatus());
      setLevels(outputLevels());
    }, 500);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <p className="text-[10px] text-neutral-400">{t("sound.hint")}</p>
      <label className="flex items-center gap-2 text-[11px]">
        {t("sound.volume")}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => setMasterVolume(Number(e.target.value))}
          className="min-w-0 flex-1"
        />
        <span className="w-9 text-right tabular-nums">{Math.round(settings.volume * 100)}%</span>
      </label>
      <label className="flex items-center gap-2 text-[11px] cursor-pointer">
        <input type="checkbox" checked={settings.muted} onChange={(e) => setMuted(e.target.checked)} />
        {t("sound.mute")}
      </label>
      <label className="flex items-center gap-2 text-[11px]" title={t("sound.rearHint")}>
        {t("sound.rear")}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.rearStrength}
          onChange={(e) => setRearStrength(Number(e.target.value))}
          className="min-w-0 flex-1"
        />
        <span className="w-9 text-right tabular-nums">{Math.round(settings.rearStrength * 100)}%</span>
      </label>
      <p className="text-[10px] text-neutral-300">{t("sound.status", { state: status.state, voices: status.voices })}</p>
      <p className="text-[10px] text-neutral-400 tabular-nums">{t("sound.levels", { left: dbText(levels.left), right: dbText(levels.right) })}</p>
    </>
  );
}
