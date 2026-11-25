import { useContext, useState } from "react";
import { getLang, t, type Key } from "../../i18n";
import {
  GRADE_LIMITS,
  IDENTITY_GRADE,
  LOOK_PRESETS,
  presetGrade,
  swatchesCss,
  type GradeKey,
  type LookPresetId,
} from "../../render/colorGrade";
import {
  effectiveGrade,
  effectiveStrength,
  lookToText,
  parseLookText,
  withGradeValue,
  withPreset,
  withStrength,
  withoutGradeChanges,
  type LookSpec,
} from "../../game/look";
import { NumberField } from "../NumberField";
import { BUTTON, CommitContext, KindChoice, idle } from "./parts";

// The map settings' "Színvilág" fields (see game/look.ts): a preset, its strength, the grade's own
// sliders under "Haladó", a before / after colour strip, copy / paste of the look as text, and a
// display-only switch that turns the look off for a comparison. The look lives in MapFile.look.

const GROUPS: { title: Key; keys: GradeKey[] }[] = [
  { title: "look.group.balance", keys: ["temperature", "tint"] },
  { title: "look.group.tone", keys: ["exposure", "contrast", "saturation", "shadows", "highlights"] },
  { title: "look.group.toning", keys: ["shadowHue", "shadowAmount", "highlightHue", "highlightAmount"] },
];

interface Props {
  value: LookSpec | undefined;
  // the map's look changed (undefined: no look of its own); `merge` joins a drag's edits into one undo step
  onChange: (look: LookSpec | undefined, merge?: string) => void;
  // the display-only switch (never saved)
  viewOff: boolean;
  onViewOff: (off: boolean) => void;
}

export function LookFields({ value, onChange, viewOff, onViewOff }: Props) {
  const commit = useContext(CommitContext);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const lang = getLang();
  const grade = effectiveGrade(value);
  const base = presetGrade(value?.preset);
  const changed = !!value?.grade;

  const copy = async () => {
    const text = lookToText(value);
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ ok: true, text: t("look.copied") });
    } catch {
      // (no clipboard here: the text is shown to be copied by hand)
      window.prompt(t("look.copyPrompt"), text);
      setMessage(null);
    }
  };

  const paste = async () => {
    let text: string | null;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = window.prompt(t("look.pastePrompt"));
    }
    if (text === null) return;
    const parsed = parseLookText(text);
    if (!parsed.ok) {
      setMessage({ ok: false, text: t(parsed.reason === "empty" ? "look.pasteEmpty" : parsed.reason === "json" ? "look.pasteJson" : "look.pasteFormat") });
      return;
    }
    onChange(parsed.look);
    commit();
    setMessage({ ok: true, text: t("look.pasted") });
  };

  const before = swatchesCss(IDENTITY_GRADE);
  const after = swatchesCss(grade);

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-sm border border-neutral-700 p-2">
      <div className="text-neutral-200" title={t("look.hint")}>{t("look.section")}</div>
      <KindChoice
        label={t("look.preset")}
        title={t("look.hint")}
        value={value ? value.preset ?? "none" : ""}
        options={[
          { value: "", label: t("look.presetDefault") },
          ...LOOK_PRESETS.map((preset) => ({ value: preset.id, label: preset.name[lang] })),
        ]}
        onChange={(next) => onChange(next === "" ? undefined : withPreset(value, next as LookPresetId))}
      />
      {value && (
        <>
          <NumberField
            label={t("look.strength")}
            title={t("look.strengthHint")}
            value={effectiveStrength(value)}
            min={0}
            max={1}
            step={0.01}
            defaultValue={1}
            slider
            onChange={(v) => onChange(withStrength(value, v), "look")}
            onCommit={commit}
          />
          <div className="flex flex-col gap-0.5" title={t("look.preview")}>
            <div className="flex h-3 overflow-hidden rounded-sm border border-neutral-700">
              {before.map((color, i) => <span key={i} className="flex-1" style={{ background: color }} />)}
            </div>
            <div className="flex h-3 overflow-hidden rounded-sm border border-neutral-700">
              {after.map((color, i) => <span key={i} className="flex-1" style={{ background: color }} />)}
            </div>
          </div>
          <details className="border-t border-neutral-700 pt-1">
            <summary className="cursor-pointer select-none text-neutral-300">{t("look.advanced")}</summary>
            <div className="mt-1 flex flex-col gap-2">
              {GROUPS.map((group) => (
                <div key={group.title} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-neutral-400">{t(group.title)}</span>
                  {group.keys.map((key) => {
                    const limit = GRADE_LIMITS[key];
                    return (
                      <NumberField
                        key={key}
                        label={t(`look.grade.${key}` as Key)}
                        value={grade[key]}
                        min={limit.min}
                        max={limit.max}
                        step={limit.step}
                        defaultValue={base[key]}
                        unit={key.endsWith("Hue") ? "°" : undefined}
                        slider
                        onChange={(v) => onChange(withGradeValue(value, key, v), "look")}
                        onCommit={commit}
                      />
                    );
                  })}
                </div>
              ))}
              <button
                type="button"
                className={`${BUTTON} ${idle} self-start`}
                title={t("look.resetHint")}
                disabled={!changed}
                onClick={() => { onChange(withoutGradeChanges(value)); commit(); }}
              >
                {t("look.reset")}
              </button>
            </div>
          </details>
        </>
      )}
      <div className="flex flex-wrap gap-1">
        <button type="button" className={`${BUTTON} ${idle}`} disabled={!value} onClick={copy}>{t("look.copy")}</button>
        <button type="button" className={`${BUTTON} ${idle}`} onClick={paste}>{t("look.paste")}</button>
      </div>
      {message && <div className={message.ok ? "text-neutral-400" : "text-amber-300"} role="status">{message.text}</div>}
      <label className="flex items-center gap-1" title={t("look.viewOffHint")}>
        <input type="checkbox" checked={viewOff} onChange={(e) => onViewOff(e.target.checked)} />
        {t("look.viewOff")}
      </label>
    </div>
  );
}
