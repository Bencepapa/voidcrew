// Run: npx tsx src/audio/soundField.test.ts
import assert from "node:assert/strict";
import { resolveSound, type SoundSpec } from "../game/sounds";
import {
  attenuation, behindness, MAX_SOURCES, MUFFLE_CUTOFFS, muffle, pathField, pathTo, planSources, portalDirection, rearFilter, selectPool, voiceTargets, wallsBetween,
  type Emitter,
} from "./soundField";
import { FIXTURE_LISTENER, FIXTURE_SOUND, fixtureBlocked } from "./soundFixture";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

// ---- distance
near(attenuation(0, 20), 1);
near(attenuation(1, 20), 1, 1e-9);
near(attenuation(3, 40, 1), 1 / 3);
near(attenuation(5, 40, 0.5), 1 / (1 + 0.5 * 4));
assert.ok(attenuation(3, 40, 2) < attenuation(3, 40, 1), "a bigger rolloff dies away faster");
assert.ok(attenuation(3, 40, 0.5) > attenuation(3, 40, 1), "a smaller one carries on");
assert.equal(attenuation(20, 20), 0, "gone at its range");
assert.equal(attenuation(25, 20), 0);
assert.equal(attenuation(5, 0.5), 0, "a range under a cell: nothing past it");
{
  let last = 2;
  for (let d = 0; d <= 20; d += 0.25) {
    const a = attenuation(d, 20, 1);
    assert.ok(a <= last + 1e-12 && a >= 0, `falls and stays above 0 at ${d}`);
    last = a;
  }
}
assert.ok(attenuation(19, 20) < 0.01, "it fades out over the last quarter: nearly nothing just inside the range");

// ---- walls along a straight line
const open: (x: number, y: number) => boolean = () => false;
assert.equal(wallsBetween(0, 0, 5, 0, open), 0);
const wallAt = (...cells: [number, number][]) => (x: number, y: number) => cells.some(([cx, cy]) => cx === x && cy === y);
assert.equal(wallsBetween(0, 0, 5, 0, wallAt([2, 0])), 1);
assert.equal(wallsBetween(5, 0, 0, 0, wallAt([2, 0])), 1, "the same from the other end");
assert.equal(wallsBetween(0, 0, 5, 0, wallAt([2, 0], [3, 0])), 2, "a thick wall counts each cell");
assert.equal(wallsBetween(0, 0, 6, 0, wallAt([1, 0], [2, 0], [3, 0], [4, 0], [5, 0])), 5, "(the cap of three is the muffle's)");
assert.equal(wallsBetween(0, 0, 5, 0, wallAt([0, 0], [5, 0])), 0, "the cells the line starts and ends in don't count");
assert.equal(wallsBetween(2, 2, 2, 2, wallAt([2, 2])), 0, "no distance");
assert.equal(wallsBetween(0, 0, 0, 5, wallAt([0, 3])), 1, "along z too");
assert.equal(wallsBetween(0, 0, 4, 2, wallAt([2, 1])), 1, "slanted: the cell the line crosses");
assert.equal(wallsBetween(0, 0, 4, 2, wallAt([2, 0])), 0, "... and not one beside it");
assert.equal(wallsBetween(0.3, 0.2, 4.4, 2.1, wallAt([2, 1])), wallsBetween(4.4, 2.1, 0.3, 0.2, wallAt([2, 1])), "either way");
// (a line through the crack between two walls that meet at a corner: one wall, not none)
assert.equal(wallsBetween(0, 0, 2, 2, wallAt([1, 0], [0, 1])), 1);
assert.equal(wallsBetween(0, 0, 2, 2, wallAt([1, 0])), 0, "one wall beside the diagonal: it goes by");
assert.equal(wallsBetween(0, 0, 2, 2, wallAt([1, 1])), 1, "a wall on the diagonal");
// (the edge of the map blocks: a callback that says so for what is outside)
{
  const edge = (x: number, y: number) => x < 0 || y < 0 || x > 4 || y > 4;
  assert.equal(wallsBetween(1, 1, 3, 3, edge), 0);
}

// ---- muffling
assert.deepEqual(muffle(0), { cutoff: MUFFLE_CUTOFFS[0], gain: 1 });
assert.deepEqual(muffle(1), { cutoff: 1600, gain: 0.5 });
assert.deepEqual(muffle(2), { cutoff: 800, gain: 0.25 });
assert.deepEqual(muffle(3), { cutoff: 400, gain: 0.125 });
assert.deepEqual(muffle(7), muffle(3), "no worse after the third");
assert.deepEqual(muffle(-1), muffle(0));

// ---- the way round: with the door shut, none; open, the shortest through it
{
  const shut = pathField({ x: 3, y: 3 }, fixtureBlocked(false), 30);
  assert.equal(pathTo(shut, { x: 9, y: 1 }), null, "a shut door is a wall");
  assert.ok(pathTo(shut, { x: 5, y: 1 }), "the same room is reached");
  const doorOpen = pathField({ x: 3, y: 3 }, fixtureBlocked(true), 30);
  const path = pathTo(doorOpen, { x: 9, y: 1 })!;
  assert.equal(path.length - 1, 8, "3 to the door, 3 more to the room's middle, 2 up");
  assert.deepEqual(path[0], { x: 3, y: 3 });
  assert.deepEqual(path[path.length - 1], { x: 9, y: 1 });
  assert.ok(path.some((c) => c.x === 6 && c.y === 3), "through the door");
  for (let i = 1; i < path.length; i++) assert.equal(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y), 1, "four neighbours only");
  // limited by the steps it may take
  assert.equal(pathTo(pathField({ x: 3, y: 3 }, fixtureBlocked(true), 7), { x: 9, y: 1 }), null, "8 steps are out of reach of 7");
  assert.ok(pathTo(pathField({ x: 3, y: 3 }, fixtureBlocked(true), 8), { x: 9, y: 1 }));
  assert.equal(pathTo(doorOpen, { x: 6, y: 2 }), null, "a wall cell is not on any way");
  assert.deepEqual(pathTo(doorOpen, { x: 3, y: 3 }), [{ x: 3, y: 3 }], "the start is its own path");
}
{
  // a wall with two gaps: the near one wins
  const rows = ["WWWWWWW", "W..W..W", "W.....W", "W..W..W", "WWWWWWW"];
  const blocked = (x: number, y: number) => (rows[y]?.[x] ?? "W") === "W";
  const field = pathField({ x: 1, y: 1 }, blocked, 20);
  assert.equal(pathTo(field, { x: 5, y: 1 })!.length - 1, 6, "down, through the gap, up");
}

// ---- which way a sound seems to come from
{
  const path = pathTo(pathField({ x: 3, y: 3 }, fixtureBlocked(true), 30), { x: 9, y: 1 })!;
  const dir = portalDirection(FIXTURE_LISTENER, path, fixtureBlocked(true));
  near(dir.x, 1);
  near(dir.z, 0);
  // from the north end of the room, the doorway is south-east of the listener
  const from = { x: 3, z: 1 };
  const way = pathTo(pathField({ x: 3, y: 1 }, fixtureBlocked(true), 30), { x: 9, y: 1 })!;
  const slant = portalDirection(from, way, fixtureBlocked(true));
  assert.ok(slant.x > 0.5 && slant.z > 0.1, "toward the door, down and to the east");
  near(Math.hypot(slant.x, slant.z), 1);
  // with nothing in sight past the first step it is the first step's way
  const corner = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }];
  const bend = (x: number, y: number) => !(x === 1 && y === 1) && !(x === 1 && y === 2) && !(x === 2 && y === 2);
  const first = portalDirection({ x: 1, z: 1 }, corner, bend);
  assert.ok(Math.abs(Math.hypot(first.x, first.z) - 1) < 1e-9);
}

// ---- behind the listener
{
  const ears = { x: 0, z: 0, y: 0.5, fx: 0, fz: -1 };
  near(behindness(ears, 0, -5), 0, 1e-9);
  near(behindness(ears, 5, 0), 0, 1e-9);
  near(behindness(ears, 0, 5), 1);
  assert.ok(behindness(ears, 3, 3) > 0.6 && behindness(ears, 3, 3) < 0.8, "behind and to the side: partly");
  assert.equal(behindness(ears, 0.1, 0.1), 0, "right on top of the listener");
  const east = { ...ears, fx: 1, fz: 0 };
  near(behindness(east, -4, 0), 1);
  near(behindness(east, 4, 0), 0, 1e-9);
  near(rearFilter(0).cutoff, 18000);
  near(rearFilter(0).gain, 1);
  // (the default strength: about 4 kHz and -2.5 dB straight behind; the whole curve is tested in rear.test.ts)
  near(rearFilter(1).cutoff, 4000, 1e-6);
  near(rearFilter(1).gain, Math.pow(10, -2.5 / 20), 1e-9);
  assert.ok(rearFilter(0.5).cutoff < 18000 && rearFilter(0.5).cutoff > 4000);
  assert.equal(rearFilter(3).gain, rearFilter(1).gain, "limited");
  assert.equal(rearFilter(-1).cutoff, 18000);
}

// ---- the pool
const emitterAt = (id: number, x: number, z: number, spec: Partial<SoundSpec> = {}): Emitter => ({ id, sound: resolveSound({ x: 0, y: 0, kind: "tone", volume: 1, range: 30, ...spec }), x, y: 0.5, z });
{
  const ears = { x: 0, y: 0.5, z: 0 };
  const many = Array.from({ length: 30 }, (_, i) => emitterAt(i, 1 + i, 0));
  const pool = selectPool(ears, many);
  assert.equal(pool.length, MAX_SOURCES);
  assert.deepEqual(pool.map((e) => e.id), Array.from({ length: 12 }, (_, i) => i), "the nearest twelve");
  assert.equal(selectPool(ears, many, 5).length, 5);
  // out of its own range: not in the pool
  const mixed = [emitterAt(0, 5, 0, { range: 4 }), emitterAt(1, 20, 0, { range: 30 }), emitterAt(2, 3, 0, { range: 4 })];
  assert.deepEqual(selectPool(ears, mixed).map((e) => e.id), [2, 1], "the first is out of its range of 4");
  // (a sound already playing is kept over one just a hair nearer)
  const close = [emitterAt(0, 5.2, 0), emitterAt(1, 5, 0)];
  assert.deepEqual(selectPool(ears, close, 1).map((e) => e.id), [1]);
  assert.deepEqual(selectPool(ears, close, 1, new Set([0])).map((e) => e.id), [0]);
  // height counts
  assert.equal(selectPool(ears, [{ ...emitterAt(0, 1, 0, { range: 5 }), y: 30 }]).length, 0);
}

// ---- the plan for the fixture: the sound behind the wall
{
  const ears = { ...FIXTURE_LISTENER, y: 0.5 };
  const sound = { id: 0, sound: resolveSound(FIXTURE_SOUND), x: 9, y: 0.5, z: 1 };
  const shut = planSources(ears, [sound], fixtureBlocked(false));
  assert.equal(shut.length, 1);
  assert.equal(shut[0].walls, 1, "the wall (6,2) between them");
  assert.equal(shut[0].portal, undefined, "no way round with the door shut");
  const doorOpen = planSources(ears, [sound], fixtureBlocked(true));
  // (door open: the straight line goes through the doorway or the wall: from (3,3) to (9,1) it passes (6,2), a wall)
  assert.equal(doorOpen[0].walls, 1);
  assert.ok(doorOpen[0].portal, "a way round through the door");
  near(doorOpen[0].portal!.dir.x, 1);
  near(doorOpen[0].portal!.dir.z, 0);
  assert.deepEqual(doorOpen[0].portal!.via, { x: 4, y: 3 });
  assert.equal(doorOpen[0].portal!.after, 7, "from the second cell of the way, 7 steps on (8 in all)");
  // too far by the way though near as the crow flies: no way round, and the direct voice is still there
  const short = { ...sound, sound: resolveSound({ ...FIXTURE_SOUND, range: 7 }) };
  const reach = planSources(ears, [short], fixtureBlocked(true));
  assert.equal(reach[0].portal, undefined, "8 steps are over a range of 7");
  assert.equal(reach[0].walls, 1);
  // a sound with no wall between needs no search
  const clear = planSources({ x: 8, y: 0.5, z: 3 }, [sound], fixtureBlocked(false));
  assert.equal(clear[0].walls, 0);
  assert.equal(clear[0].portal, undefined);
}

// ---- the voices of a planned sound
{
  const ears = { ...FIXTURE_LISTENER, y: 0.5 };
  const e: Emitter = { id: 0, sound: resolveSound({ ...FIXTURE_SOUND, volume: 0.8 }), x: 9, y: 0.5, z: 1 };
  const plan = planSources(ears, [e], fixtureBlocked(true))[0];
  const voices = voiceTargets(ears, e, plan);
  assert.equal(voices.length, 2, "heard from both places");
  const direct = voices.find((v) => v.role === "direct")!;
  const portal = voices.find((v) => v.role === "portal")!;
  assert.deepEqual([direct.x, direct.y, direct.z], [9, 0.5, 1], "at the sound's own spot");
  near(direct.level, 0.8 * attenuation(Math.hypot(6, 2), 20, 1), 1e-9);
  assert.equal(direct.cutoff, 1600, "dulled by its wall");
  assert.equal(direct.wallGain, 0.5);
  near(portal.x, 4, 1e-9);
  near(portal.z, 3, 1e-9);
  assert.equal(portal.y, 0.5);
  // the level comes from the way's length (8), not the straight distance
  near(portal.level, 0.8 * attenuation(8, 20, 1), 1e-9);
  assert.ok(attenuation(8, 20) < attenuation(Math.hypot(6, 2), 20), "(the way is longer than the line)");
  assert.equal(portal.cutoff, MUFFLE_CUTOFFS[0], "not dulled");
  assert.equal(portal.wallGain, 1);
  // walking toward the door the portal voice gets louder, and keeps its place a cell off
  const nearer = voiceTargets({ x: 5, y: 0.5, z: 3 }, e, planSources({ x: 5, y: 0.5, z: 3 }, [e], fixtureBlocked(true))[0]).find((v) => v.role === "portal")!;
  assert.ok(nearer.level > portal.level);
  near(Math.hypot(nearer.x - 5, nearer.z - 3), 1, 1e-9);
  // a sound out of range at its own spot has no direct voice at all
  const far = { ...e, sound: resolveSound({ ...FIXTURE_SOUND, range: 6 }) };
  assert.equal(voiceTargets(ears, far, { id: 0, walls: 1 }).length, 0);
  // no walls: one voice, not dulled
  const free = voiceTargets({ x: 8, y: 0.5, z: 3 }, e, { id: 0, walls: 0 });
  assert.equal(free.length, 1);
  assert.equal(free[0].cutoff, MUFFLE_CUTOFFS[0]);
}

console.log("soundField: ok");
