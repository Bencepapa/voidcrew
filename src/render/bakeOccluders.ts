import { BRIDGE_THICKNESS, BRIDGE_WIDTH, floorHeight } from "../game/mapGeometry";
import { PROP_TYPES, ROOF_THICKNESS, propHeight, propPlacement } from "../game/props";
import type { GameMap } from "../game/types";
import type { LightBakeMap, Occluder, Occluders } from "./bakeOcclusion";

export function propCastsBakedShadow(spec: NonNullable<GameMap["props"]>[number]): boolean {
  const kind = PROP_TYPES[spec.prop]?.kind;
  // Fences and crossed foliage are mostly gaps, thin faces or leaves.
  return !!kind && kind !== "cross" && kind !== "fence" && kind !== "prism";
}

export function occludersOf(map: LightBakeMap, includeRoofs = false): Occluders {
  const out: Occluders = { width: map.width, cells: [] };
  const add = (box: Occluder) => {
    for (let z = Math.max(0, Math.round(box.minZ)); z <= Math.min(map.height - 1, Math.round(box.maxZ)); z++) {
      for (let x = Math.max(0, Math.round(box.minX)); x <= Math.min(map.width - 1, Math.round(box.maxX)); x++) {
        (out.cells[z * map.width + x] ??= []).push(box);
      }
    }
  };
  for (const spec of map.props ?? []) {
    const sharedType = map.sharedPropTypes?.[spec.prop];
    const type = sharedType ?? PROP_TYPES[spec.prop];
    if (!type || type.kind === "cross" || type.kind === "prism" || (type.kind === "roof" && !includeRoofs) || type.kind === "fence") continue;
    const { x, z, reachX, reachZ } = propPlacement(spec, type);
    const scale = spec.scale ?? 1;
    const lift = sharedType?.elevation ?? 0;
    const bottom = floorHeight(map, spec.cell.x, spec.cell.y) + (spec.elevation ?? 0) + lift * scale;
    const roof = type.kind === "roof";
    const height = propHeight(map, spec, type);
    add({
      minX: x - reachX, maxX: x + reachX, minY: bottom, maxY: bottom + height,
      minZ: z - reachZ, maxZ: z + reachZ,
      skyOnly: roof,
      skyMaxY: bottom + (height + (roof ? ROOF_THICKNESS : 0)) * (type.kind === "pillar" ? 1 : scale),
    });
  }
  for (const bridge of map.bridges ?? []) {
    const half = BRIDGE_WIDTH / 2;
    const [hx, hz] = bridge.axis === "NS" ? [half, 0.5] : [0.5, half];
    const { x, y } = bridge.cell;
    add({ minX: x - hx, maxX: x + hx, minY: bridge.height - BRIDGE_THICKNESS, maxY: bridge.height, minZ: y - hz, maxZ: y + hz });
  }
  return out;
}
