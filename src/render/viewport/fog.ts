import * as THREE from "three";

const FOG_NEAR = 1.6;
// (the fog ends this far short of the view distance)

const FOG_FAR_MARGIN = 0.5;
// The fog thickens over at most this many cells before its end: up to the
// usual 7-cell view it starts at FOG_NEAR as ever, but a farther view moves
// its start out with it - else a longer view only added more black, a lit
// hall 8 cells off fogged as dark as one past the view (the fog, not the
// lights' reach, was what hid it).
const FOG_SPAN = 5;
function fogNear(far: number): number {
  return Math.max(FOG_NEAR, far - FOG_SPAN);
}
// The fog's span for a view reach: automatic (0) ends just inside the view and starts FOG_SPAN cells before that; a map can
// set where it starts and where it is fully thick (the end never beyond what is drawn, the start before the end).
export function fogRange(viewReach: number, start: number, end: number): { near: number; far: number } {
  const autoFar = viewReach - FOG_FAR_MARGIN;
  const far = end > 0 ? Math.max(0.5, Math.min(end, autoFar)) : autoFar;
  const near = start > 0 ? Math.max(0, Math.min(start, far - 0.1)) : fogNear(far);
  return { near, far };
}
// A dark fog is the dark, not a haze: what a lamp lights stands out of it
// as far as it's drawn. So a lit pixel (by its brightness) isn't fogged
// over the fog's whole span, only over its last LIT_FOG_SPAN cells - the
// lights fade out over about as much (LIGHT_FADE_SPAN) - and an unlit one
// as before. Without it a shorter view (High's 9 cells against Ultra's 14)
// left a torch-lit hall 7 cells off nearly black, though drawn and lit:
// the fog starts FOG_SPAN short of the view's end. A light fog (mist) is
// left alone: it hides lit things too. (Every material's fog; a few
// instructions a pixel.)
const LIT_FOG_SPAN = 1.5;
// (once: a hot reload runs this module again)
if (!THREE.ShaderChunk.fog_fragment.includes("fogLit")) THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
  "gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );",
  `#ifndef FOG_EXP2
	{
		const vec3 fogLuma = vec3( 0.3, 0.59, 0.11 );
		float fogLit = smoothstep( 0.12, 0.4, dot( gl_FragColor.rgb, fogLuma ) ) * ( 1.0 - smoothstep( 0.03, 0.2, dot( fogColor, fogLuma ) ) );
		fogFactor = mix( fogFactor, smoothstep( fogFar - ${LIT_FOG_SPAN.toFixed(2)}, fogFar, vFogDepth ), fogLit );
	}
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );`,
);
