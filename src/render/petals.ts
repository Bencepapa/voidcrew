import { spriteCloud, type SpriteEmitter } from "./spriteCloud";
export type { PetalEmitter } from "./motes";
export const createPetals = (emitters: SpriteEmitter[], quality=1) => spriteCloud(emitters, quality, "petals");
