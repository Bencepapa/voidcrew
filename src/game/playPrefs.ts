// The play preferences kept in this browser (localStorage, each guarded - without storage a choice
// lasts for the page): how items are picked up (see pickupMode.ts), and the testing switch "Enemies
// inactive" (see enemiesOff.ts). Both are changed in the Debug panel.

import { useSyncExternalStore } from "react";
import { ENEMIES_STORAGE_KEY, enemiesParamChoice, enemiesStoredChoice, resolveEnemiesOff } from "./enemiesOff";
import { parsePickupMode, type PickupMode } from "./pickupMode";

const PICKUP_STORAGE_KEY = "voidcrew-pickup-mode";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice lasts for this page */
  }
}

const hasWindow = typeof window !== "undefined";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const emit = () => { for (const listener of listeners) listener(); };

// ---- how items are picked up: null = the world's default ----
let pickupStored: PickupMode | null = hasWindow ? (parsePickupMode(read(PICKUP_STORAGE_KEY)) ?? null) : null;
export const storedPickupMode = (): PickupMode | null => pickupStored;
export function setStoredPickupMode(mode: PickupMode | null) {
  if (mode === pickupStored) return;
  pickupStored = mode;
  write(PICKUP_STORAGE_KEY, mode);
  emit();
}
export const useStoredPickupMode = () => useSyncExternalStore(subscribe, storedPickupMode);

// ---- enemies inactive ----
// (the URL choice lasts for this page load only, until the switch is used)
let enemiesParam = hasWindow ? enemiesParamChoice(window.location.search) : null;
let enemiesStored = hasWindow ? enemiesStoredChoice(read(ENEMIES_STORAGE_KEY)) : null;
let enemiesOffNow = resolveEnemiesOff(enemiesParam, enemiesStored);
export const enemiesOff = (): boolean => enemiesOffNow;
export function setEnemiesOff(off: boolean) {
  enemiesStored = off;
  enemiesParam = null;
  write(ENEMIES_STORAGE_KEY, off ? "1" : "0");
  const next = resolveEnemiesOff(enemiesParam, enemiesStored);
  if (next === enemiesOffNow) return;
  enemiesOffNow = next;
  emit();
}
export const useEnemiesOff = () => useSyncExternalStore(subscribe, enemiesOff);
