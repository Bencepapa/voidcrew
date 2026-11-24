import { useContext, useEffect } from "react";
import { t } from "../../i18n";
import { OPERABLE_DEFAULTS, facingOf, type OperableSpec, type OperableTarget } from "../../game/operables";
import { NumberField } from "../NumberField";
import { cleanSpec, type OperableInfo, type SourceRef } from "../operableEdits";
import { operableLink, useOperableLink } from "../operableLink";
import { BUTTON, CommitContext, KindChoice, active, idle } from "./parts";

// The operable props' settings in the Inspector (see game/operables.ts): what a lever, button, pressure plate, trap cell
// or wall trap does, the targets it works (listed, with a link mode to add one by clicking it in the view) and a wall
// trap's shot.

const same = (a: SourceRef | null, b: SourceRef) => !!a && a.from === b.from && a.index === b.index;

export function OperableFields({ info, onChange }: {
  info: OperableInfo;
  onChange: (spec: OperableSpec | undefined) => void;
}) {
  const commit = useContext(CommitContext);
  const { kind, spec, source } = info;
  const linking = same(useOperableLink(), source);
  const patch = (next: Partial<OperableSpec>) => onChange(cleanSpec({ ...spec, ...next }));
  // (link mode ends with Esc, and when the panel goes away)
  useEffect(() => {
    if (!linking) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      operableLink.cancel();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [linking]);
  useEffect(() => () => {
    if (same(operableLink.get(), source)) operableLink.cancel();
  }, [source.from, source.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const targets = spec.targets ?? [];
  const setTarget = (i: number, next: OperableTarget) => patch({ targets: targets.map((x, j) => (j === i ? next : x)) });
  const projectile = spec.projectile ?? info.projectile ?? "arrow";
  const number = (label: string, value: number, min: number, max: number, step: number, unit: string | undefined, set: (v: number) => void, title?: string) =>
    <NumberField label={label} title={title} value={value} min={min} max={max} step={step} unit={unit} defaultValue={value} onChange={set} onCommit={commit}/>;
  const momentary = kind === "button" && spec.mode === "momentary";

  return <div className="flex min-w-0 flex-col gap-2 border border-neutral-700 p-1" data-operable={kind}>
    <strong className="text-neutral-200">{t("operable.title")}: {t(`operable.kind.${kind}`)}</strong>

    {kind === "button" && <KindChoice label={t("operable.mode")} value={spec.mode ?? "toggle"} options={[
      { value: "toggle", label: t("operable.mode.toggle") },
      { value: "momentary", label: t("operable.mode.momentary") },
    ]} onChange={(mode) => patch({ mode: mode === "momentary" ? "momentary" : undefined })}/>}
    {momentary && number(t("operable.delay"), spec.delay ?? OPERABLE_DEFAULTS.delay, 0.5, 60, 0.5, "s", (v) => patch({ delay: v === OPERABLE_DEFAULTS.delay ? undefined : v }))}
    {(kind === "plate" || momentary) && <label className="flex items-center gap-1" title={t("operable.holdTitle")}>
      <input type="checkbox" checked={spec.hold !== false} onChange={(e) => patch({ hold: e.target.checked ? undefined : false })}/>
      {t("operable.hold")}
    </label>}
    {kind === "trapcell" && <label className="flex items-center gap-1">
      <input type="checkbox" checked={spec.once === true} onChange={(e) => patch({ once: e.target.checked || undefined })}/>
      {t("operable.once")}
    </label>}

    {kind === "emitter" && <>
      <span className="text-neutral-400">{t("operable.facing", { side: facingOf(info.at, info.rotation) })}</span>
      <KindChoice label={t("operable.projectile")} value={projectile} options={[
        { value: "arrow", label: t("operable.projectile.arrow") },
        { value: "spell", label: t("operable.projectile.spell") },
      ]} onChange={(p) => patch({ projectile: p === info.projectile ? undefined : (p as "arrow" | "spell"), damage: undefined })}/>
      {number(t("operable.damage"), spec.damage ?? OPERABLE_DEFAULTS.damage[projectile], 0, 99, 1, undefined, (v) => patch({ damage: v === OPERABLE_DEFAULTS.damage[projectile] ? undefined : v }))}
      {number(t("operable.range"), spec.range ?? OPERABLE_DEFAULTS.range, 1, 30, 1, undefined, (v) => patch({ range: v === OPERABLE_DEFAULTS.range ? undefined : v }))}
      {number(t("operable.cooldown"), spec.cooldown ?? OPERABLE_DEFAULTS.cooldown, 0, 30, 0.5, "s", (v) => patch({ cooldown: v === OPERABLE_DEFAULTS.cooldown ? undefined : v }))}
    </>}

    {kind !== "emitter" && <>
      <label className="flex items-center gap-1" title={t("operable.flagTitle")}>
        {t("operable.flag")}
        <input type="text" value={spec.flag ?? ""} placeholder="-" onChange={(e) => patch({ flag: e.target.value.trim() || undefined })} className="min-w-0 flex-1 bg-neutral-800 border border-neutral-700 px-1"/>
      </label>
      <strong className="text-neutral-300">{t("operable.targets")}</strong>
      {!targets.length && <span className="text-neutral-500">{t("operable.noTargets")}</span>}
      {targets.map((target, i) => <div key={`${i}:${target.kind}:${target.x},${target.y}`} className="flex min-w-0 flex-wrap items-center gap-1 border-t border-neutral-800 pt-1">
        <span className="text-neutral-200">{target.kind === "door"
          ? t("operable.target.door", { x: target.x, y: target.y })
          : t("operable.target.trap", { x: target.x, y: target.y, side: target.side ? ` ${target.side}` : "" })}</span>
        {target.kind === "door" && <>
          <KindChoice value={target.action ?? "open"} options={(["open", "close", "toggle"] as const).map((a) => ({ value: a, label: t(`operable.action.${a}`) }))}
            onChange={(action) => setTarget(i, { ...target, action: action === "open" ? undefined : (action as "close" | "toggle") })}/>
          <label className="flex items-center gap-1" title={t("operable.forceTitle")}>
            <input type="checkbox" checked={target.force === true} onChange={(e) => setTarget(i, { ...target, force: e.target.checked || undefined })}/>
            {t("operable.force")}
          </label>
        </>}
        <button type="button" className={`${BUTTON} ${idle}`} onClick={() => patch({ targets: targets.filter((_, j) => j !== i) })}>{t("operable.removeTarget")}</button>
      </div>)}
      <button type="button" className={`${BUTTON} ${linking ? active : idle}`} onClick={() => (linking ? operableLink.cancel() : operableLink.start(source))}>
        {linking ? t("operable.link.done") : t("operable.link.start")}
      </button>
      {linking && <span className="text-amber-200">{t("operable.link.active")}</span>}
    </>}
  </div>;
}
