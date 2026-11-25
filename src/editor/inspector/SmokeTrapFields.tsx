import { useContext } from "react";
import { t } from "../../i18n";
import { EMITTER_PRESETS, presetPatch } from "../../game/emitterPresets";
import { HARM_DEFAULTS } from "../../game/emitters";
import type { EditorBarProps } from "../EditorBar";
import { NumberField } from "../NumberField";
import { BUTTON, CommitContext, Section, idle } from "./parts";

// The smoke / fire emitter as a trap (see game/emitters.ts): its kind and colour as one-click presets (Fire, Blue fire,
// Green fire, Smoke, Steam, Poison smoke, Flame jet from the wall - each a set of the settings above), whether it is on from
// the start or waits for a lever / button / plate, and the harm it does to the crew in its smoke.
export function SmokeTrapFields(p: EditorBarProps) {
  const commit = useContext(CommitContext);
  const smoke = p.smoke;
  if (!smoke) return null;
  const harm = smoke.harm;
  const change = p.onSmokeChange;
  const setHarm = (next: Partial<NonNullable<typeof harm>> | undefined) =>
    change({ harm: next && { ...(harm ?? { damage: 2 }), ...next } });
  return <>
    <Section kind="smoke" section="fireType">
      <span className="text-neutral-400">{t("trap.presetsHint")}</span>
      <div className="flex flex-wrap gap-1">
        {EMITTER_PRESETS.map((id) => (
          <button key={id} type="button" className={`${BUTTON} ${idle}`} title={t(`trap.preset.${id}.title`)}
            onClick={() => change(presetPatch(id, smoke.jetYaw ?? 0) as Parameters<typeof change>[0])}>{t(`trap.preset.${id}`)}</button>
        ))}
      </div>
    </Section>
    <Section kind="smoke" section="trap">
      <label className="flex items-center gap-1" title={t("trap.activeTitle")}>
        <input type="checkbox" checked={smoke.active !== false} onChange={(e) => change({ active: e.target.checked ? undefined : false })} />
        {t("trap.active")}
      </label>
      <label className="flex items-center gap-1" title={t("trap.harmTitle")}>
        <input type="checkbox" checked={!!harm} onChange={(e) => change({ harm: e.target.checked ? { damage: 2 } : undefined })} />
        {t("trap.harm")}
      </label>
      {harm && <>
        <NumberField label={t("trap.damage")} value={harm.damage} min={1} max={99} step={1} defaultValue={2} onChange={(v) => setHarm({ damage: Math.max(1, Math.round(v)) })} onCommit={commit} />
        <NumberField label={t("trap.every")} value={harm.every ?? HARM_DEFAULTS.every} min={0.25} max={60} step={0.25} unit="s" defaultValue={HARM_DEFAULTS.every}
          onChange={(v) => setHarm({ every: v === HARM_DEFAULTS.every ? undefined : v })} onCommit={commit} />
        <NumberField label={t("trap.reach")} value={harm.reach ?? HARM_DEFAULTS.reach} min={0} max={HARM_DEFAULTS.maxReach} step={1} defaultValue={HARM_DEFAULTS.reach} title={t("trap.reachTitle")}
          onChange={(v) => setHarm({ reach: v === HARM_DEFAULTS.reach ? undefined : Math.round(v) })} onCommit={commit} />
        <label className="flex items-center gap-1" title={t("trap.labelTitle")}>
          {t("trap.label")}
          <input type="text" value={harm.label ?? ""} placeholder={t("trap.labelPlaceholder")} onChange={(e) => setHarm({ label: e.target.value || undefined })} className="min-w-0 flex-1 bg-neutral-800 border border-neutral-700 px-1" />
        </label>
      </>}
    </Section>
  </>;
}
