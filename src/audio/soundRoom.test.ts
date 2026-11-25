// Run: npx tsx src/audio/soundRoom.test.ts
// The sound system with rooms: the listener's room told to the backend, every voice's send to the echo, and the walls'
// dulling made stronger by a zone's insulation (a stand-in backend, no Web Audio).
import assert from "node:assert/strict";
import { register } from "node:module";
import { fixtureFile, FIXTURE_SOUND, FIXTURE_LISTENER, fixtureBlocked } from "./soundFixture";
import { createSoundSystem, type SoundBackend, type SoundScene, type VoiceState } from "./soundSystem";
import { NO_PLACE, type Place } from "./acoustics";
import { wetSend } from "./roomMix";
import type { SoundSpec } from "../game/sounds";
import type { AcousticZone } from "../game/acousticZones";

register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { parseMap } = await import("../game/mapFormat");
const { zoneAt } = await import("./acoustics");

function fakeBackend() {
  const rooms: Place[] = [];
  const voices: { state: VoiceState | null; stopped: boolean }[] = [];
  const backend: SoundBackend<(typeof voices)[number]> = {
    start: () => {
      const voice = { state: null, stopped: false };
      voices.push(voice);
      return voice;
    },
    set: (voice, state) => {
      voice.state = state;
    },
    stop: (voice) => {
      voice.stopped = true;
    },
    setListener: () => {},
    setRoom: (place) => void rooms.push(place),
  };
  return { backend, rooms, live: () => voices.filter((v) => !v.stopped) };
}
const scene = (sounds: SoundSpec[], doorOpen = false): SoundScene => ({ sounds, blocked: fixtureBlocked(doorOpen), floorHeight: () => 0, wallHeight: 1 });
const ears = (x: number, z: number) => ({ x, y: 0.5, z, fx: 1, fz: 0 });
const mapWith = (acoustics?: AcousticZone[]) => {
  const file = { ...fixtureFile(), acoustics } as never;
  return parseMap("t", file);
};
const providerOf = (map: ReturnType<typeof mapWith>) => (x: number, y: number) => zoneAt(map, x, y);

// ---- no acoustics: nothing changes (no send, the old muffling)
{
  const { backend, rooms, live } = fakeBackend();
  const system = createSoundSystem(backend, { now: () => 0 });
  system.setScene(scene([FIXTURE_SOUND]));
  system.frame(ears(FIXTURE_LISTENER.x, FIXTURE_LISTENER.z));
  assert.equal(rooms.length, 1, "told once");
  assert.equal(rooms[0].source, "none");
  assert.equal(live()[0].state!.send, 0, "no echo");
  assert.equal(live()[0].state!.cutoff, 1600, "the old muffling");
  system.frame(ears(FIXTURE_LISTENER.x, FIXTURE_LISTENER.z));
  assert.equal(rooms.length, 1, "and not again");
}

// ---- a zone: its room told, a send from its reverb and the distance
{
  const map = mapWith([{ name: "west hall", cells: [[1, 1, 5], [2, 1, 5], [3, 1, 5], [4, 1, 5], [5, 1, 5]], preset: "hall" }]);
  const { backend, rooms, live } = fakeBackend();
  const system = createSoundSystem(backend, { now: () => 0 });
  system.setAcoustics(providerOf(map));
  system.setScene(scene([FIXTURE_SOUND]));
  system.frame(ears(FIXTURE_LISTENER.x, FIXTURE_LISTENER.z));
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].name, "west hall");
  assert.equal(rooms[0].acoustics.decay, 2.2);
  const send = live()[0].state!.send!;
  assert.ok(send > 0);
  // (the sound is 6.3 cells off: the share of echo of that distance times the hall's 0.6)
  const state = live()[0].state!;
  const distance = Math.hypot(9 - 3, 0.5 - 0.5, 1 - 3);
  assert.ok(Math.abs(send - wetSend(0.6, distance)) < 1e-9, `send ${send}`);
  assert.ok(state.send! < 0.6 * 0.8 && state.send! > 0.6 * 0.2);
  // nearer: less of it is echo, though it is the same hall
  system.frame(ears(5, 1));
  assert.ok(live()[0].state!.send! < state.send!, "a nearer sound sends less");
}

// ---- walking into another room: the backend is told after a moment, not at once
{
  const map = mapWith([
    { name: "west", cells: [[1, 1, 5], [2, 1, 5], [3, 1, 5], [4, 1, 5], [5, 1, 5]], preset: "hall" },
    { name: "east", cells: [[1, 7, 11], [2, 7, 11], [3, 7, 11], [4, 7, 11], [5, 7, 11]], preset: "cave" },
  ]);
  let t = 0;
  const { backend, rooms } = fakeBackend();
  const system = createSoundSystem(backend, { now: () => t });
  system.setAcoustics(providerOf(map));
  system.setScene(scene([]));
  system.frame(ears(3, 3));
  assert.equal(rooms.at(-1)!.name, "west");
  // across the door: still the first room for a bit
  for (t = 0.05; t < 0.25; t += 0.05) system.frame(ears(9, 3));
  assert.equal(rooms.at(-1)!.name, "west", "not at once");
  for (; t < 0.5; t += 0.05) system.frame(ears(9, 3));
  assert.equal(rooms.at(-1)!.name, "east", "then it is");
  assert.equal(rooms.at(-1)!.acoustics.decay, 3.5);
  const told = rooms.length;
  // over a border and back inside the hold: nothing is told
  for (let i = 0; i < 6; i++) {
    t += 0.04;
    system.frame(ears(i % 2 ? 3 : 9, 3));
  }
  assert.equal(rooms.length, told, "no flicker");
}

// ---- a zone edited while it is heard: the numbers come at once
{
  const first = mapWith([{ cells: [[3, 1, 5]], preset: "hall" }]);
  const { backend, rooms } = fakeBackend();
  const system = createSoundSystem(backend, { now: () => 0 });
  system.setAcoustics(providerOf(first));
  system.setScene(scene([]));
  system.frame(ears(3, 3));
  assert.equal(rooms.at(-1)!.acoustics.decay, 2.2);
  system.setAcoustics(providerOf(mapWith([{ cells: [[3, 1, 5]], preset: "hall", decay: 4 }])));
  system.frame(ears(3, 3));
  assert.equal(rooms.at(-1)!.acoustics.decay, 4);
  // no acoustics any more: the old silence of rooms
  system.setAcoustics(null);
  system.frame(ears(3, 3));
  assert.equal(rooms.at(-1)!.key, NO_PLACE.key);
}

// ---- insulation: the walls dull more when the listener's or the sound's zone insulates
{
  const cutoffWith = (zones?: AcousticZone[]) => {
    const { backend, live } = fakeBackend();
    const system = createSoundSystem(backend, { now: () => 0 });
    system.setAcoustics(providerOf(mapWith(zones)));
    system.setScene(scene([FIXTURE_SOUND]));
    system.frame(ears(FIXTURE_LISTENER.x, FIXTURE_LISTENER.z));
    return { cutoff: live()[0].state!.cutoff, gain: live()[0].state!.wallGain };
  };
  const west = { cells: [[1, 1, 5], [2, 1, 5], [3, 1, 5], [4, 1, 5], [5, 1, 5]] as AcousticZone["cells"], preset: "custom" as const };
  const east = { cells: [[1, 7, 11], [2, 7, 11], [3, 7, 11], [4, 7, 11], [5, 7, 11]] as AcousticZone["cells"], preset: "custom" as const };
  const none = cutoffWith();
  assert.equal(none.cutoff, 1600, "automatic rooms insulate nothing");
  const listener = cutoffWith([{ ...west, insulation: 1 }]);
  const source = cutoffWith([{ ...east, insulation: 1 }]);
  const neither = cutoffWith([{ ...west, insulation: 0 }, { ...east, insulation: 0 }]);
  assert.equal(neither.cutoff, 1600);
  assert.ok(listener.cutoff < none.cutoff && listener.gain < none.gain, "the listener's zone insulates");
  assert.ok(source.cutoff < none.cutoff && source.gain < none.gain, "the sound's zone insulates");
  assert.deepEqual(listener, source, "either one: the same");
  // both: the stronger counts, not the sum
  const both = cutoffWith([{ ...west, insulation: 1 }, { ...east, insulation: 0.5 }]);
  assert.deepEqual(both, listener);
  // a half-insulating zone: halfway
  const half = cutoffWith([{ ...west, insulation: 0.5 }]);
  assert.ok(half.cutoff < none.cutoff && half.cutoff > listener.cutoff);
  // the preset's own insulation (a room: 0.3) counts as well
  const room = cutoffWith([{ ...west, preset: "room" }]);
  assert.ok(room.cutoff < none.cutoff);
}

console.log("soundRoom: ok");
