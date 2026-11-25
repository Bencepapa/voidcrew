// Run: npx tsx src/audio/soundSystem.test.ts
import assert from "node:assert/strict";
import type { SoundSpec } from "../game/sounds";
import { FIXTURE_LAYOUT, FIXTURE_LISTENER, FIXTURE_SOUND, fixtureBlocked } from "./soundFixture";
import { createSoundSystem, type SoundBackend, type SoundScene, type VoiceState, type WaveSpec } from "./soundSystem";

// a stand-in for the engine: it keeps what the system tells it
interface FakeVoice {
  id: number;
  wave: WaveSpec;
  state: VoiceState | null;
  stopped: boolean;
  sets: number;
  portal: boolean;
}
function fakeBackend() {
  const voices: FakeVoice[] = [];
  const backend: SoundBackend<FakeVoice> = {
    start: (wave, options) => {
      const voice: FakeVoice = { id: voices.length, wave, state: null, stopped: false, sets: 0, portal: options?.portal === true };
      voices.push(voice);
      return voice;
    },
    set: (voice, state) => {
      voice.state = state;
      voice.sets++;
    },
    stop: (voice) => {
      voice.stopped = true;
    },
    setListener: () => {},
  };
  return { backend, voices, live: () => voices.filter((v) => !v.stopped) };
}

let doorOpen = false;
const scene = (sounds: SoundSpec[]): SoundScene => ({
  sounds,
  blocked: (x, y) => fixtureBlocked(doorOpen)(x, y),
  floorHeight: () => 0,
  wallHeight: 1,
});
const ears = (x: number, z: number, fx = 1, fz = 0) => ({ x, y: 0.5, z, fx, fz });

// ---- nothing before a scene; the editor is silent
{
  const { backend, voices } = fakeBackend();
  const system = createSoundSystem(backend, { now: () => 0 });
  system.frame(ears(3, 3));
  assert.equal(voices.length, 0, "no scene: nothing");
  system.setScene(scene([FIXTURE_SOUND]));
  system.setEditing(true);
  system.frame(ears(3, 3));
  assert.equal(voices.length, 0, "editing: silent");
  system.setPreview(0);
  system.frame(ears(3, 3));
  assert.equal(voices.filter((v) => !v.stopped).length, 1, "the preview sounds");
  system.setPreview(null);
  system.frame(ears(3, 3));
  assert.equal(voices.filter((v) => !v.stopped).length, 0, "and stops");
  system.setEditing(false);
  system.frame(ears(3, 3));
  assert.equal(voices.filter((v) => !v.stopped).length, 1, "the game plays them");
}

// ---- walls and doorways, through the voices
{
  doorOpen = false;
  const { backend, live } = fakeBackend();
  const system = createSoundSystem(backend, { now: () => 0 });
  system.setScene(scene([FIXTURE_SOUND]));
  system.frame(ears(FIXTURE_LISTENER.x, FIXTURE_LISTENER.z));
  assert.equal(live().length, 1, "door shut: only the muffled sound through the wall");
  assert.equal(live()[0].state!.cutoff, 1600);
  assert.equal(live()[0].state!.wallGain, 0.5);
  assert.deepEqual([live()[0].state!.x, live()[0].state!.z], [9, 1], "at its own place");
  // the door opens: told so, and a second voice comes in at the listener's side
  doorOpen = true;
  system.invalidate();
  system.frame(ears(FIXTURE_LISTENER.x, FIXTURE_LISTENER.z));
  assert.equal(live().length, 2, "door open: both");
  const portal = live().find((v) => v.state!.cutoff > 10000)!;
  assert.ok(portal, "the doorway's voice is not dulled");
  assert.ok(Math.abs(portal.state!.x - 4) < 1e-9 && Math.abs(portal.state!.z - 3) < 1e-9, "a cell from the listener toward the door");
  assert.deepEqual(live().map((v) => v.wave.kind), ["tone", "tone"], "both from the same wave");
  // the door shuts again: the doorway's voice goes
  doorOpen = false;
  system.invalidate();
  system.frame(ears(FIXTURE_LISTENER.x, FIXTURE_LISTENER.z));
  assert.equal(live().length, 1);
  // into the far room: no wall, one clear voice
  system.frame(ears(9, 3));
  assert.equal(live().length, 1);
  assert.equal(live()[0].state!.wallGain, 1);
  assert.equal(live()[0].state!.cutoff, 20000);
}

// ---- the pool: the twelve nearest of many
{
  doorOpen = true;
  const { backend, live } = fakeBackend();
  const system = createSoundSystem(backend, { now: () => 0 });
  const sounds: SoundSpec[] = [];
  // (twenty sounds in the west room, at spots going away from the listener)
  for (let i = 0; i < 20; i++) sounds.push({ x: 1 + (i % 5), y: 1 + Math.floor(i / 5), kind: "noise", volume: 0.4, range: 30 });
  system.setScene(scene(sounds));
  system.frame(ears(1, 1));
  assert.equal(live().length, 12, "no more than twelve at once");
  const placed = live().map((v) => `${v.state!.x},${v.state!.z}`);
  // the far corner's are the ones left out
  assert.ok(!placed.includes("5,4"), "the farthest is out");
  assert.ok(placed.includes("1,1") && placed.includes("2,1"), "the nearest are in");
  assert.deepEqual([...new Set(live().map((v) => v.wave.noise))], ["white"]);
  // out of range of all: silence (and voices stopped: they fade out in the engine)
  system.frame(ears(11, 5));
  assert.equal(sounds.length, 20);
}

// ---- inactive emitters are silent; a changed pitch is a new voice; a removed sound goes
{
  doorOpen = true;
  const { backend, live, voices } = fakeBackend();
  const system = createSoundSystem(backend, { now: () => 0 });
  const base: SoundSpec = { x: 4, y: 2, kind: "tone", volume: 1, range: 30 };
  system.setScene(scene([{ ...base, active: false }]));
  system.frame(ears(3, 3));
  assert.equal(live().length, 0, "off until something switches it on");
  system.setScene(scene([base]));
  system.frame(ears(3, 3));
  assert.equal(live().length, 1);
  const first = live()[0];
  system.setScene(scene([{ ...base, volume: 0.2 }]));
  system.frame(ears(3, 3));
  assert.equal(live().length, 1);
  assert.equal(live()[0], first, "a quieter sound is the same voice");
  assert.ok(live()[0].state!.level < 0.3);
  system.setScene(scene([{ ...base, pitch: 880 }]));
  system.frame(ears(3, 3));
  assert.equal(live().length, 1);
  assert.notEqual(live()[0], first, "another pitch: a new voice");
  assert.ok(first.stopped, "the old one fades out");
  assert.equal(live()[0].wave.pitch, 880);
  system.setScene(scene([]));
  system.frame(ears(3, 3));
  assert.equal(live().length, 0, "a removed sound is gone");
  void voices;
  system.setScene(scene([base]));
  system.frame(ears(3, 3));
  assert.equal(live().length, 1);
  system.setScene(null);
  assert.equal(live().length, 0, "the scene gone: silence");
}

// ---- pulses: the gate follows the clock, the voice stays
{
  doorOpen = true;
  let now = 0;
  const { backend, live } = fakeBackend();
  const system = createSoundSystem(backend, { now: () => now });
  system.setScene(scene([{ x: 4, y: 3, kind: "tone", volume: 1, range: 30, pulse: { on: 0.5, off: 1.5 } }]));
  system.frame(ears(3, 3));
  const voice = live()[0];
  assert.equal(voice.state!.gate, 1);
  now = 0.7;
  system.frame(ears(3, 3));
  assert.equal(voice.state!.gate, 0, "silent between the bursts");
  now = 2.1;
  system.frame(ears(3, 3));
  assert.equal(voice.state!.gate, 1);
  assert.equal(live().length, 1);
  assert.equal(live()[0], voice, "one voice all along");
}

// ---- the stereo balance and the pulse's edges ride along with each state
{
  doorOpen = true;
  const { backend, live } = fakeBackend();
  const system = createSoundSystem(backend, { now: () => 0 });
  // (a sound exactly to the east, the listener looking north: to the right)
  system.setScene(scene([{ x: 4, y: 3, kind: "tone", volume: 0.8, range: 30, pulse: { on: 1, off: 1, attack: 0.1, release: 0.4 } }]));
  system.frame({ x: 3, y: 0.5, z: 3, fx: 0, fz: -1 });
  const state = live()[0].state!;
  assert.ok(state.pan > 0 && state.pan < 0.4, "close and loud: right, but not hard right");
  assert.equal(state.attack, 0.1);
  assert.equal(state.release, 0.4);
  system.frame({ x: 5, y: 0.5, z: 3, fx: 0, fz: -1 });
  assert.ok(live()[0].state!.pan < 0, "walked past it: now on the left");
  system.frame({ x: 4, y: 0.5, z: 5, fx: 0, fz: -1 });
  assert.ok(Math.abs(live()[0].state!.pan) < 1e-9, "straight ahead: the middle");
  // a pulse with no edges set: the defaults (a short edge)
  const { backend: b2, live: live2 } = fakeBackend();
  const s2 = createSoundSystem(b2, { now: () => 0 });
  s2.setScene(scene([{ x: 4, y: 3, kind: "tone", volume: 1, range: 30, pulse: { on: 1, off: 1 } }]));
  s2.frame(ears(3, 3));
  assert.equal(live2()[0].state!.attack, 0.02);
  assert.equal(live2()[0].state!.release, 0.02);
}

// ---- the doorway's voice is started as one (it fades slowly) and is wide-set
{
  doorOpen = true;
  const { backend, voices } = fakeBackend();
  const system = createSoundSystem(backend, { now: () => 0 });
  system.setScene(scene([FIXTURE_SOUND]));
  system.frame(ears(FIXTURE_LISTENER.x, FIXTURE_LISTENER.z));
  assert.deepEqual(voices.map((v) => v.portal).sort(), [false, true], "one direct voice, one portal voice");
  const portal = voices.find((v) => v.portal)!;
  assert.ok(Math.abs(portal.state!.pan) <= 0.6 + 1e-9, "the doorway's voice is wide");
}

// ---- what is worked out when: the searches only on a change of cell, a fifth of a second, or an invalidation; the
// distances every frame
{
  doorOpen = true;
  let now = 0;
  const { backend, live } = fakeBackend();
  let blockedCalls = 0;
  const system = createSoundSystem(backend, { now: () => now });
  system.setScene({ ...scene([FIXTURE_SOUND]), blocked: (x, y) => (blockedCalls++, fixtureBlocked(true)(x, y)) });
  system.frame(ears(3, 3));
  const searched = blockedCalls;
  assert.ok(searched > 0);
  const direct = live().find((v) => v.state!.cutoff < 10000)!;
  const level = direct.state!.level;
  now = 0.05;
  system.frame(ears(3.2, 3));
  assert.equal(blockedCalls, searched, "a step inside the cell: no new search");
  assert.ok(direct.state!.level > level, "but the voice follows the listener: nearer, louder");
  now = 0.1;
  system.frame(ears(3.4, 3));
  assert.equal(blockedCalls, searched);
  now = 0.3;
  system.frame(ears(3.4, 3));
  assert.ok(blockedCalls > searched, "a fifth of a second on: again");
  const again = blockedCalls;
  system.frame(ears(4, 3));
  assert.ok(blockedCalls > again, "a new cell: again");
}

// ---- the layout of the fixture is what the tests say it is
assert.equal(FIXTURE_LAYOUT[3][6], "D");

console.log("soundSystem: ok");
