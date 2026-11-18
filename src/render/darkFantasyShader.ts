import * as THREE from "three";
import type { PostProcessSettings, PostRuleMode } from "./postSettings";
import { hueOfHex } from "./postSettings";

// An optional "dark fantasy" post-process (an experiment, see
// concept/editor-ui/NOTES-dark-fantasy-post.md): shadows crushed to black with
// the detail of the key colours kept, a small set of data-driven hue rules
// (fire, deep blue, protected green, and a spare), the rest faded towards a
// neutral blue-grey, then contrast and a vignette.
// Its input is the display-referred image (after tone mapping and the sRGB
// output pass), so it runs LAST in the composer. The rules are found by hue
// (HSV masks) and are passed as two vec4 arrays (hue/width/min sat/enabled and
// mode/target hue/sat/value).
export const DarkFantasyShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uDarkness: { value: 0.7 },
    uWarmBoost: { value: 1.8 },
    uColdBoost: { value: 1.5 },
    uSaturation: { value: 1.3 },
    uPalette: { value: 0.9 },
    uVignette: { value: 0.6 },
    uRuleA: {
      value: Array.from({ length: 4 }, () => new THREE.Vector4()),
    },
    uRuleB: {
      value: Array.from({ length: 4 }, () => new THREE.Vector4()),
    },
    uOthersMode: { value: 1 },
    uOthersFade: { value: 0.5 },
    uMaskMode: { value: 0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uDarkness;
    uniform float uWarmBoost;
    uniform float uColdBoost;
    uniform float uSaturation;
    uniform float uPalette;
    uniform float uVignette;
    // x: source hue (0-1), y: half-width (0-1), z: min saturation, w: enabled
    uniform vec4 uRuleA[4];
    // x: mode (0 keep, 1 shift, 2 fade), y: target hue (0-1), z: sat scale, w: value scale
    uniform vec4 uRuleB[4];
    uniform float uOthersMode;
    uniform float uOthersFade;
    uniform float uMaskMode;
    varying vec2 vUv;

    float lumOf(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    float hueDistance(float a, float b) {
      float d = abs(a - b);
      return min(d, 1.0 - d);
    }

    float hueDelta(float from, float to) {
      float d = to - from;
      if (d > 0.5) d -= 1.0;
      if (d < -0.5) d += 1.0;
      return d;
    }

    void main() {
      vec3 src = texture2D(tDiffuse, vUv).rgb;
      vec3 hsv = rgb2hsv(src);
      float lum = lumOf(src);
      float brightness = max(max(src.r, src.g), src.b);

      // The best matching rule (soft hue edge, minimum saturation).
      float bestMatch = 0.0;
      float protect = 0.0;
      int bestRule = -1;
      vec4 bestB = vec4(0.0);
      for (int i = 0; i < 4; i++) {
        vec4 a = uRuleA[i];
        vec4 b = uRuleB[i];
        if (a.w < 0.5) continue;
        float soft = max(0.012, a.y * 0.5);
        float hueMatch = 1.0 - smoothstep(a.y, a.y + soft, hueDistance(hsv.x, a.x));
        float satGate = smoothstep(a.z, min(a.z + 0.2, 1.0), hsv.y);
        float m = hueMatch * satGate;
        if (m > bestMatch) {
          bestMatch = m;
          bestRule = i;
          bestB = b;
        }
        // keep and shift rules keep their detail in the shadow crush
        if (b.x < 1.5) protect = max(protect, m);
      }

      if (uMaskMode > 0.5) {
        if (bestRule < 0 || bestMatch < 0.01) {
          gl_FragColor = vec4(vec3(0.4), 1.0);
        } else if (bestRule == 0) {
          gl_FragColor = vec4(1.0, 0.1, 0.1, 1.0);
        } else if (bestRule == 1) {
          gl_FragColor = vec4(0.15, 0.35, 1.0, 1.0);
        } else if (bestRule == 2) {
          gl_FragColor = vec4(0.1, 1.0, 0.2, 1.0);
        } else {
          gl_FragColor = vec4(1.0, 0.9, 0.1, 1.0);
        }
        return;
      }

      // The neutral blue-grey the unmatched colours fade towards.
      vec3 neutral = vec3(lum) * vec3(0.32, 0.42, 0.60);
      vec3 color = src;
      float key = bestMatch;
      if (bestRule >= 0) {
        float pull = bestMatch * uPalette;
        if (bestB.x > 0.5 && bestB.x < 1.5) {
          float targetHue = bestB.y;
          float hue = hsv.x + hueDelta(hsv.x, targetHue) * pull;
          float sat = mix(hsv.y, clamp(hsv.y * bestB.z, 0.0, 1.0), pull);
          float val = mix(hsv.z, clamp(hsv.z * bestB.w, 0.0, 1.0), pull);
          color = hsv2rgb(vec3(hue, sat, val));
          // the fire / deep-blue strengths follow the target hue
          float boost = 1.0;
          if (targetHue < 0.17 || targetHue > 0.92) boost = uWarmBoost;
          else if (targetHue > 0.53 && targetHue < 0.72) boost = uColdBoost;
          color *= mix(1.0, boost, pull);
        } else if (bestB.x > 1.5) {
          color = mix(src, neutral, pull);
          key = 0.0;
        }
      } else {
        float fade = uOthersMode > 0.5 ? uOthersFade * uPalette : 0.0;
        color = mix(src, neutral, fade);
      }

      // selective saturation on the key colours
      float gray = lumOf(color);
      color = mix(vec3(gray), color, mix(1.0, uSaturation, key));

      // Shadow crush: a perceptual value (luminance with a value floor) so
      // dark blues are not crushed just because blue has little luminance.
      float perceptual = max(lum, 0.6 * brightness);
      float threshold = mix(0.02, 0.38, uDarkness);
      float visibility = smoothstep(threshold * 0.25, threshold + 0.18, perceptual);
      // the warm, cold and protected colours keep their detail
      float protectRamp = smoothstep(0.02, 0.22, perceptual);
      visibility = mix(visibility, 1.0, protect * protectRamp * 0.9);
      color *= visibility;

      // contrast
      color = pow(max(color, vec3(0.0)), vec3(1.12));

      // vignette
      vec2 p = vUv * 2.0 - 1.0;
      float vig = clamp(1.0 - dot(p, p) * 0.32 * uVignette, 0.0, 1.0);
      color *= vig;

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

const RULE_MODE: Record<PostRuleMode, number> = { keep: 0, shift: 1, fade: 2 };

// Writes the current settings into the pass's uniforms. The composer's
// ShaderPass clones the uniforms, so these are the live copies.
export function updateDarkFantasyUniforms(uniforms: Record<string, THREE.IUniform>, s: PostProcessSettings) {
  uniforms.uDarkness.value = s.postDarkness;
  uniforms.uWarmBoost.value = s.postWarm;
  uniforms.uColdBoost.value = s.postCold;
  uniforms.uSaturation.value = s.postSaturation;
  uniforms.uPalette.value = s.postPalette;
  uniforms.uVignette.value = s.postVignette;
  const ruleA = uniforms.uRuleA.value as THREE.Vector4[];
  const ruleB = uniforms.uRuleB.value as THREE.Vector4[];
  for (let i = 0; i < ruleA.length; i++) {
    const rule = s.postRules[i];
    if (!rule) {
      ruleA[i].set(0, 0.05, 0.5, 0);
      ruleB[i].set(0, 0, 1, 1);
      continue;
    }
    const hue = ((((rule.hue % 360) + 360) % 360) / 360);
    const width = Math.max(0, Math.min(180, rule.width)) / 360;
    ruleA[i].set(hue, width, Math.max(0, Math.min(1, rule.minSat)), rule.on ? 1 : 0);
    ruleB[i].set(RULE_MODE[rule.mode], hueOfHex(rule.target) / 360, rule.sat, rule.val);
  }
  uniforms.uOthersMode.value = s.postOthers.mode === "fade" ? 1 : 0;
  uniforms.uOthersFade.value = s.postOthers.fade;
  uniforms.uMaskMode.value = s.postMask === "rules" ? 1 : 0;
}
