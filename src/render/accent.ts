// A ship's accent color, without new textures: every lit material (see
// useLightGrid) turns the strongly colored parts of its texture - and of its
// glow - whose hue is near `from` round the hue circle by `shift`: the blue
// trim of a deck and its robots' lights cyan, yellow, green... Grey metal,
// dark and pale pixels and other hues stay as they are. Hues 0..1 (0 red,
// 1/3 green, 2/3 blue); `width`: how far from `from` a hue still counts;
// `minSat`: how saturated a pixel must be.
export const ACCENT_UNIFORMS = {
  uAccentFrom: { value: 0.6 },
  uAccentWidth: { value: 0.08 },
  uAccentShift: { value: 0 },
  uAccentMinSat: { value: 0.35 },
};

// (GLSL: declared once in each patched fragment shader)
export const ACCENT_GLSL = `
uniform float uAccentFrom;
uniform float uAccentWidth;
uniform float uAccentShift;
uniform float uAccentMinSat;
vec3 acRgb2Hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 acHsv2Rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
// a linear color with its accent turned (in sRGB-like space, where hue and
// saturation read as the painter saw them)
vec3 accentShift(vec3 linear) {
  if (uAccentShift == 0.0) return linear;
  vec3 c = pow(max(linear, vec3(0.0)), vec3(1.0 / 2.2));
  vec3 hsv = acRgb2Hsv(c);
  float away = abs(fract(hsv.x - uAccentFrom + 0.5) - 0.5);
  float w = (1.0 - smoothstep(uAccentWidth * 0.6, uAccentWidth, away))
    * smoothstep(uAccentMinSat, uAccentMinSat + 0.15, hsv.y)
    * smoothstep(0.04, 0.12, hsv.z);
  if (w <= 0.0) return linear;
  vec3 turned = acHsv2Rgb(vec3(fract(hsv.x + uAccentShift), hsv.yz));
  return pow(mix(c, turned, w), vec3(2.2));
}
`;
