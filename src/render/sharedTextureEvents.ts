// Told when the files of a shared texture in TEXTURE_SETS change (see src/editor/textureLibrary.ts), so the game's
// scene, which reads the table once when it is built, can rebuild.
const listeners = new Set<() => void>();
export function onSharedTexturesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
export function sharedTexturesChanged() {
  for (const listener of listeners) listener();
}
