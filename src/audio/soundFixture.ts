// A map to test the sound with (see soundField.test.ts, soundSystem.test.ts): two rooms with a wall between them and a
// door in it, and a sound emitter in the far room.
//
//      x: 0123456789ABC
//   y0    WWWWWWWWWWWWW
//   y1    W.....W.....W      the listener stands at (3, 3) in the room to the west;
//   y2    W.....W.....W      the wall is the column x = 6, with a door in it at (6, 3);
//   y3    W.....D.....W      the sound is at (9, 1) in the room to the east: with the door shut it is behind one wall,
//   y4    W.....W.....W      and open the way to it from the listener runs through the door - 8 steps.
//   y5    W.....W.....W
//   y6    WWWWWWWWWWWWW
import type { MapFile } from "../game/mapFormat";
import type { SoundSpec } from "../game/sounds";
import type { Blocked } from "./soundField";

export const FIXTURE_LAYOUT = [
  "WWWWWWWWWWWWW",
  "W.....W.....W",
  "W.....W.....W",
  "W.....D.....W",
  "W.....W.....W",
  "W.....W.....W",
  "WWWWWWWWWWWWW",
];
export const FIXTURE_LISTENER = { x: 3, z: 3 };
export const FIXTURE_DOOR = { x: 6, y: 3 };
export const FIXTURE_SOUND: SoundSpec = { x: 9, y: 1, kind: "tone", volume: 1, range: 20 };

// what blocks sound in the fixture: a wall, the edge of the map, and the door while it is shut
export function fixtureBlocked(doorOpen: boolean): Blocked {
  return (x, y) => {
    const char = FIXTURE_LAYOUT[y]?.[x];
    if (char === undefined || char === "W") return true;
    return char === "D" && !doorOpen;
  };
}

export function fixtureFile(sounds: SoundSpec[] = [FIXTURE_SOUND]): MapFile {
  return { name: "sound fixture", deck: 1, start: { x: 3, y: 3, facing: "E" }, layout: [...FIXTURE_LAYOUT], sounds } as unknown as MapFile;
}
