import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { ShotResult, Weapon } from "../game/combat";
import type { AimFocus, AimFrame, AimTarget } from "./GameViewport";

// The aiming overlay (bullet time, see combat.ts), drawn over the game view:
// 1. pick: the enemies in reach, their body parts outlined with hit chances;
//    Tab or left/right picks the enemy, up/down or W/S the part, a click
//    either; Space/Enter goes on, Esc cancels
// 2. with the mini-game on: a crosshair sways around the part; Space/Enter
//    or a click fires wherever it is - the shot goes through that point of
//    the view (see GameViewport's shoot); it fires by itself after a while.
//    A rapid-fire weapon (Weapon.burst) fires several shots this way, one
//    at a time; each leaves a mark on the target (x: a hit, o: a miss)
//    until the burst is over.
// The sway settles the longer the aim is held; each shot fired and each
// hit the crew takes shakes it up again (a jolt that fades).
//    With it off, the hit chance is rolled; a miss goes to a spot next to
//    the part and hits whatever is there.

const AUTO_FIRE_MS = 5000;
// the sway shrinks to this share of the weapon's over about this long (s)
const SWAY_STEADY = 0.3;
const SWAY_SETTLE_S = 1.4;
// shakes: how much a shot of a burst and a hit on the crew add to the sway
// (shares of the weapon's), and how fast that fades (s)
const RECOIL_SWAY = 0.35;
const HURT_SWAY = 0.6;
const JOLT_FADE_S = 1.2;
const HIT_MARK = "#ff5a3c";
const MISS_MARK = "#d8e0e8";
const PART_COLOR = "rgba(120, 255, 170, 0.9)";
const PART_DIM = "rgba(120, 255, 170, 0.28)";
const CROSSHAIR = "#ffd24a";

interface Props {
  frameRef: MutableRefObject<AimFrame | null>;
  // tells the camera what to turn to and zoom on
  focusRef: MutableRefObject<AimFocus | null>;
  // when the crew was last hit (performance.now()): it shakes the aim
  hurtAt: number;
  weapon: Weapon;
  crewName: string;
  miniGame: boolean;
  // each shot as it's fired; `last`: the use is over
  onShot: (result: ShotResult, last: boolean) => void;
  onCancel: () => void;
}

export function AimOverlay({ frameRef, focusRef, hurtAt, weapon, crewName, miniGame, onShot, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"pick" | "aim">("pick");
  // the picked enemy (by id, so it survives reordering) and part index
  const pickRef = useRef<{ target: number | null; part: number }>({ target: null, part: 1 });
  const aimStartRef = useRef(0);
  // when the current shot's auto-fire countdown started
  const shotStartRef = useRef(0);
  const firedRef = useRef(false);
  const burst = Math.max(1, weapon.burst ?? 1);
  // the shakes so far: added sway, as of when
  const joltRef = useRef({ amount: 0, at: 0 });
  const joltNow = (t: number) => joltRef.current.amount * Math.exp(-(t - joltRef.current.at) / 1000 / JOLT_FADE_S);
  const jolt = (amount: number) => {
    const t = performance.now();
    joltRef.current = { amount: joltNow(t) + amount, at: t };
  };
  const seenHurtRef = useRef(hurtAt);
  useEffect(() => {
    if (hurtAt === seenHurtRef.current) return;
    seenHurtRef.current = hurtAt;
    jolt(HURT_SWAY);
  }, [hurtAt]);
  const shotsRef = useRef(0);
  const [shots, setShots] = useState(0);
  // the burst's shots so far: where on the target (fractions of its box)
  const marksRef = useRef<{ target: number; x: number; y: number; hit: boolean }[]>([]);
  const crosshairRef = useRef<[number, number]>([0, 0]);

  const current = (): { target: AimTarget; partIndex: number } | null => {
    const frame = frameRef.current;
    if (!frame?.targets.length) return null;
    const pick = pickRef.current;
    const target = frame.targets.find((t) => t.id === pick.target) ?? frame.targets[0];
    pick.target = target.id;
    return { target, partIndex: Math.min(pick.part, target.parts.length - 1) };
  };

  // the picked target's box on screen
  const targetBox = (target: AimTarget): [number, number, number, number] => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const { rect } of target.parts) {
      [x0, y0, x1, y1] = [Math.min(x0, rect[0]), Math.min(y0, rect[1]), Math.max(x1, rect[2]), Math.max(y1, rect[3])];
    }
    return [x0, y0, x1, y1];
  };

  const fire = (x: number, y: number) => {
    if (firedRef.current) return;
    const frame = frameRef.current;
    if (!frame) return;
    const result = frame.shoot(x, y);
    const now = current();
    if (now) {
      const [x0, y0, x1, y1] = targetBox(now.target);
      marksRef.current.push({
        target: now.target.id,
        x: (x - x0) / Math.max(1, x1 - x0),
        y: (y - y0) / Math.max(1, y1 - y0),
        hit: result.kind === "actor",
      });
    }
    count(result);
  };
  // a shot done: the next one kicks and restarts its countdown, the last
  // ends the use
  const count = (result: ShotResult) => {
    shotsRef.current++;
    setShots(shotsRef.current);
    const last = shotsRef.current >= burst;
    if (last) firedRef.current = true;
    // the next shot: the recoil shakes the aim, and its countdown starts over
    jolt(RECOIL_SWAY);
    shotStartRef.current = performance.now();
    onShot(result, last);
  };

  // confirm the pick: aim with the mini-game, or roll the chance
  const confirm = () => {
    const now = current();
    if (!now) return;
    if (miniGame) {
      aimStartRef.current = shotStartRef.current = performance.now();
      setPhase("aim");
      return;
    }
    const part = now.target.parts[now.partIndex];
    const [x0, y0, x1, y1] = part.rect;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const frame = frameRef.current;
    for (let i = 0; i < burst && !firedRef.current; i++) {
      if (Math.random() < part.chance) {
        count({ kind: "actor", actor: now.target.id, part: part.part });
        continue;
      }
      // a miss: somewhere just off the part
      const a = Math.random() * Math.PI * 2;
      const r = Math.max(x1 - x0, y1 - y0) * 0.6 + (weapon.sway ?? 0.03) * (frame?.height ?? 600) * (frame?.zoom ?? 1);
      fire(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const pick = pickRef.current;
      const frame = frameRef.current;
      const key = e.key;
      const handled = ["Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "s", "a", "d", " ", "Enter", "Escape"];
      if (!handled.includes(key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (key === "Escape") return onCancel();
      if (phase === "aim") {
        if (key === " " || key === "Enter") fire(...crosshairRef.current);
        return;
      }
      if (key === " " || key === "Enter") return confirm();
      const targets = frame?.targets ?? [];
      if (!targets.length) return;
      const at = Math.max(0, targets.findIndex((t) => t.id === pick.target));
      if (key === "Tab" || key === "ArrowRight" || key === "d") pick.target = targets[(at + 1) % targets.length].id;
      if (key === "ArrowLeft" || key === "a") pick.target = targets[(at + targets.length - 1) % targets.length].id;
      const parts = targets[at].parts.length;
      if (key === "ArrowUp" || key === "w") pick.part = (Math.min(pick.part, parts - 1) + parts - 1) % parts;
      if (key === "ArrowDown" || key === "s") pick.part = (Math.min(pick.part, parts - 1) + 1) % parts;
    };
    // before the game's own key handlers
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // draw every frame: outlines and chances, or the swaying crosshair
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const frame = frameRef.current;
      if (!canvas) return;
      const { clientWidth: w, clientHeight: h } = canvas;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, w, h);
      // bullet time tint
      ctx.fillStyle = "rgba(20, 40, 60, 0.18)";
      ctx.fillRect(0, 0, w, h);
      const now = current();
      focusRef.current = {
        target: now?.target.id ?? null,
        part: now ? now.target.parts[now.partIndex].part : null,
        phase,
      };
      if (!frame || !now) return;
      ctx.font = "11px monospace";
      ctx.lineWidth = 1;
      for (const target of frame.targets) {
        const picked = target.id === now.target.id;
        target.parts.forEach((part, i) => {
          const [x0, y0, x1, y1] = part.rect;
          const on = picked && i === now.partIndex;
          // aiming: the part lights up on the sprite itself (no boxes)
          if (phase === "aim") return;
          ctx.strokeStyle = on ? PART_COLOR : PART_DIM;
          ctx.setLineDash(on ? [] : [3, 3]);
          ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
          if (picked && phase === "pick") {
            ctx.fillStyle = on ? PART_COLOR : PART_DIM;
            ctx.fillText(`${part.label} ${Math.round(part.chance * 100)}%`, x1 + 4, (y0 + y1) / 2 + 4);
          }
        });
      }
      ctx.setLineDash([]);
      if (phase !== "aim") return;
      // the burst's shots so far, on their target
      ctx.lineWidth = 2;
      for (const mark of marksRef.current) {
        const target = frame.targets.find((t) => t.id === mark.target);
        if (!target) continue;
        const [bx0, by0, bx1, by1] = targetBox(target);
        const mx = bx0 + mark.x * (bx1 - bx0);
        const my = by0 + mark.y * (by1 - by0);
        ctx.strokeStyle = mark.hit ? HIT_MARK : MISS_MARK;
        ctx.beginPath();
        if (mark.hit) {
          ctx.moveTo(mx - 5, my - 5);
          ctx.lineTo(mx + 5, my + 5);
          ctx.moveTo(mx + 5, my - 5);
          ctx.lineTo(mx - 5, my + 5);
        } else ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      // the crosshair sways around the part's centre (it follows it)
      const part = now.target.parts[now.partIndex];
      const [x0, y0, x1, y1] = part.rect;
      const t = (performance.now() - aimStartRef.current) / 1000;
      // the aim steadies the longer it's held
      // (and shakes when shooting or shot at)
      const steady = SWAY_STEADY + (1 - SWAY_STEADY) * Math.exp(-t / SWAY_SETTLE_S) + joltNow(performance.now());
      const r = (weapon.sway ?? 0.03) * h * frame.zoom * steady;
      const x = (x0 + x1) / 2 + r * (0.65 * Math.sin(t * 1.9) + 0.35 * Math.sin(t * 3.7 + 1.1));
      const y = (y0 + y1) / 2 + r * (0.65 * Math.cos(t * 2.3) + 0.35 * Math.sin(t * 2.9 + 2.3));
      crosshairRef.current = [x, y];
      ctx.strokeStyle = CROSSHAIR;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.moveTo(x - 13, y);
      ctx.lineTo(x - 4, y);
      ctx.moveTo(x + 4, y);
      ctx.lineTo(x + 13, y);
      ctx.moveTo(x, y - 13);
      ctx.lineTo(x, y - 4);
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x, y + 13);
      ctx.stroke();
      const left = 1 - (performance.now() - shotStartRef.current) / AUTO_FIRE_MS;
      ctx.fillStyle = CROSSHAIR;
      ctx.fillRect(x - 13, y + 17, 26 * Math.max(0, left), 2);
      if (left <= 0) fire(x, y);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  });

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (phase === "aim") return fire(...crosshairRef.current);
    // a click on a part picks it (and a click on the picked one confirms)
    for (const target of frameRef.current?.targets ?? []) {
      for (let i = 0; i < target.parts.length; i++) {
        const [x0, y0, x1, y1] = target.parts[i].rect;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        const pick = pickRef.current;
        if (pick.target === target.id && pick.part === i) return confirm();
        pickRef.current = { target: target.id, part: i };
        return;
      }
    }
  };

  return (
    <div className="absolute inset-0 z-10">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair" onClick={onClick} />
      <div className="absolute top-2 inset-x-0 text-center text-[11px] text-emerald-200/90 pointer-events-none font-mono">
        {crewName} · {weapon.name} ·{" "}
        {phase === "pick"
          ? "Tab: target · ↑↓: part · Space: " + (miniGame ? "aim" : "fire") + " · Esc: cancel"
          : "Space: fire" + (burst > 1 ? ` (${Math.min(burst, shots + 1)}/${burst})` : "")}
      </div>
    </div>
  );
}
