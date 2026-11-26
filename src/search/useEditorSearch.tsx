import { useEffect, useRef, useState } from "react";
import type { WorldId } from "../game/worlds";
import { registerEditorSearchOpeners } from "./editorSearchOpeners";
import { readSearchHistory, saveSearchHistory, type SearchHistoryEntry } from "./history";
import { SearchDialog } from "./SearchDialog";

export interface AssetSearchRequest { id: string }

const storage = () => window.localStorage;

export function useEditorSearch(
  enabled: boolean,
  world: WorldId,
  openers: { openMapRender: () => void; openDebug: () => void; revealAssetTree: () => void },
) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(() => readSearchHistory(storage));
  const panels = useRef(openers);
  panels.current = openers;
  const [assetRequest, setAssetRequest] = useState<AssetSearchRequest | null>(null);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      setAssetRequest(null);
      return;
    }
    return registerEditorSearchOpeners({
      openMapRender: () => { setAssetRequest(null); panels.current.openMapRender(); },
      openDebug: () => { setAssetRequest(null); panels.current.openDebug(); },
      openAssetTree: id => {
        panels.current.revealAssetTree();
        setAssetRequest({ id });
      },
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.defaultPrevented || e.isComposing) return;
      if (key !== "p" && key !== "k") return;
      if (open || hasVisibleModal()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) setOpen(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, open]);

  function updateHistory(next: SearchHistoryEntry[]) {
    setHistory(next);
    saveSearchHistory(storage, next);
  }

  return {
    open: (trigger: HTMLButtonElement) => {
      if (!hasVisibleModal()) {
        trigger.focus();
        setOpen(true);
      }
    },
    dialog: enabled && open ? (
      <SearchDialog world={world} history={history} onHistoryChange={updateHistory} onClose={() => setOpen(false)} />
    ) : null,
    assetRequest,
    closeAssetTree: () => setAssetRequest(null),
  };
}

function hasVisibleModal() {
  return Array.from(document.querySelectorAll('[aria-modal="true"], dialog[open]')).some(element =>
    element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible",
  );
}
