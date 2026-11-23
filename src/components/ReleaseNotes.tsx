import { useEffect, useState } from "react";
import { CURRENT_RELEASE, pendingReleases, type Release } from "../releaseNotes";

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

export function ReleaseNotes() {
  const [releases, setReleases] = useState<Release[]>(read);
  const close = () => {
    try { localStorage.setItem(SEEN_KEY, String(CURRENT_RELEASE)); } catch { /* private window: it shows again next time */ }
    setReleases([]);
  };

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
  }, [releases]);

  if (!releases.length) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Újdonságok"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-2"
      onPointerDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) close(); }}
      onPointerUp={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <section className="max-h-[85vh] w-[min(32rem,94vw)] overflow-auto rounded-lg border-2 border-neutral-500 bg-neutral-950 p-5 text-left text-sm text-white shadow-2xl">
        <header className="mb-3 flex items-center justify-between border-b border-neutral-700 pb-3">
          <strong>Újdonságok</strong>
          <button type="button" aria-label="Bezár" className="rounded border border-neutral-500 bg-neutral-800 px-3 py-1 text-xs hover:border-amber-400 hover:bg-neutral-700" onClick={close}>×</button>
        </header>
        <div className="flex flex-col gap-4">
          {releases.map(r => (
            <div key={r.version}>
              <div className="mb-1 text-xs text-neutral-400">Verzió {r.version} · {r.date}</div>
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
        <button type="button" className="mt-4 rounded border border-neutral-500 bg-neutral-800 px-4 py-1.5 hover:border-amber-400 hover:bg-neutral-700" onClick={close}>Rendben</button>
      </section>
    </div>
  );
}
