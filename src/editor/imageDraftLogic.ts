// The pure part of "edit a published picture": which published images can be revised into a draft, the uuid their
// folder in the shared store has, and the draft made from their files. (No store or browser access here, so it is tested.)

import type { PickupAppearance } from "../game/items";
import type { SharedImage } from "../render/sharedImages";
import type { ImageDraft } from "./sharedImages";

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

// "<world>_<type>_<uuid>" -> uuid ("" when the id is not of that shape: a built-in picture)
export function publishedUuid(image: Pick<SharedImage, "id" | "world" | "type">): string {
  const prefix = `${image.world}_${image.type}_`;
  const uuid = image.id.startsWith(prefix) ? image.id.slice(prefix.length) : "";
  return uuidPattern.test(uuid) ? uuid : "";
}

// pickups and decals have maps worth editing; a still is a flat picture and keeps its read-only view
export const canReviseImage = (image: Pick<SharedImage, "id" | "world" | "type">) =>
  (image.type === "item" || image.type === "decal") && publishedUuid(image) !== "";

// the draft of a published picture: its files are the uploads. The published diffuse already has its transparency applied,
// so the draft keeps the alpha channel as it is; a pickup's maps become uploaded maps (the published files, auto-made or not).
export function draftFromPublished(image: SharedImage, files: { png: Blob; normal?: Blob; depth?: Blob }): ImageDraft {
  const pickup = image.pickup;
  const appearance: PickupAppearance | undefined = pickup
    ? { category: pickup.category, height: pickup.height, glow: pickup.glow, ...(pickup.value !== undefined ? { value: pickup.value } : {}) }
    : undefined;
  return {
    id: image.id,
    uuid: publishedUuid(image),
    world: image.world,
    type: image.type,
    name: image.name,
    png: files.png,
    surface: image.surface ?? "wall",
    transparency: { source: "alpha", colorKey: "#ff00ff" },
    purpose: image.purpose,
    pickup: image.type === "item" ? appearance : undefined,
    pickupMaps: image.type === "item" ? { depth: files.depth, normal: files.normal, aiDepth: false } : undefined,
  };
}
