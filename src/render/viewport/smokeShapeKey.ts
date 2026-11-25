import type { GameMap } from "../../game/types";

export function smokeShapeKey(m: Pick<GameMap, "smokes">): string | undefined {
  return JSON.stringify(m.smokes?.map(({ color, lightColor, lightIntensity, lightReach, active, harm, ...rest }) => rest));
}
