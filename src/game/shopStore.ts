import { useSyncExternalStore } from "react";
import type { ShopStockEntry } from "./shop";
import { getShopDef } from "./shopCatalog";

// The shops' live stock: what buying and selling has made of it. Session only
// (module state): it is not saved, a reload gives every shop its starting stock
// again. One stock per shop id, so every NPC that opens the same id shares it.

const live = new Map<string, readonly ShopStockEntry[]>();
const listeners = new Set<() => void>();

const NONE: readonly ShopStockEntry[] = [];
const initial = (id: string): readonly ShopStockEntry[] => getShopDef(id)?.stock ?? NONE;

export const getShopStock = (id: string): readonly ShopStockEntry[] => live.get(id) ?? initial(id);

export function setShopStock(id: string, stock: readonly ShopStockEntry[]) {
  live.set(id, stock);
  listeners.forEach((l) => l());
}

export function useShopStock(id: string): readonly ShopStockEntry[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => getShopStock(id),
  );
}
