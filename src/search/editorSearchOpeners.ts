import { registerOpener, type OpenForTarget } from "./openers";

export function registerEditorSearchOpeners(openers: { openMapRender: OpenForTarget; openAssetTree: OpenForTarget; openDebug: OpenForTarget }) {
  const unregister = [
    registerOpener("mapRender", openers.openMapRender),
    registerOpener("assetTree", openers.openAssetTree),
    registerOpener("debug", openers.openDebug),
  ];
  return () => unregister.forEach(remove => remove());
}
