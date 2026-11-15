import { useState } from "react";
import type { LogEntry } from "../game/useGameState";
import { t } from "../i18n";
import { KIND_COLOR } from "../components/LogPanel";

export function EditorStatusBar({log, mapName, unsaved, tool}: {log: LogEntry[]; mapName: string; unsaved: boolean; tool: string}) {
  const [history, setHistory] = useState(false);
  const latest = log[log.length - 1];
  return <footer className="relative shrink-0 border border-neutral-700 bg-neutral-950 p-2 text-xs text-neutral-200">
    {history && <section aria-label={t("editorShell.history")} className="absolute bottom-full left-0 right-0 z-40 mb-1 flex max-h-[40vh] flex-col overflow-auto border border-neutral-600 bg-neutral-950 p-3 shadow-xl">
      <div className="flex items-center justify-between"><strong>{t("editorShell.history")}</strong><button aria-label={t("editorShell.history")} className="px-3 py-1" onClick={()=>setHistory(false)}>×</button></div>
      {log.map(entry=><p key={entry.id} className={KIND_COLOR[entry.kind ?? "info"]}>{entry.text}</p>)}
    </section>}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <strong>{mapName}</strong><span>{tool}</span><span className={unsaved?"text-amber-300":"text-green-400"}>{t(unsaved?"editorShell.unsaved":"editorShell.saved")}</span>
      <button className={`min-w-0 flex-1 truncate text-left hover:text-white ${KIND_COLOR[latest?.kind ?? "info"]}`} onClick={()=>setHistory(!history)} aria-expanded={history} title={t("editorShell.history")}>{latest?.text ?? t("editorShell.ready")} ▴</button>
    </div>
    <p className="mt-1 text-neutral-400">{t("editorShell.shortcuts")}</p>
  </footer>;
}
