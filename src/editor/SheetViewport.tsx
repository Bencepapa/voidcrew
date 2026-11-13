import { useEffect, useRef, type ReactNode } from "react";

// CSS fits the canvas in both axes. Zoom changes only its on-screen transform,
// so the drawing and editing tools keep their original pixel coordinates.
export function SheetViewport({children, height}: {children: ReactNode; height: string}) {
  const frame = useRef<HTMLDivElement>(null);
  const reset = useRef<() => void>(() => {});
  useEffect(() => {
    const host = frame.current!;
    const canvas = host.querySelector("canvas")!;
    let scale = 1, x = 0, y = 0;
    const fit = () => {
      scale = 1; x = 0; y = 0;
      canvas.style.transform = "";
    };
    reset.current = fit;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const bounds = host.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      const next = Math.min(16, Math.max(1, scale * Math.exp(-delta * .002)));
      const ratio = next / scale;
      const px = event.clientX - bounds.left - bounds.width / 2;
      const py = event.clientY - bounds.top - bounds.height / 2;
      const image = canvas.getBoundingClientRect();
      const limitX = Math.max(0, (image.width * ratio - bounds.width) / 2);
      const limitY = Math.max(0, (image.height * ratio - bounds.height) / 2);
      x = Math.max(-limitX, Math.min(limitX, px + (x - px) * ratio));
      y = Math.max(-limitY, Math.min(limitY, py + (y - py) * ratio));
      scale = next;
      canvas.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    host.addEventListener("wheel",wheel,{passive:false});
    return () => {observer.disconnect();host.removeEventListener("wheel",wheel);};
  }, []);
  return <div className="min-w-0">
    <div ref={frame} style={{height}} className="grid place-items-center overflow-hidden bg-neutral-900 [&>canvas]:max-h-full [&>canvas]:max-w-full [&>canvas]:min-h-0 [&>canvas]:min-w-0" >{children}</div>
    <div className="flex items-center gap-2 text-neutral-400"><button type="button" className="rounded border border-neutral-600 px-2" onClick={()=>reset.current()}>Fit</button>Wheel to zoom</div>
  </div>;
}
