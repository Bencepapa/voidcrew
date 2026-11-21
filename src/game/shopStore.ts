import { useSyncExternalStore } from "react";
import type { ShopStockEntry } from "./shop";
import { getShopDef, subscribeShops } from "./shopCatalog";

// The shops' live stock: what buying and selling has made of it. Session only
// (module state): it is not saved, a reload gives every shop its starting stock
// again. One stock per shop id, so every NPC that opens the same id shares it.
// A shop whose definition changes (a draft edited in the Asset Manager, a newer
// shared revision) starts from its new stock again.

const live = new Map<string, readonly ShopStockEntry[]>();
// the definition (as text) a live stock started from
const startedFrom = new Map<string, string>();
const listeners = new Set<() => void>();

const NONE: readonly ShopStockEntry[] = [];
const initial = (id: string): readonly ShopStockEntry[] => getShopDef(id)?.stock ?? NONE;
const defText = (id: string) => JSON.stringify(getShopDef(id) ?? null);

export const getShopStock = (id: string): readonly ShopStockEntry[] => live.get(id) ?? initial(id);

export function setShopStock(id: string, stock: readonly ShopStockEntry[]) {
  if (!live.has(id)) startedFrom.set(id, defText(id));
  live.set(id, stock);
  listeners.forEach((l) => l());
}

subscribeShops(() => {
  let reset = false;
  for (const id of [...live.keys()]) {
    if (startedFrom.get(id) === defText(id)) continue;
    live.delete(id);
    startedFrom.delete(id);
    reset = true;
  }
  if (reset) listeners.forEach((l) => l());
});

export function useShopStock(id: string): readonly ShopStockEntry[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => getShopStock(id),
  );
}
