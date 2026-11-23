import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ACTOR_TYPES } from "../game/actors";
import type { Interaction } from "../game/interactions";
import { configureStoryUi, storyChoose, storyCurrentView, storySetShopOpen, useStoryRevision } from "../game/story/storyRuntime";
import { t } from "../i18n";
import { useSharedImages } from "../render/sharedImages";
import { ShopPanel } from "./ShopPanel";

type TalkEvent = Extract<Interaction, { kind: "dialogue" | "shop" }>;

// The talk with an NPC when the story engine runs it (storyRuntime.ts): the same window as DialoguePopup
// (portrait, text, choices as buttons: mouse, 1-9, Up/Down + Enter; Esc closes), driven by the engine's
// view (text, choices, ended) instead of a dialogue library. A story @shop opens the shop window over it.
export function StoryDialoguePopup({ event, close, partyDock }: {
  event: TalkEvent;
  close: () => void;
  partyDock: HTMLElement | null;
}) {
  const images = useSharedImages();
  useStoryRevision(); // (the view changes under us: the runtime's)
  const view = storyCurrentView();
  const [selected, setSelected] = useState(0);
  const [shopId, setShopId] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const [bottomInset, setBottomInset] = useState(0);

  const choices = view && !view.ended ? view.choices : [];
  const portrait = event.portrait ? images.find(image => image.id === event.portrait) : undefined;
  const npcName = event.npc ? ACTOR_TYPES[event.npc]?.name : undefined;

  // the story's @shop (its id, or the NPC's own - the runtime resolved it)
  useEffect(() => {
    configureStoryUi({ openShop: setShopId });
    return () => configureStoryUi({ openShop: undefined });
  }, []);
  // (no saving while the shop is open)
  useEffect(() => {
    storySetShopOpen(shopId !== null);
    return () => storySetShopOpen(false);
  }, [shopId]);

  const pick = (index: number) => {
    if (!view || view.ended || index < 0 || index >= choices.length) return;
    storyChoose(index);
    setSelected(0);
  };

  useLayoutEffect(() => {
    if (!partyDock) { setBottomInset(0); return; }
    const update = () => setBottomInset(Math.max(0, window.innerHeight - partyDock.getBoundingClientRect().top));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(partyDock);
    if (partyDock.parentElement) observer.observe(partyDock.parentElement);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [partyDock]);

  useEffect(() => {
    const previous = document.activeElement;
    root.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  const latest = useRef({ choices, selected, pick, close, shopOpen: shopId !== null });
  latest.current = { choices, selected, pick, close, shopOpen: shopId !== null };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const { choices, selected, pick, close, shopOpen } = latest.current;
      if (shopOpen) return;
      const swallow = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === "Escape") { swallow(); if (!e.repeat) close(); }
      else if (e.key === "Enter") {
        swallow();
        if (e.repeat) return;
        if (choices.length) pick(selected); else close();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        swallow();
        if (choices.length) setSelected(i => (i + (e.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length);
      } else if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        swallow();
        if (!e.repeat && Number(e.key) <= choices.length) pick(Number(e.key) - 1);
      } else if (e.key === "Tab") swallow();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  return <><div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4"
    style={bottomInset > 0 ? { paddingBottom: `calc(1rem + ${bottomInset}px)` } : undefined}
    onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
    <section ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("events.dialogue")}
      className="pointer-events-auto flex max-h-full w-full max-w-2xl gap-4 overflow-auto rounded border border-neutral-500 bg-neutral-950 p-4 shadow-xl outline-none">
      <div className="h-28 w-28 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-900">
        {portrait
          ? <img src={portrait.url} alt={portrait.name} className="h-full w-full object-cover"/>
          : <svg viewBox="0 0 100 100" className="h-full w-full text-neutral-700" role="img" aria-label={t("dialogue.popup.noPortrait")}>
            <circle cx="50" cy="36" r="17" fill="currentColor"/>
            <path d="M16 100c0-24 14-38 34-38s34 14 34 38z" fill="currentColor"/>
          </svg>}
      </div>
      <div className="min-w-0 flex-1">
        {npcName && <p className="mb-1 text-xs uppercase tracking-wide text-neutral-400">{npcName}</p>}
        {view?.text && <p className="whitespace-pre-wrap break-words text-neutral-100">{view.text}</p>}
        <div className="mt-3 flex flex-col items-stretch gap-1">
          {choices.map((choice, i) => <button key={i} type="button"
            className={`rounded border px-3 py-1 text-left text-neutral-100 ${i === selected ? "border-neutral-300 bg-neutral-800" : "border-neutral-600 hover:bg-neutral-800"}`}
            onMouseEnter={() => setSelected(i)} onClick={() => pick(i)}>
            <span className="mr-2 text-neutral-400">{i + 1}.</span>{choice.label}
          </button>)}
          {!choices.length && <button type="button" autoFocus
            className="self-start rounded border border-neutral-500 px-3 py-1 text-neutral-100 hover:bg-neutral-800" onClick={close}>
            {t("dialogue.popup.close")}
          </button>}
        </div>
      </div>
    </section>
  </div>
  {shopId !== null && <ShopPanel shopId={shopId} partyDock={partyDock} onClose={() => setShopId(null)}/>}
  </>;
}
