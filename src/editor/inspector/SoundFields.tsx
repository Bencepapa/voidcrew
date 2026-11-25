import { useContext } from "react";
import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { NumberField } from "../NumberField";
import { CommitContext, KindChoice, Section, BUTTON, idle, active } from "./parts";
import { NOISE_COLORS, SOUND_KINDS, SOUND_LIMITS, SOUND_WAVES, changePulse, type NoiseColor, type SoundKind, type SoundWave } from "../../game/sounds";

// a pitch is felt in octaves: the slider runs along the logarithm of the frequency
const { min: PITCH_MIN, max: PITCH_MAX } = SOUND_LIMITS.pitch;
const pitchToSlider = (hz: number) => Math.log(hz / PITCH_MIN) / Math.log(PITCH_MAX / PITCH_MIN);
const sliderToPitch = (v: number) => PITCH_MIN * (PITCH_MAX / PITCH_MIN) ** v;

// The Sound tool's panel: the selected sound emitter (or, with none picked, the next one's settings). The main
// settings are open all the time - there are few of them; the spot in the cell is a section of its own.
export function SoundFields(p: EditorBarProps & { placing?: boolean }) {
  const commit = useContext(CommitContext);
  const s = p.sound;
  if (!s) return null;
  const change = p.onSoundChange;
  const num = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, options: { title?: string; unit?: string; defaultValue?: number } = {}) => (
    <NumberField label={label} value={value} min={min} max={max} step={step} slider title={options.title} unit={options.unit} defaultValue={options.defaultValue} onChange={onChange} onCommit={commit} />
  );
  return (
    <>
      <div className="flex min-w-0 flex-col gap-2 px-2 py-2">
        <KindChoice
          label={t("sound.kind")}
          value={s.kind}
          options={SOUND_KINDS.map((value) => ({ value, label: t(`sound.kind.${value}`) }))}
          onChange={(kind) => change({ kind: kind as SoundKind })}
        />
        {s.kind === "tone" ? (
          <>
            <KindChoice
              label={t("sound.wave")}
              value={s.wave}
              options={SOUND_WAVES.map((value) => ({ value, label: t(`sound.wave.${value}`) }))}
              onChange={(wave) => change({ wave: (wave === "sine" ? undefined : wave) as SoundWave | undefined })}
            />
            <div className="flex min-w-0 flex-col gap-1">
              {num(t("sound.pitch"), s.pitch, PITCH_MIN, PITCH_MAX, 1, (hz) => change({ pitch: hz === SOUND_LIMITS.pitch.default ? undefined : hz }), { unit: t("sound.pitchUnit"), defaultValue: SOUND_LIMITS.pitch.default })}
              <input
                type="range"
                aria-label={t("sound.pitch")}
                min={0}
                max={1}
                step={0.002}
                value={pitchToSlider(s.pitch)}
                onChange={(e) => change({ pitch: Math.round(sliderToPitch(Number(e.target.value))) })}
                onPointerUp={commit}
                onKeyUp={commit}
                className="w-full"
              />
            </div>
          </>
        ) : (
          <KindChoice
            label={t("sound.noiseColor")}
            value={s.noise}
            options={NOISE_COLORS.map((value) => ({ value, label: t(`sound.noise.${value}`) }))}
            onChange={(noise) => change({ noise: (noise === "white" ? undefined : noise) as NoiseColor | undefined })}
          />
        )}
        {num(t("sound.volumeField"), s.volume, 0, 1, 0.05, (volume) => change({ volume }), { defaultValue: SOUND_LIMITS.volume.default })}
        {num(t("sound.range"), s.range, 1, 60, 0.5, (range) => change({ range }), { title: t("sound.rangeHint"), defaultValue: SOUND_LIMITS.range.default })}
        {num(t("sound.rolloff"), s.rolloff, SOUND_LIMITS.rolloff.min, SOUND_LIMITS.rolloff.max, 0.1, (rolloff) => change({ rolloff: rolloff === 1 ? undefined : rolloff }), { title: t("sound.rolloffHint"), defaultValue: SOUND_LIMITS.rolloff.default })}
        <KindChoice
          label={t("sound.repeat")}
          value={s.pulse ? "pulse" : "loop"}
          options={[
            { value: "loop", label: t("sound.repeat.loop") },
            { value: "pulse", label: t("sound.repeat.pulse") },
          ]}
          onChange={(mode) => change({ pulse: mode === "pulse" ? { on: 0.3, off: 0.7 } : undefined })}
        />
        {s.pulse && (
          <>
            {num(t("sound.on"), s.pulse.on, 0.05, 10, 0.05, (on) => change({ pulse: changePulse(s.pulse!, { on }) }))}
            {num(t("sound.off"), s.pulse.off, 0.05, 10, 0.05, (off) => change({ pulse: changePulse(s.pulse!, { off }) }))}
            {num(t("sound.attack"), s.pulse.attack ?? SOUND_LIMITS.edge.default, SOUND_LIMITS.edge.min, SOUND_LIMITS.edge.max, 0.01, (attack) => change({ pulse: changePulse(s.pulse!, { attack }) }), { title: t("sound.attackHint"), unit: "s", defaultValue: SOUND_LIMITS.edge.default })}
            {num(t("sound.release"), s.pulse.release ?? SOUND_LIMITS.edge.default, SOUND_LIMITS.edge.min, SOUND_LIMITS.edge.max, 0.01, (release) => change({ pulse: changePulse(s.pulse!, { release }) }), { title: t("sound.releaseHint"), unit: "s", defaultValue: SOUND_LIMITS.edge.default })}
          </>
        )}
        <label className="flex items-center gap-1" title={t("sound.activeHint")}>
          <input type="checkbox" checked={s.active} onChange={(e) => change({ active: e.target.checked ? undefined : false })} />
          {t("sound.active")}
        </label>
        {!p.placing && (
          <label className="flex items-center gap-1" title={t("sound.idHint")}>
            {t("sound.id")}
            <input type="text" value={s.id ?? ""} placeholder="-" onChange={(e) => change({ id: e.target.value.trim() || undefined })} className="min-w-0 flex-1 bg-neutral-800 border border-neutral-700 px-1" />
          </label>
        )}
        {!p.placing && (
          <button
            type="button"
            aria-pressed={s.listening}
            title={t("sound.listenHint")}
            className={`${BUTTON} ${s.listening ? active : idle}`}
            onClick={() => p.onSoundListen(!s.listening)}
          >
            {s.listening ? t("sound.listening") : t("sound.listen")}
          </button>
        )}
      </div>
      {!p.placing && (
        <>
          <Section kind="sound" section="transform">
            {num(t("sound.height"), s.pos[1], 0, Math.max(0.05, s.roomHeight - 0.05), 0.05, (up) => change({ pos: [s.pos[0], up, s.pos[2]] }), { defaultValue: SOUND_LIMITS.up.default })}
            {num(t("sound.across"), s.pos[0], SOUND_LIMITS.across.min, SOUND_LIMITS.across.max, 0.05, (dx) => change({ pos: [dx, s.pos[1], s.pos[2]] }), { defaultValue: 0 })}
            {num(t("sound.along"), s.pos[2], SOUND_LIMITS.across.min, SOUND_LIMITS.across.max, 0.05, (dz) => change({ pos: [s.pos[0], s.pos[1], dz] }), { defaultValue: 0 })}
            <span className="text-neutral-500">{t("editorBar.arrowsPgUpPgDnMove")}</span>
          </Section>
          <footer className="flex flex-wrap gap-2 border-t border-neutral-700 p-2">
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSoundDelete} title={t("editorBar.delete")}>{t("editorBar.remove")}</button>
            <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSoundDeselect}>{t("editorBar.done")}</button>
          </footer>
        </>
      )}
    </>
  );
}
