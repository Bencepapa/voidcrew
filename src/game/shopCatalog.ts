// The shops a game knows. Sources, a later one replacing an earlier one with the same id:
// (a) the json files bundled in src/shops (the id is the file's "id", else its name without the extension;
//     `npm run pull:shared` also writes the published shops there),
// (b) the shops the shared store has (loaded in the background by editor/sharedCommon.ts).
// Shop editing in the Asset Manager comes later (H4b).
import { parseShop, type ShopDef } from "./shop";

const RAW = import.meta.glob<unknown>("../shops/*.json", { import: "default", eager: true });

/** "../shops/smith-shop.json" -> "smith-shop" */
export const bundledShopId = (path: string): string => (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]*$/, "");

const bundled = new Map<string, ShopDef>();
for (const [path, raw] of Object.entries(RAW)) {
  const shop = parseShop(raw, bundledShopId(path));
  if (shop) bundled.set(shop.id, shop);
}
let shops = new Map(bundled);
const listeners = new Set<() => void>();

/** Replaces the shared layer (what the store has now). */
export function setSharedShops(shared: ReadonlyMap<string, ShopDef>) {
  shops = new Map([...bundled, ...shared]);
  for (const l of listeners) l();
}
export const subscribeShops = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };

/** The shop as it is defined (its starting stock); undefined if there is none with this id. */
export const getShopDef = (id: string): ShopDef | undefined => shops.get(id);
export const getShopIds = (): ReadonlySet<string> => new Set(shops.keys());
