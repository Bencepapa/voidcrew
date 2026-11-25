import assert from "node:assert/strict";
import type { PropType } from "../../game/props";
import { retextured } from "./propRetexture";

const box: PropType = { kind: "box", size: [1, 1, 1], side: "crate1", top: "crate1_top" };
const panel: PropType = { kind: "panel", size: [1, 1, 1], texture: "fence" };
const billboard: PropType = { kind: "billboard", size: [1, 1, 1], texture: "tree" };
const hasTexture = (id: string) => id === "stone_top";

assert.equal(retextured(box, undefined, hasTexture), box);
assert.deepEqual(retextured(box, "stone", hasTexture), { ...box, side: "stone", top: "stone_top" });
assert.deepEqual(retextured(box, "wood", hasTexture), { ...box, side: "wood", top: "wood" });
assert.deepEqual(retextured(panel, "wood", hasTexture), { ...panel, texture: "wood" });
assert.equal(retextured(billboard, "wood", hasTexture), billboard);
