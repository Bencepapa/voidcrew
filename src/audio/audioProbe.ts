// Audio spike (see the sound system plan): a Howler backend behind a tiny surface, to try it in the Debug panel
// before deciding Howler vs. our own Web Audio layer. The game talks to this module only (setListener from the
// viewport, the probe functions from the panel); nothing here is saved or shipped as sound data.
//
// Units: the world is in cells (x east, z south, y up), the same as the three.js scene, so a sound's distance
// falloff is in cells too.
import { Howl, Howler } from "howler";

interface ListenerState { x: number; y: number; z: number; fx: number; fz: number }
let listener: ListenerState = { x: 0, y: 0.5, z: 0, fx: 0, fz: -1 };
let listenerSeen = false;

/** Called every frame by the viewport with the eye position and the (normalized) horizontal look direction. */
export function setListener(x: number, y: number, z: number, fx: number, fz: number) {
  listener = { x, y, z, fx, fz };
  if (!listenerSeen) return; // (nothing has played yet: the audio context may not exist; do not wake it)
  try {
    Howler.pos(x, y, z);
    Howler.orientation(fx, 0, fz, 0, 1, 0);
  } catch {
    /* no audio: nothing to move */
  }
}

// ---- a generated test sound: a short decaying tone (no file needed) ----

function toneWav(frequency: number, seconds: number, rate = 22050): string {
  const samples = Math.floor(seconds * rate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const envelope = Math.min(1, t / 0.01) * Math.exp(-t * 5);
    view.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * frequency * t) * envelope * 0.6 * 32767), true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

let beep: Howl | undefined;
function theBeep(): Howl {
  listenerSeen = true;
  if (!beep) beep = new Howl({ src: [toneWav(660, 0.6)], format: ["wav"], volume: 0.7 });
  return beep;
}

export interface ProbeSource {
  /** world position, in cells */
  x: number; y: number; z: number;
  /** a low-pass cutoff (Hz): the muffled sound of a house, 0: none */
  muffle?: number;
}

const panner = { panningModel: "HRTF" as const, distanceModel: "inverse" as const, refDistance: 1, maxDistance: 20, rolloffFactor: 1.4 };

/** Plays one instance of the test sound at a world position (it stays there while the listener turns and walks). */
export function playAt(source: ProbeSource): number {
  const howl = theBeep();
  Howler.pos(listener.x, listener.y, listener.z);
  Howler.orientation(listener.fx, 0, listener.fz, 0, 1, 0);
  const id = howl.play();
  howl.pos(source.x, source.y, source.z, id);
  howl.pannerAttr(panner, id);
  if (source.muffle) muffle(howl, id, source.muffle);
  return id;
}

// Inserts a low-pass filter into one instance's chain (Howler keeps no hook for it: its gain node feeds its
// panner). Part of what the probe checks: can the chain be reached without breaking on a Howler update?
function muffle(howl: Howl, id: number, cutoff: number) {
  try {
    const sound = (howl as unknown as { _soundById(id: number): { _node: GainNode; _panner?: PannerNode } | null })._soundById(id);
    if (!sound?._panner) return;
    const filter = Howler.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    sound._node.disconnect();
    sound._node.connect(filter);
    filter.connect(sound._panner);
  } catch (error) {
    console.warn("[audio probe] muffle failed", error);
  }
}

/** Where the world is relative to the listener: `ahead` and `right` in cells. */
export function relative(ahead: number, right: number, up = 0): ProbeSource {
  // the right-hand side of a forward vector (fx, fz) on the ground plane (x east, z south): (-fz, fx)
  return { x: listener.x + listener.fx * ahead - listener.fz * right, y: listener.y + up, z: listener.z + listener.fz * ahead + listener.fx * right };
}

/** Plays many instances at once, spread round the listener (the pool check). */
export function playMany(count: number): number {
  let started = 0;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const distance = 2 + (i % 5);
    playAt({ x: listener.x + Math.cos(angle) * distance, y: listener.y, z: listener.z + Math.sin(angle) * distance });
    started++;
  }
  return started;
}

let orbit: ReturnType<typeof setInterval> | undefined;
/** One instance circling the listener's start spot for about six seconds, to hear the panning move. */
export function playOrbit(): void {
  const howl = theBeep();
  stopOrbit();
  const centre = { ...listener };
  const start = performance.now();
  const loop = new Howl({ src: [toneWav(440, 6, 11025)], format: ["wav"], volume: 0.5 });
  listenerSeen = true;
  Howler.pos(centre.x, centre.y, centre.z);
  Howler.orientation(centre.fx, 0, centre.fz, 0, 1, 0);
  const id = loop.play();
  loop.pannerAttr(panner, id);
  orbit = setInterval(() => {
    const t = (performance.now() - start) / 1000;
    if (t > 6) { stopOrbit(); return; }
    const angle = (t / 6) * Math.PI * 2;
    loop.pos(centre.x + Math.cos(angle) * 3, centre.y, centre.z + Math.sin(angle) * 3, id);
  }, 30);
  void howl;
}

export function stopOrbit() {
  if (orbit) clearInterval(orbit);
  orbit = undefined;
}

export function stopAllProbes() {
  stopOrbit();
  Howler.stop();
}

export interface ProbeStatus { state: string; sampleRate: number; active: number }
export function probeStatus(): ProbeStatus {
  const ctx = Howler.ctx as AudioContext | undefined;
  const sounds = beep ? (beep as unknown as { _sounds: { _paused: boolean; _ended: boolean }[] })._sounds : [];
  return { state: ctx?.state ?? "(not started)", sampleRate: ctx?.sampleRate ?? 0, active: sounds.filter((s) => !s._paused && !s._ended).length };
}
