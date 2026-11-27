import { useCallback, useEffect, useState } from "react";
import {
  clearSharedCache,
  setSharedServiceWorkerSwitch,
  sharedCacheStatus,
  subscribeSharedServiceWorker,
  type SharedCacheStatus,
} from "../editor/sharedServiceWorker";
import { formatNumber, t, type Key } from "../i18n";
import { searchAnchor } from "../search/searchAnchor";

const BUTTON = "text-[11px] border border-neutral-600 rounded-sm px-2 py-1 hover:bg-neutral-800 text-left";

function stateKey(s: SharedCacheStatus): Key {
  if (!s.available) return "debug.swStateUnavailable";
  if (!s.enabled) return "debug.swStateOff";
  if (!s.registered) return "debug.swStateNone";
  return s.controlling ? "debug.swStateActive" : "debug.swStateWaiting";
}

// The Debug panel's row for the shared-file service worker (public/sw.js): status, on/off, clearing its cache.
export function SharedCacheDebugSection() {
  const [status, setStatus] = useState<SharedCacheStatus | null>(null);
  const refresh = useCallback(() => void sharedCacheStatus().then(setStatus).catch(() => {}), []);
  useEffect(() => {
    refresh();
    return subscribeSharedServiceWorker(refresh);
  }, [refresh]);

  if (!status) return null;
  const mb = formatNumber(status.bytes / 1048576, 1);
  return (
    <>
      <div className="text-[10px] text-neutral-300">{t("debug.swHint")}</div>
      <label className="flex items-center gap-2 text-[11px] cursor-pointer">
        <input
          type="checkbox"
          {...searchAnchor("debug.sw.enabled")}
          checked={status.enabled}
          disabled={!status.available}
          onChange={(e) => void setSharedServiceWorkerSwitch(e.target.checked).then(refresh)}
        />
        {t("debug.swEnabled")}
      </label>
      <div className="text-[10px] text-neutral-300">{t("debug.swState", { state: t(stateKey(status)) })}</div>
      <div className="text-[10px] text-neutral-300">{t("debug.swEntries", { n: status.entries, size: mb })}</div>
      <div className="flex gap-1">
        <button type="button" {...searchAnchor("debug.sw.clear")} className={BUTTON} onClick={() => void clearSharedCache().then(refresh)}>{t("debug.swClear")}</button>
        <button type="button" {...searchAnchor("debug.sw.refresh")} className={BUTTON} onClick={refresh}>{t("debug.swRefresh")}</button>
      </div>
    </>
  );
}
