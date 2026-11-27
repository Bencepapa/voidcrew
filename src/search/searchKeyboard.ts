export function isSearchControl(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("[data-editor-search-dialog], [data-search-target]");
}

// The text-field key guard in main.tsx stops every key typed into a field before any other handler
// (React's included) sees it. The open search dialog registers its key handler here, and the guard
// hands the dialog's own keys (Enter, arrows, Escape) to it.
type SearchKeyHandler = (e: KeyboardEvent) => void;
let searchKeyHandler: SearchKeyHandler | null = null;

export function setSearchKeyHandler(handler: SearchKeyHandler | null): () => void {
  searchKeyHandler = handler;
  return () => { if (searchKeyHandler === handler) searchKeyHandler = null; };
}

const SEARCH_KEYS = new Set(["Enter", "Escape", "ArrowDown", "ArrowUp"]);

// true when the key went to the search dialog (the guard then skips its own Enter/Escape blur)
export function routeSearchKey(e: KeyboardEvent): boolean {
  if (!searchKeyHandler || !SEARCH_KEYS.has(e.key)) return false;
  if (!(e.target instanceof Element) || !e.target.closest("[data-editor-search-dialog]")) return false;
  searchKeyHandler(e);
  return true;
}
