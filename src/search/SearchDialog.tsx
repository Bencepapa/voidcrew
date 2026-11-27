import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DIALOG_BUTTON, DIALOG_INPUT } from "../editor/Dialog";
import { neutralStyle } from "../editor/inspector/parts";
import { t, useLang } from "../i18n";
import { rememberSearch, type SearchHistoryEntry } from "./history";
import { navigate } from "./openers";
import { isSearchShortcut, setSearchKeyHandler } from "./searchKeyboard";
import { buildSearchIndex } from "./searchIndex";
import { findSearchTarget, SEARCH_TARGETS, type SearchTarget } from "./targets";

interface SearchDialogProps {
  world: SearchTarget["world"];
  history: readonly SearchHistoryEntry[];
  onHistoryChange: (history: SearchHistoryEntry[]) => void;
  onClose: () => void;
}

export function SearchDialog({ world, history, onHistoryChange, onClose }: SearchDialogProps) {
  const lang = useLang();
  const index = useMemo(() => buildSearchIndex(SEARCH_TARGETS, target => t(target.titleKey)), [lang]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [missing, setMissing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searching = !!query.trim();
  const rows = searching
    ? index.query(query, world).map(target => ({ target, query }))
    : history.flatMap(entry => {
      const target = findSearchTarget(entry.targetId);
      return target ? [{ target, query: entry.query }] : [];
    });
  const active = Math.min(selected, rows.length - 1);
  const selectedId = active >= 0 ? `${listId}-${active}` : undefined;

  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    input.current?.focus();
    return () => element.close();
  }, []);

  useEffect(() => {
    if (selectedId) document.getElementById(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function close() {
    dialog.current?.close();
    onClose();
  }

  // the dialog's own keys; main.tsx's text-field guard hands them over (see searchKeyboard.ts)
  function onKey(e: { key: string; isComposing: boolean; preventDefault(): void }) {
    if (e.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (!rows.length) {
      return;
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setSelected((active + step + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      void choose(active);
    }
  }
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  useEffect(() => setSearchKeyHandler(e => onKeyRef.current(e)), []);

  async function choose(index: number) {
    const row = rows[index];
    const element = dialog.current;
    if (!row || !element?.open) return;
    element.close();
    const found = await navigate(row.target.id);
    if (!element.isConnected) return;
    if (found) {
      onHistoryChange(rememberSearch(history, { query: row.query, targetId: row.target.id }));
      onClose();
    } else {
      setMissing(true);
      element.showModal();
      input.current?.focus();
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      data-editor-search-dialog
      aria-label={t("editorSearch.title")}
      aria-modal="true"
      style={neutralStyle}
      className="fixed inset-0 m-auto w-[min(34rem,94vw)] max-w-none rounded-lg border border-neutral-500 bg-neutral-950 p-4 text-sm text-white shadow-2xl backdrop:bg-black/70"
      onCancel={e => { e.preventDefault(); close(); }}
      // (a portal's React events bubble up the component tree: keep the view's mouselook from capturing the pointer)
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === "Escape" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          close();
        }
        if (isSearchShortcut(e)) e.preventDefault();
      }}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <strong>{t("editorSearch.title")}</strong>
        <button type="button" className={DIALOG_BUTTON} aria-label={t("dialog.close")} onClick={close}>×</button>
      </header>
      <input
        ref={input}
        role="combobox"
        aria-autocomplete="list"
        aria-label={t("editorSearch.query")}
        aria-expanded={rows.length > 0}
        aria-controls={listId}
        aria-activedescendant={selectedId}
        className={DIALOG_INPUT}
        value={query}
        onChange={e => { setQuery(e.target.value); setSelected(0); setMissing(false); }}
        onKeyDown={e => { if (e.key !== "Escape") onKey({ key: e.key, isComposing: e.nativeEvent.isComposing, preventDefault: () => e.preventDefault() }); }}
      />
      {!searching && rows.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-neutral-300">
          <span>{t("editorSearch.recent")}</span>
          <button type="button" className={DIALOG_BUTTON} onClick={() => { onHistoryChange([]); setSelected(0); input.current?.focus(); }}>{t("editorSearch.clearHistory")}</button>
        </div>
      )}
      <ul id={listId} role="listbox" aria-label={t(searching ? "editorSearch.results" : "editorSearch.recent")} className="mt-2 max-h-[45vh] overflow-auto">
        {rows.map((row, i) => (
          <li
            key={searching ? row.target.id : `${row.query}:${row.target.id}`}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 rounded px-2 py-1.5 hover:bg-neutral-800 aria-selected:bg-amber-900/60 aria-selected:text-amber-100"
            onMouseDown={e => e.preventDefault()}
            onClick={() => void choose(i)}
          >
            <span>{t(row.target.titleKey)}</span>
            {!searching && <span className="break-all text-xs text-neutral-400">{row.query}</span>}
          </li>
        ))}
      </ul>
      {missing && <p className="mt-2 text-amber-200" role="status">{t("editorSearch.unavailable")}</p>}
      {!rows.length && <p className="mt-2 text-neutral-400" role="status">{t(searching ? "editorSearch.noResults" : "editorSearch.empty")}</p>}
    </dialog>,
    document.body,
  );
}
