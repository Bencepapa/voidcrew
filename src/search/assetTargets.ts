import type { Key } from "../i18n";
import type { WorldId } from "../game/worlds";
import type { SearchTarget } from "./targets";

const categories = {
  assetProp: "assetManager.props",
  assetTexture: "assetManager.textures",
  assetSound: "sound.group",
  assetActor: "assetManager.npcs",
  assetItem: "assetManager.pickups",
} as const satisfies Record<string, Key>;

export type AssetSearchKind = keyof typeof categories;
export const assetCategoryKey = (kind: AssetSearchKind) => categories[kind];
export const ASSET_SEARCH_KINDS = Object.keys(categories) as AssetSearchKind[];
export type SearchAsset = {
  kind: AssetSearchKind;
  id: string;
  name: string;
  nameKey?: Key;
  world?: WorldId;
  category: string;
  tags?: readonly string[];
  tree?: { group: string; entry: string; tab?: string };
};

export function assetTarget(asset: SearchAsset): SearchTarget {
  return {
    id: `asset.${asset.kind.slice(5).toLowerCase()}.${asset.id}`,
    kind: asset.kind,
    titleKey: asset.nameKey ?? categories[asset.kind],
    world: asset.world,
    synonyms: [asset.name],
    keywords: [asset.id, asset.category, ...(asset.tags ?? [])],
    asset,
  };
}
