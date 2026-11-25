// The game's one sound system: the map's sound emitters, played by the Howler engine. The viewport feeds it the scene
// and the listener (GameViewport.tsx); the editor's "listen" button sets the preview (App.tsx).
import { engine } from "./engine";
import { createSoundSystem } from "./soundSystem";

export const gameSound = createSoundSystem(engine);
