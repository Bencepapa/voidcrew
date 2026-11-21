# Shop editor (H4b) and pickup values (branch feature/shopeditor)

## Task A: Shops category in the Asset Manager
- New category **Shops** (hu: Boltok) in `AssetManager.tsx` (`Sample` has `"shop"`; like Dialogues it is a panel of its own: no sub-category/world/preview, `ownPanel`).
- `src/editor/ShopsPanel.tsx`: list (bundled = lock, shared = "shared" tag, local draft = yellow dot; search; **+ New**; **import .json**), form (name, id, portrait picker = shared stills with purpose portrait like the NPC editor, buy/sell rate), stock table (item select with name + id, grouped items / weapons incl. the editor's pickups; base value; optional price override with the auto price as placeholder; qty + unlimited checkbox; up/down/remove; add row), live prices per row ("You pay" / "You get", computed with `buyPrice` / `sellPrice` from `game/shop.ts`) and an example line under the rates, problems list (right side + inline per row), **Publish** (reuses `publishShop()`; errors block it; not signed in -> `SignInPopover`, then publishes), **Export .json**, **Delete** (pure draft) / **Discard the draft** (draft over a bundled/shared shop). Bundled/shared shops are read-only; **Edit a local copy** makes a draft with the same id that replaces it on this computer.
- Pure helpers `src/editor/shopEdit.ts` (tested in `shopEdit.test.ts`): `ShopDraft`, `draftFromShop` / `shopFromDraft` (goes through `parseShop`, so what the game and Publish see is the cleaned shop), `normalizeShopDraft` (storage), `shopSlug`, `uniqueShopId`, `shopToJson` / `shopFromJsonText` (also accepts a published `meta.json`), `validateShop` (codes: idInvalid, idTaken, idShadows, noName, buyRate, sellRate, sellAboveBuy, portraitMissing, noStock, itemEmpty, itemUnknown, itemDuplicate, priceInvalid, priceFraction, qtyInvalid, qtyFraction, qtyZero, free; errors vs warnings), `previewRow` / `previewItem`.
- Drafts: `src/editor/shopDrafts.ts` (IndexedDB store `shopDrafts`, `idb.ts` VERSION 4 -> 5 adds the store; autosave on every edit, like the other drafts). Id edits: applied when valid and not taken by another draft (rename = save new + delete old).
- Catalog layering: `game/shopCatalog.ts` is now bundled < shared < local drafts (`getBundledShops`, `getSharedShops` added for the editor). Draft ids count for the dialogue `@shop` check and for the NPC Shop id picker (same `subscribeShops`). `game/shopStore.ts`: a live (session) stock is dropped when its shop's definition changes (so an edited draft starts from its new stock); an unchanged shared reload does not reset it.
- i18n: `src/i18n/{en,hu}/shopEditor.ts` (`shopEditor.*`, `assetManager.shops`), registered in `i18n/index.ts`.
- Docs: `docs/parbeszed-es-bolt-szerkeszto.md` section 5 now has a Hungarian how-to for the editor (the "no editor yet" note is gone); `docs/img/bolt-ablak.svg` untouched (it shows the in-game window).

## Task B: pickup values
- `src/game/pickupValue.ts` (pure, `pickupValue.test.ts`): `CATEGORY_VALUES` (salvage 4, tech 15, supplies 10, valuables 40, data 30), `categoryValue`, `cleanPickupValue` (finite >= 0, rounded, capped at 10000), `pickupValue(value, category)` = own value else the category's. The built-in `ITEM_TYPES` are unchanged.
- `PickupAppearance.value?` (optional, `game/items.ts`). Stored in the pickup's meta.json `pickup` object (`editor/sharedImages.ts` `readPickup` keeps a valid value, drops anything else), so old pickups simply have none.
- `render/sharedImages.ts` registers `ITEM_TYPES[id].value = pickupValue(pickup.value, category)` (was `0`): works for old pickups at registration time too.
- Pickup editor (`ImageAssetsPanel.tsx`): "Value" number field plus a checkbox "Default for the category (N cr)" (checked = no own value; the field then shows the default and is disabled). The read-only details of a published pickup show the value. i18n `assetManager.pickup.value*` en+hu.

## Not verified
- No browser run (as instructed): `npx tsc --noEmit` clean, `npm run build` ok, all `src/game/*.test.ts` and `src/editor/*.test.ts` pass. The panel layout (the 7-column stock grid at narrow widths, horizontal scroll), the number inputs (typing "1." / clearing), id rename, the sign-in popover flow, file import/export, the IndexedDB v5 upgrade and the live-reset of a shop's session stock are read-checked only.
- Publish was not run against Supabase.

## Caveats / follow-ups
- Pickup value is per definition revision: an already published pickup without a value gets the category default; to give it another value it has to be revised/published again (the pickup editor edits drafts only).
- A draft shop with errors still layers into the game (cleaned by `parseShop`); only Publish is blocked.
- Portraits come from the published stills (as in the NPC editor); a local still draft is not offered.
- `requestClose` of the Asset Manager only counts texture drafts (unchanged): shop drafts, like dialogue drafts, are autosaved and not warned about.
- Local drafts only: the Shops panel has no "refresh from shared" of its own; the header Refresh button reloads textures/images/props etc., the shared shops/dialogues are loaded by `autoShared` as before (and after a Publish).
- A fractional qty or price is only a warning; the game floors the qty and rounds the price.
