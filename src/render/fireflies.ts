import { spriteCloud, type SpriteEmitter } from "./spriteCloud";
export const createFireflies = (emitters: SpriteEmitter[], quality=1) => spriteCloud(emitters, quality, "fireflies");
