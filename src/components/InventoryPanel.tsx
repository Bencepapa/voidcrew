import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PACK_COLS, packLoc, locKey, parseLoc, slotAt, usedCells } from "../game/inventory";
import { itemName, itemValue } from "../game/itemRules";
import { stacksText } from "../game/items";
import { haulOf, useInventory } from "../game/inventoryStore";
import { activeWorld } from "../game/worlds";
import { t } from "../i18n";
import { HelpTip, InfoArea, QtyPopover, SlotGrid, moveInInventory, slotOfKey, splitInInventory } from "./InventorySlots";
import { cancelDrag, cancelQty, clearInfo, clearSelection, dropSlot, dropSlotAsking, pinnedSlot, useDropOverPack, useInfoSlot, usePinnedSlot, useSelectedSlot, useSlotNotice } from "./slotDrag";
import { getInventory } from "../game/inventoryStore";

// the arrow keys move between slots: the nearest one that way
export function focusNeighbor(root: HTMLElement, key: string) {
  const slots = [...root.querySelectorAll<HTMLElement>("[data-slot]")];
  const here = document.activeElement instanceof HTMLElement && slots.includes(document.activeElement) ? document.activeElement : null;
  if (!here) {
    slots[0]?.focus();
    return;
  }
  const centre = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const from = centre(here);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of slots) {
    if (el === here) continue;
    const p = centre(el);
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const along = key === "ArrowRight" ? dx : key === "ArrowLeft" ? -dx : key === "ArrowDown" ? dy : -dy;
    if (along < 2) continue;
    const across = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    const score = along + across * 3;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  best?.focus();
}

// The party's inventory (see game/inventory.ts): the backpack's cells. The
// crew's hands are the hand boxes in the party's dock: the panel is modal -
// the world stands still behind it - but stops above the dock (partyDock), so
// those stay reachable. Items move by dragging them (to a cell, to a hand
// box); a click on one shows what it is (the info area). The keys are the
// panel's while it's open (arrows move, Enter and Space pick up and put down,
// I and Esc close).
export function InventoryPanel({ partyDock, onClose }: {
  partyDock: HTMLElement | null;
  onClose: () => void;
}) {
  const inventory = useInventory();
  const selected = useSelectedSlot();
  const notice = useSlotNotice();
  const overPack = useDropOverPack();
  const root = useRef<HTMLElement>(null);
  const [bottomInset, setBottomInset] = useState(0);

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

  // focus goes into the panel (the first cell), and back where it was when it closes
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.querySelector<HTMLElement>("[data-slot]")?.focus();
    return () => {
      cancelQty();
      clearSelection();
      clearInfo();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  // the keys are the panel's while it's open (the game's keys don't act behind it)
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // (the quantity chooser takes its own typing; only Esc is the panel's)
      if (e.key !== "Escape" && e.target instanceof Element && e.target.closest("[data-qty]")) return;
      const swallow = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === "Escape") {
        swallow();
        // (first a drag, then what's picked up, then the panel)
        if (!e.repeat && !cancelDrag() && !clearSelection()) latest.current();
      } else if (e.key === "i" || e.key === "I") {
        swallow();
        if (!e.repeat) latest.current();
      } else if (e.key === "d" || e.key === "D") {
        // drop the focused slot's item (else the pinned one) on the floor: all of it, with Shift choose how many
        swallow();
        if (e.repeat) return;
        const el = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>("[data-slot]") : null;
        const key = el?.dataset.slot ?? pinnedSlot();
        const stack = key ? slotOfKey(getInventory(), key) : null;
        if (!key || !stack) return;
        if (e.shiftKey && stack.qty > 1) {
          const r = (el ?? root.current)?.getBoundingClientRect();
          dropSlotAsking(key, stack.qty, { x: r ? r.left + r.width / 2 : 0, y: r ? r.top : 0 });
        } else dropSlot(key);
      } else if (e.key.startsWith("Arrow")) {
        swallow();
        if (root.current) focusNeighbor(root.current, e.key);
      } else if (e.key === "Enter" || e.key === " ") {
        // (a focused cell or button acts on it, as a button does)
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

  const haul = haulOf(inventory);
  const worth = Object.entries(haul).reduce((sum, [item, count]) => sum + count * itemValue(item), 0);
  const loose = Object.entries(inventory.overflow).map(([item, count]) => ({ item, count }));
  const picked = selected ? slotAt(inventory, parseLoc(selected) ?? packLoc(-1)) : null;
  const infoKey = useInfoSlot();
  const shown = infoKey ? slotOfKey(inventory, infoKey) : null;
  // (the Drop button is there for the item a click pinned: a hovered one is gone when the pointer goes to the button)
  const pinned = usePinnedSlot();
  const canDrop = !!shown && !!infoKey && infoKey === pinned;

  return (
    <div
      data-drop-world
      className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center bg-black/40 p-3"
      style={{ bottom: bottomInset }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={t("inventory.title")}
        data-drop-pack
        className={`pointer-events-auto flex max-h-full w-full max-w-md flex-col gap-2 overflow-auto rounded border bg-neutral-950 p-3 font-mono text-[11px] text-neutral-200 shadow-xl ${overPack ? "border-emerald-400" : "border-neutral-500"}`}
      >
        <header className="flex items-center justify-between">
          <span className="text-amber-200">
            {t("inventory.title").toUpperCase()} <span className="text-neutral-500">{t("inventory.cells", { used: usedCells(inventory), total: inventory.pack.length })}</span>
          </span>
          <span className="flex items-center gap-1">
            <HelpTip text={`${t("inventory.hint")} ${t("inventory.help")}`} />
            <button type="button" onClick={onClose} className="px-1 text-neutral-400 hover:text-neutral-100" title={t("inventory.close")} aria-label={t("inventory.close")}>
              ×
            </button>
          </span>
        </header>
        <SlotGrid
          slots={inventory.pack}
          cols={PACK_COLS}
          keyOf={(i) => locKey(packLoc(i))}
          onMove={moveInInventory}
          title={(i) => t("inventory.cell", { n: i + 1 })}
          onSplit={splitInInventory}
        />
        <QtyPopover />
        {loose.length > 0 && <div className="text-amber-300/90">{t("inventory.overflow", { items: stacksText(loose) })}</div>}
        {worth > 0 && (
          <div className="flex justify-between border-t border-neutral-700 pt-1">
            <span className="text-neutral-400">{t(activeWorld() === "fantasy" ? "inventory.worthFantasy" : "inventory.worth")}</span>
            <span>{t("inventory.worthValue", { n: worth })}</span>
          </div>
        )}
        <InfoArea slot={shown} empty={t("inventory.infoEmpty")} onDrop={canDrop ? (at) => dropSlotAsking(infoKey!, shown!.qty, at) : undefined} />
        <p className="h-[1.4em] truncate text-neutral-500" aria-live="polite">
          {notice ? <span className="text-red-300">{t(`inventory.fail.${notice}` as "inventory.fail.full")}</span> : picked ? <span className="text-amber-200">{t("inventory.selected", { item: itemName(picked.item) })}</span> : null}
        </p>
      </section>
    </div>
  );
}
