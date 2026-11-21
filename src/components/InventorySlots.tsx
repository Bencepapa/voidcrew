import { useState } from "react";
import { LEFT, RIGHT, handLoc, handView, locKey, parseLoc, slotAt, type HandIndex, type Inventory, type Slot } from "../game/inventory";
import { itemInfo, type Texts } from "../game/itemInfo";
import { itemName, itemRules, itemValue, weaponTypeOfItem } from "../game/itemRules";
import { ITEM_TYPES } from "../game/items";
import { moveItem, useInventory } from "../game/inventoryStore";
import { getMeta } from "../game/meta";
import { hasKey, t, type Key } from "../i18n";
import { pickupTexture, useSharedImages } from "../render/sharedImages";
import { activateSlot, beginDrag, hoverSlot, inspectSlot, justDragged, useDrag, useDragging, useSlotStatus, type MoveFn } from "./slotDrag";

// The building blocks of the inventory screens (a shop's later): a slot that
// shows an item and takes drags and clicks, a grid of them, a crewmate's two
// hand boxes. They take the keys and the move function from their parents
// (a slot's key is its `data-slot`, see slotDrag.ts); nothing here is
// specific to the backpack.

// the backpack's and the hands' own move: see moveItem
export const moveInInventory: MoveFn = (from, to) => {
  if (mover) return mover(from, to);
  const result = moveItem(from, to);
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
}: {
  slotKey: string;
  slot: Slot | null;
  ghost?: Slot | null;
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
      onPointerDown={shown ? (e) => beginDrag(e, slotKey, shown, onMove) : undefined}
      onClick={(e) => {
        if (justDragged()) return;
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
        inspectSlot(slotKey);
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
}: {
  slots: readonly (Slot | null)[];
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
        />
      ))}
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

// The fixed area that says what an item is: its name and a few lines (or
// `empty` when there is none to show); `extra` goes last (a shop's price).
export function InfoArea({ slot, empty, extra }: { slot: Slot | null; empty: string; extra?: string }) {
  if (!slot) return <div className="min-h-[7em] border-t border-neutral-700 pt-1 text-neutral-500">{empty}</div>;
  const info = itemInfo(slot.item, infoTexts, slot.uid, getMeta().weapons);
  return (
    <div className="min-h-[7em] border-t border-neutral-700 pt-1" aria-live="polite">
      <div className="text-amber-200">
        {info.name}
        {slot.qty > 1 && <span className="text-neutral-400"> x{slot.qty}</span>}
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
