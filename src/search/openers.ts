import { findSearchTarget, type SearchTargetKind } from "./targets";

export type OpenForTarget = (id: string) => void | Promise<void>;

const openers = new Map<SearchTargetKind, OpenForTarget>();

export function registerOpener(kind: SearchTargetKind, openForTarget: OpenForTarget): () => void {
  openers.set(kind, openForTarget);
  return () => { if (openers.get(kind) === openForTarget) openers.delete(kind); };
}

export const hasOpener = (kind: SearchTargetKind) => openers.has(kind);

let navigation = 0;
let highlight: Animation | undefined;

export async function navigate(id: string): Promise<boolean> {
  const target = findSearchTarget(id);
  const open = target && openers.get(target.kind);
  if (!target || !open || typeof document === "undefined") return false;

  const request = ++navigation;
  await open(target.id);

  // The opener can mount its panel on the next React commit.
  for (let frame = 0; frame < 12; frame++) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (request !== navigation) return false;
    const control = document.querySelector<HTMLElement>(`[data-search-target="${CSS.escape(target.id)}"]`);
    if (!control) continue;
    for (let parent = control.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    if (!control.getClientRects().length) continue;

    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    control.scrollIntoView({ block: "center", inline: "nearest", behavior: reduceMotion ? "instant" : "smooth" });
    control.focus({ preventScroll: true });
    highlight?.cancel();
    highlight = control.animate(
      [{ outline: "3px solid #fbbf24", outlineOffset: "2px" }, { outline: "3px solid transparent", outlineOffset: "2px" }],
      { duration: 1400, easing: reduceMotion ? "steps(1, end)" : "ease-in" },
    );
    return true;
  }
  return false;
}
