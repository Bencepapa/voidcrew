import type { Direction, GameMap, Vec2, ActorSpec } from "./types";
import type { WallFacePart } from "./mapGeometry";
import { isFriendlySpec } from "./actors";
import { readShopInteraction, talkMode } from "./simpleShop";

export type Interaction = { clickOnly?: true } & (
  | { kind: "message"; text: string; modal: boolean; position: "top" | "center" | "bottom"; timeout?: number }
  | { kind: "image"; text: string; image?: string }
  // a talk (see dialogue.ts): the library and the passage it starts at; the
  // portrait shown beside it, the shop a parameter-less @shop opens, the
  // actor type talking and (a placed NPC) its index in the map's actors
  | { kind: "dialogue"; library: string; entry: string; portrait?: string; shop?: string; npc?: string; actorId?: number }
  // the simple shop: the shop window straight away, with a portrait and a greeting
  // (empty = the default one); an NPC without a dialogue opens it too (npc, actorId)
  | { kind: "shop"; shop: string; greeting?: string; portrait?: string; npc?: string; actorId?: number }
);

export type WallInteractionTarget = { kind: "wall"; cell: Vec2; side: Direction; part?: WallFacePart };

export type InteractionTarget =
  | WallInteractionTarget
  | { kind: "door"; cell: Vec2 }
  | { kind: "decal" | "prop" | "item" | "actor"; index: number };

export const sameInteractionCell = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

// A friendly NPC with a dialogue talks when used (its spec's object is the key:
// the same event comes back every time, so Use can match what it aimed at).
const talks = new WeakMap<ActorSpec, Interaction>();
export function actorInteraction(spec: ActorSpec | undefined, index: number): Interaction | undefined {
  if (!spec) return undefined;
  const mode = talkMode(spec, isFriendlySpec(spec));
  if (!mode) return undefined;
  let event = talks.get(spec);
  if (!event || event.kind !== mode || ("actorId" in event ? event.actorId : undefined) !== index) {
    event = spec.dialogue
      ? { kind: "dialogue", library: spec.dialogue.library, entry: spec.dialogue.entry, portrait: spec.portrait, shop: spec.shop, npc: spec.actor, actorId: index }
      : { kind: "shop", shop: spec.shop ?? "", greeting: spec.greeting, portrait: spec.portrait, npc: spec.actor, actorId: index };
    talks.set(spec, event);
  }
  return event;
}

export function interactionAt(map: GameMap, target: InteractionTarget): Interaction | undefined {
  switch (target.kind) {
    case "wall": return map.wallInteractions?.find(w => w.side === target.side && w.part === target.part && sameInteractionCell(w.cell, target.cell))?.interaction;
    case "door": return map.doors?.find(d => sameInteractionCell(d.cell, target.cell))?.interaction;
    case "prop": return map.props?.[target.index]?.interaction;
    case "decal": return map.decals?.[target.index]?.interaction;
    case "item": return map.items?.[target.index]?.interaction;
    case "actor": return actorInteraction(map.actors?.[target.index], target.index);
  }
}

export function readInteraction(raw: Interaction | undefined): Interaction | undefined {
  if (!raw) return undefined;
  const click = raw.clickOnly === true ? { clickOnly: true as const } : {};
  if (raw.kind === "dialogue") {
    if (typeof raw.library !== "string" || typeof raw.entry !== "string" || !raw.library) return undefined;
    return {
      ...click, kind: "dialogue", library: raw.library, entry: raw.entry,
      portrait: typeof raw.portrait === "string" && raw.portrait ? raw.portrait : undefined,
      shop: typeof raw.shop === "string" && raw.shop ? raw.shop : undefined,
      npc: typeof raw.npc === "string" && raw.npc ? raw.npc : undefined,
    };
  }
  if (raw.kind === "shop") return readShopInteraction(raw);
  if (typeof raw.text !== "string") return undefined;
  if (raw.kind === "image") return { ...click, kind: "image", text: raw.text, image: typeof raw.image === "string" ? raw.image : undefined };
  if (raw.kind !== "message") return undefined;
  return {
    ...click,
    kind: "message", text: raw.text, modal: raw.modal === true,
    position: raw.position === "top" || raw.position === "bottom" ? raw.position : "center",
    timeout: typeof raw.timeout === "number" && Number.isFinite(raw.timeout) && raw.timeout > 0 ? raw.timeout : undefined,
  };
}
