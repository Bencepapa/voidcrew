import { useEffect, useRef, useState } from "react";
import type { WorldId } from "../game/worlds";
import { openAssetManager, type Sample } from "../editor/AssetManager";
import type { AssetSearchKind, SearchAsset } from "./assetTargets";
import { registerEditorSearchOpeners } from "./editorSearchOpeners";
import { readSearchHistory, saveSearchHistory, type SearchHistoryEntry } from "./history";
import { SearchDialog } from "./SearchDialog";
import { isSearchShortcut } from "./searchKeyboard";

export interface AssetSearchRequest { id: string; tree?: SearchAsset["tree"] }

const managerCategory: Record<AssetSearchKind, Sample> = {
  assetProp: "prop", assetTexture: "material", assetSound: "sound", assetActor: "actor", assetItem: "item",
};

const storage = () => window.localStorage;

export function useEditorSearch(
  enabled: boolean,
  world: WorldId,
  openers: { openMapRender: () => void; openDebug: () => void; revealAssetTree: (id: string) => void },
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
      openAssetManager: (id, target) => {
        setAssetRequest(null);
        openAssetManager("prop", "", { targetId: id, propField: target.propField });
      },
      openAsset: (id, { asset }) => {
        if (!asset) return;
        if (asset.tree && (!asset.world || asset.world === world || asset.tree.group === "fence")) {
          panels.current.revealAssetTree(id);
          setAssetRequest({ id, tree: asset.tree });
        } else {
          setAssetRequest(null);
          openAssetManager(managerCategory[asset.kind], asset.id, { targetId: id });
        }
      },
      openAssetTree: id => {
        panels.current.revealAssetTree(id);
        setAssetRequest({ id });
      },
    });
  }, [enabled, world]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || !isSearchShortcut(e)) return;
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
