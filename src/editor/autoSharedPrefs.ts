// Whether the game loads the whole shared store by itself (the Debug panel's switch).
// Off for guests and for the plain Pages build; on for a signed-in editor and in a dev
// build; `?shared=on` or the stored switch turns it on (see autoSharedPolicy.ts).

import { useSyncExternalStore } from "react";
import { resolveAutoShared, sharedParamChoice, storedChoice } from "./autoSharedPolicy";
import { sharedToken, subscribeSharedAuth } from "./sharedAuth";

const STORAGE_KEY = "voidcrew-auto-shared";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const hasWindow = typeof window !== "undefined";
// (the URL choice lasts for this page load only)
let param = hasWindow ? sharedParamChoice(window.location.search) : null;
let stored = hasWindow ? storedChoice(readStored()) : null;
const compute = () => resolveAutoShared({ param, stored, signedIn: !!sharedToken(), dev: import.meta.env.DEV });

let enabled = compute();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const emit = () => { for (const listener of listeners) listener(); };
const update = () => {
  const next = compute();
  if (next === enabled) return;
  enabled = next;
  emit();
};

// signing in as an editor turns it on (unless switched off), signing out back to the default
subscribeSharedAuth(update);

export const autoLoadShared = () => enabled;

export function setAutoLoadShared(value: boolean) {
  stored = value ? "on" : "off";
  param = null; // (the switch was used: it speaks now, not the URL)
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable: the choice lasts for this page */
  }
  update();
}

export const subscribeAutoLoadShared = subscribe;
export const useAutoLoadShared = () => useSyncExternalStore(subscribe, autoLoadShared);
