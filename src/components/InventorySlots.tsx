import { useEffect, useRef, useState } from "react";
import { LEFT, RIGHT, halfOf, handLoc, handView, locKey, parseLoc, slotAt, type HandIndex, type Inventory, type Slot } from "../game/inventory";
import { itemInfo, type Texts } from "../game/itemInfo";
import { itemName, itemRules, itemValue, weaponTypeOfItem } from "../game/itemRules";
import { ITEM_TYPES } from "../game/items";
import { moveItem, splitItem, useInventory } from "../game/inventoryStore";
import { getMeta } from "../game/meta";
import { hasKey, t, type Key } from "../i18n";
import { pickupTexture, useSharedImages } from "../render/sharedImages";
import { activateSlot, askQty, beginDrag, cancelQty, confirmQty, hoverSlot, inspectSlot, justDragged, pinSlot, useDrag, useDragging, useQtyAsk, useSlotStatus, type MoveFn } from "./slotDrag";

// The building blocks of the inventory screens (a shop's later): a slot that
// shows an item and takes drags and clicks, a grid of them, a crewmate's two
// hand boxes. They take the keys and the move function from their parents
// (a slot's key is its `data-slot`, see slotDrag.ts); nothing here is
// specific to the backpack.

// the backpack's and the hands' own move: see moveItem
export const moveInInventory: MoveFn = (from, to, qty) => {
  if (mover) return mover(from, to, qty);
  const result = moveItem(from, to, qty);
  return result.ok ? null : result.reason;
};

// ctrl+click, after choosing how many: that many into the first free cell
export const splitInInventory = (from: string, qty: number): string | null => {
  const result = splitItem(from, qty);
  return result.ok ? null : result.reason;
};

// A window that takes over the moves while it is open (the shop: the party's
// dock hand boxes, which are always there, must be able to sell to it).
let mover: MoveFn | null = null;
export function setMover(fn: MoveFn | null) {
  mover = fn;
}

const SIZES = {
  // the crew panel's hand boxes
  sm: "h-7 w-7 text-[9px]",
  md: "h-10 w-10 text-[10px]",
  lg: "h-11 w-11 text-[11px]",
};
export type SlotSize = keyof typeof SIZES;

// "Pulse rifle" -> "PR"
const shortName = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

// An item's picture: its pickup image, or (a weapon, or no image) a short name.
export function ItemIcon({ item, uid, className = "" }: { item: string; uid?: number; className?: string }) {
  useSharedImages();
  // (the item whose picture failed to load)
  const [broken, setBroken] = useState<string | null>(null);
  const weapon = weaponTypeOfItem(item);
  const level = weapon !== null ? (getMeta().weapons.find((w) => w.id === uid)?.level ?? 0) : 0;
  if (weapon === null && ITEM_TYPES[item] && broken !== item) {
    return (
      <img
        src={pickupTexture(item).diffuse}
        alt=""
        draggable={false}
        onError={() => setBroken(item)}
        className={`h-full w-full object-contain p-0.5 [image-rendering:pixelated] ${className}`}
      />
    );
  }
  return (
    <span className={`flex h-full w-full items-center justify-center font-bold leading-none ${weapon !== null ? "text-amber-200" : "text-neutral-300"} ${className}`}>
      {shortName(itemName(item))}
      {level > 0 && <span className="text-emerald-300">+{level}</span>}
    </span>
  );
}

const ring: Record<string, string> = {
  idle: "border-neutral-600",
  source: "border-neutral-500 opacity-40",
  over: "border-emerald-400 bg-emerald-900/40",
  picked: "border-amber-300 bg-amber-900/30",
};

// One place for an item: a cell, a hand. Drag its item away, drop another on
// it; a click uses it (`onUse`) or shows what it is; Enter and Space pick up
// and put down (the keyboard's way). `ghost`: the two-handed item the
// other hand holds, shown dimmed (it can be dragged from here too).
export function SlotBox({
  slotKey,
  slot,
  ghost = null,
  onMove,
  size = "md",
  label,
  title,
  tabIndex,
  tip,
  badge,
  onQuick,
  onUse,
  onSplit,
  maxQtyOf,
}: {
  slotKey: string;
  slot: Slot | null;
  ghost?: Slot | null;
  // ctrl+click on a stack, after choosing how many: the split (or a deal's quantity)
  onSplit?: (slotKey: string, qty: number) => string | null;
  // the most that can be chosen (a shop's unlimited stock), else the stack's quantity
  maxQtyOf?: number;
  // a click uses what the box holds (the dock's hand boxes): true when it did
  // something; false leaves the click to show the item's description
  onUse?: (slotKey: string) => boolean;
  onMove: MoveFn;
  size?: SlotSize;
  // a letter in the corner (L, R), or - on an item - a short text (a shop's price)
  label?: string;
  // what it is, when it holds nothing
  title: string;
  tabIndex?: number;
  // more for the tooltip (a shop's price)
  tip?: string;
  // the corner's count, instead of the quantity (a shop's "unlimited")
  badge?: string;
  // shift+click, double click and shift+Enter: the quick move (a shop's buy and sell)
  onQuick?: (slotKey: string) => void;
}) {
  const status = useSlotStatus(slotKey);
  const dragging = useDragging();
  const shown = slot ?? ghost;
  const maxQty = maxQtyOf ?? shown?.qty ?? 1;
  const text = shown
    ? [
        shown.qty > 1 ? t("inventory.itemTip", { name: itemName(shown.item), qty: shown.qty }) : itemName(shown.item),
        itemRules.twoHanded(shown.item) ? t("inventory.twoHanded") : "",
        itemValue(shown.item) ? t("inventory.valueTip", { n: itemValue(shown.item) }) : "",
        tip ?? "",
      ]
        .filter(Boolean)
        .join(", ")
    : `${title} (${t("inventory.empty")})`;
  return (
    <button
      type="button"
      data-slot={slotKey}
      title={text}
      aria-label={shown ? `${title}: ${text}` : text}
      tabIndex={tabIndex}
      onPointerDown={shown ? (e) => beginDrag(e, slotKey, shown, onMove, maxQty) : undefined}
      onClick={(e) => {
        if (justDragged()) return;
        // ctrl+click on a stack: choose how many (a split, or a deal's quantity)
        if (onSplit && slot && maxQty > 1 && (e.ctrlKey || e.metaKey)) {
          askQty({ x: e.clientX, y: e.clientY, max: maxQty, apply: (n) => onSplit(slotKey, n) });
          return;
        }
        if (onQuick && shown && e.shiftKey) {
          onQuick(slotKey);
          return;
        }
        // (Enter and Space click a button with no pointer: that is the
        // keyboard's pick up and put down; the mouse and touch only use or
        // describe - moving them is dragging)
        if (e.detail === 0 && !onUse) {
          activateSlot(slotKey, !!shown, onMove);
          inspectSlot(shown ? slotKey : null);
          return;
        }
        if (!shown) return;
        if (onUse?.(slotKey)) return;
        pinSlot(slotKey);
      }}
      onDoubleClick={onQuick && shown ? () => onQuick(slotKey) : undefined}
      onPointerEnter={(e) => e.pointerType === "mouse" && shown && hoverSlot(slotKey)}
      onPointerLeave={() => hoverSlot(null)}
      onFocus={() => shown && hoverSlot(slotKey)}
      onBlur={() => hoverSlot(null)}
      className={`relative shrink-0 select-none rounded-sm border bg-black/50 outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${SIZES[size]} ${ring[status]} ${shown ? `touch-none ${dragging ? "cursor-grabbing" : "cursor-pointer"}` : ""}`}
    >
      {shown && (
        <span className={`block h-full w-full ${slot ? "" : "opacity-35"}`}>
          <ItemIcon item={shown.item} uid={shown.uid} />
        </span>
      )}
      {slot && (badge || slot.qty > 1) && <span className="absolute bottom-0 right-0.5 text-[9px] font-bold leading-none text-neutral-100 [text-shadow:0_0_2px_#000]">{badge ?? slot.qty}</span>}
      {shown && itemRules.twoHanded(shown.item) && (
        <span className="absolute left-0.5 top-0 text-[8px] leading-none text-amber-300/80">{t("inventory.twoHandedShort")}</span>
      )}
      {label && !shown && <span className="absolute inset-0 flex items-center justify-center text-neutral-600">{label}</span>}
      {label && shown && <span className="absolute bottom-0 left-0.5 text-[8px] leading-none text-neutral-300 [text-shadow:0_0_2px_#000]">{label}</span>}
    </button>
  );
}

// a grid of cells: `keyOf(i)` names each place for the drag ("pack:3")
export function SlotGrid({
  slots,
  cols,
  keyOf,
  onMove,
  size = "md",
  title,
  labelOf,
  tipOf,
  badgeOf,
  onQuick,
  onSplit,
  maxQtyOf,
}: {
  slots: readonly (Slot | null)[];
  onSplit?: (slotKey: string, qty: number) => string | null;
  maxQtyOf?: (index: number, slot: Slot) => number | undefined;
  cols: number;
  keyOf: (index: number) => string;
  onMove: MoveFn;
  size?: SlotSize;
  title: (index: number) => string;
  // per cell, for SlotBox's label, tip and badge (a shop's prices)
  labelOf?: (index: number, slot: Slot) => string | undefined;
  tipOf?: (index: number, slot: Slot) => string | undefined;
  badgeOf?: (index: number, slot: Slot) => string | undefined;
  onQuick?: (slotKey: string) => void;
}) {
  return (
    <div className="grid w-fit gap-1" style={{ gridTemplateColumns: `repeat(${cols}, max-content)` }}>
      {slots.map((slot, i) => (
        <SlotBox
          key={i}
          slotKey={keyOf(i)}
          slot={slot}
          onMove={onMove}
          size={size}
          title={title(i)}
          label={slot ? labelOf?.(i, slot) : undefined}
          tip={slot ? tipOf?.(i, slot) : undefined}
          badge={slot ? badgeOf?.(i, slot) : undefined}
          onQuick={onQuick}
          onSplit={onSplit}
          maxQtyOf={slot ? maxQtyOf?.(i, slot) : undefined}
        />
      ))}
    </div>
  );
}

// The quantity chooser (see askQty in slotDrag.ts): a number with - and +,
// starting at half the stack; Enter or OK does it, Esc or Cancel doesn't.
export function QtyPopover() {
  const ask = useQtyAsk();
  if (!ask) return null;
  return <QtyBox key={`${ask.x}:${ask.y}:${ask.max}`} ask={ask} />;
}
function QtyBox({ ask }: { ask: NonNullable<ReturnType<typeof useQtyAsk>> }) {
  const [n, setN] = useState(halfOf(ask.max));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const clamp = (v: number) => Math.max(1, Math.min(ask.max, Number.isFinite(v) ? Math.floor(v) : 1));
  const left = Math.max(4, Math.min(ask.x - 70, window.innerWidth - 150));
  const top = Math.max(4, Math.min(ask.y - 56, window.innerHeight - 80));
  return (
    <div
      data-qty=""
      role="dialog"
      aria-label={t("inventory.qty.title")}
      className="pointer-events-auto fixed z-[220] flex flex-col gap-1 rounded border border-amber-300 bg-neutral-950 p-1.5 font-mono text-[11px] text-neutral-200 shadow-xl"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="text-neutral-400">{t("inventory.qty.title")}</div>
      <div className="flex items-center gap-1">
        <button type="button" className="h-6 w-6 rounded-sm border border-neutral-600 hover:bg-neutral-800" aria-label="-" onClick={() => setN((v) => clamp(v - 1))}>
          -
        </button>
        <input
          ref={input}
          type="number"
          min={1}
          max={ask.max}
          value={n}
          aria-label={t("inventory.qty.title")}
          className="h-6 w-14 rounded-sm border border-neutral-600 bg-black/60 px-1 text-center"
          onChange={(e) => setN(clamp(Number(e.target.value)))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmQty(n);
            }
          }}
        />
        <button type="button" className="h-6 w-6 rounded-sm border border-neutral-600 hover:bg-neutral-800" aria-label="+" onClick={() => setN((v) => clamp(v + 1))}>
          +
        </button>
        <span className="text-neutral-500">/ {ask.max}</span>
      </div>
      <div className="flex gap-1">
        <button type="button" className="flex-1 rounded-sm border border-emerald-600 px-1 py-0.5 text-emerald-200 hover:bg-emerald-900/40" onClick={() => confirmQty(n)}>
          {t("inventory.qty.ok")}
        </button>
        <button type="button" className="flex-1 rounded-sm border border-neutral-600 px-1 py-0.5 hover:bg-neutral-800" onClick={cancelQty}>
          {t("inventory.qty.cancel")}
        </button>
      </div>
    </div>
  );
}

// A crewmate's two hands, left and right: what they hold, to drag to and
// from. A two-handed item shows in the right box and dimmed in the left.
export function HandBoxes({ crew, name, onMove = moveInInventory, size = "sm", tabbable = true, tipOf, onQuick, onUse }: {
  crew: string;
  name: string;
  onMove?: MoveFn;
  size?: SlotSize;
  tabbable?: boolean;
  tipOf?: (slot: Slot) => string | undefined;
  onQuick?: (slotKey: string) => void;
  // a click on a hand box uses what it holds (the party dock's)
  onUse?: (hand: HandIndex) => boolean;
}) {
  const inventory = useInventory();
  const view = handView(inventory, crew, itemRules);
  return (
    <div className="flex gap-0.5">
      <SlotBox
        slotKey={locKey(handLoc(crew, LEFT))}
        slot={view.left}
        ghost={view.leftBlocked ? view.right : null}
        onMove={onMove}
        size={size}
        label={t("inventory.hand.leftShort")}
        title={t("inventory.hand.left", { name })}
        tabIndex={tabbable ? undefined : -1}
        tip={tipOf && (view.left ?? (view.leftBlocked ? view.right : null)) ? tipOf((view.left ?? view.right)!) : undefined}
        onQuick={onQuick}
        onUse={onUse && (() => onUse(LEFT))}
      />
      <SlotBox
        slotKey={locKey(handLoc(crew, RIGHT))}
        slot={view.right}
        onMove={onMove}
        size={size}
        label={t("inventory.hand.rightShort")}
        title={t("inventory.hand.right", { name })}
        tabIndex={tabbable ? undefined : -1}
        tip={view.right ? tipOf?.(view.right) : undefined}
        onQuick={onQuick}
        onUse={onUse && (() => onUse(RIGHT))}
      />
    </div>
  );
}

// --- what an item is ---

export const infoTexts: Texts = { t: (key, values) => t(key as Key, values), has: hasKey };

// the stack in the place a slot key names (the left hand shows a two-handed item the right holds)
export function slotOfKey(inv: Inventory, key: string): Slot | null {
  const loc = parseLoc(key);
  if (!loc) return null;
  if (loc.kind === "hand" && loc.hand === LEFT) {
    const view = handView(inv, loc.crew, itemRules);
    return view.left ?? (view.leftBlocked ? view.right : null);
  }
  return slotAt(inv, loc);
}

// an item's description as one line, for a tooltip
export const infoLine = (slot: Slot): string => {
  const info = itemInfo(slot.item, infoTexts, slot.uid, getMeta().weapons);
  return [info.name, ...info.lines].join(" ");
};

// The area that says what an item is: its name and its lines (or `empty` when
// there is none to show); `extra` goes last (a shop's price). Its height is
// fixed, so the panel around it never changes size with the text (a panel that
// grew under the pointer made the item lose the hover and the panel shrink
// again, every frame): a long text scrolls inside it.
const INFO_BOX = "h-[6.5em] overflow-y-auto border-t border-neutral-700 pt-1";
export function InfoArea({ slot, empty, extra, onDrop }: {
  slot: Slot | null;
  empty: string;
  extra?: string;
  // a Drop button beside the name (the inventory panel's: the item onto the floor); not in a shop's
  onDrop?: (at: { x: number; y: number }) => void;
}) {
  if (!slot) return <div className={INFO_BOX + " text-neutral-500"}>{empty}</div>;
  const info = itemInfo(slot.item, infoTexts, slot.uid, getMeta().weapons);
  return (
    <div className={INFO_BOX} aria-live="polite" tabIndex={-1}>
      <div className="flex items-start justify-between gap-2 text-amber-200">
        <span>
          {info.name}
          {slot.qty > 1 && <span className="text-neutral-400"> x{slot.qty}</span>}
        </span>
        {onDrop && (
          <button
            type="button"
            title={t("inventory.dropTitle")}
            className="shrink-0 rounded-sm border border-neutral-600 px-1.5 leading-tight text-neutral-200 hover:border-amber-300 hover:text-amber-200"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onDrop({ x: r.left + r.width / 2, y: r.top });
            }}
          >
            {t("inventory.drop")}
          </button>
        )}
      </div>
      <ul className="mt-0.5 space-y-0.5 text-neutral-300">
        {info.lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
        {extra && <li className="text-emerald-300">{extra}</li>}
      </ul>
    </div>
  );
}

// A "?" button that opens a short text over the panel (not in its layout: the
// panel keeps its size) - the long how-to lines live behind it.
export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={t("inventory.helpTitle")}
        title={t("inventory.helpTitle")}
        onClick={() => setOpen((v) => !v)}
        className={"h-4 w-4 rounded-full border text-[10px] leading-none " + (open ? "border-amber-300 text-amber-200" : "border-neutral-500 text-neutral-400 hover:text-neutral-100")}
      >
        ?
      </button>
      {open && (
        <span role="note" className="absolute right-0 top-5 z-10 block w-64 rounded border border-neutral-500 bg-neutral-900 p-2 text-[11px] leading-snug text-neutral-200 shadow-xl">
          {text}
        </span>
      )}
    </span>
  );
}

// the item under the pointer while one is dragged
export function DragGhost() {
  const drag = useDrag();
  if (!drag) return null;
  return (
    <div
      className="pointer-events-none fixed z-[200] h-11 w-11 rounded-sm border border-amber-300 bg-black/80 opacity-90"
      style={{ left: drag.x - 22, top: drag.y - 22 }}
    >
      <ItemIcon item={drag.slot.item} uid={drag.slot.uid} />
    </div>
  );
}
