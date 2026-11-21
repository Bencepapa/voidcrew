// Run: npx tsx src/game/simpleShop.test.ts
import assert from "node:assert/strict";
import { readShopInteraction, simpleShopRefs, talkMode, unknownShops } from "./simpleShop";
import type { Interaction } from "./interactions";
const readInteraction = readShopInteraction;

const dlg = { library: "l", entry: "e" };

// mode selection: a dialogue wins, else a shop opens directly, else nothing
assert.equal(talkMode({ dialogue: dlg, shop: "s" }, true), "dialogue");
assert.equal(talkMode({ dialogue: dlg }, true), "dialogue");
assert.equal(talkMode({ shop: "s" }, true), "shop");
assert.equal(talkMode({}, true), undefined);
assert.equal(talkMode({ shop: "s" }, false), undefined);
assert.equal(talkMode({ dialogue: dlg }, false), undefined);

// reading a shop interaction
assert.equal(readInteraction({ kind: "shop", shop: "" }), undefined);
assert.deepEqual(readInteraction({ kind: "shop", shop: "smith", greeting: "  ", portrait: "p", clickOnly: true }),
  { clickOnly: true, kind: "shop", shop: "smith", greeting: undefined, portrait: "p", npc: undefined });
assert.equal(readInteraction({ kind: "shop", shop: "smith", greeting: "Hi" })!.greeting, "Hi");

// shop references and the unknown ones
const shopEvent: Interaction = { kind: "shop", shop: "counter" };
const refs = simpleShopRefs({
  actors: [
    { cell: { x: 1, y: 1 }, shop: "smith" },
    { cell: { x: 2, y: 2 }, shop: "ignored", dialogue: dlg }, // its @shop is the dialogue's business
    { cell: { x: 3, y: 3 } },
  ],
  props: [{ cell: { x: 4, y: 4 }, interaction: shopEvent }, { cell: { x: 5, y: 5 } }],
  doors: [{ cell: { x: 6, y: 6 }, interaction: { kind: "message", text: "", modal: false, position: "center" } }],
});
assert.deepEqual(refs.map(r => `${r.via}:${r.shop}`), ["npc:smith", "event:counter"]);
assert.deepEqual(unknownShops(refs, new Set(["smith"])).map(r => r.shop), ["counter"]);
assert.deepEqual(unknownShops(refs, new Set(["smith", "counter"])), []);
console.log("simpleShop ok");
