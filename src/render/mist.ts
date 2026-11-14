import { spriteCloud, type SpriteEmitter } from "./spriteCloud";
export const createMist = (emitters: SpriteEmitter[], quality=1) => spriteCloud(emitters, quality, "mist");
