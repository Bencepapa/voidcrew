import type { PropType } from "./props";

export const DEFAULT_PROP_SHADOW = 0.5;

export function propShadowStrength(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : DEFAULT_PROP_SHADOW;
}

export function propShadowAppearance(type: Pick<PropType, "kind" | "size" | "elevation" | "shadow">, elevation = 0, scale = 1) {
  if (type.kind !== "prism" && type.kind !== "panel" && type.kind !== "cross" && type.kind !== "billboard") return;
  const strength = propShadowStrength(type.shadow);
  if (strength === 0) return;

  const [width, , depth] = type.size;
  const lift = Math.max(0, elevation + (type.elevation ?? 0) * scale);
  const attenuation = 1 / (1 + 2 * lift);
  const spread = 1.25 * attenuation;
  return {
    width: width * spread,
    depth: (type.kind === "panel" ? Math.max(depth, 0.2) : depth) * spread,
    opacity: strength * attenuation,
  };
}
