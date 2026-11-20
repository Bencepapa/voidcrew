import { useCallback, useEffect, useRef, useState } from "react";
import { t, useLang, type Key } from "../i18n";
import { defaultActorView, type ActorSheetLayout } from "../game/actorSheets";
import { SheetViewport } from "./SheetViewport";

type PreviewMode = "walk" | "turn" | "both" | "fight" | "attack" | "hit" | "die";
type Ghost = "none" | "idle" | "prev" | "next";

const ZOOM = 4;
const PREVIEW_ZOOM = 3;
const SHEET_ZOOM = 1.5;
type Offset = [number, number];

export function ActorAlignment({ image, layout: type, offsets, onOffsetsChange }: {
  image: HTMLImageElement | null;
  layout: ActorSheetLayout;
  offsets: Offset[];
  onOffsetsChange: (offsets: Offset[]) => void;
}) {
  const lang = useLang();
  const cellW = image ? image.width / type.cols : 1;
  const cellH = image ? image.height / type.rows : 1;
  const count = type.cols * type.rows;
  const attack = type.shootRows ?? (type.shootRow === undefined ? [] : [type.shootRow]);
  const death = [...(type.dieRows ?? []), ...(type.wreckRow === undefined ? [] : [type.wreckRow])];
  const hit = type.hitRow === undefined ? [] : [type.hitRow];
  const [sel, setSel] = useState({ col: 0, row: 0 });
  const [ghost, setGhost] = useState<Ghost>("idle");
  const [mode, setMode] = useState<PreviewMode>("walk");
  const [fps, setFps] = useState(6);
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
    const sequence = [type.walkRows, attack, hit, death].find(rows => rows.includes(sel.row)) ?? [];
    const at = sequence.indexOf(sel.row);
    const ghostRow =
      ghost === "idle"
        ? type.idleRow
        : ghost === "prev" && at >= 0
          ? sequence[(at + sequence.length - 1) % sequence.length]
          : ghost === "next" && at >= 0
            ? sequence[(at + 1) % sequence.length]
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
      const sector = Math.floor(step / (mode === "both" ? type.walkRows.length : 1)) % 8;
      const view = type.directions?.[sector] ?? defaultActorView(type.cols, sector);
      // a fight, in this column: standing, firing twice, falling, the wreck
      const fight = [
        type.idleRow,
        type.idleRow,
        ...(type.shootRows ?? [type.shootRow]),
        type.idleRow,
        ...(type.shootRows ?? [type.shootRow]),
        type.idleRow,
        type.hitRow,
        ...(type.dieRows ?? []),
        type.wreckRow,
        type.wreckRow,
        type.wreckRow,
      ].filter((r): r is number => r !== undefined);
      const still = mode !== "turn" && mode !== "both";
      const col = still ? sel.col : view.col;
      const sequence = mode === "fight" ? fight : mode === "attack" ? attack : mode === "hit" ? hit : mode === "die" ? death : undefined;
      const row = mode === "turn" ? sel.row : sequence ? sequence[step % sequence.length] ?? type.idleRow : walkRow;
      const mirror = still ? false : view.mirror;
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      drawFrame(ctx, col, row, 0, 0, PREVIEW_ZOOM, mirror);
      guides(ctx, 0, 0, PREVIEW_ZOOM);
      ctx.fillStyle = "#8a8";
      ctx.font = "11px monospace";
      ctx.fillText(t("editorShell.actorEditor.frameLabel", { col, mirrored: mirror ? t("editorShell.actorEditor.mirrored") : "", row }), 4, 12);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [image, drawFrame, mode, fps, sel, lang]);

  const nudge = useCallback(
    (ddx: number, ddy: number) => {
      onOffsetsChange(Array.from({ length: count }, (_, i) => {
        const [x, y] = offsets[i] ?? [0, 0];
        return i === selIndex ? [x + ddx, y + ddy] : [x, y];
      }));
    },
    [count, offsets, onOffsetsChange, selIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!image || (e.target instanceof HTMLElement && e.target.closest("input, select, textarea, button, [contenteditable=true]"))) return;
      const n = e.shiftKey ? 5 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-n, 0],
        ArrowRight: [n, 0],
        ArrowUp: [0, -n],
        ArrowDown: [0, n],
      };
      if (moves[e.key]) {
        e.preventDefault();
        e.stopPropagation();
        nudge(...moves[e.key]);
      }
      // frame to frame: WASD
      const sels: Record<string, [number, number]> = { a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
      if (sels[e.key]) {
        e.preventDefault();
        e.stopPropagation();
        const [c, r] = sels[e.key];
        setSel((s) => ({
          col: (s.col + c + type.cols) % type.cols,
          row: (s.row + r + type.rows) % type.rows,
        }));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [image, nudge, type]);

  const [dx, dy] = offsets[selIndex] ?? [0, 0];
  const button = "px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-sm hover:bg-neutral-700";

  return (
      <div className="grid gap-4 items-start md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <span className="text-neutral-500">{t("editorShell.actorEditor.sheetHint")}</span>
          <SheetViewport height="min(56vh, 32rem)"><canvas
            ref={sheetRef}
            width={cellW * type.cols * SHEET_ZOOM}
            height={cellH * type.rows * SHEET_ZOOM}
            className="cursor-pointer"
            tabIndex={0}
            aria-label={t("editorShell.actorEditor.sheetHint")}
            onClick={(e) => {
              e.currentTarget.focus({ preventScroll: true });
              const r = e.currentTarget.getBoundingClientRect();
              setSel({
                col: Math.min(type.cols - 1, Math.floor((e.clientX - r.left) / r.width * type.cols)),
                row: Math.min(type.rows - 1, Math.floor((e.clientY - r.top) / r.height * type.rows)),
              });
            }}
          /></SheetViewport>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-neutral-500">
            {t("editorShell.actorEditor.frameInfo", { col: sel.col, row: sel.row, dx, dy })}
          </span>
          <canvas style={{maxHeight:"38vh",maxWidth:"100%",objectFit:"contain",alignSelf:"start"}} ref={frameRef} width={cellW * ZOOM} height={cellH * ZOOM} />
          <div className="flex flex-wrap items-center gap-2">
            <span>{t("editorShell.actorEditor.ghost")}</span>
            {(["none", "idle", "prev", "next"] as Ghost[]).map((g) => (
              <label key={g} className="flex items-center gap-1">
                <input type="radio" checked={ghost === g} onChange={() => setGhost(g)} />
                {t(({ none: "editorShell.actorEditor.ghostNone", idle: "editorShell.actorEditor.ghostIdle", prev: "editorShell.actorEditor.ghostPrev", next: "editorShell.actorEditor.ghostNext" } as Record<Ghost, Key>)[g])}
              </label>
            ))}
            <button className={button} onClick={() => nudge(-dx, -dy)}>
              {t("editorShell.actorEditor.resetFrame")}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-neutral-500">{t("editorShell.actorEditor.preview")}</span>
          <canvas style={{maxHeight:"38vh",maxWidth:"100%",objectFit:"contain",alignSelf:"start"}} ref={previewRef} width={cellW * PREVIEW_ZOOM} height={cellH * PREVIEW_ZOOM} />
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["walk", "editorShell.actorEditor.previewWalk"],
                ["turn", "editorShell.actorEditor.previewTurn"],
                ["both", "editorShell.actorEditor.previewBoth"],
                ["fight", "editorShell.actorEditor.previewFight"],
                ...(attack.length ? [["attack", "assetManager.npcSheet.role.attack"]] : []),
                ...(hit.length ? [["hit", "assetManager.npcSheet.role.hit"]] : []),
                ...(death.length ? [["die", "assetManager.npcSheet.role.die"]] : []),
              ] as [PreviewMode, Key][]
            ).map(([m, label]) => (
              <label key={m} className="flex items-center gap-1">
                <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
                {t(label)}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2">
            {fps} fps
            <input type="range" min={1} max={16} value={fps} onChange={(e) => setFps(Number(e.target.value))} />
          </label>
        </div>
      </div>
  );
}
