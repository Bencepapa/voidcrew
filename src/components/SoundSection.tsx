import { useEffect, useState, useSyncExternalStore } from "react";
import { t } from "../i18n";
import { currentRoom, engineStatus, getSoundSettings, outputLevels, setMasterVolume, setMuted, setRearStrength, setReverbAmount, setReverbOn, subscribeSoundSettings, wetLevel } from "../audio/engine";
import { dbText } from "../audio/meter";

// The Debug panel's "Sound" section: the master volume and the mute switch for everything that plays (the map's
// sound emitters and the test voices below), kept between sessions (see src/audio/engine.ts).
export function SoundSection() {
  const settings = useSyncExternalStore(subscribeSoundSettings, getSoundSettings);
  const [status, setStatus] = useState(engineStatus);
  const [levels, setLevels] = useState(outputLevels);
  const [room, setRoom] = useState(currentRoom);
  const [wet, setWet] = useState(0);
  // (a line that follows the voices: a few times a second while the panel is open)
  useEffect(() => {
    const timer = setInterval(() => {
      setStatus(engineStatus());
      setLevels(outputLevels());
      setRoom(currentRoom());
      setWet(wetLevel());
    }, 500);
    return () => clearInterval(timer);
  }, []);
  const decay = room ? room.acoustics.decay.toFixed(2) : "";
  const echo = room ? Math.round(room.acoustics.reverb * 100) : 0;
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
      <label className="flex items-center gap-2 text-[11px] cursor-pointer" title={t("acoustics.reverbHint")}>
        <input type="checkbox" checked={settings.reverbOn} onChange={(e) => setReverbOn(e.target.checked)} />
        {t("acoustics.reverbOn")}
      </label>
      <label className={`flex items-center gap-2 text-[11px] ${settings.reverbOn ? "" : "opacity-40"}`} title={t("acoustics.reverbHint")}>
        {t("acoustics.reverb")}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.reverbAmount}
          disabled={!settings.reverbOn}
          onChange={(e) => setReverbAmount(Number(e.target.value))}
          className="min-w-0 flex-1"
        />
        <span className="w-9 text-right tabular-nums">{Math.round(settings.reverbAmount * 100)}%</span>
      </label>
      <p className="text-[10px] text-neutral-300">
        {room && room.source === "zone"
          ? t("acoustics.roomZone", { name: room.name ?? t("acoustics.unnamed"), preset: t(`acoustics.preset.${room.preset === "auto" || !room.preset ? "room" : room.preset}`), decay, reverb: echo })
          : room && room.source === "auto"
            ? t("acoustics.roomAuto", { decay, reverb: echo })
            : t("acoustics.roomNone")}
      </p>
      <p className="text-[10px] text-neutral-300">{t("sound.status", { state: status.state, voices: status.voices })}</p>
      <p className="text-[10px] text-neutral-400 tabular-nums">{t("sound.levels", { left: dbText(levels.left), right: dbText(levels.right) })}</p>
      <p className="text-[10px] text-neutral-400 tabular-nums">{t("acoustics.wet", { wet: dbText(wet) })}</p>
    </>
  );
}
