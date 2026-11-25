// How the room's acoustics reach a voice, as plain numbers (no Web Audio: tested in roomMix.test.ts): how much of a voice
// is sent to the echo, how much a zone's insulation dulls a wall, and how the listener's room is followed without
// flickering between two zones.
import type { Place } from "./acoustics";

// The Debug panel's "Echo" slider runs 0..1; this is the value at which the zones' own numbers are used as they are.
export const DEFAULT_REVERB_AMOUNT = 0.6;

// the master factor of the wet level: the slider's value as a multiplier (the default is 1; the end of the slider 1.67)
export const masterSend = (amount: number, on = true) => (on ? Math.max(0, Math.min(1, amount)) / DEFAULT_REVERB_AMOUNT : 0);

// ---- distance: a far sound is more echo, less direct

export const WET_NEAR = 0.2;
export const WET_FAR = 0.8;
// from this far (cells) the echo's share stops growing
export const WET_FAR_DISTANCE = 16;

// How much of a voice goes to the echo for its distance (cells): 0.2 from close by, growing smoothly to 0.8 from 16 cells
// (the air between the source and the listener takes the direct sound away, the room's echo stays).
export function wetRatio(distance: number): number {
  const u = Math.max(0, Math.min(1, (distance - 1) / (WET_FAR_DISTANCE - 1)));
  return WET_NEAR + (WET_FAR - WET_NEAR) * u * u * (3 - 2 * u);
}

// A voice's send to the echo bus (0..1), before the master slider: the zone's `reverb` times the distance's share.
export const wetSend = (reverb: number, distance: number) => Math.max(0, Math.min(1, reverb)) * wetRatio(distance);

// ---- insulation

export const INSULATION_STRENGTH = 0.6;

// what each wall between a sound and the listener counts as, with the insulation (0..1) of the zones on its ends
export const insulationFactor = (insulation: number) => 1 + INSULATION_STRENGTH * Math.max(0, Math.min(1, insulation));

// the dulling is the stronger one's: either end's zone can shut sound in or out
export const wallInsulation = (listener: number, source: number) => Math.max(listener, source);

// ---- following the listener's place

export interface RoomTracker {
  // the place the listener hears now: it changes only after the listener has stood in another one for `hold` seconds
  // (a place with the same key but other numbers - a zone being edited - is taken at once)
  update(t: number, place: Place): Place;
  reset(): void;
}

export function createRoomTracker(hold = 0.3): RoomTracker {
  let current: Place | null = null;
  let pending: { key: string; since: number } | null = null;
  return {
    update(t, place) {
      if (!current) return (current = place);
      if (place.key === current.key) {
        pending = null;
        return (current = place);
      }
      if (!pending || pending.key !== place.key) pending = { key: place.key, since: t };
      if (t - pending.since >= hold) {
        pending = null;
        return (current = place);
      }
      return current;
    },
    reset() {
      current = null;
      pending = null;
    },
  };
}
