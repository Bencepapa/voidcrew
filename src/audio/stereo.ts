// The left / right balance of a voice, worked out here instead of by a panner node: a StereoPannerNode's equal-power law
// puts a sound that is straight to one side wholly in that ear, which is not how a sound in a room is heard (both ears
// get it, the near one more) and which is worst for loud, near and doorway sounds. So the balance is
//
//     pan = sin(azimuth) * width            (-1 left .. +1 right)
//
// where the azimuth is the angle of the sound's apparent place from straight ahead, and the width - how far from the
// middle the sound may be put - grows with its apparent distance (a sound close by is a wide, diffuse one; a far one
// is a point), is cut for a sound that comes through a doorway (it reaches the ear spread out) and for a loud one.
// Pure, tested without a browser (stereo.test.ts). The engine (engine.ts) feeds the number to its panner; with the HRTF
// switch on, the 3D panner does the whole job and this is not used.
import type { Point } from "./soundField";

export const STEREO = {
  // the apparent distance (cells) up to which the width is `nearWidth`, and from which it is `farWidth`
  nearDistance: 1,
  farDistance: 7,
  nearWidth: 0.35,
  // never near 1 (measured: a pan of 0.9 leaves the far ear 22 dB down, which is "one ear"): at 0.75 the far ear is
  // about 14 dB down for a quiet far sound, a sound is never in one ear alone
  farWidth: 0.75,
  // a sound that reaches the listener through a doorway
  portalWidth: 0.6,
  // how much of the width a full-level sound gives up (a loud sound fills both ears)
  loudSpread: 0.3,
  // a sound this close to the listener (cells, on the floor plane) has no clear side: the azimuth fades in over this
  centre: 0.5,
} as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

// The widest balance (0..1) a voice may have: from its apparent distance (cells), its level (0..1: volume times the
// distance's falloff) and whether it is the doorway's voice.
export function panWidth(distance: number, level: number, portal = false): number {
  const t = smooth(clamp01((distance - STEREO.nearDistance) / (STEREO.farDistance - STEREO.nearDistance)));
  let width = STEREO.nearWidth + (STEREO.farWidth - STEREO.nearWidth) * t;
  if (portal) width = Math.min(width, STEREO.portalWidth);
  return width * (1 - STEREO.loudSpread * clamp01(level));
}

// Which side a place is on, -1 (left) .. 1 (right): the sine of its angle from the way the listener faces, on the floor
// plane (x east, z south; the right of a forward vector (fx, fz) is (-fz, fx)). 0 straight ahead or behind.
export function sideOf(listener: Point & { fx: number; fz: number }, x: number, z: number): number {
  const dx = x - listener.x;
  const dz = z - listener.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return 0;
  const facing = Math.hypot(listener.fx, listener.fz) || 1;
  const right = (dx * -listener.fz + dz * listener.fx) / (length * facing);
  // (right on top of the listener there is no side: it fades in over a short way)
  return Math.max(-1, Math.min(1, right)) * smooth(clamp01(length / STEREO.centre));
}

export interface PanInput {
  // the apparent distance in cells: the straight one, or - for the doorway's voice - the length of the way round
  distance: number;
  // 0..1
  level: number;
  portal?: boolean;
}

export function stereoPan(listener: Point & { fx: number; fz: number }, x: number, z: number, input: PanInput): number {
  return sideOf(listener, x, z) * panWidth(input.distance, input.level, input.portal === true);
}

// The two ears' gains for a pan (the equal-power law of a StereoPannerNode, for a mono source): what the engine's panner
// does with the number, for the tests and for the reader.
export function earGains(pan: number): { left: number; right: number } {
  const x = (Math.max(-1, Math.min(1, pan)) + 1) / 2;
  return { left: Math.cos((x * Math.PI) / 2), right: Math.sin((x * Math.PI) / 2) };
}
