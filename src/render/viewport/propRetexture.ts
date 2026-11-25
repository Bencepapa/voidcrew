import type { PropType } from "../../game/props";

// a prop type wearing another texture set (see PropSpec.texture)
export function retextured(type: PropType, texture: string | undefined, isTextureSetId: (id: string) => boolean): PropType {
  if (!texture) return type;
  switch (type.kind) {
    case "box":
      return { ...type, side: texture, top: isTextureSetId(`${texture}_top`) ? `${texture}_top` : texture };
    case "pillar":
    case "roof":
    case "panel":
    case "cross":
      return { ...type, texture };
    default:
      return type;
  }
}
