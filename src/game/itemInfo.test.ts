import assert from "node:assert/strict";
import { itemInfo, type Texts } from "./itemInfo";
import { ITEM_CATEGORIES, ITEM_TYPES } from "./items";
import { WEAPON_TYPES } from "./weapons";
import { inventoryEn } from "../i18n/en/inventory";
import { itemInfoEn } from "../i18n/en/itemInfo";
import { itemInfoHu } from "../i18n/hu/itemInfo";

// real english texts, so a missing key shows up as the key itself
const dict: Record<string, string> = { ...itemInfoEn };
const texts: Texts = {
  t: (key, values) => (dict[key] ?? `?${key}`).replace(/\{(\w+)\}/g, (_, n: string) => String(values?.[n])),
  has: (key) => key in dict,
};
const noMissing = (lines: string[]) => assert.ok(lines.every((l) => !l.startsWith("?") && !l.includes("undefined")), lines.join(" | "));

// a weapon: damage, range, cooldown, hands
const rifle = itemInfo("weapon:pulse_rifle", texts);
assert.equal(rifle.name, "Pulse rifle");
assert.ok(rifle.lines.some((l) => l.includes("5-9")), "damage");
assert.ok(rifle.lines.some((l) => l.includes("8")), "range");
assert.ok(rifle.lines.some((l) => l === dict["itemInfo.twoHanded"]));
assert.ok(rifle.lines.some((l) => l.includes("3")), "burst");
noMissing(rifle.lines);

// a stun weapon says so; a heal weapon heals instead of damaging
assert.ok(itemInfo("weapon:shock_emitter", texts).lines.some((l) => l.includes("2.5")));
const stim = itemInfo("weapon:stim_injector", texts);
assert.ok(stim.lines.some((l) => l.includes("8-14")) && !stim.lines.some((l) => l === dict["itemInfo.twoHanded"]));

// an upgraded weapon shows its level and its better numbers
const upgraded = itemInfo("weapon:sidearm", texts, 7, [{ id: 7, type: "sidearm", level: 2 }]);
assert.equal(upgraded.name, "Sidearm +2");
assert.ok(upgraded.lines.some((l) => l.includes("2")) && upgraded.lines.some((l) => l.includes("8-13")));

// every weapon and every item gets lines with no hole in them
for (const id of Object.keys(WEAPON_TYPES)) noMissing(itemInfo(`weapon:${id}`, texts).lines);
for (const id of Object.keys(ITEM_TYPES)) noMissing(itemInfo(id, texts).lines);

// a usable item says what it does, one that isn't says that
assert.ok(itemInfo("potion_red", texts).lines.some((l) => l.includes("12-20")));
assert.ok(itemInfo("scrap", texts).lines.includes(dict["itemInfo.noUse"]));

// an item with no text of its own is generated from its category and value
ITEM_TYPES.shared_test = { name: "Odd thing", category: "data", value: 0 };
const odd = itemInfo("shared_test", texts);
assert.equal(odd.lines[0], dict["itemInfo.cat.data"]);
assert.ok(odd.lines.includes(dict["itemInfo.noValue"]));
delete ITEM_TYPES.shared_test;

// an unknown id doesn't throw
assert.equal(itemInfo("nothing_here", texts).name, "nothing_here");

// every category has a generated line, and Hungarian has what English has
for (const c of ITEM_CATEGORIES) assert.ok(`itemInfo.cat.${c}` in dict, c);
for (const key of Object.keys(itemInfoEn)) assert.ok(key in itemInfoHu, `hu: ${key}`);
assert.ok("inventory.worthFantasy" in inventoryEn);

console.log("itemInfo tests passed");
