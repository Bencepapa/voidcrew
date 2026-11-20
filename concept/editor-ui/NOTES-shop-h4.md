# Shop H4 notes (branch feature/shop)

## What was done
- Pure rules: `src/game/shop.ts`. `ShopDef { id, name, portrait?, stock: [{ item, price?, qty }], buyRate, sellRate }`, `qty = UNLIMITED (-1)` never runs out. `buyPrice` = entry `price` or `value x buyRate`; `sellPrice` = `value x sellRate` (min 1 for anything worth something; 0 = the shop won't take it). `buy(inv, credits, stock, shop, index, to, rules, qty)` to a backpack cell (empty, or the same item's stack, else first room), to a hand (one unit; what the hand held goes to the backpack, `equipHand`) or `to = null` (anywhere in the backpack); `sell(inv, credits, stock, shop, from, rules, qty?)` (whole stack by default; stock goes up, an unlimited entry stays unlimited). Refusals: `empty | soldout | poor | full | worthless | place`, nothing changes. `parseShop(raw, fallbackId)` cleans loose json. New helper `takeSlot` in `inventory.ts` (take qty out of a cell or hand; a two-hander shown in the left hand is taken from the right).
- Data: `src/shops/*.json` (id from the file's `id`, else the file name), loaded by `src/game/shopCatalog.ts` (`import.meta.glob`, `getShopDef`, `getShopIds`). Bundled: `wizard-shop`, `smith-shop` (the ids `src/dialogues/void-fantasy.twee` uses). The NPC's own shop = `ActorSpec.shop` (a shop id), used by a parameter-less `@shop`.
- Live stock: `src/game/shopStore.ts` (module store, `useShopStock`, `setShopStock`): **session only, not saved**; one stock per shop id, shared by every NPC that opens it.
- Credits: the existing `meta.credits` counter (not an item). New `setCredits(n)` in `meta.ts` (refuses < 0); deals spend/earn the same counter the base uses.
- Window: `src/components/ShopPanel.tsx`, opened by `DialoguePopup` when a passage has `@shop` (the placeholder line is gone; the dialogue stays underneath and its choices continue after the shop closes; `App.tsx` passes `crew`). Modal like the inventory (z above the dialogue, stops above the party dock, the world stays paused because the dialogue is open). Left: shop grid (price in the cell's corner, `∞` for unlimited, qty), right: party backpack, header: credits (with `-> N cr` preview of a picked-up item), below: each crewmate's avatar and hand boxes. Reuses `SlotGrid/HandBoxes/slotDrag`; slot keys `shop:<i>` next to `pack:<i>` / `hand:<crew>:<h>`. `InventorySlots` got `tip/badge/onQuick` on `SlotBox`, `labelOf/tipOf/badgeOf/onQuick` on `SlotGrid`, `tipOf/onQuick` on `HandBoxes`, and `setMover` (while the shop is open the always-visible dock hand boxes route their moves through it, so a dock hand can sell to the shop).
- Input: buy = drag a shop item to a backpack cell or a hand (ONE unit each time); sell = drag a backpack/hand item (the WHOLE stack) onto any shop cell; click an item then its place; quick: Shift+click, double click, or Shift+Enter on a focused cell (shop item -> backpack; yours -> shop). Arrows move focus, Enter/Space pick up/put down, Esc cancels a drag, then a pick-up, then closes the shop (back in the dialogue). Moves within backpack/hands still work in the window. Messages: "Bought/Sold ... for N cr", red refusal ("Not enough credits", "No room for it", "Sold out", "The shop does not want that").
- Validation: `buildDialogueCatalogChecked(knownShops, ...layers)` in `dialogueCatalogCore.ts` (`buildDialogueCatalog` unchanged, delegates); `dialogueCatalog.ts` passes the bundled shop ids, so the catalog warns on unknown `@shop` ids; the editor's Dialogues panel passes them too.
- i18n: `src/i18n/{en,hu}/shop.ts` (`shop.*`); `dialogue.popup.shop` removed, `dialogue.popup.ownShop` reworded.
- Tests: `npx tsx src/game/shop.test.ts` (prices, buy to cell/hand/anywhere, stacking, unlimited, poor/full/soldout, two-hander displacement, sell incl. hand and left-ghost, parseShop, bundled shops valid and the sample's ids present); `dialogueCatalog.test.ts` extended with the shop-id check.

## Not verified
- No browser run (as instructed): `npx tsc --noEmit` clean, `npm run build` ok, all `src/game/*.test.ts` pass. Drag feel, focus, layout on small screens/dock inset, the dock-hand-boxes-as-sell-source and Shift+Enter (relies on the browser's keyboard click keeping `shiftKey`) are read-checked only.

## Import cycles
- None added. New edges: `ShopPanel -> InventoryPanel` (for the exported `focusNeighbor`), `DialoguePopup -> ShopPanel`, `dialogueCatalog -> shopCatalog`, `shopStore -> shopCatalog -> shop -> inventory`.

## How to test (browser)
1. Fantasy world, an NPC with the `void-fantasy` dialogue (smith1 `Start Smith` or a wizard with `Start Wizard`; set Own shop id if you want `@shop` without an id). Talk (Space), pick `Vásárlás` / `Buy/Sell`: the shop window opens over the dialogue.
2. Credits start at whatever the base has (0 on a fresh save: set it via the base or `localStorage` `voidcrew-meta-v1`). Drag a priced item to a backpack cell/hand: credits drop, stock goes down (`∞` ones stay), a message appears. Too expensive: "Not enough credits".
3. Drag a backpack item onto the shop grid: credits up, the item appears in the shop. Try a stack (whole stack sold), a weapon from a hand (also from the party dock's hand boxes).
4. Click an item then a place; Shift+click and double click; Tab/arrows + Enter, Shift+Enter. Esc: drops a drag, then a pick-up, then closes the shop and you are back in the dialogue; Esc again leaves it.
5. Close and reopen the same shop: the changed stock stays; reload the page: starting stock again.

## Open questions / follow-ups
- **H4b:** shop stock/rates/portrait editing in the Asset Manager (type `shop`, then H5 release in `pull:shared`); the bundled json is the only source now. Stock per shop id is shared across NPCs (the plan's open question: per-NPC instances would need a key like map+actor).
- Buying is 1 unit per action, selling the whole stack: no quantity picker / split yet.
- Selling an owned weapon (has a `uid`) drops it from the party; it stays in `meta.weapons` as an unequipped record. A weapon bought comes without a `uid` (level 0) and is adopted as owned at `bankRun`. Should the shop refuse to buy owned weapons, or pay by level?
- The shop buys anything with a value; no per-shop "buys only these categories".
- Credits spent in a run persist immediately (meta), even if the run is then lost.
- Shops do not restock; the stock is not saved with the run.
