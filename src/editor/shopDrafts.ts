// Local shop drafts (the Shops category of the Asset Manager), kept in IndexedDB like the dialogue drafts.
// They layer over the bundled and shared shops in game/shopCatalog.ts, so an edit can be played at once.
import { useSyncExternalStore } from "react";
import { idb } from "./idb";
import { normalizeShopDraft, type ShopDraft } from "./shopEdit";

let drafts: readonly ShopDraft[] = [];
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };
const sorted = (list: readonly ShopDraft[]) => [...list].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
export const subscribeShopDrafts = subscribe;
export const getShopDrafts = () => drafts;
export const useShopDrafts = () => useSyncExternalStore(subscribe, getShopDrafts);

// removed (or saved anew) before the first load finished must not come back from it
const touched = new Set<string>();
void (async () => {
  try {
    const saved = (await idb.all<unknown>("shopDrafts")).map(normalizeShopDraft).filter((d): d is ShopDraft => d !== null);
    drafts = sorted([...drafts, ...saved.filter(d => !touched.has(d.id) && !drafts.some(own => own.id === d.id))]);
    emit();
  } catch { /* no IndexedDB: the drafts stay for this page only */ }
})();

export async function saveShopDraft(draft: ShopDraft): Promise<void> {
  touched.add(draft.id);
  drafts = sorted([...drafts.filter(d => d.id !== draft.id), draft]);
  emit();
  await idb.put("shopDrafts", draft);
}

export async function deleteShopDraft(id: string): Promise<void> {
  touched.add(id);
  drafts = drafts.filter(d => d.id !== id);
  emit();
  await idb.del("shopDrafts", id);
}

/** Saves `draft` under its (new) id and removes the one saved as `oldId`. */
export async function renameShopDraft(oldId: string, draft: ShopDraft): Promise<void> {
  await saveShopDraft(draft);
  if (oldId !== draft.id) await deleteShopDraft(oldId);
}
