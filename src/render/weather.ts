import * as THREE from "three";
import type { Weather } from "../game/types";

export interface WeatherColumn { floor: number; ceiling: number; open: boolean; valid: boolean }
const SIZE = 32;
export function createWeatherUniforms() {
  const texture = new THREE.DataTexture(new Float32Array(SIZE * SIZE * 4), SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return {
    uWeatherColumns: { value: texture }, uWeatherOrigin: { value: new THREE.Vector2() },
    uWeatherWet: { value: 0 }, uWeatherSnow: { value: 0 },
  };
}
export type WeatherUniforms = ReturnType<typeof createWeatherUniforms>;
const columnsGLSL = `
uniform sampler2D uWeatherColumns;
uniform vec2 uWeatherOrigin;
vec4 weatherColumn(vec2 p) {
  vec2 cell = floor(p + 0.5) - uWeatherOrigin;
  if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, vec2(32.0)))) return vec4(0.0);
  return texture2D(uWeatherColumns, (cell + 0.5) / 32.0);
}`;

// Chained with the scene's other material patches; values are shared per viewport.
export function useWeatherSurface(material: THREE.Material, uniforms: WeatherUniforms) {
  if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial || material.userData.weatherSurface) return;
  material.userData.weatherSurface = true;
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|weather-surface-v1";
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWeatherWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 weatherWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
weatherWorld = instanceMatrix * weatherWorld;
#endif
vWeatherWorld = (modelMatrix * weatherWorld).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
${columnsGLSL}
varying vec3 vWeatherWorld;
uniform float uWeatherWet;
uniform float uWeatherSnow;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uWeatherWet > 0.0 || uWeatherSnow > 0.0) {
vec3 weatherNormal = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
vec4 weatherC = weatherColumn((vWeatherWorld + weatherNormal * 0.08).xz);
float weatherExposed = weatherC.b * weatherC.a * step(weatherC.r - 0.08, vWeatherWorld.y);
float weatherWet = uWeatherWet * weatherExposed;
float weatherNoise = fract(sin(dot(floor(vWeatherWorld.xz * 24.0), vec2(12.9898,78.233))) * 43758.5453);
float weatherSnow = smoothstep(weatherNoise * 0.35, 0.36 + weatherNoise * 0.35, uWeatherSnow) * smoothstep(0.65, 0.95, weatherNormal.y) * weatherExposed;
diffuseColor.rgb *= 1.0 - 0.18 * weatherWet;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.91, 0.96), weatherSnow);
roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.15), weatherWet);
roughnessFactor = mix(roughnessFactor, 0.85, weatherSnow);
metalnessFactor = mix(metalnessFactor, max(metalnessFactor, 0.18), weatherWet);
}`);
  };
}

export function createWeather(quality = 1, surface = createWeatherUniforms()) {
  const capacity = Math.round(12000 * Math.max(0, Math.min(2, quality)));
  const geometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geometry.index = quad.index;
  geometry.attributes.position = quad.attributes.position;
  geometry.attributes.uv = quad.attributes.uv;
  const seeds = new Float32Array(capacity * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  geometry.setAttribute('weatherSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = 0;
  const uniforms = { ...surface, ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    uTime: { value: 0 }, uCamera: { value: new THREE.Vector3() },
    uWind: { value: new THREE.Vector2() }, uRain: { value: 1 }, uIndoors: { value: 0 } };
  const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: `
#include <common>
#include <fog_pars_vertex>
${columnsGLSL}
attribute vec4 weatherSeed;
uniform float uTime;
uniform vec3 uCamera;
uniform vec2 uWind;
uniform float uRain;
uniform float uIndoors;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 velocity = vec3(uWind.x, -mix(0.38, 5.0, uRain), uWind.y);
  vec3 p = weatherSeed.xyz * vec3(16.0, 8.0, 16.0) + velocity * uTime;
  p.xz += (1.0-uRain) * vec2(sin(uTime*0.7 + weatherSeed.w*60.0), cos(uTime*0.5 + weatherSeed.w*40.0)) * 0.22;
  p = uCamera + mod(p - uCamera + vec3(8.0, 3.0, 8.0), vec3(16.0, 8.0, 16.0)) - vec3(8.0, 3.0, 8.0);
  vec4 c = weatherColumn(p.xz);
  float visible = c.a * max(c.b, uIndoors) * step(c.r + 0.03, p.y) * step(p.y, c.g);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  vec2 fall = (viewMatrix * vec4(velocity, 0.0)).xy;
  vec2 axis = length(fall) > 0.001 ? normalize(fall) : vec2(0.0, -1.0);
  vec2 across = vec2(-axis.y, axis.x);
  mvPosition.xy += visible * (across * position.x * mix(0.05, 0.014, uRain) + axis * position.y * mix(0.05, 0.32, uRain));
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `
#include <common>
#include <fog_pars_fragment>
varying vec2 vUv;
uniform float uRain;
void main() {
  float alpha = (1.0 - smoothstep(0.12, 0.5, length(vUv - 0.5))) * mix(0.85, 0.6, uRain);
  gl_FragColor = vec4(mix(vec3(0.93,0.96,1.0), vec3(0.65,0.79,0.94), uRain), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}` });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  let lastX = NaN, lastZ = NaN;
  let lastMap: unknown;
  return { mesh,
    update(_dt: number, time: number, camera: THREE.Camera, weather: Weather | undefined, column: (x:number,z:number)=>WeatherColumn, mapVersion?: unknown) {
      const intensity = Math.max(0, Math.min(2, weather?.intensity ?? 1));
      geometry.instanceCount = weather ? Math.round(capacity * (intensity / 2) ** 2) : 0;
      surface.uWeatherWet.value = weather?.type === 'rain' ? Math.max(0, Math.min(1, weather.wetness ?? 0.6)) : 0;
      surface.uWeatherSnow.value = weather?.type === 'snow' ? Math.max(0, Math.min(1, weather.snowCover ?? 0.6)) : 0;
      uniforms.uTime.value = time;
      uniforms.uCamera.value.copy(camera.position);
      uniforms.uWind.value.set(weather?.wind?.[0] ?? 0, weather?.wind?.[1] ?? 0);
      uniforms.uRain.value = weather?.type === 'rain' ? 1 : 0;
      uniforms.uIndoors.value = weather?.indoors ? 1 : 0;
      if (!weather) return;
      const x = Math.round(camera.position.x), z = Math.round(camera.position.z);
      if (x === lastX && z === lastZ && lastMap === mapVersion) return;
      lastX = x; lastZ = z; lastMap = mapVersion;
      surface.uWeatherOrigin.value.set(x - SIZE / 2, z - SIZE / 2);
      const data = surface.uWeatherColumns.value.image.data as Float32Array;
      for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
        const c = column(x - SIZE / 2 + i, z - SIZE / 2 + j);
        const n = (j * SIZE + i) * 4;
        data[n] = c.floor; data[n+1] = Number.isFinite(c.ceiling) ? c.ceiling : 100000;
        data[n+2] = c.open ? 1 : 0; data[n+3] = c.valid ? 1 : 0;
      }
      surface.uWeatherColumns.value.needsUpdate = true;
    },
    dispose() { geometry.dispose(); quad.dispose(); material.dispose(); },
  };
}
