import { useCallback, useEffect, useRef, useState } from "react";
import { ACTOR_TYPES } from "../game/actors";
import { actorOffsets } from "../render/actorOffsets";
import type { ActorOffsets } from "../render/actorOffsets";

// Actor sprite editor (dev tool, open with ?editor=actors): nudges each
// sheet frame into place so the figure stands steady - through the walk
// cycle, and as it turns - and saves the shifts to src/actors/<sheet>.json,
// which the game applies (see actorOffsets).
//
// Left: the whole sheet (click a frame). Middle: the frame, big, over a
// ghost of another frame, with the feet's baseline and center line; arrow
// keys move it (Shift: 5 px). Right: a live preview - walking, turning
// round, or both.

type PreviewMode = "walk" | "turn" | "both" | "fight";
type Ghost = "none" | "idle" | "prev" | "next";

const ZOOM = 4;
const PREVIEW_ZOOM = 3;
const SHEET_ZOOM = 1.5;
// the 8 views going round: sheet column, and whether it's mirrored
const TURN = [0, 1, 2, 3, 4, 3, 2, 1].map((col, i) => ({ col, mirror: i > 4 }));

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`can't load ${src}`));
    img.src = src;
  });
}

export function ActorEditor() {
  const names = Object.keys(ACTOR_TYPES);
  const [name, setName] = useState(names[0]);
  const type = ACTOR_TYPES[name];
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const cellW = image ? image.width / type.cols : 1;
  const cellH = image ? image.height / type.rows : 1;
  const count = type.cols * type.rows;

  const [offsets, setOffsets] = useState<[number, number][]>([]);
  const [sel, setSel] = useState({ col: 0, row: 0 });
  const [ghost, setGhost] = useState<Ghost>("idle");
  const [mode, setMode] = useState<PreviewMode>("walk");
  const [fps, setFps] = useState(6);
  const [status, setStatus] = useState("");

  // (re)load the sheet and its saved fixes; `bust` re-reads a regenerated one
  const load = useCallback(
    async (bust = false) => {
      const img = await loadImage(`${import.meta.env.BASE_URL}actors/${type.sheet}/diffuse.png${bust ? `?${Date.now()}` : ""}`);
      setImage(img);
      const saved = actorOffsets(type.sheet);
      setOffsets(Array.from({ length: type.cols * type.rows }, (_, i) => saved?.offsets[i] ?? [0, 0]));
      setStatus(bust ? "sheet reloaded" : "");
    },
    [type],
  );
  useEffect(() => {
    load().catch((err) => setStatus(String(err)));
  }, [load]);

  const index = (col: number, row: number) => row * type.cols + col;
  const selIndex = index(sel.col, sel.row);

  // draws a frame into a 2D context at (x, y) = the cell's top-left
  const drawFrame = useCallback(
    (ctx: CanvasRenderingContext2D, col: number, row: number, x: number, y: number, zoom: number, mirror = false) => {
      if (!image) return;
      const [dx, dy] = offsets[index(col, row)] ?? [0, 0];
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (mirror) {
        ctx.translate(x + cellW * zoom, y);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(x, y);
      }
      ctx.drawImage(image, col * cellW, row * cellH, cellW, cellH, dx * zoom, dy * zoom, cellW * zoom, cellH * zoom);
      ctx.restore();
    },
    [image, offsets, cellW, cellH, type],
  );

  const guides = (ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number) => {
    ctx.strokeStyle = "rgba(80, 220, 120, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    // the feet's baseline and the cell's center line
    ctx.moveTo(x, y + cellH * zoom - 0.5);
    ctx.lineTo(x + cellW * zoom, y + cellH * zoom - 0.5);
    ctx.moveTo(x + (cellW * zoom) / 2 + 0.5, y);
    ctx.lineTo(x + (cellW * zoom) / 2 + 0.5, y + cellH * zoom);
    ctx.stroke();
  };

  // the whole sheet
  const sheetRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = sheetRef.current?.getContext("2d");
    if (!ctx || !image) return;
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (let row = 0; row < type.rows; row++) {
      for (let col = 0; col < type.cols; col++) {
        const x = col * cellW * SHEET_ZOOM;
        const y = row * cellH * SHEET_ZOOM;
        drawFrame(ctx, col, row, x, y, SHEET_ZOOM);
        const [dx, dy] = offsets[index(col, row)] ?? [0, 0];
        ctx.strokeStyle = col === sel.col && row === sel.row ? "#ffd24a" : dx || dy ? "#4a8" : "#444";
        ctx.lineWidth = col === sel.col && row === sel.row ? 2 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cellW * SHEET_ZOOM - 1, cellH * SHEET_ZOOM - 1);
      }
    }
  }, [image, offsets, sel, drawFrame]);

  // the selected frame, big, over its ghost
  const frameRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = frameRef.current?.getContext("2d");
    if (!ctx || !image) return;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const walk = type.walkRows;
    const at = walk.indexOf(sel.row);
    const ghostRow =
      ghost === "idle"
        ? type.idleRow
        : ghost === "prev" && at >= 0
          ? walk[(at + walk.length - 1) % walk.length]
          : ghost === "next" && at >= 0
            ? walk[(at + 1) % walk.length]
            : null;
    if (ghostRow !== null && ghostRow !== sel.row) {
      ctx.globalAlpha = 0.35;
      drawFrame(ctx, sel.col, ghostRow, 0, 0, ZOOM);
      ctx.globalAlpha = 1;
    }
    drawFrame(ctx, sel.col, sel.row, 0, 0, ZOOM);
    guides(ctx, 0, 0, ZOOM);
  }, [image, offsets, sel, ghost, drawFrame]);

  // the live preview
  const previewRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const ctx = previewRef.current?.getContext("2d");
      if (!ctx || !image) return;
      const step = Math.floor(((performance.now() - start) / 1000) * fps);
      const walkRow = type.walkRows[step % type.walkRows.length];
      // walk + turn: a whole walk cycle in each view
      const view = TURN[Math.floor(step / (mode === "both" ? type.walkRows.length : 1)) % TURN.length];
      // a fight, in this column: standing, firing twice, falling, the wreck
      const fight = [
        type.idleRow,
        type.idleRow,
        type.shootRow,
        type.idleRow,
        type.shootRow,
        type.idleRow,
        ...(type.dieRows ?? []),
        type.wreckRow,
        type.wreckRow,
        type.wreckRow,
      ].filter((r): r is number => r !== undefined);
      const still = mode === "walk" || mode === "fight";
      const col = still ? sel.col : view.col;
      const row = mode === "turn" ? sel.row : mode === "fight" ? fight[step % fight.length] : walkRow;
      const mirror = still ? false : view.mirror;
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      drawFrame(ctx, col, row, 0, 0, PREVIEW_ZOOM, mirror);
      guides(ctx, 0, 0, PREVIEW_ZOOM);
      ctx.fillStyle = "#8a8";
      ctx.font = "11px monospace";
      ctx.fillText(`col ${col}${mirror ? " (mirrored)" : ""}  row ${row}`, 4, 12);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [image, drawFrame, mode, fps, sel]);

  const nudge = useCallback(
    (ddx: number, ddy: number) => {
      setOffsets((prev) => prev.map((o, i) => (i === selIndex ? [o[0] + ddx, o[1] + ddy] : o)));
    },
    [selIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "SELECT") return;
      const n = e.shiftKey ? 5 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-n, 0],
        ArrowRight: [n, 0],
        ArrowUp: [0, -n],
        ArrowDown: [0, n],
      };
      if (moves[e.key]) {
        e.preventDefault();
        nudge(...moves[e.key]);
      }
      // frame to frame: WASD
      const sels: Record<string, [number, number]> = { a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
      if (sels[e.key]) {
        const [c, r] = sels[e.key];
        setSel((s) => ({
          col: (s.col + c + type.cols) % type.cols,
          row: (s.row + r + type.rows) % type.rows,
        }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudge, type]);

  const data = (): ActorOffsets => ({ cell: [cellW, cellH], offsets });
  const save = async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}__voidcrew/actor-offsets?name=${type.sheet}`, {
      method: "POST",
      body: JSON.stringify(data()),
    });
    setStatus(res.ok ? `saved to ${await res.text()}` : `save failed: ${await res.text()}`);
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data(), null, 2)], { type: "application/json" }));
    a.download = `${type.sheet}.json`;
    a.click();
  };

  const [dx, dy] = offsets[selIndex] ?? [0, 0];
  const button = "px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-sm hover:bg-neutral-700";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-300 p-4 flex flex-col gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold uppercase tracking-wide text-neutral-400">Actor editor</span>
        <select value={name} onChange={(e) => setName(e.target.value)} className="bg-neutral-800 border border-neutral-600 px-1">
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button className={button} onClick={() => load(true)}>
          Reload sheet
        </button>
        <button className={button} onClick={save}>
          Save
        </button>
        <button className={button} onClick={download}>
          Download JSON
        </button>
        <span className="text-green-400">{status}</span>
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-1">
          <span className="text-neutral-500">Sheet (click a frame, or W/A/S/D)</span>
          <canvas
            ref={sheetRef}
            width={cellW * type.cols * SHEET_ZOOM}
            height={cellH * type.rows * SHEET_ZOOM}
            className="cursor-pointer"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setSel({
                col: Math.min(type.cols - 1, Math.floor((e.clientX - r.left) / (cellW * SHEET_ZOOM))),
                row: Math.min(type.rows - 1, Math.floor((e.clientY - r.top) / (cellH * SHEET_ZOOM))),
              });
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-neutral-500">
            Frame col {sel.col}, row {sel.row}: shift {dx}, {dy} px (arrow keys, Shift = 5)
          </span>
          <canvas ref={frameRef} width={cellW * ZOOM} height={cellH * ZOOM} />
          <div className="flex flex-wrap items-center gap-2">
            <span>Ghost:</span>
            {(["none", "idle", "prev", "next"] as Ghost[]).map((g) => (
              <label key={g} className="flex items-center gap-1">
                <input type="radio" checked={ghost === g} onChange={() => setGhost(g)} />
                {g === "prev" ? "previous walk frame" : g === "next" ? "next walk frame" : g}
              </label>
            ))}
            <button className={button} onClick={() => nudge(-dx, -dy)}>
              Reset frame
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-neutral-500">Preview</span>
          <canvas ref={previewRef} width={cellW * PREVIEW_ZOOM} height={cellH * PREVIEW_ZOOM} />
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["walk", "walk (this column)"],
                ["turn", "turn round (this row)"],
                ["both", "walk + turn"],
                ["fight", "fire, fall, wreck (this column)"],
              ] as [PreviewMode, string][]
            ).map(([m, label]) => (
              <label key={m} className="flex items-center gap-1">
                <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
                {label}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2">
            {fps} fps
            <input type="range" min={1} max={16} value={fps} onChange={(e) => setFps(Number(e.target.value))} />
          </label>
        </div>
      </div>
      <div className="text-neutral-500">
        {count} frames; shifts are in sheet pixels and mirror with mirrored views. Save writes src/actors/{type.sheet}.json,
        which the running game picks up.
      </div>
    </div>
  );
}
