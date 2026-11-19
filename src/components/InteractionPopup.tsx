import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Interaction } from "../game/interactions";
import { t } from "../i18n";
import { useSharedImages } from "../render/sharedImages";

const alignment = { top: "items-start", center: "items-center", bottom: "items-end" };

export function InteractionPopup({ event, close, partyDock }: {
  event: Interaction;
  close: () => void;
  partyDock: HTMLElement | null;
}) {
  const images = useSharedImages();
  const image = event.kind === "image" && images.find(entry => entry.id === event.image);
  const modal = event.kind === "message" && event.modal;
  const position = event.kind === "message" ? event.position : "center";
  const button = useRef<HTMLButtonElement>(null);
  const [bottomInset, setBottomInset] = useState(0);
  useLayoutEffect(() => {
    if (position !== "bottom" || !partyDock) {
      setBottomInset(0);
      return;
    }
    const update = () => setBottomInset(Math.max(0, window.innerHeight - partyDock.getBoundingClientRect().top));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(partyDock);
    if (partyDock.parentElement) observer.observe(partyDock.parentElement);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [partyDock, position]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    button.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [modal]);

  return <div className={`fixed inset-0 z-[80] flex justify-center p-4 ${alignment[position]} ${modal ? "bg-black/40" : "pointer-events-none"}`}
    style={position === "bottom" && bottomInset > 0 ? { paddingBottom: `calc(1rem + ${bottomInset}px)` } : undefined}
    onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
    <section role="dialog" aria-modal={modal || undefined} aria-label={t(`events.${event.kind}`)}
      className="pointer-events-auto flex max-h-full w-full max-w-lg flex-col overflow-auto rounded border border-neutral-500 bg-neutral-950 shadow-xl">
      {image && <img src={image.url} alt={image.name} className="max-h-[55dvh] w-full shrink-0 object-contain"/>}
      <div className="p-4">
        <p className="whitespace-pre-wrap break-words text-neutral-100">{event.text}</p>
        <button ref={button} type="button" className="mt-3 rounded border border-neutral-500 px-3 py-1 text-neutral-100 hover:bg-neutral-800" onClick={close}>
          {t("events.close")}
        </button>
      </div>
    </section>
  </div>;
}
