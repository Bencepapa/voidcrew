import { findSearchTarget, type SearchTarget, type SearchTargetKind } from "./targets";

export type OpenForTarget = (id: string, target: SearchTarget) => void | Promise<void>;

const openers = new Map<SearchTargetKind, OpenForTarget>();

export function registerOpener(kind: SearchTargetKind, openForTarget: OpenForTarget): () => void {
  openers.set(kind, openForTarget);
  return () => { if (openers.get(kind) === openForTarget) openers.delete(kind); };
}

export const hasOpener = (kind: SearchTargetKind) => openers.has(kind);

let navigation = 0;
let highlight: Animation | undefined;

export async function navigate(result: string | SearchTarget): Promise<boolean> {
  const target = typeof result === "string" ? findSearchTarget(result) : result;
  const open = target && openers.get(target.kind);
  if (!target || !open || typeof document === "undefined") return false;

  const request = ++navigation;
  await open(target.id, target);

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
    if (control.hasAttribute("data-search-pick")) control.click();
    control.scrollIntoView({ block: "center", inline: "nearest", behavior: reduceMotion ? "instant" : "smooth" });
    const focus = control.matches(":disabled, [aria-disabled=true]") || control.closest("fieldset[disabled]")
      ? control.closest<HTMLElement>("[tabindex='-1']") ?? control : control;
    focus.focus({ preventScroll: true });
    highlight?.cancel();
    highlight = control.animate(
      [{ outline: "3px solid #fbbf24", outlineOffset: "2px" }, { outline: "3px solid transparent", outlineOffset: "2px" }],
      { duration: 1400, easing: reduceMotion ? "steps(1, end)" : "ease-in" },
    );
    return true;
  }
  return false;
}
