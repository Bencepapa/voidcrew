import type { Interaction } from "./interactions";
import type { Vec2 } from "./types";

// The simple shop: a shop opened straight from an NPC or an event target,
// with no Twine dialogue in between (see components/ShopPanel.tsx `intro`).

/** What using a friendly NPC does: a dialogue wins (its @shop can still open a shop), else a shop opens directly, else nothing. */
export function talkMode(spec: { dialogue?: { library: string; entry: string }; shop?: string }, friendly: boolean): "dialogue" | "shop" | undefined {
  if (!friendly) return undefined;
  if (spec.dialogue) return "dialogue";
  if (spec.shop) return "shop";
  return undefined;
}

/** Reads a saved `shop` interaction: it needs a shop id; an empty greeting/portrait/npc is dropped. */
export function readShopInteraction(raw: Extract<Interaction, { kind: "shop" }>): Extract<Interaction, { kind: "shop" }> | undefined {
  if (typeof raw.shop !== "string" || !raw.shop) return undefined;
  return {
    ...(raw.clickOnly === true ? { clickOnly: true as const } : {}),
    kind: "shop", shop: raw.shop,
    greeting: typeof raw.greeting === "string" && raw.greeting.trim() ? raw.greeting : undefined,
    portrait: typeof raw.portrait === "string" && raw.portrait ? raw.portrait : undefined,
    npc: typeof raw.npc === "string" && raw.npc ? raw.npc : undefined,
  };
}

export type ShopRef = { shop: string; cell?: Vec2; via: "npc" | "event" };

/** Every shop id the simple shop refers to: NPCs without a dialogue and `shop` events on walls, doors, props, decals and items. */
export function simpleShopRefs(map: {
  actors?: { cell: Vec2; dialogue?: unknown; shop?: string }[];
  wallInteractions?: { cell: Vec2; interaction?: Interaction }[];
  doors?: { cell: Vec2; interaction?: Interaction }[];
  props?: { cell: Vec2; interaction?: Interaction }[];
  decals?: { cell: Vec2; interaction?: Interaction }[];
  items?: { cell: Vec2; interaction?: Interaction }[];
}): ShopRef[] {
  const out: ShopRef[] = [];
  for (const a of map.actors ?? []) if (!a.dialogue && a.shop) out.push({ shop: a.shop, cell: a.cell, via: "npc" });
  for (const list of [map.wallInteractions, map.doors, map.props, map.decals, map.items])
    for (const e of list ?? []) if (e.interaction?.kind === "shop") out.push({ shop: e.interaction.shop, cell: e.cell, via: "event" });
  return out;
}

/** The refs whose shop id is not among `known`. */
export const unknownShops = (refs: readonly ShopRef[], known: ReadonlySet<string>): ShopRef[] => refs.filter(r => !known.has(r.shop));
