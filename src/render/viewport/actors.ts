import * as THREE from "three";
import { BODY_PARTS } from "../../game/actors";

// the party's cover (see updatePartyCover): how often it's measured (ms),
// the heights sampled on its body (shares of the eye height) and how wide
// it stands
export const PARTY_COVER_REFRESH_MS = 250;
export const PARTY_BODY_HEIGHTS = [0.3, 0.65, 1];
export const PARTY_BODY_HALF_WIDTH = 0.12;
// the hit chance samples a grid of this many spots squared over a part
export const CHANCE_GRID = 6;
// actors: how long a hit flashes and a death fades (game ms)
export const ACTOR_FLASH_MS = 220;
export const ACTOR_FADE_MS = 900;
// an actor's firing pose, held after a shot; each of its dying frames (ms)
export const ACTOR_SHOOT_POSE_MS = 350;
export const ACTOR_DIE_FRAME_MS = 260;
// each of its firing rows, when it has several (ActorType.shootRows)
export const ACTOR_SHOOT_FRAME_MS = 70;
// how long its hit pose shows (ActorType.hitRow)
export const ACTOR_HIT_POSE_MS = 320;
// aiming: how often the hit chances are worked out again (real ms), and how
// long a shot's trace lingers
export const AIM_CHANCE_REFRESH_MS = 250;
// how many body parts' chances are worked out again per frame
export const AIM_CHANCE_PARTS_PER_FRAME = 1;
export const TRACER_MS = 220;

// muzzle flashes (see addFlash): the party's, and an actor's (its color,
// strength, reach and length in ms)
export const PARTY_FLASH_COLOR = 0xffe2a0;
export const ACTOR_FLASH = { color: 0xff9a40, intensity: 3.5, range: 3, duration: 110 };

// an actor's glowing pixels (see glowMapOf): at least this red, no more
// than this green or blue
const GLOW_MIN_RED = 150;
const GLOW_MAX_OTHER = 90;
// ... or, for the other colors that glow (see ActorType.glow), bright and
// clearly that color
export const GLOW_COLORS: Record<"red" | "blue" | "cyan", (r: number, g: number, b: number) => boolean> = {
  red: (r, g, b) => r >= GLOW_MIN_RED && Math.max(g, b) <= GLOW_MAX_OTHER,
  blue: (r, _g, b) => b > 170 && b - r > 70,
  cyan: (r, g, b) => g > 170 && b > 170 && r < 130,
};

// Aiming: the picked body part lights up on its actor's sprite - its own
// pixels, not a box: a faint fill and a bright outline, drawn in the scene,
// so whatever covers part of it covers the highlight too. The sprite's
// material gets the four parts' zones (sheet UVs of the cell shown) and the
// picked one's index (-1: none). Its weak spots (ActorType.crits) show red
// with a yellow rim.
export const MAX_CRIT_ZONES = 10;
export interface PartHighlight {
  zones: { value: THREE.Vector4[] };
  // 1: outline the whole sprite (the crew's scanner, see enemyScanner)
  outline: { value: number };
  part: { value: number };
  texel: { value: THREE.Vector2 };
  // the weak spots' zones in the cell shown, their parts, and how many
  crits: { value: THREE.Vector4[] };
  critParts: { value: number[] };
  critCount: { value: number };
  // the actor's glowing parts (see ActorType.glow) and how bright they are
  glowMap: { value: THREE.Texture };
  glow: { value: number };
}
// no glow (a sampler needs some texture)
const NO_GLOW = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
NO_GLOW.needsUpdate = true;
export function highlightMaterial(material: THREE.MeshStandardMaterial): PartHighlight {
  const uniforms: PartHighlight = {
    zones: { value: BODY_PARTS.map(() => new THREE.Vector4()) },
    outline: { value: 0 },
    part: { value: -1 },
    texel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    crits: { value: Array.from({ length: MAX_CRIT_ZONES }, () => new THREE.Vector4()) },
    critParts: { value: new Array(MAX_CRIT_ZONES).fill(-1) },
    critCount: { value: 0 },
    glowMap: { value: NO_GLOW },
    glow: { value: 0 },
  };
  material.customProgramCacheKey = () => "actor-part-highlight";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPartZones = uniforms.zones;
    shader.uniforms.uPart = uniforms.part;
    shader.uniforms.uOutline = uniforms.outline;
    shader.uniforms.uTexel = uniforms.texel;
    shader.uniforms.uCrits = uniforms.crits;
    shader.uniforms.uCritParts = uniforms.critParts;
    shader.uniforms.uCritCount = uniforms.critCount;
    shader.uniforms.uGlowMap = uniforms.glowMap;
    shader.uniforms.uGlow = uniforms.glow;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance += texture2D(uGlowMap, vMapUv).rgb * uGlow;`,
      )
      .replace(
        "#include <map_pars_fragment>",
        `#include <map_pars_fragment>
uniform vec4 uPartZones[${BODY_PARTS.length}];
uniform float uOutline;
uniform sampler2D uGlowMap;
uniform float uGlow;
uniform int uPart;
uniform vec2 uTexel;
uniform vec4 uCrits[${MAX_CRIT_ZONES}];
uniform float uCritParts[${MAX_CRIT_ZONES}];
uniform int uCritCount;
bool inZone(vec4 z, vec2 uv) { return uv.x >= z.x && uv.x <= z.z && uv.y <= z.y && uv.y >= z.w; }
// the weak spot zone a spot of the sheet is in (-1: none)
int critOf(vec2 uv) {
  for (int i = 0; i < ${MAX_CRIT_ZONES}; i++) {
    if (i >= uCritCount) break;
    if (inZone(uCrits[i], uv)) return i;
  }
  return -1;
}
// the part a spot of the sheet belongs to (a BODY_PARTS index): a weak
// spot's, else head, torso, legs, then the arms (they reach across the
// torso) - as hitPart() on the CPU
int partOf(vec2 uv) {
  int c = critOf(uv);
  if (c >= 0) return int(uCritParts[c] + 0.5);
  if (inZone(uPartZones[0], uv)) return 0;
  if (inZone(uPartZones[1], uv)) return 1;
  if (inZone(uPartZones[4], uv)) return 4;
  if (inZone(uPartZones[2], uv)) return 2;
  if (inZone(uPartZones[3], uv)) return 3;
  return -1;
}
bool solid(vec2 uv) { return texture2D(map, uv).a >= 0.5; }
bool onPart(vec2 uv) { return texture2D(map, uv).a >= 0.5 && partOf(uv) == uPart; }
bool onCrit(vec2 uv) { return texture2D(map, uv).a >= 0.5 && critOf(uv) >= 0 && partOf(uv) == uPart; }`,
      )
      .replace(
        "#include <fog_fragment>",
        `#include <fog_fragment>
// after the fog, so it reads at any distance: a tint over the part, and a
// two-texel outline where it meets another part or the transparent edge
if (uPart >= 0 && onPart(vMapUv)) {
  bool edge = false;
  for (int i = 1; i <= 2; i++) {
    vec2 d = uTexel * float(i);
    edge = edge || !onPart(vMapUv + vec2(d.x, 0.0)) || !onPart(vMapUv - vec2(d.x, 0.0)) ||
      !onPart(vMapUv + vec2(0.0, d.y)) || !onPart(vMapUv - vec2(0.0, d.y));
  }
  if (edge) gl_FragColor.rgb = vec3(0.5, 1.0, 0.7);
  else if (critOf(vMapUv) >= 0) {
    bool rim = !onCrit(vMapUv + vec2(uTexel.x, 0.0)) || !onCrit(vMapUv - vec2(uTexel.x, 0.0)) ||
      !onCrit(vMapUv + vec2(0.0, uTexel.y)) || !onCrit(vMapUv - vec2(0.0, uTexel.y));
    gl_FragColor.rgb = rim ? vec3(1.0, 0.85, 0.2) : mix(gl_FragColor.rgb, vec3(1.0, 0.18, 0.08), 0.55);
  } else gl_FragColor.rgb += vec3(0.04, 0.16, 0.09);
} else if (uOutline > 0.5 && uPart < 0 && solid(vMapUv)) {
  // the crew's scanner: the sprite's outline, whatever the light
  bool rim = false;
  for (int i = 1; i <= 2; i++) {
    vec2 d = uTexel * float(i);
    rim = rim || !solid(vMapUv + vec2(d.x, 0.0)) || !solid(vMapUv - vec2(d.x, 0.0)) ||
      !solid(vMapUv + vec2(0.0, d.y)) || !solid(vMapUv - vec2(0.0, d.y));
  }
  if (rim) gl_FragColor.rgb = vec3(1.0, 0.45, 0.15);
}`,
      );
  };
  return uniforms;
}
