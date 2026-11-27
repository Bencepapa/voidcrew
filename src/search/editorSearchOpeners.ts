import { ASSET_SEARCH_KINDS } from "./assetTargets";
import { registerOpener, type OpenForTarget } from "./openers";

export function registerEditorSearchOpeners(openers: { openMapRender: OpenForTarget; openAssetTree: OpenForTarget; openDebug: OpenForTarget; openAssetManager: OpenForTarget; openAsset: OpenForTarget }) {
  const unregister = [
    registerOpener("mapRender", openers.openMapRender),
    registerOpener("assetTree", openers.openAssetTree),
    registerOpener("debug", openers.openDebug),
    registerOpener("assetManager", openers.openAssetManager),
    ...ASSET_SEARCH_KINDS.map(kind => registerOpener(kind, openers.openAsset)),
  ];
  return () => unregister.forEach(remove => remove());
}
