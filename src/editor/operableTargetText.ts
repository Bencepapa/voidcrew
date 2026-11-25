import { t } from "../i18n";
import type { Address } from "../game/emitters";
import { ITEM_TYPES } from "../game/items";
import type { OperableTarget } from "../game/operables";

// A target in one readable line (the panel's list, the editor's log): "Door 3,1", "Emitter 5,2 (switch on)", "Dormant NPC
// 4,4", "Reward: 50 credits, 2 x Medkit".

const placeOf = (a: Address): string =>
  a.id ? t("operable.target.byId", { id: a.id })
    : a.area ? t("operable.target.area", { from: `${a.area.x0},${a.area.y0}`, to: `${a.area.x1},${a.area.y1}` })
      : `${a.x},${a.y}${a.index !== undefined ? ` #${a.index + 1}` : ""}`;

export function describeTarget(target: OperableTarget): string {
  switch (target.kind) {
    case "door": return t("operable.target.door", { x: target.x, y: target.y });
    case "trap": return t("operable.target.trap", { x: target.x, y: target.y, side: target.side ? ` ${target.side}` : "" });
    case "emitter": return t("operable.target.emitter", { at: placeOf(target) });
    case "sound": return t("operable.target.sound", { at: placeOf(target) });
    case "spawn": return t("operable.target.spawn", { at: placeOf(target) });
    case "item": return t("operable.target.item", { at: placeOf(target) });
    case "reward": {
      const parts = [
        ...(target.credits ? [t("operable.target.credits", { n: target.credits })] : []),
        ...(target.items ?? []).map((i) => `${i.qty} × ${ITEM_TYPES[i.item]?.name ?? i.item}`),
      ];
      return t("operable.target.reward", { what: parts.join(", ") || "-" });
    }
  }
}
