// Autosave of the map being edited: a draft of its JSON per map id in an own
// IndexedDB database, written ~1.5 s after the last edit (and when the page
// is hidden or closed), cleared on save/download/discard, offered back on the
// next visit. Every storage call is guarded: without storage the editor just
// works as before.

import type { MapFile } from "../game/mapFormat";
import { mapFile, onMapChange, savedFile, hasUnsavedEdits } from "./mapStore";
import { fingerprint, MAX_DRAFT_CHARS, planDraft } from "./mapDraftLogic";
import type { MapDraft } from "./mapDraftLogic";

export { fingerprint, planDraft } from "./mapDraftLogic";
export type { MapDraft } from "./mapDraftLogic";

const DB = "voidcrew-map-drafts";
const STORE = "drafts";
const DELAY = 1500;

let opened: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { opened = undefined; reject(request.error); };
    } catch (error) { opened = undefined; reject(error); }
  });
  return opened;
}

async function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? request.error);
    } catch (error) { reject(error); }
  });
}

export async function loadDraft(id: string): Promise<MapDraft | undefined> {
  try { return await run<MapDraft | undefined>("readonly", (s) => s.get(id)); } catch { return undefined; }
}
export async function clearDraft(id: string): Promise<void> {
  cancel(id);
  try { await run("readwrite", (s) => s.delete(id)); } catch { /* storage unavailable */ }
}

async function writeDraft(id: string) {
  const file = mapFile(id);
  const base = savedFile(id);
  if (!file || !base || !hasUnsavedEdits(id)) return;
  try {
    if (JSON.stringify(file).length > MAX_DRAFT_CHARS) return;
    const draft: MapDraft = { id, savedAt: Date.now(), baseFp: fingerprint(base), file };
    await run("readwrite", (s) => s.put(draft));
  } catch { /* storage unavailable or full: no autosave, the editor goes on */ }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function cancel(id: string) {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
}
function schedule(id: string) {
  cancel(id);
  timers.set(id, setTimeout(() => { timers.delete(id); void writeDraft(id); }, DELAY));
}
function flush() {
  for (const id of [...timers.keys()]) { cancel(id); void writeDraft(id); }
}

let started = false;
// Call once: follows the map store's edits.
export function startAutosave() {
  if (started) return;
  started = true;
  onMapChange((id, kind) => {
    if (kind === "edit") {
      if (hasUnsavedEdits(id)) schedule(id); else void clearDraft(id); // (undone back to the saved map)
    } else void clearDraft(id); // saved, downloaded, reverted
  });
  try {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    window.addEventListener("pagehide", flush);
  } catch { /* no DOM */ }
}

export interface DraftFound { id: string; savedAt: number; stale: boolean; file: MapFile }

// A draft worth offering for this map, or nothing. A draft that equals the
// map is deleted on the way.
export async function findDraft(id: string): Promise<DraftFound | null> {
  if (hasUnsavedEdits(id)) return null; // edited already in this session
  const base = savedFile(id);
  if (!base) return null;
  const draft = await loadDraft(id);
  const plan = planDraft(draft, base);
  if (plan.kind === "same") void clearDraft(id);
  if (plan.kind !== "restore" || !draft) return null;
  if (hasUnsavedEdits(id)) return null;
  return { id, savedAt: draft.savedAt, stale: plan.stale, file: draft.file as MapFile };
}
