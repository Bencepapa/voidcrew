export function isSearchControl(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("[data-editor-search-dialog], [data-search-target]");
}
