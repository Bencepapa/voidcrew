import assert from "node:assert/strict";
import type { EditableProp } from "../game/props";
import { findSearchProp, searchPropExample } from "./assetManagerSearchProps";
import type { PropDraft } from "./sharedProps";

const cross: EditableProp = { kind: "cross", size: [1, 1, 1], texture: "bark" };
const prism: EditableProp = { ...cross, kind: "prism", sides: 6 };
const catalogue = { fantasy_cross: cross, fantasy_prism: prism, scifi_prism: prism };
const inWorld = (id: string, world: string) => id.startsWith(world);
const draft: PropDraft = { id: "fantasy_new", world: "fantasy", definition: prism };

assert.equal(findSearchProp("sides", "fantasy", [draft], catalogue, inWorld), draft.id);
assert.equal(findSearchProp("wrap", "scifi", [draft], catalogue, inWorld), "scifi_prism");
assert.equal(findSearchProp("relief", "fantasy", [draft], catalogue, inWorld), "fantasy_cross");
assert.equal(findSearchProp("inset", "fantasy", [], {}, inWorld), "");
assert.equal(searchPropExample("inset", "fantasy", "").definition.kind, "prism");
assert.equal(searchPropExample("shadow", "fantasy", "").definition.kind, "panel");
assert.equal(searchPropExample("sides", "fantasy", "fantasy_prism", prism).definition.name, "fantasy_prism");
