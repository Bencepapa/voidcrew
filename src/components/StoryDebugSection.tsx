import { useState } from "react";
import type { QuestState } from "../game/story/state";
import type { Effect } from "../game/story/storyEngine";
import { removeItem } from "../game/inventory";
import { changeInventory, haulOf } from "../game/inventoryStore";
import { storyDebug, storyDebugSetQuest, storyDebugSetVar, storyJumpToChapter, storyReset, storySave, useStoryRevision } from "../game/story/storyRuntime";
import { t } from "../i18n";

// Starts the story over: the story state is fresh, the test story's items (the `tesztsztori*` ones) leave the
// backpack, and the page reloads so the map's actors and pickups are back where they started.
function restartStory() {
  changeInventory((inv) => {
    let next = inv;
    for (const item of Object.keys(haulOf(inv))) if (item.startsWith("tesztsztori")) next = removeItem(next, item, 9999).inv;
    return next;
  });
  storyReset();
  storySave();
  window.setTimeout(() => window.location.reload(), 150);
}

const QUEST_STATES: QuestState[] = ["none", "active", "ready", "done", "failed", "expired"];
const FIELD = "bg-neutral-800 border border-neutral-700 text-[11px] px-1 py-0.5 rounded-sm";
const LABEL = "text-[10px] font-semibold uppercase tracking-wide text-neutral-400";

// the one-line form of an effect for the scrolling log
function effectLine(e: Effect): string {
  const { kind, ...rest } = e;
  const body = Object.entries(rest).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ");
  return `${kind} ${body}`.trim();
}

function VarRow({ scope, name, value }: { scope: string; name: string; value: number | string | boolean }) {
  const name_ = <span className="truncate text-neutral-300" title={name}>{name}</span>;
  if (typeof value === "boolean") {
    return <label className="flex items-center justify-between gap-2 text-[11px]">{name_}
      <input type="checkbox" checked={value} onChange={(e) => storyDebugSetVar(scope, name, e.target.checked)}/></label>;
  }
  const commit = (raw: string) => {
    const next = typeof value === "number" ? Number(raw) : raw;
    if (typeof next === "number" && !Number.isFinite(next)) return;
    if (next !== value) storyDebugSetVar(scope, name, next);
  };
  return <label className="flex items-center justify-between gap-2 text-[11px]">{name_}
    <input key={String(value)} type={typeof value === "number" ? "number" : "text"} defaultValue={value} className={`${FIELD} w-28`}
      onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit(e.currentTarget.value); }}/></label>;
}

function VarGroup({ title, scope, vars }: { title: string; scope: string; vars: Record<string, number | string | boolean> }) {
  const names = Object.keys(vars);
  if (!names.length) return null;
  return <div className="flex flex-col gap-1">
    <div className={LABEL}>{title}</div>
    {names.map((n) => <VarRow key={n} scope={scope} name={n} value={vars[n]}/>)}
  </div>;
}

// The debug panel's Story section: the active chapter, the variables (editable), quest states, the running
// passage, a jump to any chapter, and the last effects the engine returned.
export function StoryDebugSection() {
  useStoryRevision();
  const d = storyDebug();
  const [target, setTarget] = useState("");
  if (!d) return null;
  const { status, state } = d;
  const jump = target || d.chapters[0] || "";
  const questIds = [...new Set([...d.quests, ...Object.keys(state.quests)])];
  return <>
    <div className="text-[11px]">{status.ended ? t("debug.storyEnded") : t("debug.storyChapter", { chapter: status.chapter ?? "-" })}</div>
    <div className="text-[10px] text-neutral-300">
      {t("debug.storyCanSave", { state: d.canSave ? t("debug.storyCanSaveYes") : t("debug.storyCanSaveNo") })}
    </div>
    <div className="text-[10px] text-neutral-300">
      {status.dialogue ? t("debug.storyDialogue", { npc: status.dialogue.npc, passage: `${status.dialogue.file}/${status.dialogue.passage}` }) : t("debug.storyNoDialogue")}
    </div>
    <div className="flex items-center gap-1">
      <select value={jump} onChange={(e) => setTarget(e.target.value)} className={`${FIELD} flex-1`} aria-label={t("debug.storyJump")}>
        {d.chapters.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button type="button" disabled={!jump} onClick={() => storyJumpToChapter(jump)}
        className="text-[11px] border border-neutral-600 rounded-sm px-2 py-0.5 hover:bg-neutral-800">{t("debug.storyJumpGo")}</button>
    </div>
    <button type="button" onClick={restartStory} title={t("debug.storyRestartTip")}
      className="self-start text-[11px] border border-amber-700 text-amber-200 rounded-sm px-2 py-0.5 hover:bg-neutral-800">{t("debug.storyRestart")}</button>
    <VarGroup title={t("debug.storyCampaignVars")} scope="campaign" vars={state.campaign}/>
    <VarGroup title={t("debug.storyChapterVars")} scope="chapter" vars={state.chapterVars}/>
    {Object.entries(state.globals).map(([file, vars]) =>
      <VarGroup key={file} title={t("debug.storyGlobalVars", { file })} scope={file} vars={vars}/>)}
    {questIds.length > 0 && <div className="flex flex-col gap-1">
      <div className={LABEL}>{t("debug.storyQuests")}</div>
      {questIds.map((id) => <label key={id} className="flex items-center justify-between gap-2 text-[11px]">
        <span className="truncate text-neutral-300" title={id}>{id}</span>
        <select value={state.quests[id] ?? "none"} className={FIELD} onChange={(e) => storyDebugSetQuest(id, e.target.value as QuestState)}>
          {QUEST_STATES.map((s) => <option key={s} value={s}>{s === "none" ? t("debug.storyQuestNone") : s}</option>)}
        </select>
      </label>)}
    </div>}
    <div className={LABEL}>{t("debug.storyLog")}</div>
    <div className="max-h-40 overflow-y-auto rounded-sm border border-neutral-800 bg-black/30 p-1 font-mono text-[10px] text-neutral-300">
      {d.log.length === 0 && <div>{t("debug.storyLogEmpty")}</div>}
      {[...d.log].reverse().map((e, i) => <div key={i} className={e.kind === "error" ? "text-red-400" : "break-words"}>{effectLine(e)}</div>)}
    </div>
  </>;
}
