import { useId, useState } from "react";
import { t, type Key } from "../../i18n";
import { patchPropLock, type PropLock } from "../../game/propLocks";
import type { PropLockInfo } from "../lockEdits";
import { BUTTON, idle } from "./parts";

// The lock block of a container, lever or button in the Inspector (see game/propLocks.ts): locked or not, the key (a
// flag: chosen from what the map offers, or typed), what it says while shut, and whether the key is used up. "Create a key
// for this lock" names a fresh key flag - the item that carries it is put on the map by hand (its panel's key flag).

export function LockFields({ info, onChange }: { info: PropLockInfo; onChange: (lock: PropLock | undefined) => void }) {
  const list = useId();
  const [created, setCreated] = useState<string | null>(null);
  const { lock } = info;
  const patch = (next: Partial<PropLock>) => onChange(patchPropLock(lock, next));
  return <div className="flex min-w-0 flex-col gap-2 border border-neutral-700 p-1" data-lock={lock ? "on" : "off"}>
    <strong className="text-neutral-200">{t("lock.title")}</strong>
    <label className="flex items-center gap-1" title={t("lock.onTitle")}>
      <input type="checkbox" checked={!!lock} onChange={(e) => { setCreated(null); onChange(e.target.checked ? {} : undefined); }}/>
      {t("lock.on")}
    </label>
    {lock && <>
      <label className="flex items-center gap-1" title={t("lock.keyTitle")}>
        {t("lock.key")}
        <datalist id={list}>{info.keys.map((k) => <option key={k.flag} value={k.flag}>{`${k.name ? `${k.name}, ` : ""}${t(`lock.from.${k.from}` as Key)}`}</option>)}</datalist>
        <input type="text" list={list} value={lock.key ?? ""} placeholder={t("lock.keyNone")} onChange={(e) => patch({ key: e.target.value.trim() || undefined })}/>
      </label>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={`${BUTTON} ${idle}`} title={t("lock.createTitle")} onClick={() => { setCreated(info.suggested); patch({ key: info.suggested }); }}>{t("lock.create")}</button>
      </div>
      {created && lock.key === created && <span className="text-neutral-400">{t("lock.created", { flag: created })}</span>}
      {!lock.key && <span className="text-amber-300">{t("lock.noKey")}</span>}
      {info.nobody && <span className="text-amber-300">{t("lock.nobody")}</span>}
      <label className="flex items-center gap-1" title={t("lock.messageTitle")}>
        {t("lock.message")}
        <input type="text" value={lock.message ?? ""} placeholder={t("lock.locked")} onChange={(e) => patch({ message: e.target.value || undefined })}/>
      </label>
      <label className="flex items-center gap-1" title={t("lock.consumeTitle")}>
        <input type="checkbox" checked={lock.consumeKey === true} onChange={(e) => patch({ consumeKey: e.target.checked || undefined })}/>
        {t("lock.consume")}
      </label>
    </>}
  </div>;
}
