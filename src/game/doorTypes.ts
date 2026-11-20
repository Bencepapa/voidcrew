export const DOOR_MOTIONS = ["slide", "swing", "rise"] as const;
export type DoorMotion = typeof DOOR_MOTIONS[number];

export interface DoorType {
  name: string;
  leaf: string;
  frame: string;
  motion: DoorMotion;
  hinge: "left" | "right";
  swingTo: "front" | "back";
  angle: number;
}

export const isDoorTypeId = (id: string) =>
  /^(scifi|fantasy)_door_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);

// Door-local coordinates: +Z faces the front, and +X is to the viewer's
// right when they look at the door from that side.
export function doorLeafMotion(type: Pick<DoorType, "motion" | "hinge" | "swingTo" | "angle">, width: number, height: number, centerX: number) {
  if (type.motion === "slide") return { closedX: 0, openX: width, openY: 0, openYaw: 0 };
  if (type.motion === "rise") return { closedX: 0, openX: 0, openY: height, openYaw: 0 };
  const side = type.hinge === "left" ? -1 : 1;
  const closedX = centerX + side * width / 2;
  const direction = type.swingTo === "front" ? 1 : -1;
  return { closedX, openX: closedX, openY: 0, openYaw: side * direction * type.angle * Math.PI / 180 };
}
