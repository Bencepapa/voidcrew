// Local dialogue libraries (one .twee file each), kept in IndexedDB like the other local drafts.
// No publishing yet: they stay on this computer.
import { useSyncExternalStore } from "react";
import { idb } from "./idb";

export interface DialogueDraft { id: string; name: string; twee: string; updated: number }

let drafts: readonly DialogueDraft[] = [];
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };
export const subscribeDialogueDrafts = subscribe;
export const getDialogueDrafts = () => drafts;
export const useDialogueDrafts = () => useSyncExternalStore(subscribe, getDialogueDrafts);

// removed before the first load finished must not come back from it
const removed = new Set<string>();
void (async () => {
  try {
    const saved = await idb.all<DialogueDraft>("dialogueDrafts");
    const have = new Set(drafts.map(d => d.id));
    drafts = [...drafts, ...saved.filter(d => !have.has(d.id) && !removed.has(d.id))].sort((a, b) => a.name.localeCompare(b.name));
    emit();
  } catch { /* no IndexedDB: the libraries stay for this page only */ }
})();

/** "My Dialogues v2.twee" -> "my-dialogues-v2" */
export function dialogueSlug(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dialogue";
}

export async function saveDialogueDraft(draft: DialogueDraft): Promise<void> {
  removed.delete(draft.id);
  drafts = [...drafts.filter(d => d.id !== draft.id), draft].sort((a, b) => a.name.localeCompare(b.name));
  emit();
  await idb.put("dialogueDrafts", draft);
}

export async function deleteDialogueDraft(id: string): Promise<void> {
  removed.add(id);
  drafts = drafts.filter(d => d.id !== id);
  emit();
  await idb.del("dialogueDrafts", id);
}
