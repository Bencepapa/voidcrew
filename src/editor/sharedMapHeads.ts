// The latest shared map heads per world, as the editor lists them. The
// background loader fills it; the Map settings picker and the Shared maps
// dialog read it. The last good list is cached so the next visit can show it
// at once, then the network refreshes it.

import { useSyncExternalStore } from "react";
import type { WorldId } from "../game/worlds";
import { sharedConfigured, sharedRequest } from "./sharedAuth";
import { readSharedCache, writeSharedCache } from "./sharedCache";

export interface SharedMapHead {
  id: string;
  revision: number;
  title: string;
  saved_by?: string;
  saved_at?: string;
}

const CACHE = "heads";
const EMPTY: readonly SharedMapHead[] = [];
const byWorld = new Map<WorldId, SharedMapHead[]>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const emit = () => { for (const listener of listeners) listener(); };

export const sharedMapHeads = (world: WorldId): readonly SharedMapHead[] => byWorld.get(world) ?? EMPTY;
export const useSharedMapHeads = (world: WorldId) => useSyncExternalStore(subscribe, () => sharedMapHeads(world));

const isHead = (value: unknown): value is SharedMapHead => {
  const head = value as Partial<SharedMapHead> | null;
  return !!head && typeof head.id === "string" && typeof head.title === "string"
    && typeof head.revision === "number" && Number.isFinite(head.revision)
    && (head.saved_by === undefined || typeof head.saved_by === "string")
    && (head.saved_at === undefined || typeof head.saved_at === "string");
};

export function setSharedMapHeads(world: WorldId, heads: readonly SharedMapHead[]) {
  const next = heads.filter(isHead).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  if (JSON.stringify(byWorld.get(world) ?? EMPTY) === JSON.stringify(next)) return;
  byWorld.set(world, next);
  emit();
}

// The cached list, applied synchronously before any request (false: none usable).
export function applyCachedSharedMapHeads(world: WorldId): boolean {
  if (!sharedConfigured) return false;
  const cached = readSharedCache<unknown>(CACHE, world);
  if (!Array.isArray(cached) || !cached.every(isHead)) return false;
  setSharedMapHeads(world, cached);
  return cached.length > 0;
}

// Fetches the heads and stores them (throws: the background loader swallows it).
export async function refreshSharedMapHeads(world: WorldId, init?: RequestInit): Promise<SharedMapHead[]> {
  if (!sharedConfigured) return [];
  const rows = await sharedRequest<unknown>("/rest/v1/void_map_heads?world=eq." + world + "&order=title,id", init);
  const heads = Array.isArray(rows) ? rows.filter(isHead) : [];
  setSharedMapHeads(world, heads);
  writeSharedCache(CACHE, world, heads);
  return heads;
}
