// Run: npx tsx src/audio/acoustics.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MapFile } from "../game/mapFormat";
import { FIXTURE_LAYOUT, fixtureFile } from "./soundFixture";

// (the map reader pulls in the game's props, which read Vite's import.meta.glob: a stand-in is put in its place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { parseMap } = await import("../game/mapFormat");
const A = await import("./acoustics");

const base = (): MapFile => {
  const file = fixtureFile();
  delete file.sounds;
  return file;
};

// ---- rooms: the open cells that walls and doors shut in
{
  const map = parseMap("t", base());
  const { rooms, roomAt } = A.autoRooms(map);
  assert.equal(rooms.length, 2, "two rooms and a door between them");
  assert.deepEqual(rooms.map((r) => r.cells), [25, 25]);
  assert.equal(roomAt[3 * map.width + 6], -1, "the door's cell is the border: in neither");
  assert.notEqual(roomAt[3 * map.width + 3], roomAt[3 * map.width + 9]);
  assert.equal(A.autoRooms(map), A.autoRooms(map), "worked out once for a map");

  // no door: the wall is open there, and the rooms are one
  const open = parseMap("t", { ...base(), layout: FIXTURE_LAYOUT.map((row) => row.replace("D", ".")) });
  const joined = A.autoRooms(open);
  assert.equal(joined.rooms.length, 1);
  assert.equal(joined.rooms[0].cells, 51);

  // a door shut in a wall that closes the gap: still two (a door is a border, open or shut)
  const walled = parseMap("t", { ...base(), layout: FIXTURE_LAYOUT.map((row) => row.replace("D", "W")) });
  assert.equal(A.autoRooms(walled).rooms.length, 2);
}

// ---- the numbers of a room, and Sabine
{
  const map = parseMap("t", base());
  const room = A.autoRooms(map).rooms[0];
  // 5 x 5 cells of 2 m, one wall height (3 m) tall
  assert.equal(room.volume, 25 * 4 * 3, "300 m3");
  assert.equal(room.meanHeight, 1);
  // floor + ceiling 2 x 100, walls: 19 edges of 2 x 3 m, and one door edge (6 m2 of door)
  assert.equal(room.doors, 6);
  assert.equal(room.hard, 100 + 100 + 19 * 6);
  assert.equal(room.open, 0);
  assert.equal(room.skyShare, 0);
  assert.ok(Math.abs(room.openness - 1 / 20) < 1e-9, "one of the 20 edges of its boundary is a doorway");
  // RT60 = 0.161 V / A
  const alpha = A.alphaOf(A.AUTO_SOFTNESS);
  assert.ok(Math.abs(alpha - 0.21) < 1e-9);
  const by = (0.161 * 300) / (room.hard * alpha + room.doors * 0.5);
  assert.ok(Math.abs(room.estimate.raw - by) < 1e-9, `Sabine: ${room.estimate.raw} vs ${by}`);
  assert.ok(Math.abs(room.estimate.acoustics.decay - 0.7) < 0.01, `about 0.7 s: ${room.estimate.acoustics.decay}`);
  assert.equal(room.estimate.outdoor, false);
  assert.ok(room.estimate.acoustics.reverb > 0 && room.estimate.acoustics.reverb <= 0.45, "a mild echo");
  assert.equal(room.estimate.acoustics.insulation, 0);
  assert.equal(room.estimate.acoustics.softness, A.AUTO_SOFTNESS);

  // the raw formula and its limits
  assert.ok(Math.abs(A.rt60(300, 64) - 0.161 * 300 / 64) < 1e-12);
  assert.equal(A.rt60(300, 0), A.RT_MAX, "nothing absorbs: as long as it goes");
  const tiny = A.estimateReverb({ cells: 1, volume: 1, meanHeight: 1, hard: 100, doors: 0, open: 0, skyShare: 0, openness: 0 });
  assert.equal(tiny.acoustics.decay, A.RT_MIN, "never shorter than 0.15 s");
  const cathedral = A.estimateReverb({ cells: 1, volume: 5e6, meanHeight: 1, hard: 1000, doors: 0, open: 0, skyShare: 0, openness: 0 });
  assert.equal(cathedral.acoustics.decay, A.RT_MAX, "never longer than 6 s");
  assert.ok(cathedral.raw > 6);
  // a softer room soaks more up: it rings shorter
  const m = { cells: 25, volume: 300, meanHeight: 1, hard: 300, doors: 0, open: 0, skyShare: 0, openness: 0 };
  assert.ok(A.estimateReverb(m, 1).acoustics.decay < A.estimateReverb(m, 0).acoustics.decay);
  // a bigger room with the same walls rings longer
  assert.ok(A.estimateReverb({ ...m, volume: 600, hard: 450 }).acoustics.decay > A.estimateReverb(m).acoustics.decay);
}

// ---- a bigger room rings longer than a small one, a corridor shorter than a hall
{
  const hall = Array.from({ length: 20 }, (_, y) => (y === 0 || y === 19 ? "W".repeat(20) : "W" + ".".repeat(18) + "W"));
  const corridor = Array.from({ length: 3 }, (_, y) => (y === 1 ? "W" + ".".repeat(18) + "W" : "W".repeat(20)));
  // (the hall's ceiling is three wall heights up: 9 m)
  const tall = { ceiling: { legend: {}, default: 3, rows: hall.map((r) => ".".repeat(r.length)) } };
  const hallMap = parseMap("t", { ...base(), layout: hall, layers: tall, start: { x: 5, y: 5, facing: "E" } } as MapFile);
  const lowHallMap = parseMap("t", { ...base(), layout: hall, start: { x: 5, y: 5, facing: "E" } });
  const corridorMap = parseMap("t", { ...base(), layout: corridor, start: { x: 5, y: 1, facing: "E" } });
  const hallRt = A.autoRooms(hallMap).rooms[0].estimate.acoustics.decay;
  const lowRt = A.autoRooms(lowHallMap).rooms[0].estimate.acoustics.decay;
  const corridorRt = A.autoRooms(corridorMap).rooms[0].estimate.acoustics.decay;
  assert.ok(hallRt > corridorRt * 2, `hall ${hallRt} vs corridor ${corridorRt}`);
  assert.ok(hallRt > 1.2 && hallRt < 3, `a hall of 18 x 18 cells and 9 m: ${hallRt}`);
  assert.ok(hallRt > lowRt, "the same floor under a higher ceiling rings longer");
  assert.ok(corridorRt < 0.6, `a corridor: ${corridorRt}`);
}

// ---- open sky: no echo
{
  const sky = parseMap("t", { ...base(), textures: { ceiling: "sky" } as never });
  const room = A.autoRooms(sky).rooms[0];
  assert.equal(room.skyShare, 1);
  assert.equal(room.estimate.outdoor, true);
  assert.equal(room.estimate.acoustics.reverb, 0);
  const place = A.zoneAt(sky, 3, 3);
  assert.equal(place.source, "auto");
  assert.equal(place.acoustics.reverb, 0);
  // a map's cells with a sky ceiling of their own
  const some = parseMap("t", base());
  some.ceilingTextureAt = (x) => (x <= 2 ? "sky" : undefined);
  assert.ok(A.autoRooms(some).rooms[0].skyShare > 0.3 && A.autoRooms(some).rooms[0].skyShare < 0.5);
}

// ---- the acoustics of a cell
{
  const file = {
    ...base(),
    acoustics: [
      { name: "echo hall", cells: [[1, 1, 5], [2, 1, 5]], preset: "hall" as const },
      { cells: [[3, 9, 11]], decay: 5, reverb: 0.9, preset: "custom" as const, insulation: 1 },
    ] as never,
  };
  const map = parseMap("t", file);
  const inside = A.zoneAt(map, 2, 1);
  assert.equal(inside.source, "zone");
  assert.equal(inside.name, "echo hall");
  assert.equal(inside.preset, "hall");
  assert.deepEqual(inside.acoustics, A.PRESETS.hall, "the zone's own numbers, not the room's estimate");
  assert.equal(inside.key, "zone:0");
  // the rest of the room (not in the zone) is automatic
  const rest = A.zoneAt(map, 2, 5);
  assert.equal(rest.source, "auto");
  assert.notEqual(rest.acoustics.decay, A.PRESETS.hall.decay);
  assert.equal(rest.preset, "auto");
  // a zone's own values over its (custom: the room's) preset
  const custom = A.zoneAt(map, 10, 3);
  assert.deepEqual(custom.acoustics, { ...A.PRESETS.room, decay: 5, reverb: 0.9, insulation: 1 });
  // walls, the map's edge and what is off the map: nowhere
  assert.equal(A.zoneAt(map, 0, 0).source, "none");
  assert.equal(A.zoneAt(map, -4, 99).source, "none");
  assert.equal(A.zoneAt(map, 0, 0).acoustics.reverb, 0);
  // the door's cell takes its west neighbour's (zone or room)
  const door = A.zoneAt(map, 6, 3);
  assert.equal(door.key, A.zoneAt(map, 5, 3).key);
  assert.equal(door.key.startsWith("room:"), true, "(5,3) is in the room's auto: the zone has rows 1 and 2 only");
  // zones are also found at a door's cell if they name it
  const withDoor = parseMap("t", { ...base(), acoustics: [{ cells: [[3, 6, 6]], preset: "cave" as const }] as never });
  assert.equal(A.zoneAt(withDoor, 6, 3).preset, "cave");
  // the zone overrides the estimate: the same cell, without the zone, is automatic
  assert.equal(A.zoneAt(parseMap("t", base()), 2, 1).source, "auto");
  // the last zone wins
  const two = parseMap("t", { ...base(), acoustics: [{ name: "a", cells: [[1, 1, 5]], preset: "cave" as const }, { name: "b", cells: [[1, 3, 3]], preset: "hall" as const }] as never });
  assert.equal(A.zoneAt(two, 3, 1).name, "b");
  assert.equal(A.zoneAt(two, 2, 1).name, "a");
  assert.equal(A.zoneIndex(two), A.zoneIndex(two), "the lookup is made once for a map");
}

// ---- the editor: what an area would be, and the area under a click
{
  const map = parseMap("t", base());
  const area = A.estimateArea(map, [[1, 1, 5], [2, 1, 5], [3, 1, 5], [4, 1, 5], [5, 1, 5]]);
  assert.equal(area.cells, 25);
  assert.equal(area.volume, 300);
  assert.equal(area.acoustics.decay, A.autoRooms(map).rooms[0].estimate.acoustics.decay, "the room as a whole: the same as its automatic value");
  // the door's cell and walls in the list are not counted
  assert.equal(A.estimateArea(map, [[3, 0, 7]]).cells, 6);
  // a part of a room: the open edge to the rest of it takes the sound away
  const part = A.estimateArea(map, [[1, 1, 2], [2, 1, 2]]);
  assert.equal(part.cells, 4);
  assert.ok(part.acoustics.decay < area.acoustics.decay);
  assert.deepEqual(A.connectedArea(map, 3, 3).length, 5, "the room's rows");
  assert.deepEqual(A.connectedArea(map, 3, 3)[0], [1, 1, 5]);
  assert.deepEqual(A.connectedArea(map, 6, 3), [], "a door has none");
  assert.deepEqual(A.connectedArea(map, 0, 0), [], "nor a wall");
  const open = parseMap("t", { ...base(), layout: FIXTURE_LAYOUT.map((row) => row.replace("D", ".")) });
  assert.equal(A.connectedArea(open, 3, 3).reduce((n, [, a, b]) => n + b - a + 1, 0), 51, "no door: both rooms");
}

console.log("acoustics: ok");
