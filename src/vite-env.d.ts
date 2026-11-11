/// <reference types="vite/client" />

interface ImportMetaEnv {
  // a build made for one world: "scifi" or "fantasy" (see game/worlds.ts)
  readonly VITE_WORLD?: string;
}
