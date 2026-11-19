// Whether the game loads the latest shared content by itself (the Debug
// panel's switch). Kept in this browser; on by default.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "voidcrew-auto-shared";

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

let enabled = typeof window === "undefined" ? true : read();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const emit = () => { for (const listener of listeners) listener(); };

export const autoLoadShared = () => enabled;

export function setAutoLoadShared(value: boolean) {
  if (enabled === value) return;
  enabled = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable: the choice lasts for this page */
  }
  emit();
}

export const subscribeAutoLoadShared = subscribe;
export const useAutoLoadShared = () => useSyncExternalStore(subscribe, autoLoadShared);
