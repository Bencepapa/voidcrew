// Small, best-effort cache of the last shared lists (map heads and texture
// metadata) so the next visit can show them before the network answers.
// localStorage only: these are a few kilobytes of JSON, not images.

import { sharedProject } from "./sharedAuth";

const PREFIX = "voidcrew-shared-cache";

function key(name: string, world: string) {
  return `${PREFIX}:${sharedProject ?? ""}:${name}:${world}`;
}

export function readSharedCache<T>(name: string, world: string): T | null {
  try {
    const raw = window.localStorage.getItem(key(name, world));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; value?: T } | null;
    return parsed?.v === 1 ? parsed.value ?? null : null;
  } catch {
    return null;
  }
}

export function writeSharedCache(name: string, world: string, value: unknown) {
  try {
    window.localStorage.setItem(key(name, world), JSON.stringify({ v: 1, at: Date.now(), value }));
  } catch {
    /* storage unavailable or full: the cache is optional */
  }
}
