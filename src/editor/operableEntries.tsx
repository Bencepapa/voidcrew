import type { ReactNode } from "react";
import { CircleDot, Crosshair, Skull, Sparkles, Square, ToggleRight } from "lucide-react";
import { hasKey, t, type Key } from "../i18n";
import { OPERABLE_PROPS } from "../game/operables";
import { assetInWorld } from "../game/worlds";

// The asset tree's "Operable" group: the lever, button, pressure plate, trap cell and the two wall traps. They are props
// (the Prop tool puts them in), listed apart from the others because what they do is set up in the Inspector.

const ICONS: Record<string, ReactNode> = {
  lever1: <ToggleRight size={28}/>,
  button1: <CircleDot size={28}/>,
  plate1: <Square size={28}/>,
  trapcell1: <Skull size={28}/>,
  arrowslit1: <Crosshair size={28}/>,
  glyph1: <Sparkles size={28}/>,
};

export function operableEntries(choice: string, choose: (id: string) => void) {
  return Object.keys(OPERABLE_PROPS).filter((id) => assetInWorld(id)).map((id) => ({
    id,
    label: hasKey(`assetTree.name.${id}`) ? t(`assetTree.name.${id}` as Key) : id,
    search: id,
    kind: t(`operable.kind.${OPERABLE_PROPS[id].kind}`),
    icon: ICONS[id],
    active: choice === id,
    pick: () => choose(id),
  }));
}
