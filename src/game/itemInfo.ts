import { itemName, itemRules, itemValue, weaponOf, weaponTypeOfItem } from "./itemRules";
import { ITEM_TYPES } from "./items";
import { WEAPON_TYPES, type OwnedWeapon } from "./weapons";

// What an item is, as short lines of text for the inventory's info area and
// the hand boxes' tooltips: derived from the item's type data (weapons.ts,
// items.ts), so a new item has something to say without writing anything.
// A per-item text (`itemInfo.desc.<id>` in the i18n files) replaces the
// generated "what it is" line. Pure: the texts come in through `Texts`.

export interface Texts {
  t: (key: string, values?: Record<string, string | number>) => string;
  has: (key: string) => boolean;
}

export interface ItemInfo {
  name: string;
  lines: string[];
}

const seconds = (ms: number) => Math.round(ms / 100) / 10;
const range = ([lo, hi]: [number, number]) => (lo === hi ? String(lo) : `${lo}-${hi}`);

export function itemInfo(item: string, texts: Texts, uid?: number, owned: readonly OwnedWeapon[] = []): ItemInfo {
  const { t, has } = texts;
  const lines: string[] = [];
  const weaponType = weaponTypeOfItem(item);
  if (weaponType !== null) {
    const base = WEAPON_TYPES[weaponType];
    const weapon = weaponOf(item, uid, owned);
    if (!base || !weapon) return { name: itemName(item), lines: [t("itemInfo.unknown")] };
    lines.push(base.blurb);
    if (weapon.kind === "heal") {
      lines.push(t("itemInfo.heals", { n: range(weapon.amount) }));
    } else {
      lines.push(t("itemInfo.damage", { n: range(weapon.amount) }));
      if (weapon.range !== undefined) lines.push(t("itemInfo.range", { n: weapon.range }));
      if (weapon.burst && weapon.burst > 1) lines.push(t("itemInfo.burst", { n: weapon.burst }));
      if (weapon.stunMs) lines.push(t("itemInfo.stun", { n: seconds(weapon.stunMs) }));
    }
    lines.push(t("itemInfo.cooldown", { n: seconds(weapon.cooldownMs) }));
    lines.push(t(itemRules.twoHanded(item) ? "itemInfo.twoHanded" : "itemInfo.oneHanded"));
    const level = owned.find((w) => w.id === uid)?.level ?? 0;
    if (level > 0) lines.push(t("itemInfo.level", { n: level }));
    lines.push(t("itemInfo.worth", { n: itemValue(item) }));
    return { name: weapon.name, lines };
  }

  const type = ITEM_TYPES[item];
  if (!type) return { name: itemName(item), lines: [t("itemInfo.unknown")] };
  const descKey = `itemInfo.desc.${item}`;
  lines.push(has(descKey) ? t(descKey) : t(`itemInfo.cat.${type.category}`));
  if (type.use) {
    if (type.use.hp) lines.push(t("itemInfo.useHp", { n: range(type.use.hp) }));
    if (type.use.en) lines.push(t("itemInfo.useEn", { n: range(type.use.en) }));
    lines.push(t(type.use.target === "self" ? "itemInfo.useSelf" : "itemInfo.useHurt"));
  } else {
    lines.push(t("itemInfo.noUse"));
  }
  if (itemRules.twoHanded(item)) lines.push(t("itemInfo.twoHanded"));
  lines.push(type.value > 0 ? t("itemInfo.worthEach", { n: type.value }) : t("itemInfo.noValue"));
  return { name: type.name, lines };
}
