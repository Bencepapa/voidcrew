import { t, type Key } from "../i18n";
import type { Vec2 } from "../game/types";
import type { Problem } from "./validate";

interface ProblemsPanelProps {
  // Optional: validation results for the current map; defaults to an empty list.
  problems?: readonly Problem[];
  // Optional: focus the editor on the problem cell when a row is clicked.
  onGoto?: (cell: Vec2) => void;
  // Optional: apply the corresponding pure map-file repair as one undoable edit.
  onFix?: (code: "inWall" | "duplicate") => void;
}
export function ProblemsPanel({ problems = [], onGoto, onFix }: ProblemsPanelProps) {
  return <section className="bg-neutral-950 text-neutral-300 text-xs border border-neutral-700 p-2">
    <h2 className="font-semibold mb-1">{t("minimap.problems", { count: problems.length })}</h2>
    {onFix && <div className="flex flex-wrap gap-2 mb-2">
      {problems.some(p=>p.code.startsWith("inWall.") && p.code!=="inWall.start") && <button className="border border-neutral-500 rounded px-2 py-1" onClick={()=>onFix("inWall")}>{t("minimap.removeInWall")}</button>}
      {problems.some(p=>p.code==="duplicate") && <button className="border border-neutral-500 rounded px-2 py-1" onClick={()=>onFix("duplicate")}>{t("minimap.removeDuplicates")}</button>}
      <p>{t("minimap.repairHelp")}</p>
    </div>}
    {problems.length === 0 ? <p>{t("minimap.noProblems")}</p> : <ul className="max-h-64 overflow-auto">{problems.map((p, i) => <li key={`${p.code}-${i}`}>
      <button type="button" disabled={!p.cell || !onGoto} onClick={() => p.cell && onGoto?.(p.cell)} className={`text-left w-full py-1 disabled:opacity-100 ${p.severity === "error" ? "text-red-400" : "text-amber-400"}`}>
        {t(p.key as Key, Object.fromEntries(Object.entries(p.params ?? {}).map(([k, v]) => [k, ["kind", "surface", "relation"].includes(k) ? t((v === "floor" || v === "ceiling" ? `minimap.${v}` : `minimap.value.${v}`) as Key) : v])))}{p.cell && ` (${p.cell.x}, ${p.cell.y})`}
      </button>
    </li>)}</ul>}
  </section>;
}
