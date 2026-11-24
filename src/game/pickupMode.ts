// How loose items are picked up (the pure decisions; the stored choice is in pickupPrefs.ts).
//
//   "auto"  stepping onto an item takes it (the ship loop: loot is swept up as the crew walks)
//   "click" stepping does nothing; an item is taken by a click on it in the 3D view (within a short
//           reach) or by Use (Space) - so what isn't wanted stays on the floor, and an item lying on a
//           trap's disarm button is not taken by stepping on the button.
//
// Which mode is on: the map's own `pickup` (MapFile.pickup), else the choice stored in this browser
// (the Debug panel), else the world's default - the ship loop collects, the open world does not.
//
// Besides a click, a loose item can be dragged from the 3D view onto a hand box, a crewmate's card or
// the inventory (button, window): see worldDrop.ts (the rules) and components/slotDrag.ts (the drag).
// It works in both modes and has the same reach as a click.

import type { WorldId } from "./worlds";

export type PickupMode = "auto" | "click";
export const PICKUP_MODES: readonly PickupMode[] = ["auto", "click"];

export const parsePickupMode = (value: unknown): PickupMode | undefined =>
  value === "auto" || value === "click" ? value : undefined;

// what a world does when neither the map nor the player chose
export const worldDefaultPickup = (world: WorldId): PickupMode => (world === "fantasy" ? "click" : "auto");

// map override > stored preference > world default
export function resolvePickupMode(map: { pickup?: PickupMode; world: WorldId }, stored?: PickupMode | null): PickupMode {
  return parsePickupMode(map.pickup) ?? parsePickupMode(stored) ?? worldDefaultPickup(map.world);
}

// whether stepping into a cell takes what lies there
export const stepCollects = (mode: PickupMode): boolean => mode === "auto";

// How far a click can take an item: the party's cell and the ones around it (cells, either way), on
// the surface the party stands on (how much the item's floor may differ from the party's height).
export const PICKUP_REACH = 1;
const SAME_LEVEL = 0.25 + 1e-6;

export function inPickupReach(party: { x: number; y: number }, partyHeight: number, cell: { x: number; y: number }, cellFloor: number): boolean {
  return Math.max(Math.abs(cell.x - party.x), Math.abs(cell.y - party.y)) <= PICKUP_REACH && Math.abs(cellFloor - partyHeight) <= SAME_LEVEL;
}

// What a click on a loose item does: "taken" already, "far" (too far to reach), "busy" (the party can't
// act now), or "take".
export function clickPickup(input: { taken: boolean; busy: boolean; reach: boolean }): "take" | "taken" | "far" | "busy" {
  if (input.taken) return "taken";
  if (input.busy) return "busy";
  return input.reach ? "take" : "far";
}
