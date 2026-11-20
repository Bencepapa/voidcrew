import { useState } from "react";
import { LEFT, RIGHT, handLoc, handView, locKey, type Slot } from "../game/inventory";
import { itemName, itemRules, itemValue, weaponTypeOfItem } from "../game/itemRules";
import { ITEM_TYPES } from "../game/items";
import { moveItem, useInventory } from "../game/inventoryStore";
import { getMeta } from "../game/meta";
import { t } from "../i18n";
import { pickupTexture, useSharedImages } from "../render/sharedImages";
import { activateSlot, beginDrag, useDrag, useSlotStatus, type MoveFn } from "./slotDrag";

// The building blocks of the inventory screens (a shop's later): a slot that
// shows an item and takes drags and clicks, a grid of them, a crewmate's two
// hand boxes. They take the keys and the move function from their parents
// (a slot's key is its `data-slot`, see slotDrag.ts); nothing here is
// specific to the backpack.

// the backpack's and the hands' own move: see moveItem
export const moveInInventory: MoveFn = (from, to) => {
  const result = moveItem(from, to);
  return result.ok ? null : result.reason;
};

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
// it, or click (to pick up, to put down). `ghost`: the two-handed item the
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
}: {
  slotKey: string;
  slot: Slot | null;
  ghost?: Slot | null;
  onMove: MoveFn;
  size?: SlotSize;
  // a letter in the corner (L, R)
  label?: string;
  // what it is, when it holds nothing
  title: string;
  tabIndex?: number;
}) {
  const status = useSlotStatus(slotKey);
  const shown = slot ?? ghost;
  const text = shown
    ? [
        shown.qty > 1 ? t("inventory.itemTip", { name: itemName(shown.item), qty: shown.qty }) : itemName(shown.item),
        itemRules.twoHanded(shown.item) ? t("inventory.twoHanded") : "",
        itemValue(shown.item) ? t("inventory.valueTip", { n: itemValue(shown.item) }) : "",
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
      onClick={() => activateSlot(slotKey, !!shown, onMove)}
      className={`relative shrink-0 select-none rounded-sm border bg-black/50 outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${SIZES[size]} ${ring[status]} ${shown ? "touch-none cursor-grab" : ""}`}
    >
      {shown && (
        <span className={`block h-full w-full ${slot ? "" : "opacity-35"}`}>
          <ItemIcon item={shown.item} uid={shown.uid} />
        </span>
      )}
      {slot && slot.qty > 1 && <span className="absolute bottom-0 right-0.5 text-[9px] font-bold leading-none text-neutral-100 [text-shadow:0_0_2px_#000]">{slot.qty}</span>}
      {shown && itemRules.twoHanded(shown.item) && (
        <span className="absolute left-0.5 top-0 text-[8px] leading-none text-amber-300/80">{t("inventory.twoHandedShort")}</span>
      )}
      {label && !shown && <span className="absolute inset-0 flex items-center justify-center text-neutral-600">{label}</span>}
      {label && shown && <span className="absolute bottom-0 left-0.5 text-[8px] leading-none text-neutral-400">{label}</span>}
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
}: {
  slots: readonly (Slot | null)[];
  cols: number;
  keyOf: (index: number) => string;
  onMove: MoveFn;
  size?: SlotSize;
  title: (index: number) => string;
}) {
  return (
    <div className="grid w-fit gap-1" style={{ gridTemplateColumns: `repeat(${cols}, max-content)` }}>
      {slots.map((slot, i) => (
        <SlotBox key={i} slotKey={keyOf(i)} slot={slot} onMove={onMove} size={size} title={title(i)} />
      ))}
    </div>
  );
}

// A crewmate's two hands, left and right: what they hold, to drag to and
// from. A two-handed item shows in the right box and dimmed in the left.
export function HandBoxes({ crew, name, onMove = moveInInventory, size = "sm", tabbable = true }: {
  crew: string;
  name: string;
  onMove?: MoveFn;
  size?: SlotSize;
  tabbable?: boolean;
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
      />
      <SlotBox
        slotKey={locKey(handLoc(crew, RIGHT))}
        slot={view.right}
        onMove={onMove}
        size={size}
        label={t("inventory.hand.rightShort")}
        title={t("inventory.hand.right", { name })}
        tabIndex={tabbable ? undefined : -1}
      />
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
