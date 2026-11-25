// Run: npx tsx src/audio/synth.test.ts
import assert from "node:assert/strict";
import { NOISE_COLORS, SOUND_WAVES } from "../game/sounds";
import { PEAK, SAMPLE_RATE, noiseWave, toneWave, wavBytes } from "./synth";

const peak = (samples: Float32Array) => samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);

// the loudest point of a spectrum, by counting rising zero crossings (a pure tone only)
const crossings = (samples: Float32Array) => {
  let n = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1] < 0 && samples[i] >= 0) n++;
  return n;
};

for (const wave of SOUND_WAVES) {
  for (const pitch of [55, 110, 440, 1000, 1999, 2000]) {
    const w = toneWave(wave, pitch);
    assert.ok(w.samples.length > 1000, `${wave} ${pitch}: has length`);
    near(peak(w.samples), PEAK, 1e-6, `${wave} ${pitch}: peaks at the set level, never over (no clipping)`);
    assert.ok(peak(w.samples) <= 1);
    // a whole number of periods in the buffer: the pitch is what was asked, to a hair
    assert.ok(Math.abs(w.frequency! - pitch) / pitch < 0.002, `${wave} ${pitch}: pitch ${w.frequency}`);
    near((w.periods! * w.rate) / w.samples.length, w.frequency!, 1e-9, "the buffer holds exactly its periods");
    // the loop's seam: the step from the last sample to the first is no bigger than the steps within it
    const seam = Math.abs(w.samples[0] - w.samples[w.samples.length - 1]);
    let biggest = 0;
    for (let i = 1; i < w.samples.length; i++) biggest = Math.max(biggest, Math.abs(w.samples[i] - w.samples[i - 1]));
    assert.ok(seam <= biggest + 1e-6, `${wave} ${pitch}: the loop's seam (${seam}) is as smooth as the wave (${biggest})`);
    // (the average is zero: no push on the speaker)
    assert.ok(Math.abs(w.samples.reduce((s, v) => s + v, 0) / w.samples.length) < 1e-3);
  }
}
{
  // a sine has one crossing per period
  const sine = toneWave("sine", 440);
  // (the one at the very start has nothing before it to cross from)
  assert.equal(crossings(sine.samples), sine.periods! - 1);
  assert.equal(sine.periods, 220);
  // and the same wave is the same samples: it is made once, deterministically
  assert.deepEqual(toneWave("saw", 220).samples, toneWave("saw", 220).samples);
  // the wave forms differ
  const shapes = SOUND_WAVES.map((w) => toneWave(w, 300).samples);
  for (let a = 0; a < shapes.length; a++) for (let b = a + 1; b < shapes.length; b++) assert.notDeepEqual(shapes[a], shapes[b]);
  // a square is flatter on top than a sine: stronger on average
  assert.ok(rms(toneWave("square", 300).samples) > rms(toneWave("sine", 300).samples));
  // a band-limited high saw has few overtones but still nothing beyond the sample rate's half
  assert.ok(peak(toneWave("saw", 2000).samples) <= PEAK + 1e-6);
}

for (const color of NOISE_COLORS) {
  const n = noiseWave(color);
  assert.equal(n.samples.length, 2 * SAMPLE_RATE, `${color}: two seconds`);
  assert.ok(peak(n.samples) <= PEAK + 1e-6, `${color}: no clipping`);
  assert.ok(Math.abs(n.samples.reduce((s, v) => s + v, 0) / n.samples.length) < 1e-3, `${color}: no offset`);
  assert.ok(rms(n.samples) > 0.05 && rms(n.samples) <= 0.3, `${color}: an average strength like a tone's (${rms(n.samples)})`);
  // the loop's seam: no jump bigger than the noise makes anywhere else
  let biggest = 0;
  for (let i = 1; i < n.samples.length; i++) biggest = Math.max(biggest, Math.abs(n.samples[i] - n.samples[i - 1]));
  assert.ok(Math.abs(n.samples[0] - n.samples[n.samples.length - 1]) <= biggest + 1e-6, `${color}: seam`);
  assert.deepEqual(noiseWave(color, 8000, 0.5).samples, noiseWave(color, 8000, 0.5).samples, `${color}: the same every time`);
}
{
  // colours: brown is slow (neighbouring samples alike), white is not
  const slowness = (c: (typeof NOISE_COLORS)[number]) => {
    const s = noiseWave(c, 22050, 1).samples;
    let diff = 0;
    for (let i = 1; i < s.length; i++) diff += Math.abs(s[i] - s[i - 1]);
    return diff / s.length / rms(s);
  };
  assert.ok(slowness("brown") < slowness("pink") && slowness("pink") < slowness("white"), "white > pink > brown in how much it jitters");
}

// the WAV: a header and 16-bit samples
{
  const w = toneWave("sine", 440);
  const bytes = new DataView(wavBytes(w));
  assert.equal(String.fromCharCode(bytes.getUint8(0), bytes.getUint8(1), bytes.getUint8(2), bytes.getUint8(3)), "RIFF");
  assert.equal(bytes.getUint32(24, true), SAMPLE_RATE);
  assert.equal(bytes.byteLength, 44 + w.samples.length * 2);
  assert.equal(bytes.getUint32(40, true), w.samples.length * 2);
}

function near(a: number, b: number, eps: number, message: string) {
  assert.ok(Math.abs(a - b) <= eps, `${message}: ${a} is not ${b}`);
}
console.log("synth: ok");
