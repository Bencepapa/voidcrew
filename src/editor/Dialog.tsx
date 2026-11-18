import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { t } from "../i18n";
import { neutralStyle } from "./inspector/parts";

// The editor's own modal dialog (instead of Chrome's prompt / confirm / alert):
// a dark panel over a dimmed page. Escape and a click outside close it; keys
// typed inside don't reach the editor's shortcuts.
export const DIALOG_BUTTON = "rounded border border-neutral-500 bg-neutral-800 px-3 py-1 text-xs text-white hover:border-amber-400 hover:bg-neutral-700 disabled:opacity-40 disabled:hover:border-neutral-500";
export const DIALOG_PRIMARY = "rounded border border-amber-500 bg-amber-700 px-3 py-1 text-xs text-white hover:bg-amber-600 disabled:opacity-40 disabled:hover:bg-amber-700";
export const DIALOG_INPUT = "w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-white focus:border-amber-400 focus:outline-none";

export function Dialog({ title, onClose, children, width = "26rem" }: { title: string; onClose: () => void; children: ReactNode; width?: string }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    // (the first field takes the keyboard)
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea");
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-2"
      style={neutralStyle}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <section ref={panel} style={{ width: `min(${width},94vw)` }} className="max-h-[85vh] overflow-auto rounded-lg border-2 border-neutral-500 bg-neutral-950 p-5 text-left text-sm text-white shadow-2xl">
        <header className="mb-4 flex items-center justify-between border-b border-neutral-700 pb-3">
          <strong>{title}</strong>
          <button type="button" aria-label={t("dialog.close")} className={DIALOG_BUTTON} onClick={onClose}>×</button>
        </header>
        {children}
      </section>
    </div>
  );
}

// A question with two answers (instead of window.confirm)
export function ConfirmDialog({ title, message, yes, no, onYes, onNo }: { title: string; message: string; yes: string; no: string; onYes: () => void; onNo: () => void }) {
  return (
    <Dialog title={title} onClose={onNo}>
      <p className="mb-4 whitespace-pre-line">{message}</p>
      <div className="flex justify-end gap-2">
        <button type="button" className={DIALOG_BUTTON} onClick={onNo}>{no}</button>
        <button type="button" className={DIALOG_PRIMARY} onClick={onYes}>{yes}</button>
      </div>
    </Dialog>
  );
}
