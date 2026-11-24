import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { t } from "../i18n";
import { gameClock } from "./clock";
import { floorHeight } from "./mapGeometry";
import {
  doorBlocked, evaluatePlates, initialOperableState, operate, restoreFromFlags, sourceKeys, tick,
  type OperableContext, type OperableEffect, type OperableState,
} from "./operables";
import { operableView } from "./operableStore";
import { trapsActive } from "./playMode";
import type { GameMap, Vec2 } from "./types";

// The runtime of the operable props (see operables.ts): a lever pulled or a button pressed, the party stepping on or off
// a plate or a trap cell, a momentary button springing back - the effects that follow are applied here: doors opened or
// shut (through the game's own door state), a wall trap's shot that may hurt the crew, the story flags.
//
// The state belongs to the deck as it is loaded (a lever stays flipped while the party is on the deck): it starts anew
// when the deck is entered, from the story flags of the sources that have one (restoreFromFlags). Nothing runs while the
// map is being edited (`active` false) - the editor shows every prop as the map has it.

export interface OperableEnv {
  active: boolean;
  mapRef: MutableRefObject<GameMap>;
  mapId: string;
  pos: Vec2;
  elevation: number;
  openDoorsRef: MutableRefObject<ReadonlySet<string>>;
  // a door opens (`animated`: the panel slides, with the log line and the story's "open" event) / shuts
  openDoor: (cell: Vec2, animated: boolean) => void;
  closeDoor: (cell: Vec2) => void;
  // whether a door is locked still, and the lock taken off (a lever that forces it)
  isLocked: (cell: Vec2) => boolean;
  unlock: (cell: Vec2) => void;
  // a crewmate hurt: `describe` makes the log line from the victim's name
  hurt: (damage: number, describe: (name: string) => string) => void;
  hasFlag: (flag: string) => boolean;
  raiseFlag: (flag: string, on: boolean) => void;
  pushLog: (text: string, kind?: "warn" | "success" | "danger" | "damage") => void;
}

export function useOperables(env: OperableEnv) {
  const envRef = useRef(env);
  envRef.current = env;
  const stateRef = useRef<OperableState>(initialOperableState());

  const context = useCallback((): OperableContext => {
    const e = envRef.current;
    const m = e.mapRef.current;
    // (on a bridge above the floor, the party is not on a plate)
    const grounded = Math.abs(floorHeight(m, e.pos.x, e.pos.y) - e.elevation) <= 0.25 + 1e-6;
    return {
      now: gameClock.now(),
      party: e.active && grounded ? e.pos : null,
      doorOpen: (cell) => e.openDoorsRef.current.has(`${cell.x},${cell.y}`),
    };
  }, []);

  const publish = useCallback((state: OperableState) => {
    stateRef.current = state;
    operableView.set({ mapId: envRef.current.mapRef.current.id, on: state.on });
  }, []);

  // What a step's effects do in the game. `silent`: a deck being loaded with its sources already on (no door sliding open).
  const apply = useCallback((effects: OperableEffect[], silent = false) => {
    const e = envRef.current;
    const party = e.active ? e.pos : null;
    for (const effect of effects) {
      switch (effect.type) {
        case "door": {
          const open = e.openDoorsRef.current.has(`${effect.cell.x},${effect.cell.y}`);
          if (effect.action === "open") {
            if (open) break;
            if (e.isLocked(effect.cell)) {
              if (!effect.force) {
                if (!silent) e.pushLog(t("operable.locked"), "warn");
                break;
              }
              e.unlock(effect.cell);
              if (!silent) e.pushLog(t("operable.override"));
            }
            e.openDoor(effect.cell, !silent);
          } else if (open) {
            if (doorBlocked(effect, party)) {
              e.pushLog(t("operable.doorBlocked"), "warn");
              break;
            }
            e.closeDoor(effect.cell);
            if (!silent) e.pushLog(t("operable.doorShuts"));
          }
          break;
        }
        case "shot": {
          // (wander mode: the traps are not armed - no shot, no damage, no log; see playMode.ts)
          if (!trapsActive()) break;
          const arrow = effect.projectile === "arrow";
          if (effect.hit) {
            e.hurt(effect.damage, (name) => t(arrow ? "operable.arrowHit" : "operable.spellHit", { name, damage: effect.damage }));
          } else if (party && Math.hypot(party.x - effect.from.x, party.y - effect.from.y) <= 8) {
            e.pushLog(t(arrow ? "operable.arrowMiss" : "operable.spellMiss"));
          }
          break;
        }
        case "changed": {
          if (silent) break;
          const key = `operable.${effect.kind}.${effect.on ? "on" : "off"}`;
          if (effect.kind !== "trapcell" && effect.kind !== "emitter") e.pushLog(t(key as "operable.lever.on"));
          break;
        }
        case "flag":
          e.raiseFlag(effect.flag, effect.value);
          break;
        case "blocked":
          if (effect.reason === "noDoor" && !silent) e.pushLog(t("operable.noDoor"), "warn");
          break;
      }
    }
  }, []);

  // A lever or button touched: `from` and `index` as the view reports them (a prop's or a decal's index in the played map).
  const touch = useCallback((from: "prop" | "decal", index: number): boolean => {
    const e = envRef.current;
    if (!e.active) return false;
    const m = e.mapRef.current;
    const key = (from === "prop" ? sourceKeys(m).props : sourceKeys(m).decals).get(index);
    if (!key) return false;
    const step = operate(m, stateRef.current, key, context());
    publish(step.state);
    apply(step.effects);
    return true;
  }, [apply, context, publish]);

  // the deck is entered (or the game starts / leaves the editor): the state anew, from the story flags
  useEffect(() => {
    const e = envRef.current;
    if (!e.active) {
      publish(initialOperableState());
      return;
    }
    const restored = restoreFromFlags(e.mapRef.current, e.hasFlag, context());
    publish(restored.state);
    apply(restored.effects, true);
    // (stepping onto a plate is looked at below, by the position)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.mapId, env.active]);

  // the party stepped onto or off a plate or a trap cell
  useEffect(() => {
    if (!envRef.current.active) return;
    const step = evaluatePlates(envRef.current.mapRef.current, stateRef.current, context());
    if (step.state === stateRef.current && !step.effects.length) return;
    publish(step.state);
    apply(step.effects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.pos.x, env.pos.y, env.elevation, env.mapId, env.active]);

  // momentary buttons spring back
  useEffect(() => {
    if (!env.active) return;
    const timer = setInterval(() => {
      const state = stateRef.current;
      if (!Object.keys(state.springAt).length) return;
      const step = tick(envRef.current.mapRef.current, state, context());
      if (step.state === state) return;
      publish(step.state);
      apply(step.effects);
    }, 250);
    return () => clearInterval(timer);
  }, [env.active, apply, context, publish]);

  return { touch };
}
