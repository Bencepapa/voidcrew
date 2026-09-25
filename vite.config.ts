import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Files in public/ aren't part of Vite's module graph, so saving a texture
// normally does nothing until a manual reload. This notifies the running game
// instead (see TEXTURE_CHANGED_EVENT in GameViewport.tsx), which rebuilds the
// walls in place without losing the player's position.
function textureHotReload(): Plugin {
  return {
    name: "voidcrew-texture-hot-reload",
    apply: "serve",
    configureServer(server) {
      const texturesDir = path.resolve(server.config.publicDir, "textures");
      const timers = new Map<string, ReturnType<typeof setTimeout>>();

      const onFile = (file: string) => {
        const resolved = path.resolve(file);        if (!resolved.startsWith(texturesDir + path.sep)) return;
        // image editors often write a file in several steps (truncate, write,
        // rename) - coalesce those into one reload
        clearTimeout(timers.get(resolved));
        timers.set(
          resolved,
          setTimeout(() => {
            timers.delete(resolved);
            const rel = path.relative(server.config.publicDir, resolved).split(path.sep).join("/");
            server.ws.send({ type: "custom", event: "voidcrew:texture-changed", data: { file: rel } });
          }, 150),
        );
      };

      server.watcher.on("add", onFile);
      server.watcher.on("change", onFile);

      // On Windows, watching a file that another program still has locked
      // (a browser download in progress, an image editor mid-save) fails
      // with EBUSY. Unhandled, that watcher error kills the whole dev server.
      server.watcher.on("error", (err) => {
        server.config.logger.warn(`File watcher: ${err instanceof Error ? err.message : String(err)}`);
      });
    },
  };
}

export default defineConfig({
  base: "/voidcrew/",
  plugins: [react(), tailwindcss(), textureHotReload()],
  server: {
    port: 3000,
    watch: {
      // source images and offline scripts aren't part of the app; watching
      // them only triggers pointless page reloads
      ignored: ["**/concept/**", "**/scripts/**"],
    },
  },
});
