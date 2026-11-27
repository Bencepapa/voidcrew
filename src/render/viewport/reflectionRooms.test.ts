import assert from "node:assert/strict";
import type { CellType } from "../../game/types";
import { reflectionRooms } from "./reflectionRooms";

const cells: CellType[][] = [["floor", "floor", "door", "floor"], ["floor", "floor", "wall", "wall"]];
const map = { width: 4, height: 2, cells, floorHeights: [[0, 0, 0, 0], [0, 0, 0, 0]], ceilingHeights: [[1, 1, 1, 1], [1, 1, 1, 1]] };
const roomAt = reflectionRooms(map, 2);
const left = roomAt(0, 0);
assert.equal(left, roomAt(1, 1));
assert.notEqual(left, roomAt(3, 0));
assert.equal(roomAt(2, 0), undefined);
assert.equal(roomAt(-1, 1), undefined);
assert.deepEqual(left, { origin: [0.5, 1, 0.5], bounds: { min: [-0.5, 0, -0.5], max: [1.5, 2, 1.5] } });
assert.equal(reflectionRooms({ ...map, textures: { ceiling: "sky" } }, 2)(0, 0)?.bounds, undefined);
assert.equal(reflectionRooms({ ...map, floorHeights: [[0, 0, 0, 0], [0, 0.25, 0, 0]] }, 2)(0, 0)?.bounds, undefined);
