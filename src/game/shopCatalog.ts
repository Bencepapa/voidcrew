// The shops a game knows. Sources, a later one replacing an earlier one with the same id:
// (a) the json files bundled in src/shops (the id is the file's "id", else its name without the extension;
//     `npm run pull:shared` also writes the published shops there),
// (b) the shops the shared store has (loaded in the background by editor/sharedCommon.ts),
// (c) the local drafts of the Shops category of the Asset Manager (IndexedDB, see editor/shopDrafts.ts), so an
//     edit can be tried in the game at once.
import { useSyncExternalStore } from "react";
import { getShopDrafts, subscribeShopDrafts } from "../editor/shopDrafts";
import { shopFromDraft } from "../editor/shopEdit";
import { parseShop, type ShopDef } from "./shop";

const RAW = import.meta.glob<unknown>("../shops/*.json", { import: "default", eager: true });

/** "../shops/smith-shop.json" -> "smith-shop" */
export const bundledShopId = (path: string): string => (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]*$/, "");

const bundled = new Map<string, ShopDef>();
for (const [path, raw] of Object.entries(RAW)) {
  const shop = parseShop(raw, bundledShopId(path));
  if (shop) bundled.set(shop.id, shop);
}
let shared: ReadonlyMap<string, ShopDef> = new Map();
const draftShops = () => new Map(getShopDrafts().map(d => [d.id, shopFromDraft(d)] as const));
let drafts: ReadonlyMap<string, ShopDef> = draftShops();
let shops = new Map([...bundled, ...shared, ...drafts]);
const listeners = new Set<() => void>();
let idList: readonly string[] | null = null;

function rebuild() {
  shops = new Map([...bundled, ...shared, ...drafts]);
  idList = null;
  for (const l of listeners) l();
}

/** Replaces the shared layer (what the store has now). */
export function setSharedShops(next: ReadonlyMap<string, ShopDef>) {
  shared = next;
  rebuild();
}
subscribeShopDrafts(() => { drafts = draftShops(); rebuild(); });
export const subscribeShops = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };

/** The shop as it is defined (its starting stock); undefined if there is none with this id. */
export const getShopDef = (id: string): ShopDef | undefined => shops.get(id);
export const getShopIds = (): ReadonlySet<string> => new Set(shops.keys());

/** The layers one by one (the editor shows where a shop comes from; a later layer replaces an earlier one in the game). */
export const getBundledShops = (): ReadonlyMap<string, ShopDef> => bundled;
export const getSharedShops = (): ReadonlyMap<string, ShopDef> => shared;

/** The known shop ids, sorted (the editor's selectors; re-rendered when a layer changes). */
export function useShopIds(): readonly string[] {
  return useSyncExternalStore(subscribeShops, () => (idList ??= [...shops.keys()].sort()));
}
