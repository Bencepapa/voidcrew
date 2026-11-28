import assert from "node:assert/strict";
import { readPuddleRipple } from "./puddle";

assert.equal(readPuddleRipple(undefined), undefined);
assert.equal(readPuddleRipple({ speed: 1, amplitude: 1, density: 1 }), undefined);
assert.deepEqual(readPuddleRipple({ speed: 0, amplitude: 0, density: 2 }), { speed: 0, amplitude: 0, density: 2 });
assert.deepEqual(readPuddleRipple({ speed: -2, amplitude: Infinity, density: 9 }), { speed: 0, density: 4 });
