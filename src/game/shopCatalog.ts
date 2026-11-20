// The shops a game knows: the json files bundled in src/shops (the id is the
// file's "id", else its name without the extension). Shop editing in the Asset
// Manager comes later (H4b); until then this is the only source.
import { parseShop, type ShopDef } from "./shop";

const RAW = import.meta.glob<unknown>("../shops/*.json", { import: "default", eager: true });

/** "../shops/smith-shop.json" -> "smith-shop" */
export const bundledShopId = (path: string): string => (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]*$/, "");

const shops = new Map<string, ShopDef>();
for (const [path, raw] of Object.entries(RAW)) {
  const shop = parseShop(raw, bundledShopId(path));
  if (shop) shops.set(shop.id, shop);
}

/** The shop as it is defined (its starting stock); undefined if there is none with this id. */
export const getShopDef = (id: string): ShopDef | undefined => shops.get(id);
export const getShopIds = (): ReadonlySet<string> => new Set(shops.keys());
