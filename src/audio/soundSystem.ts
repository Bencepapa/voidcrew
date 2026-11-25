// The game's sound: which of the map's sound emitters sound now, and what each voice does as the listener walks about.
// It decides; a backend (engine.ts: Howler on Web Audio) plays - so the logic is tested with a stand-in backend (see
// soundSystem.test.ts). What costs a search (the walls in the way, the way round through a doorway) is worked out when
// the listener changes cells, a few times a second and when a door moves (`refresh`); what moves with every step (the
// distances, the voices' places) every frame.
import { pulseOn, resolveSound, waveKey, type SoundSpec, type ResolvedSound } from "../game/sounds";
import { stereoPan } from "./stereo";
import { MAX_SOURCES, planSources, voiceTargets, type Blocked, type Emitter, type Listener, type SourcePlan } from "./soundField";

// what the backend plays: a looping wave (see ResolvedSound)
export type WaveSpec = Pick<ResolvedSound, "kind" | "wave" | "pitch" | "noise">;

// One voice's state, for the backend to take on: where it seems to be (world, cells), its loudness before the pulse
// and the pulse's gate (0 or 1: the backend smooths the edges), and how the walls dull it.
export interface VoiceState {
  x: number;
  y: number;
  z: number;
  // the left / right balance, -1..1 (see stereo.ts): used unless the 3D (HRTF) panner is on, which works it out from x, y, z
  pan: number;
  level: number;
  gate: number;
  // seconds the gate takes to open / close (a pulse's attack and release)
  attack: number;
  release: number;
  cutoff: number;
  wallGain: number;
}

// how a voice is started: the doorway's voice fades in and out more slowly than the direct one
export interface StartOptions {
  portal?: boolean;
}

export interface SoundBackend<H = unknown> {
  // a new looping voice, silent until it is set; null if there is no sound to be had
  start(wave: WaveSpec, options?: StartOptions): H | null;
  set(voice: H, state: VoiceState): void;
  // fades out and ends the voice
  stop(voice: H): void;
  setListener(listener: Listener): void;
}

// What the map gives the system: its sounds, which cells stop sound, and where a cell's floor is.
export interface SoundScene {
  sounds: readonly SoundSpec[];
  blocked: Blocked;
  // a cell's floor, in wall heights
  floorHeight: (x: number, y: number) => number;
  // the world's height of a wall (world units); the sounds' heights are in wall heights
  wallHeight: number;
}

export interface SoundSystemOptions {
  // seconds (the pulses' clock)
  now?: () => number;
  max?: number;
  // how long the plans last without the listener changing cells (seconds)
  refreshEvery?: number;
}

export interface SoundSystem {
  setScene(scene: SoundScene | null): void;
  // the editor is open: nothing sounds but the preview
  setEditing(on: boolean): void;
  // a sound (its index) that sounds on its own while editing, whether it is on or not
  setPreview(index: number | null): void;
  // a door opened or shut, or anything else that changes what blocks sound
  invalidate(): void;
  frame(listener: Listener): void;
  // silence: every voice stopped
  stopAll(): void;
  stats(): { voices: number; sources: number };
}

interface Playing<H> {
  handle: H;
  wave: string;
}

export function createSoundSystem<H>(backend: SoundBackend<H>, options: SoundSystemOptions = {}): SoundSystem {
  const now = options.now ?? (() => performance.now() / 1000);
  const max = options.max ?? MAX_SOURCES;
  const refreshEvery = options.refreshEvery ?? 0.2;

  let scene: SoundScene | null = null;
  let editing = false;
  let preview: number | null = null;
  let dirty = true;
  let lastCell = "";
  let lastRefresh = -Infinity;
  let plans: SourcePlan[] = [];
  let all: Emitter[] = [];
  let byId = new Map<number, Emitter>();
  const voices = new Map<string, Playing<H>>();

  const stopVoice = (key: string) => {
    const voice = voices.get(key);
    if (!voice) return;
    backend.stop(voice.handle);
    voices.delete(key);
  };
  const stopAll = () => {
    for (const key of [...voices.keys()]) stopVoice(key);
    plans = [];
  };

  // the emitters that may sound now, in the world
  const emitters = (): Emitter[] => {
    if (!scene) return [];
    const { sounds, floorHeight, wallHeight } = scene;
    const out: Emitter[] = [];
    sounds.forEach((spec, id) => {
      if (editing && id !== preview) return;
      const sound = resolveSound(spec);
      // (the preview sounds whether the emitter is on or not)
      if (!sound.active && !(editing && id === preview)) return;
      out.push({
        id,
        sound,
        x: spec.x + sound.pos[0],
        y: (floorHeight(spec.x, spec.y) + sound.pos[1]) * wallHeight,
        z: spec.y + sound.pos[2],
      });
    });
    return out;
  };

  return {
    setScene(next) {
      scene = next;
      dirty = true;
      if (!next) stopAll();
    },
    setEditing(on) {
      if (on === editing) return;
      editing = on;
      dirty = true;
    },
    setPreview(index) {
      if (index === preview) return;
      preview = index;
      dirty = true;
    },
    invalidate() {
      dirty = true;
    },
    stopAll,
    stats: () => ({ voices: voices.size, sources: plans.length }),
    frame(listener) {
      backend.setListener(listener);
      if (!scene) return;
      const t = now();
      const cell = `${Math.round(listener.x)},${Math.round(listener.z)}`;
      if (dirty || cell !== lastCell || t - lastRefresh >= refreshEvery) {
        // (the emitters are made again only now: they change when the map's sounds, the editor's state or a door do)
        if (dirty) {
          all = emitters();
          byId = new Map(all.map((e) => [e.id, e]));
        }
        const playing = new Set(plans.map((p) => p.id));
        plans = planSources(listener, all, scene.blocked, max, playing);
        lastCell = cell;
        lastRefresh = t;
        dirty = false;
      }
      const wanted = new Set<string>();
      for (const plan of plans) {
        const emitter = byId.get(plan.id);
        // (an emitter edited away since the plan was made: its plan waits for the next refresh)
        if (!emitter) continue;
        const gate = pulseOn(emitter.sound.pulse, t) ? 1 : 0;
        for (const target of voiceTargets(listener, emitter, plan)) {
          const key = `${plan.id}:${target.role}`;
          wanted.add(key);
          const wave = waveKey(emitter.sound);
          let voice = voices.get(key);
          // (a changed pitch or wave: a new voice, the old one fades out)
          if (voice && voice.wave !== wave) {
            stopVoice(key);
            voice = undefined;
          }
          if (!voice) {
            const handle = backend.start(emitter.sound, { portal: target.role === "portal" });
            if (handle === null) continue;
            voice = { handle, wave };
            voices.set(key, voice);
          }
          backend.set(voice.handle, {
            x: target.x,
            y: target.y,
            z: target.z,
            pan: stereoPan(listener, target.x, target.z, { distance: target.distance, level: target.level, portal: target.role === "portal" }),
            level: target.level,
            gate,
            attack: emitter.sound.pulse?.attack ?? 0,
            release: emitter.sound.pulse?.release ?? 0,
            cutoff: target.cutoff,
            wallGain: target.wallGain,
          });
        }
      }
      for (const key of [...voices.keys()]) if (!wanted.has(key)) stopVoice(key);
    },
  };
}
