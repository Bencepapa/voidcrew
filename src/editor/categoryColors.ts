// Shared by minimap markers, editor outlines and category controls.
export type Category = "prop" | "decal" | "item" | "npc" | "light" | "smoke" | "exit" | "start" | "door" | "ladder" | "bridge" | "restricted" | "chanceWall";
export const CATEGORY_COLORS: Record<Category, string> = {
  prop: "#d97706", decal: "#a855f7", item: "#0891b2", npc: "#e11d48",
  light: "#ca8a04", smoke: "#64748b", exit: "#16a34a", start: "#2563eb",
  door: "#b45309", ladder: "#9333ea", bridge: "#0d9488", restricted: "#dc2626", chanceWall: "#db2777",
};
