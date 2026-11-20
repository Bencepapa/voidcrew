// Run: npx tsx src/game/sharedContent.test.ts
import assert from "node:assert/strict";
import { actorFiles, bundledActorFolder, commonFolder, commonIdOk, commonMeta, definitionIdOk, nextRevision, readCommonDefinition, revisionNumbers } from "./sharedContent";

assert.deepEqual(revisionNumbers([{ name: "r2" }, { name: "r10" }, { name: "r0" }, { name: "r01" }, { name: "x" }, { name: "r1" }]), [10, 2, 1]);
assert.equal(nextRevision([]), 1);
assert.equal(nextRevision([{ name: "r3" }, { name: "r1" }]), 4);

assert.ok(commonIdOk("smith-shop") && commonIdOk("void_fantasy2"));
assert.ok(!commonIdOk("") && !commonIdOk("../x") && !commonIdOk("A b") && !commonIdOk("-a") && !commonIdOk(5));
assert.equal(commonFolder("dialogue", "void-fantasy"), "common/dialogue/void-fantasy");

// dialogue
const dlg = commonMeta("dialogue", 2, { name: "  Smith  ", twee: ":: Start\nHi" });
assert.deepEqual(dlg, { v: 1, type: "dialogue", rev: 2, definition: { name: "  Smith  ", twee: ":: Start\nHi" } });
assert.deepEqual(readCommonDefinition("dialogue", dlg, "smith"), { name: "Smith", twee: ":: Start\nHi" });
assert.equal(readCommonDefinition("dialogue", { ...dlg, type: "shop" }, "smith"), undefined);
assert.equal(readCommonDefinition("dialogue", commonMeta("dialogue", 1, { name: "x", twee: "  " }), "smith"), undefined);
assert.equal(readCommonDefinition("dialogue", commonMeta("dialogue", 1, { name: "x", twee: "a".repeat(600_000) }), "smith"), undefined);
assert.equal(readCommonDefinition("dialogue", dlg, "../bad"), undefined);
assert.equal(readCommonDefinition("dialogue", null, "smith"), undefined);
assert.equal(readCommonDefinition("dialogue", commonMeta("dialogue", 1, { twee: "x" }), "smith")!.name, "smith");

// shop: the id in the definition must be the folder's id
const shop = commonMeta("shop", 1, { id: "smith-shop", name: "Smith", stock: [{ item: "dagger", qty: 2 }], buyRate: 1.5, sellRate: 0.4 });
assert.equal(readCommonDefinition("shop", shop, "smith-shop")?.id, "smith-shop");
assert.equal(readCommonDefinition("shop", shop, "other-shop"), undefined);
assert.equal(readCommonDefinition("shop", commonMeta("shop", 1, "nope" as unknown as object), "smith-shop"), undefined);

// NPC files
assert.deepEqual(actorFiles({}), ["diffuse.png"]);
assert.deepEqual(actorFiles({ diffuseFile: "diffuse.webp", hasNormal: true }), ["diffuse.webp", "normal.png"]);
assert.deepEqual(actorFiles({ diffuseFile: "../evil.png", hasNormal: false }), ["diffuse.png"]);
assert.equal(bundledActorFolder("fantasy_actor_x"), "shared-actors/fantasy_actor_x/");

const uuid = "123e4567-e89b-12d3-a456-426614174000";
assert.ok(definitionIdOk("fantasy", "actor", `fantasy_actor_${uuid}`));
assert.ok(!definitionIdOk("fantasy", "actor", `scifi_actor_${uuid}`));
assert.ok(!definitionIdOk("fantasy", "prop", `fantasy_actor_${uuid}`));
assert.ok(!definitionIdOk("fantasy", "actor", `fantasy_actor_${uuid}/../x`));
console.log("sharedContent ok");
