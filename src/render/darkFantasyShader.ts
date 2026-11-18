import * as THREE from "three";

// An optional "dark fantasy" post-process (an experiment, see
// concept/editor-ui/NOTES-dark-fantasy-post.md): shadows crushed to black with
// a little cold blue kept, blues and violets pulled to a deep blue, reds /
// oranges / yellows to one glowing fire colour, the rest desaturated, warm
// light spots kept bright, then contrast and a vignette.
// Its input is the display-referred image (after tone mapping and the sRGB
// output pass), so it runs LAST in the composer. The colour families are found
// by hue (HSV masks).
export const DarkFantasyShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uDarkness: { value: 0.7 },
    uWarmBoost: { value: 1.8 },
    uColdBoost: { value: 1.5 },
    uSaturation: { value: 1.3 },
    uPalette: { value: 0.9 },
    uVignette: { value: 0.6 },
    uWarmHue: { value: new THREE.Color("#ff6414") },
    uColdHue: { value: new THREE.Color("#06315c") },
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
    uniform vec3 uWarmHue;
    uniform vec3 uColdHue;
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

    float hueDistance(float a, float b) {
      float d = abs(a - b);
      return min(d, 1.0 - d);
    }

    void main() {
      vec3 src = texture2D(tDiffuse, vUv).rgb;
      vec3 hsv = rgb2hsv(src);
      float lum = lumOf(src);
      float sat = hsv.y;

      // warm family: red, orange, yellow
      float warmHue = 1.0 - smoothstep(0.08, 0.20, hueDistance(hsv.x, 0.075));
      // cold family: blue, violet
      float coldHue = 1.0 - smoothstep(0.08, 0.19, hueDistance(hsv.x, 0.65));
      float colorConfidence = smoothstep(0.12, 0.45, sat);
      float warm = warmHue * colorConfidence;
      float cold = coldHue * colorConfidence;

      // protected: yellow-green / turquoise (important objects)
      float special = 1.0 - smoothstep(0.08, 0.16, hueDistance(hsv.x, 0.37));
      special *= colorConfidence;
      warm *= 1.0 - special;
      cold *= 1.0 - special;

      float brightness = max(hsv.z, 0.001);
      vec3 warmColor = uWarmHue * brightness * uWarmBoost;
      vec3 coldColor = uColdHue * brightness * uColdBoost * 2.0;
      vec3 neutral = vec3(lum) * vec3(0.32, 0.42, 0.60);

      float importance = max(max(warm, cold), special);
      vec3 color = mix(src, neutral, uPalette * (1.0 - importance));
      color = mix(color, warmColor, clamp(warm * uPalette, 0.0, 1.0));
      color = mix(color, coldColor, clamp(cold * uPalette, 0.0, 1.0));

      // selective saturation
      float gray = lumOf(color);
      color = mix(vec3(gray), color, mix(1.0, uSaturation, importance));

      // shadow crush, by the original luminance
      float threshold = mix(0.02, 0.38, uDarkness);
      float visibility = smoothstep(threshold * 0.25, threshold + 0.18, lum);
      // keep the warm light sources
      visibility = mix(visibility, 1.0, warm * smoothstep(0.12, 0.65, lum) * 0.8);
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
