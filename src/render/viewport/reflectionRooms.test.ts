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

const fromLayout = (layout: string[]) => reflectionRooms({
  width: layout[0].length, height: layout.length,
  cells: layout.map(row => [...row].map((cell): CellType => cell === "W" ? "wall" : "floor")),
  floorHeights: [], ceilingHeights: [],
}, 2);

// A corridor and room connected via a one-cell gap have separate captures.
const cabin = fromLayout([".......", "WWW.WWW", "WW...WW", "WW...WW"]);
assert.equal(cabin(0, 0), cabin(6, 0));
assert.equal(cabin(3, 1), cabin(3, 0));
assert.notEqual(cabin(3, 1), cabin(3, 2));
assert.deepEqual(cabin(3, 2)?.origin, [3, 1, 2.5]);

const narrowEdge = fromLayout(["..WW", "....", "WW.."]);
assert.notEqual(narrowEdge(1, 1), narrowEdge(2, 1));

const irregular = ["...", "...", "..W"];
assert.deepEqual(fromLayout(irregular)(2, 0)?.origin, fromLayout(irregular)(0, 2)?.origin);
