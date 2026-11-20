// The "Dialogues" category of the Asset Manager: local Twee libraries, a problems list and a test window.
import { useEffect, useMemo, useState } from "react";
import { t } from "../i18n";
import { choose, parseTwee, startDialogue, type DialogueState } from "../game/dialogue";
import { getShopIds } from "../game/shopCatalog";
import { dialogueSlug, deleteDialogueDraft, saveDialogueDraft, useDialogueDrafts } from "./dialogueDrafts";

const button = "rounded-sm border border-neutral-700 bg-neutral-800 px-2 py-1 text-left text-neutral-200 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40";
const field = "min-w-0 rounded-sm border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-xs text-neutral-200";

export function DialoguesPanel({ onError, onNotice }: { onError: (text: string) => void; onNotice: (text: string) => void }) {
  const drafts = useDialogueDrafts();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [passage, setPassage] = useState("");
  const [pasteId, setPasteId] = useState("pasted");
  const [pasteText, setPasteText] = useState("");
  const [entry, setEntry] = useState("");
  const [state, setState] = useState<DialogueState>();

  const term = query.trim().toLocaleLowerCase();
  const shown = drafts.filter(d => !term || `${d.name} ${d.id}`.toLocaleLowerCase().includes(term));
  const draft = shown.find(d => d.id === selected) ?? shown[0];
  const parsed = useMemo(() => draft ? parseTwee(draft.twee, draft.id, getShopIds()) : undefined, [draft]);
  const dialogue = parsed?.dialogue;

  // a new library (or a replaced one) restarts the test
  useEffect(() => {
    const first = dialogue?.entries.find(e => e in dialogue.passages) ?? "";
    setEntry(first);
    setState(first && dialogue ? startDialogue(dialogue, first) : undefined);
    setPassage("");
  }, [dialogue]);

  function run(from: string) {
    if (!dialogue || !(from in dialogue.passages)) return;
    setEntry(from);
    setState(startDialogue(dialogue, from));
  }
  const current = dialogue && state ? dialogue.passages[state.passage] : undefined;
  function pick(index: number) {
    if (dialogue && state) setState(choose(dialogue, state, index));
  }
  // keys 1-9 pick a choice (not while typing in a field)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
      if (!dialogue || !state || state.ended) return;
      const next = choose(dialogue, state, +e.key - 1);
      if (next !== state) { e.preventDefault(); setState(next); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dialogue, state]);

  async function importText(id: string, twee: string, fileName?: string) {
    if (drafts.some(d => d.id === id) && !window.confirm(t("dialogue.confirmReplace", { id }))) return;
    const { dialogue: d } = parseTwee(twee, id);
    const name = d.title && d.title !== id ? d.title : fileName?.replace(/\.[^./\\]+$/, "") || id;
    try {
      await saveDialogueDraft({ id, name, twee, updated: Date.now() });
      setSelected(id);
      setQuery("");
      onError("");
    } catch (error) { onError(error instanceof Error ? error.message : String(error)); }
  }
  async function chooseFile(file: File | undefined) {
    if (!file) return;
    let text: string;
    try { text = await file.text(); } catch { onError(t("dialogue.readError")); return; }
    await importText(dialogueSlug(file.name), text, file.name);
  }
  async function remove() {
    if (!draft || !window.confirm(t("dialogue.confirmDelete", { name: draft.name }))) return;
    try { await deleteDialogueDraft(draft.id); onNotice(""); } catch (error) { onError(error instanceof Error ? error.message : String(error)); }
  }

  const selectedPassage = dialogue && passage ? dialogue.passages[passage] : undefined;
  const commandText = (c: string) => {
    if (c.startsWith("shop: ")) return `shop: ${c.slice(6)} (${t("dialogue.wouldShop", { shop: c.slice(6) })})`;
    if (c === "shop") return `shop (${t("dialogue.wouldShopOwn")})`;
    return c;
  };

  return <div className="flex min-h-0 flex-1 gap-2">
    <aside className="flex w-64 shrink-0 flex-col gap-1 overflow-hidden border-r border-neutral-800 pr-2">
      <strong className="text-sm">{t("assetManager.dialogues")}</strong>
      <div className="flex items-center gap-1">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("assetManager.searchAssets")} aria-label={t("assetManager.searchAssets")}
          className="min-w-0 flex-1 rounded-sm border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100"/>
        <label className={button + " shrink-0 cursor-pointer"} title={t("dialogue.import")}>+ {t("assetManager.new")}
          <input type="file" accept=".twee,.tw,.txt,text/plain" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void chooseFile(f); }}/>
        </label>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto">
        {shown.map(d => <button key={d.id} type="button" aria-pressed={draft?.id === d.id} onClick={() => setSelected(d.id)}
          className={"flex w-full items-center gap-2 rounded-sm border px-1 py-1 text-left text-xs " + (draft?.id === d.id ? "border-amber-400 bg-amber-400/10 text-amber-100" : "border-transparent text-neutral-200 hover:bg-neutral-900")}>
          <span className="min-w-0 flex-1 truncate">{d.name}</span>
          <span className="shrink-0 text-neutral-500">{d.id}</span>
          <span role="img" aria-label={t("assetManager.draftTitle")} title={t("assetManager.draftTitle")} className="h-2 w-2 shrink-0 rounded-full bg-yellow-400"/>
        </button>)}
        {!shown.length && <p className="p-2 text-xs text-neutral-500">{drafts.length ? t("assetManager.noAssets") : t("dialogue.none")}</p>}
      </div>
    </aside>

    <main className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <strong>{draft?.name ?? t("dialogue.test")}</strong>
        {dialogue && <>
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">{t("dialogue.entry")}
            <select className={field} value={entry} onChange={e => run(e.target.value)} disabled={!dialogue.entries.length}>
              {dialogue.entries.filter(e => e in dialogue.passages).map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <button type="button" className={button} disabled={!entry} onClick={() => run(entry)}>{t("dialogue.restart")}</button>
        </>}
      </div>
      {!dialogue ? <p className="text-xs text-neutral-500">{t("dialogue.selectOne")}</p>
        : !current || !state ? <p className="text-xs text-neutral-500">{t("dialogue.noEntryToTest")}</p>
        : <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto rounded-sm border border-neutral-800 p-3">
          <div className="text-[11px] text-neutral-500">{current.name}</div>
          <p className="whitespace-pre-wrap text-sm text-neutral-100">{current.text || <span className="text-neutral-500">…</span>}</p>
          {state.log.length > 0 && <div className="flex flex-col gap-0.5 text-[11px] text-yellow-300">
            {state.log.map((c, i) => <span key={i}>{t("dialogue.commandLog", { command: commandText(c) })}</span>)}
          </div>}
          {state.ended ? <p className="text-xs text-neutral-400">{t("dialogue.ended")}</p>
            : <div className="flex flex-col gap-1">
              {current.choices.map((c, i) => <button key={i} type="button" className={button} disabled={!(c.to in dialogue.passages)} onClick={() => pick(i)}>
                {i < 9 && <span className="mr-2 text-neutral-500">{i + 1}</span>}{c.label}
              </button>)}
              {!current.choices.length && <p className="text-xs text-neutral-500">{t("dialogue.noChoices")}</p>}
            </div>}
        </div>}
    </main>

    <aside className="flex w-72 shrink-0 flex-col gap-2 overflow-auto border-l border-neutral-800 pl-2">
      <strong className="text-sm">{t("assetManager.properties")}</strong>
      {draft && dialogue && parsed && <>
        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
          <span className="text-neutral-400">{t("dialogue.name")}</span><span className="truncate" title={draft.name}>{draft.name}</span>
          <span className="text-neutral-400">{t("dialogue.id")}</span><span className="truncate">{draft.id}</span>
          <span className="text-neutral-400">{t("dialogue.entries")}</span>
          <span>{dialogue.entries.length ? dialogue.entries.join(", ") : t("dialogue.noEntries")}</span>
        </div>
        <button type="button" className={button + " self-start"} onClick={() => void remove()}>{t("dialogue.delete")}</button>
        <details open className="rounded border border-neutral-800 p-2">
          <summary className="cursor-pointer font-semibold">{t("dialogue.problems")} ({parsed.problems.length})</summary>
          {parsed.problems.length ? <ul className="mt-1 flex flex-col gap-1 text-xs">
            {parsed.problems.map((p, i) => <li key={i}>
              <button type="button" className={"w-full text-left hover:underline " + (p.severity === "error" ? "text-red-300" : "text-yellow-300")}
                disabled={!p.passage || !(p.passage in dialogue.passages)} onClick={() => p.passage && setPassage(p.passage)}>
                {p.severity === "error" ? "✖" : "▲"} {p.message}
              </button>
            </li>)}
          </ul> : <p className="mt-1 text-xs text-emerald-300">{t("dialogue.noProblems")}</p>}
        </details>
        <details open className="rounded border border-neutral-800 p-2">
          <summary className="cursor-pointer font-semibold">{t("dialogue.passages", { n: Object.keys(dialogue.passages).length })}</summary>
          <div className="mt-1 flex flex-col gap-0.5">
            {Object.values(dialogue.passages).map(p => <button key={p.name} type="button" aria-pressed={passage === p.name} onClick={() => setPassage(p.name)}
              className={"rounded-sm border px-1 py-0.5 text-left text-xs " + (passage === p.name ? "border-amber-400 bg-amber-400/10 text-amber-100" : "border-transparent text-neutral-200 hover:bg-neutral-900")}>
              <span className="block truncate">{p.name}</span>
              <span className="block truncate text-[11px] text-neutral-500">{p.tags.length ? p.tags.join(" ") + " · " : ""}{t("dialogue.choicesCount", { n: p.choices.length })}</span>
            </button>)}
          </div>
          {selectedPassage && <div className="mt-2 flex flex-col gap-1 border-t border-neutral-800 pt-2 text-xs">
            <strong>{selectedPassage.name}</strong>
            <p className="whitespace-pre-wrap text-neutral-300">{selectedPassage.text}</p>
            {selectedPassage.commands.length > 0 && <p className="text-yellow-300">{selectedPassage.commands.map(c => c.kind === "end" ? "@end" : c.kind === "shop" ? "@shop" + (c.shop ? " " + c.shop : "") : c.raw).join(" · ")}</p>}
            <button type="button" className={button + " self-start"} onClick={() => run(selectedPassage.name)}>{t("dialogue.testHere")}</button>
          </div>}
        </details>
      </>}
      <details className="rounded border border-neutral-800 p-2">
        <summary className="cursor-pointer font-semibold">{t("dialogue.paste")}</summary>
        <div className="mt-1 flex flex-col gap-1">
          <p className="text-[11px] text-neutral-400">{t("dialogue.pasteHint")}</p>
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">{t("dialogue.id")}
            <input className={field + " flex-1"} value={pasteId} onChange={e => setPasteId(e.target.value)}/>
          </label>
          <textarea className={field + " h-32 font-mono"} value={pasteText} onChange={e => setPasteText(e.target.value)} spellCheck={false}/>
          <button type="button" className={button + " self-start"} disabled={!pasteText.trim()} onClick={() => void importText(dialogueSlug(pasteId), pasteText).then(() => setPasteText(""))}>{t("dialogue.importPasted")}</button>
        </div>
      </details>
    </aside>
  </div>;
}
