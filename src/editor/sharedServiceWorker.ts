// Registers public/sw.js, which keeps the shared store's immutable files (revision folders) in Cache Storage so each
// downloads once per browser (see swPolicy.ts for what it caches and concept/supabase-egress-audit.md, "Service worker
// cache"). Only when the store is configured at runtime: a packaged build has no Supabase config and no worker.
// Off with `?sw=off` or the Debug panel's switch (localStorage `voidcrew-sw` = "off").

import { sharedConfigured, sharedProject } from "./sharedAuth";
import { SW_CACHE_PREFIX, resolveServiceWorker, swParamChoice, swScriptUrl, swStoredChoice, type SwEnv } from "./swPolicy";

const STORAGE_KEY = "voidcrew-sw";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const supported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator;
const hasWindow = typeof window !== "undefined";
// (the URL choice lasts for this page load only)
let param = hasWindow ? swParamChoice(window.location.search) : null;

function currentEnv(): SwEnv {
  return {
    configured: sharedConfigured,
    secure: hasWindow && window.isSecureContext,
    supported: supported(),
    param,
    stored: hasWindow ? swStoredChoice(readStored()) : null,
  };
}

/** Whether the worker is wanted right now (store configured, secure context, not switched off). */
export const sharedServiceWorkerWanted = () => resolveServiceWorker(currentEnv());
/** Whether the stored switch is on (what the Debug panel's checkbox shows). */
export const sharedServiceWorkerSwitch = () => swStoredChoice(hasWindow ? readStored() : null) !== "off" && param !== "off";

function scopeUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.href).href;
}

async function ownRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!supported()) return undefined;
  try {
    return await navigator.serviceWorker.getRegistration(scopeUrl());
  } catch {
    return undefined;
  }
}

async function register() {
  if (!sharedProject) return;
  try {
    const origin = new URL(sharedProject).origin;
    await navigator.serviceWorker.register(swScriptUrl(import.meta.env.BASE_URL, origin), { scope: import.meta.env.BASE_URL });
  } catch (err) {
    console.info("[voidcrew] shared file cache (service worker) not started:", err);
  }
  emit();
}

async function unregister() {
  try {
    await (await ownRegistration())?.unregister();
  } catch (err) {
    console.info("[voidcrew] shared file cache (service worker) not removed:", err);
  }
  emit();
}

// (the Debug panel re-reads the status when the worker was registered / removed or the cache cleared)
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
export const subscribeSharedServiceWorker = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Called once at app start: registers the worker when wanted (and removes it when switched off). */
export function initSharedServiceWorker() {
  if (!hasWindow || !sharedConfigured || !supported()) return;
  const go = () => void (sharedServiceWorkerWanted() ? register() : unregister());
  // (after the page's own loading: the worker is a convenience, not part of getting the game up)
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}

/** The Debug panel's switch: stores the choice and registers / removes the worker at once. */
export async function setSharedServiceWorkerSwitch(on: boolean) {
  param = null; // (the switch was used: it speaks now, not the URL)
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable: the choice lasts for this page */
  }
  if (!sharedConfigured || !supported()) return;
  await (sharedServiceWorkerWanted() ? register() : unregister());
}

export interface SharedCacheStatus {
  /** the worker can run here (store configured, secure context, API there) */
  available: boolean;
  /** the switch is on */
  enabled: boolean;
  registered: boolean;
  /** the worker answers this page's requests (a first-ever load is controlled only once the worker has claimed it) */
  controlling: boolean;
  entries: number;
  /** from the files' Content-Length headers */
  bytes: number;
}

async function sharedCaches(): Promise<Cache[]> {
  if (typeof caches === "undefined") return [];
  try {
    const names = (await caches.keys()).filter((name) => name.startsWith(SW_CACHE_PREFIX));
    return await Promise.all(names.map((name) => caches.open(name)));
  } catch {
    return [];
  }
}

export async function sharedCacheStatus(): Promise<SharedCacheStatus> {
  const available = sharedConfigured && supported() && hasWindow && window.isSecureContext;
  let entries = 0;
  let bytes = 0;
  for (const cache of await sharedCaches()) {
    try {
      for (const response of await cache.matchAll()) {
        entries++;
        bytes += Number(response.headers.get("content-length")) || 0;
      }
    } catch {
      /* unreadable cache: counted as empty */
    }
  }
  const registration = available ? await ownRegistration() : undefined;
  return {
    available,
    enabled: sharedServiceWorkerSwitch(),
    registered: !!registration,
    controlling: available && !!navigator.serviceWorker.controller,
    entries,
    bytes,
  };
}

/** Deletes every cached shared file (the worker stays and fills the cache again). */
export async function clearSharedCache() {
  if (typeof caches === "undefined") return;
  try {
    for (const name of await caches.keys()) if (name.startsWith(SW_CACHE_PREFIX)) await caches.delete(name);
  } catch (err) {
    console.info("[voidcrew] shared file cache not cleared:", err);
  }
  emit();
}
