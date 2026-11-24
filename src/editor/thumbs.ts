// Small palette thumbnails of the shared store's images, made once on this side.
//
// The palettes show 48 px pictures, but an NPC sheet or a texture diffuse is 0.2-3 MB. A published revision
// never changes, so a thumbnail made from it (96 px wide, WebP) is kept in IndexedDB under the revision's own
// URL (see derivedCache.ts) and the full file is downloaded at most once per browser, only for a picture that
// is actually scrolled into view. Files that are not in the store (bundled, local, blob) are shown as they are.
//
// (Publishing does not upload a thumb.webp: the client-side path works for every existing revision, needs no
// SQL/mime change and no meta flag. An old revision and a new one are treated alike.)

import { thumbKey, thumbSize, thumbSource, isStoreUrl, type ThumbCrop } from "./derivedCache";
import { idb } from "./idb";
import { sharedProject } from "./sharedAuth";

const ready = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
// a few at a time: a long palette must not open a hundred downloads at once
const MAX_PARALLEL = 4;
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>(resolve => waiting.push(resolve));
  active++;
  try { return await work(); } finally { active--; waiting.shift()?.(); }
}

async function render(url: string, crop?: ThumbCrop): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const from = thumbSource(bitmap.width, bitmap.height, crop);
    const size = thumbSize(from.width, from.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, from.x, from.y, from.width, from.height, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("no thumbnail")), "image/webp", 0.85));
  } finally {
    bitmap.close();
  }
}

export const isThumbable = (url: string) => isStoreUrl(url, sharedProject);

/** The thumbnail's object URL if it is made already (synchronous: a palette redraw shows it at once). */
export const readyThumb = (url: string, crop?: ThumbCrop) => ready.get(thumbKey(url, crop));

/** Makes (or reads from IndexedDB) the thumbnail of a store image; rejects when it cannot (the caller shows the full file). */
export function loadThumb(url: string, crop?: ThumbCrop): Promise<string> {
  const key = thumbKey(url, crop);
  const done = ready.get(key);
  if (done) return Promise.resolve(done);
  let running = pending.get(key);
  if (!running) {
    running = (async () => {
      let blob = await idb.get<Blob>("auto", key).catch(() => undefined);
      if (!(blob instanceof Blob)) {
        blob = await slot(() => render(url, crop));
        void idb.put("auto", blob, key).catch(() => {});
      }
      const objectUrl = URL.createObjectURL(blob);
      ready.set(key, objectUrl);
      return objectUrl;
    })().finally(() => pending.delete(key));
    pending.set(key, running);
  }
  return running;
}
