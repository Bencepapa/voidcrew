import { useCallback, useEffect, useState } from "react";
import { CURRENT_RELEASE, RELEASES, pendingReleases, type Release } from "../releaseNotes";
import { t } from "../i18n";

// "Újdonságok": shown once after an update, to a user whose last seen version is lower than the current one (see
// src/releaseNotes.ts). Closing it (button, Escape, click outside) stores the current version.

const SEEN_KEY = "voidcrew-release-seen";
const META_KEY = "voidcrew-meta-v1";

function read(): Release[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const stored = raw === null ? undefined : Number(raw);
    const returning = localStorage.getItem(META_KEY) !== null;
    const list = pendingReleases(stored !== undefined && Number.isFinite(stored) ? stored : undefined, returning);
    // a brand-new user: mark as up to date silently
    if (stored === undefined && !returning) localStorage.setItem(SEEN_KEY, String(CURRENT_RELEASE));
    return list;
  } catch {
    return [];
  }
}

export function useReleaseNotes() {
  const [pending, setPending] = useState(read);
  const [archive, setArchive] = useState(false);
  const openArchive = useCallback(() => setArchive(true), []);
  const close = useCallback(() => {
    if (pending.length) {
      try { localStorage.setItem(SEEN_KEY, String(CURRENT_RELEASE)); } catch { /* Storage is optional. */ }
      setPending([]);
    }
    setArchive(false);
  }, [pending]);
  return {
    archive,
    releases: archive ? RELEASES : pending,
    openArchive,
    close,
  };
}

export function ReleaseNotes({ releases, archive, openArchive, close }: ReturnType<typeof useReleaseNotes>) {
  const title = t(archive ? "app.releaseArchive" : "app.releaseNew");

  useEffect(() => {
    if (!releases.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [releases, close]);

  if (!releases.length) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-2"
      onPointerDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) close(); }}
      onPointerUp={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key !== "Tab") return;
        const buttons = e.currentTarget.querySelectorAll("button");
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (document.activeElement === (e.shiftKey ? first : last) || !e.currentTarget.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        }
      }}
    >
      <section className="max-h-[85vh] w-[min(32rem,94vw)] overflow-auto rounded-lg border-2 border-neutral-500 bg-neutral-950 p-5 text-left text-sm text-white shadow-2xl">
        <header className="mb-3 flex items-center justify-between border-b border-neutral-700 pb-3">
          <strong>{title}</strong>
          <button type="button" autoFocus aria-label={t("app.releaseClose")} className="rounded border border-neutral-500 bg-neutral-800 px-3 py-1 text-xs hover:border-amber-400 hover:bg-neutral-700" onClick={close}>×</button>
        </header>
        <div className="flex flex-col gap-4">
          {releases.map(r => (
            <div key={r.version}>
              <h2 className="mb-1 text-xs text-neutral-400">{t("app.releaseVersion", { version: r.version })} · {r.date}</h2>
              <ul className="flex flex-col gap-2">
                {r.items.map(it => (
                  <li key={it.title}>
                    <div className="font-semibold">{it.title}</div>
                    <div className="text-neutral-300">{it.text}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <footer className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="rounded border border-neutral-500 bg-neutral-800 px-4 py-1.5 hover:border-amber-400 hover:bg-neutral-700" onClick={close}>{t("app.releaseDone")}</button>
          {!archive && <button type="button" className="rounded border border-neutral-500 px-4 py-1.5 hover:border-amber-400" onClick={e => {
            e.currentTarget.closest("[role=dialog]")?.querySelector("button")?.focus();
            openArchive();
          }}>{t("app.releaseArchive")}</button>}
        </footer>
      </section>
    </div>
  );
}
