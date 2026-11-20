import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PACK_COLS, parseLoc, slotAt, type Slot } from "../game/inventory";
import { getInventory, changeInventory, moveItem, useInventory } from "../game/inventoryStore";
import { itemName, itemRules, itemValue } from "../game/itemRules";
import { getMeta, setCredits, useMeta } from "../game/meta";
import { UNLIMITED, buy, buyPrice, sell, sellPrice, type Deal, type ShopRules } from "../game/shop";
import { getShopDef } from "../game/shopCatalog";
import { getShopStock, setShopStock, useShopStock } from "../game/shopStore";
import type { Crewmate } from "../game/types";
import { t } from "../i18n";
import { useSharedImages } from "../render/sharedImages";
import { HandBoxes, SlotGrid, setMover } from "./InventorySlots";
import { focusNeighbor } from "./InventoryPanel";
import { Avatar } from "./PartyPanel";
import { cancelDrag, clearSelection, useSelectedSlot, useSlotNotice } from "./slotDrag";

const rules: ShopRules = { ...itemRules, value: itemValue };
const SHOP_PREFIX = "shop:";
const SHOP_COLS = 6;
const shopKey = (index: number) => `${SHOP_PREFIX}${index}`;
const isShopKey = (key: string) => key.startsWith(SHOP_PREFIX);

type Msg = { text: string; bad: boolean } | null;

// The shop window (opened by a dialogue's @shop, see DialoguePopup): the
// shop's stock on one side, the party's backpack on the other, the crew's hands
// below. Buy by dragging a stock item to a backpack cell or a hand (one at a
// time), sell by dragging an item (the whole stack) to the shop; or click an
// item and then where it goes; shift+click, double click or shift+Enter does
// the quick one (a buy goes into the backpack, a sale to the shop). The keys
// are the window's while it's open: arrows move, Enter/Space pick up and put
// down, Esc cancels what's picked up, then closes the shop. The stock changes
// only for this session (see shopStore.ts).
export function ShopPanel({ shopId, crew, partyDock, onClose }: {
  shopId: string;
  crew: Crewmate[];
  partyDock: HTMLElement | null;
  onClose: () => void;
}) {
  const def = getShopDef(shopId);
  const stock = useShopStock(shopId);
  const inventory = useInventory();
  const credits = useMeta().credits;
  const selected = useSelectedSlot();
  const notice = useSlotNotice();
  const images = useSharedImages();
  const root = useRef<HTMLElement>(null);
  const [bottomInset, setBottomInset] = useState(0);
  const [msg, setMsg] = useState<Msg>(null);
  const rates = { buyRate: def?.buyRate ?? 1, sellRate: def?.sellRate ?? 0.5 };

  useLayoutEffect(() => {
    if (!partyDock) {
      setBottomInset(0);
      return;
    }
    const update = () => setBottomInset(Math.max(0, window.innerHeight - partyDock.getBoundingClientRect().top));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(partyDock);
    if (partyDock.parentElement) observer.observe(partyDock.parentElement);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [partyDock]);

  // --- the deals (they read the live state, so a stale render can't misprice) ---

  const finish = (deal: Deal, bought: boolean): string | null => {
    if (!deal.ok) return deal.reason;
    changeInventory(() => deal.inv);
    setCredits(deal.credits);
    setShopStock(shopId, deal.stock);
    setMsg({ text: t(bought ? "shop.bought" : "shop.sold", { item: itemName(deal.item), qty: deal.qty, n: deal.amount }), bad: false });
    return null;
  };
  const doBuy = (index: number, to: string | null): string | null => {
    const loc = to === null ? null : parseLoc(to);
    if (to !== null && !loc) return "place";
    return finish(buy(getInventory(), getMeta().credits, getShopStock(shopId), rates, index, loc, rules), true);
  };
  const doSell = (from: string): string | null => {
    const loc = parseLoc(from);
    if (!loc) return "place";
    return finish(sell(getInventory(), getMeta().credits, getShopStock(shopId), rates, loc, rules), false);
  };

  // every move of the window (dragging, click and click, the dock's hand boxes too)
  const onMove = (from: string, to: string): string | null => {
    setMsg(null);
    if (isShopKey(from)) return isShopKey(to) ? "same" : doBuy(Number(from.slice(SHOP_PREFIX.length)), to);
    if (isShopKey(to)) return doSell(from);
    const result = moveItem(from, to);
    return result.ok ? null : result.reason;
  };
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const quick = (key: string) => {
    clearSelection();
    setMsg(null);
    const reason = isShopKey(key) ? doBuy(Number(key.slice(SHOP_PREFIX.length)), null) : doSell(key);
    if (reason) setMsg({ text: t(`shop.fail.${reason}` as "shop.fail.full"), bad: true });
  };
  const quickRef = useRef(quick);
  quickRef.current = quick;

  // the dock's hand boxes are drop targets for the shop too
  useEffect(() => {
    setMover((from, to) => onMoveRef.current(from, to));
    return () => setMover(null);
  }, []);

  // focus goes into the window (the first cell), and back where it was when it closes
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.querySelector<HTMLElement>("[data-slot]")?.focus();
    return () => {
      clearSelection();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const swallow = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === "Escape") {
        swallow();
        // (first a drag, then what's picked up, then the shop)
        if (!e.repeat && !cancelDrag() && !clearSelection()) latest.current();
      } else if (e.key.startsWith("Arrow")) {
        swallow();
        if (root.current) focusNeighbor(root.current, e.key);
      } else if (e.key === "Enter" || e.key === " ") {
        // (a focused cell or button acts on it, as a button does; with shift: the quick move)
        const active = document.activeElement;
        if (!(active instanceof HTMLButtonElement && root.current?.contains(active))) e.preventDefault();
        e.stopImmediatePropagation();
      } else {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  // --- what is shown ---

  const cells = Math.max(2 * SHOP_COLS, Math.ceil((stock.length + 1) / SHOP_COLS) * SHOP_COLS);
  const shopSlots: (Slot | null)[] = Array.from({ length: cells }, (_, i) => {
    const e = stock[i];
    return e ? { item: e.item, qty: e.qty === UNLIMITED ? 1 : e.qty } : null;
  });
  const sellTip = (slot: Slot) => {
    const each = sellPrice(rates, slot.item, rules);
    return each > 0 ? t("shop.sellTip", { n: each * slot.qty }) : t("shop.noSale");
  };
  const portrait = def?.portrait ? images.find((image) => image.id === def.portrait) : undefined;

  // what the picked-up item would do: a buy costs, a sale pays
  let hint: string | null = null;
  let after: number | null = null;
  if (selected) {
    if (isShopKey(selected)) {
      const entry = stock[Number(selected.slice(SHOP_PREFIX.length))];
      if (entry) {
        const price = buyPrice(rates, entry, rules);
        hint = t("shop.pickedBuy", { item: itemName(entry.item), n: price });
        after = credits - price;
      }
    } else {
      const loc = parseLoc(selected);
      const slot = loc ? slotAt(inventory, loc) : null;
      if (slot) {
        const gain = sellPrice(rates, slot.item, rules) * slot.qty;
        hint = gain > 0 ? t("shop.pickedSell", { item: itemName(slot.item), n: gain }) : t("shop.pickedNoSale", { item: itemName(slot.item) });
        after = gain > 0 ? credits + gain : null;
      }
    }
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center bg-black/50 p-3"
      style={{ bottom: bottomInset }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={t("shop.title")}
        className="pointer-events-auto flex max-h-full w-full max-w-xl flex-col gap-2 overflow-auto rounded border border-neutral-500 bg-neutral-950 p-3 font-mono text-[11px] text-neutral-200 shadow-xl"
      >
        <header className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-amber-200">
            {portrait && <img src={portrait.url} alt="" className="h-7 w-7 shrink-0 rounded-sm object-cover" />}
            <span className="truncate">{(def?.name ?? shopId).toUpperCase()}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-neutral-400" aria-live="polite">
              {t("shop.credits")} <span className="text-amber-200">{credits} cr</span>
              {after !== null && after !== credits && <span className={after < 0 ? "text-red-300" : "text-emerald-300"}> {"->"} {after} cr</span>}
            </span>
            <button type="button" onClick={onClose} className="px-1 text-neutral-400 hover:text-neutral-100" title={t("shop.close")} aria-label={t("shop.close")}>
              ×
            </button>
          </span>
        </header>
        {!def ? (
          <p className="text-red-300">{t("shop.missing", { id: shopId || t("dialogue.popup.ownShop") })}</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <div>
              <div className="mb-1 text-neutral-400">{t("shop.stock")}</div>
              <SlotGrid
                slots={shopSlots}
                cols={SHOP_COLS}
                keyOf={shopKey}
                onMove={onMove}
                title={(i) => t("shop.cell", { n: i + 1 })}
                labelOf={(i) => (stock[i] ? String(buyPrice(rates, stock[i], rules)) : undefined)}
                tipOf={(i) => (stock[i] ? t("shop.buyTip", { n: buyPrice(rates, stock[i], rules) }) : undefined)}
                badgeOf={(i) => (stock[i]?.qty === UNLIMITED ? "∞" : undefined)}
                onQuick={quick}
              />
            </div>
            <div>
              <div className="mb-1 text-neutral-400">{t("shop.backpack")}</div>
              <SlotGrid
                slots={inventory.pack}
                cols={PACK_COLS}
                keyOf={(i) => `pack:${i}`}
                onMove={onMove}
                title={(i) => t("inventory.cell", { n: i + 1 })}
                tipOf={(_, slot) => sellTip(slot)}
                onQuick={quick}
              />
            </div>
          </div>
        )}
        <div className="border-t border-neutral-700 pt-1">
          <div className="mb-1 text-neutral-400">{t("inventory.crew")}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {crew.map((mate) => (
              <div key={mate.id} className="flex items-center gap-1.5">
                <Avatar mate={mate} className="h-9 w-9 shrink-0" />
                <div className="min-w-0">
                  <div className={`truncate ${mate.hp > 0 ? "text-neutral-200" : "text-red-400"}`}>{mate.name}</div>
                  <HandBoxes crew={mate.id} name={mate.name} size="md" onMove={onMove} tipOf={sellTip} onQuick={quick} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="min-h-[2.2em] text-neutral-500" aria-live="polite">
          {notice ? (
            <span className="text-red-300">{t(`shop.fail.${notice}` as "shop.fail.full")}</span>
          ) : msg ? (
            <span className={msg.bad ? "text-red-300" : "text-emerald-300"}>{msg.text}</span>
          ) : hint ? (
            <span className="text-amber-200">{hint}</span>
          ) : (
            t("shop.help")
          )}
        </p>
      </section>
    </div>
  );
}
