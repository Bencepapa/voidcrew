import { normalizeSearch } from "./normalizeSearch";

export interface SearchHistoryEntry {
  query: string;
  targetId: string;
}

const KEY = "voidcrew-editor-search-history";
const LIMIT = 10;

interface SearchHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function rememberSearch(history: readonly SearchHistoryEntry[], entry: SearchHistoryEntry): SearchHistoryEntry[] {
  const query = entry.query.trim();
  if (!query || !entry.targetId) return history.slice(0, LIMIT);
  const normalized = normalizeSearch(query);
  return [{ ...entry, query }, ...history.filter(item => normalizeSearch(item.query) !== normalized)].slice(0, LIMIT);
}

export function readSearchHistory(storage: () => SearchHistoryStorage): SearchHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(storage().getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SearchHistoryEntry =>
      typeof item?.query === "string" && !!item.query.trim() &&
      typeof item.targetId === "string" && !!item.targetId,
    ).slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function saveSearchHistory(storage: () => SearchHistoryStorage, history: readonly SearchHistoryEntry[]): void {
  try {
    storage().setItem(KEY, JSON.stringify(history.slice(0, LIMIT)));
  } catch {
    // The dialog keeps the history in memory if storage is unavailable.
  }
}
