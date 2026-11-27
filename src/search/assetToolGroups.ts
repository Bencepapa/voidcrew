const TRAVERSE = new Set(["ladder", "bridge", "door", "stairs", "exit"]);
const EVENTS = new Set(["start", "restricted", "chanceWall", "message", "image", "shop"]);

// Which asset-tree group a stable tool target belongs to (so the opener can expand it).
export function assetToolGroup(id: string): string | undefined {
  if (id === "tool.roofAuto" || id.startsWith("tool.roof.")) return "roof";
  if (id.startsWith("tool.fence.")) return "fence";
  if (id.startsWith("tool.light.")) return "light";
  if (id.startsWith("tool.smoke.")) return "smoke";
  const name = id.startsWith("tool.") ? id.slice("tool.".length) : "";
  if (TRAVERSE.has(name)) return "traverse";
  if (EVENTS.has(name)) return "events";
  return undefined;
}
