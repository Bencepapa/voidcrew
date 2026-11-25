import assert from "node:assert/strict";
import type { ActorType, BodyPart } from "../../game/actors";
import { partAt } from "./aimHitPart";

const parts: ActorType["parts"] = {
  head: { label: "Head", zone: [0.4, 0, 0.6, 0.3] },
  torso: { label: "Torso", zone: [0.4, 0.3, 0.6, 0.6] },
  armL: { label: "Left arm", zone: [0.2, 0.2, 0.4, 0.6] },
  armR: { label: "Right arm", zone: [0.6, 0.2, 0.8, 0.6] },
  legs: { label: "Legs", zone: [0.4, 0.6, 0.6, 1] },
};
const bodyParts: BodyPart[] = ["head", "torso", "armL", "armR", "legs"];

assert.equal(partAt(parts, bodyParts, 0.5, 0.3), "head");
assert.equal(partAt(parts, bodyParts, 0.7, 0.5), "armR");
assert.equal(partAt(parts, bodyParts, 0.5, 1), "legs");
assert.equal(partAt(parts, bodyParts, 0.9, 0.4), "armR");
