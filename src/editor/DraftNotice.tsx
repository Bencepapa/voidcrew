import { useEffect, useRef, useState } from "react";
import type { GameMap } from "../game/types";
import { t } from "../i18n";
import { anyUnsavedEdits, restoreFile, revertToSaved } from "./mapStore";
import { clearDraft, findDraft, startAutosave } from "./mapDrafts";

interface Notice { id: string; savedAt: number; stale: boolean }

// Autosave glue for the app: starts the autosave, offers a stored draft when a
// map is opened, warns before the tab closes with unsaved edits. Returns the
// notice to render (null when there is none).
export function useMapDrafts(
  mapId: string,
  replaceMap: (m: GameMap) => void,
  changed: () => void,
  pushLog: (text: string, kind?: "editor") => void,
) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const api = useRef({ replaceMap, changed, pushLog });
  api.current = { replaceMap, changed, pushLog };

  useEffect(() => {
    startAutosave();
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!anyUnsavedEdits()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  useEffect(() => {
    let live = true;
    setNotice(null);
    void findDraft(mapId).then((found) => {
      if (!live || !found) return;
      const result = restoreFile(mapId, found.file);
      if ("error" in result) { void clearDraft(mapId); return; }
      api.current.replaceMap(result.map);
      api.current.changed();
      const time = new Date(found.savedAt).toLocaleString();
      api.current.pushLog(t("editorShell.draft.restored", { time }) + (found.stale ? " " + t("editorShell.draft.baseChanged") : ""), "editor");
      setNotice({ id: mapId, savedAt: found.savedAt, stale: found.stale });
    });
    return () => { live = false; };
  }, [mapId]);

  const discard = () => {
    const map = revertToSaved(mapId);
    void clearDraft(mapId);
    if (map) api.current.replaceMap(map);
    api.current.changed();
    setNotice(null);
  };

  if (!notice || notice.id !== mapId) return null;
  return (
    <div role="status" className="fixed left-1/2 top-3 z-50 flex max-w-[94vw] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-1 rounded border border-amber-400 bg-neutral-950 px-3 py-2 text-xs text-amber-200 shadow-xl">
      <span>
        {t("editorShell.draft.restored", { time: new Date(notice.savedAt).toLocaleString() })}
        {notice.stale && <strong className="ml-2 text-red-300">{t("editorShell.draft.baseChanged")}</strong>}
      </span>
      <button className="rounded border border-neutral-500 px-2 py-0.5 hover:text-white" onClick={discard}>{t("editorShell.draft.discard")}</button>
      <button className="rounded border border-neutral-500 px-2 py-0.5 hover:text-white" onClick={() => setNotice(null)}>{t("editorShell.draft.keep")}</button>
    </div>
  );
}
