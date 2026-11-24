import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ActorType } from "../game/actors";
import { actorView } from "../game/actorSheets";
import { actorSheetFiles, actorThumbnail } from "../render/actorSheetFiles";
import type { ThumbCrop } from "./derivedCache";
import { isThumbable, loadThumb, readyThumb } from "./thumbs";

// A palette picture. A file of the shared store shows its small thumbnail (made once, kept in IndexedDB; the full
// file is fetched only when the picture scrolls into view and is not cached yet) - and the full file if that fails.
// Any other URL is a plain lazy <img>, as before.
export function Thumb({ src, crop, className, style }: { src: string; crop?: ThumbCrop; className?: string; style?: CSSProperties }) {
  const store = isThumbable(src);
  const ref = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | undefined>(() => store ? readyThumb(src, crop) : src);
  const cols = crop?.cols, rows = crop?.rows, col = crop?.col, row = crop?.row;
  useEffect(() => {
    if (!store || url) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "120px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [store, url]);
  useEffect(() => {
    if (!store) { setUrl(src); return; }
    const made = readyThumb(src, crop);
    if (made) { setUrl(made); return; }
    setUrl(undefined);
    if (!visible) return;
    let live = true;
    loadThumb(src, crop).then(found => { if (live) setUrl(found); }, () => { if (live) setUrl(src); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, src, cols, rows, col, row, visible]);
  return <img ref={ref} src={url} loading={store ? undefined : "lazy"} alt="" className={className} style={style} />;
}

// An NPC's first frame: a thumbnail of the sheet's cell when the sheet is in the store, else the sheet as a CSS
// background (a bundled sheet is a local file).
export function ActorThumb({ type, className }: { type: ActorType; className?: string }) {
  const sheet = actorSheetFiles(type).diffuse;
  if (!isThumbable(sheet)) return <span aria-hidden="true" className={className} style={actorThumbnail(type)} />;
  const { col, mirror } = actorView(type, 0);
  return <span aria-hidden="true" className={className}>
    <Thumb src={sheet} crop={{ cols: type.cols, rows: type.rows, col, row: type.idleRow }} className="h-full w-full object-contain"
      style={{ transform: mirror ? "scaleX(-1)" : undefined, imageRendering: "pixelated" }} />
  </span>;
}
