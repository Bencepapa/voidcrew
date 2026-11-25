import assert from "node:assert/strict";
import type { GameMap } from "../../game/types";
import { smokeShapeKey } from "./smokeShapeKey";

const spec = { cell: { x: 1, y: 2 }, pos: [0, 0.5, 0], effect: "fire" } satisfies NonNullable<GameMap["smokes"]>[number];
const key = smokeShapeKey({ smokes: [spec] });
assert.equal(smokeShapeKey({ smokes: [{ ...spec, color: "#ffffff", lightColor: "#ff6600", lightIntensity: 2, lightReach: 3, active: false, harm: { damage: 2 } }] }), key);
assert.notEqual(smokeShapeKey({ smokes: [{ ...spec, density: 2 }] }), key);
assert.notEqual(smokeShapeKey({ smokes: [] }), smokeShapeKey({}));
