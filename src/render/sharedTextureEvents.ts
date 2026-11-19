// Told when the files of a shared texture in TEXTURE_SETS change (see src/editor/textureLibrary.ts), so the game's
// scene, which reads the table once when it is built, can rebuild - but only when the map on screen uses one of them.
const listeners = new Set<(ids: readonly string[]) => void>();
export function onSharedTexturesChanged(listener: (ids: readonly string[]) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
export function sharedTexturesChanged(ids: readonly string[]) {
  for (const listener of listeners) listener(ids);
}
