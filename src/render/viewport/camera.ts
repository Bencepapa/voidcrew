import * as THREE from "three";
import { DIR_VECTOR } from "../../game/movement";
import type { Direction, Vec2 } from "../../game/types";

// The top-down view (editing; the O key or the button): the camera high above
// the map looking down (tilted with Ctrl+wheel), the ceilings and the sight
// culling and fog off - to survey and texture a large area, even across
// walls. Height above the floor: ZOOM_MIN..ZOOM_MAX cells; the wheel zooms.
export const TOPDOWN_FOV = 40;
export const TOPDOWN_REACH = 400;

export const TOPDOWN_ZOOM_MIN = 1.5;
export const TOPDOWN_ZOOM_MAX = 60;

// aiming camera: how much of the view a target fills while a part is
// picked, the narrowest field of view (degrees) and how fast it eases (s)
export const AIM_FRAMING = 1.6;
export const AIM_MIN_FOV = 8;
export const AIM_CAMERA_TAU = 0.12;

// settings.fov is applied to the screen's shorter side; on a portrait screen
// that makes the vertical FOV large, capped here to limit distortion
const MAX_VERTICAL_FOV = 115;


// Lift rides: the cabin lights dip this long either side of the deck swap;
// a shaft light passes every SHAFT_LIGHT_PERIOD_MS, sweeping this far above
// and below the eyes
export const LIFT_DIP_MS = 350;
export const SHAFT_LIGHT_COLOR = 0xffe2b0;
export const SHAFT_LIGHT_INTENSITY = 3.5;
export const SHAFT_LIGHT_PERIOD_MS = 700;
export const SHAFT_LIGHT_SWEEP = 1.2;
// a change of map: how long the black sheet takes to clear after arriving (s)
export const TRANSIT_FADE_IN_S = 0.6;
// taking stairs: how far ahead (cells) the eye walks and how far it climbs or
// sinks (wall heights) by the end of the ride
export const STAIRS_WALK = 0.55;
export const STAIRS_RISE = 0.7;

// the crew down: how long the view takes to fall, the eye's height above
// the floor then, how far up it looks and how far over the head rolls
export const DOWN_FALL_MS = 900;
export const DOWN_EYE = 0.09;
export const DOWN_LOOK_UP = 0.35;
export const DOWN_ROLL = 1.25;

// a peek eases back to center once its input has been idle this long...
export const PEEK_IDLE_MS = 300;
// ...with this time constant (s)
export const PEEK_RETURN_TAU = 0.25;

export interface CamTarget {
  x: number;
  z: number;
  tx: number;
  tz: number;
  // height of the surface under the camera (wall heights)
  y: number;
}

export function computeTarget(pos: Vec2, dir: Direction, elevation: number): CamTarget {
  const fwd = DIR_VECTOR[dir];
  return { x: pos.x, z: pos.y, tx: pos.x + fwd.x, tz: pos.y + fwd.y, y: elevation };
}

// a vertical field of view (degrees) magnified `zoom` times
export function zoomedFov(fov: number, zoom: number): number {
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) / zoom));
}

// vertical FOV that shows `fov` degrees across the shorter screen side
export function verticalFov(fov: number, aspect: number): number {
  if (aspect >= 1) return fov;
  const v = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return Math.min(MAX_VERTICAL_FOV, v);
}
