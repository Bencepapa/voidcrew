import { useCallback, useRef, type MutableRefObject } from "react";
import { t } from "../i18n";
import { countOf, removeItem } from "./inventory";
import { changeInventory, getInventory } from "./inventoryStore";
import { PROP_TYPES } from "./props";
import { lockStep, propUnlockedFlag } from "./propLocks";
import type { GameMap, PropSpec } from "./types";

// The runtime of the locks on props (see propLocks.ts): a locked chest that is Used or clicked, a locked lever or button
// that is touched. `gate` says whether the prop may be worked now - if not, the party has been told why; if the party holds
// the key, the lock is opened first ("You unlock the crate.", the key used up if the lock says so) and it may. Nothing is
// locked while the map is being edited (`active` false).

export interface LockEnv {
  active: boolean;
  // the map as played (its props' indices are the view's), and the deck's full map (the indices the run's flags use)
  mapRef: MutableRefObject<GameMap>;
  fullMapRef: MutableRefObject<GameMap>;
  hasFlag: (flag: string) => boolean;
  raiseFlag: (flag: string, on: boolean) => void;
  pushLog: (text: string, kind?: "warn" | "success" | "danger" | "damage") => void;
}

const nameOf = (spec: PropSpec) => (PROP_TYPES[spec.prop]?.name ?? spec.prop).toLowerCase();

export function useLocks(env: LockEnv) {
  const envRef = useRef(env);
  envRef.current = env;

  // true: it may be opened / pulled now
  const gate = useCallback((spec: PropSpec | undefined): boolean => {
    const e = envRef.current;
    if (!spec?.lock || !e.active) return true;
    const full = e.fullMapRef.current;
    const index = (full.props ?? []).indexOf(spec);
    if (index < 0) return true;
    const flag = propUnlockedFlag(full.id, index);
    const step = lockStep(spec.lock, {
      unlocked: e.hasFlag(flag),
      hasFlag: e.hasFlag,
      countItem: (item) => countOf(getInventory(), item),
      map: full,
      fallback: t("lock.locked"),
    });
    if (step.kind === "open") return true;
    if (step.kind === "locked") {
      e.pushLog(step.message, "warn");
      return false;
    }
    e.raiseFlag(flag, true);
    e.pushLog(t("lock.unlocked", { what: nameOf(spec) }), "success");
    const consume = step.consume;
    if (consume) {
      if (consume.item) {
        changeInventory((inv) => removeItem(inv, consume.item!, 1).inv);
        if (countOf(getInventory(), consume.item) === 0) e.raiseFlag(consume.flag, false);
      } else e.raiseFlag(consume.flag, false);
      e.pushLog(t("lock.keyUsedUp"));
    }
    return true;
  }, []);

  // a lever or button touched (`index`: its prop's in the played map); a decal has no lock
  const gateOperable = useCallback(
    (from: "prop" | "decal", index: number): boolean => (from === "prop" ? gate(envRef.current.mapRef.current.props?.[index]) : true),
    [gate],
  );

  return { gate, gateOperable };
}
