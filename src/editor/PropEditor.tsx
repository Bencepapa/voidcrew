import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PROP_TYPES, propEditable, type PropEdit, type PropFace, type PropPart, type PropType } from "../game/props";
import { propEdit } from "./propEditState";

// The prop box editor (dev tool, opened from the map editor's Prop panel):
// a views prop (see PropType "views") is a few boxes, each face of a box
// cut out of the matching view - front, side or top - wherever the box
// stands in it. This shows the three views with the boxes drawn over them
// and lets you drag them (a box: move it; its edge: that side) or type
// their numbers. The game rebuilds the props as you go and draws the boxes
// over them; Save writes src/props/<name>.json.
//
// The view images are public/textures/<views>_front|_side|_top/diffuse.png
// (and depth.png): paint over them in GIMP, save, and both this panel and
// the game reload them (the dev server redoes normal.png from the depth,
// and copies the diffuse's transparent holes into the depth).

type ViewName = "front" | "side" | "top";
const VIEWS: ViewName[] = ["front", "side", "top"];
type Axis = 0 | 1 | 2;
type ViewsType = Extract<(typeof PROP_TYPES)[string], { kind: "views" }>;

// one image axis of a view: the prop axis it runs along, image 0..1 to that
// axis' value and back, and whether its low end is the box's min
interface ViewAxis {
  axis: Axis;
  toValue: (t: number) => number;
  fromValue: (v: number) => number;
  minAtLow: boolean;
}
interface ViewFrame {
  u: ViewAxis;
  v: ViewAxis;
}

// What each view covers - as the game builds it (GameViewport
// buildPropTemplate): at the front view's pixel scale (with px), the front
// view across the prop's length from the floor up, the side view from the
// front (+z, its left) back, the top view with the front at its bottom; a
// wall prop's side and top views start at the wall (-z).
function viewFrames(type: ViewsType): Record<ViewName, ViewFrame> {
  const [length, height, depth] = type.size;
  const px = type.px;
  const scale = px ? length / px.front[0] : 0;
  const frontY = px ? px.front[1] * scale : height;
  const sideY = px ? px.side[1] * scale : height;
  const sideZ = px ? px.side[0] * scale : depth;
  const topX = px ? px.top[0] * scale : length;
  const topZ = px ? px.top[1] * scale : depth;
  const zFrom = (extent: number) => (type.wall ? -depth / 2 : -extent / 2);
  const sideZ0 = zFrom(sideZ);
  const topZ0 = zFrom(topZ);
  const up = (h: number): ViewAxis => ({ axis: 1, toValue: (t) => h - t * h, fromValue: (y) => (h - y) / h, minAtLow: false });
  return {
    front: {
      u: { axis: 0, toValue: (t) => t * length - length / 2, fromValue: (x) => (x + length / 2) / length, minAtLow: true },
      v: up(frontY),
    },
    side: {
      u: { axis: 2, toValue: (t) => sideZ0 + sideZ - t * sideZ, fromValue: (z) => (sideZ0 + sideZ - z) / sideZ, minAtLow: false },
      v: up(sideY),
    },
    top: {
      u: { axis: 0, toValue: (t) => t * topX - topX / 2, fromValue: (x) => (x + topX / 2) / topX, minAtLow: true },
      v: { axis: 2, toValue: (t) => topZ0 + t * topZ, fromValue: (z) => (z - topZ0) / topZ, minAtLow: true },
    },
  };
}

// a box's rectangle in a view (image 0..1)
function rectOf(part: PropPart, frame: ViewFrame) {
  const us = [frame.u.fromValue(part.min[frame.u.axis]), frame.u.fromValue(part.max[frame.u.axis])];
  const vs = [frame.v.fromValue(part.min[frame.v.axis]), frame.v.fromValue(part.max[frame.v.axis])];
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
}

// the box a view cuts a part's faces from: its own, or (its faces not
// following it - PropPart.src) its place in that view
function shownIn(part: PropPart, view: ViewName): PropPart {
  return part.src?.[view] ?? part;
}
const FACES: PropFace[] = ["front", "back", "left", "right", "top"];

const round = (n: number) => Math.round(n * 10000) / 10000;

// what any prop saves: its size, relief and normal strength
function commonEdit(type: PropType): PropEdit {
  return {
    size: type.size.map(round) as [number, number, number],
    ...(type.relief !== undefined ? { relief: type.relief } : {}),
    ...(type.normal !== undefined ? { normal: type.normal } : {}),
  };
}
async function postEdit(name: string, edit: PropEdit): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}__voidcrew/prop?name=${name}`, { method: "POST", body: `${JSON.stringify(edit, null, 2)}\n` });
  return res.ok ? `saved ${await res.text()}` : `save failed: ${await res.text()}`;
}
const BTN = "px-2 py-0.5 bg-neutral-800 border border-neutral-600 hover:bg-neutral-700";
function NumField({ value, onChange, step = 0.005 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onKeyDown={(e) => e.stopPropagation()}
      className="w-16 bg-neutral-800 border border-neutral-700 px-1 py-0.5 text-right"
    />
  );
}
// relief depth and normal strength (relative to the usual)
function LookFields({ type, changed }: { type: PropType; changed: () => void }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-neutral-400" title="Relief depth, relative to props' usual">relief</span>
      <NumField
        value={type.relief ?? 1}
        step={0.1}
        onChange={(v) => {
          if (!Number.isFinite(v) || v < 0) return;
          type.relief = v === 1 ? undefined : v;
          changed();
        }}
      />
      <span className="text-neutral-400" title="Normal map strength, relative to the viewer's Normal strength">normal</span>
      <NumField
        value={type.normal ?? 1}
        step={0.1}
        onChange={(v) => {
          if (!Number.isFinite(v) || v < 0) return;
          type.normal = v === 1 ? undefined : v;
          changed();
        }}
      />
    </span>
  );
}
const EDITABLE = Object.entries(PROP_TYPES)
  .filter(([, t]) => propEditable(t))
  .map(([n]) => n);
function PropSelect({ name }: { name: string }) {
  return (
    <select value={name} onChange={(e) => propEdit.set({ name: e.target.value, part: 0 })} className="bg-neutral-800 border border-neutral-700 px-1 py-0.5">
      {EDITABLE.map((n) => (
        <option key={n} value={n}>
          {n} ({PROP_TYPES[n].kind})
        </option>
      ))}
    </select>
  );
}

// A prop without boxes (a crate, a cutout, crossed cutouts, a cabin): only
// its size and look
function PlainPropPanel({ name, type }: { name: string; type: PropType }) {
  const [, setTick] = useState(0);
  const [status, setStatus] = useState("");
  const changed = () => {
    setTick((t) => t + 1);
    propEdit.changed();
  };
  const what: Record<string, string> = {
    box: "a box: its side texture on four sides, its top texture on top",
    panel: "one upright cutout, seen from both sides",
    cross: "two cutouts crossed at right angles (reads as solid from any side) - no boxes: its size is the cutouts' width and height",
    cabin: "a walk-in box seen into through its door",
  };
  return (
    <div
      className="absolute top-2 left-2 z-40 w-[560px] bg-neutral-950/92 border border-neutral-700 rounded-sm p-2 text-[11px] text-neutral-200 font-mono"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-200">Prop</span>
        <PropSelect name={name} />
        <button type="button" className={BTN} onClick={async () => setStatus(await postEdit(name, commonEdit(type)))}>
          Save
        </button>
        <button type="button" className={`ml-auto ${BTN}`} onClick={() => propEdit.set({ name: null })}>
          ✕
        </button>
      </div>
      <div className="text-neutral-500 mb-2">{what[type.kind] ?? type.kind}</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-neutral-400">size</span>
        {([0, 1, 2] as const).map((axis) => (
          <span key={axis}>
            {"xyz"[axis]}{" "}
            <NumField
              value={type.size[axis]}
              onChange={(v) => {
                if (!Number.isFinite(v) || v <= 0) return;
                type.size[axis] = v;
                changed();
              }}
            />
          </span>
        ))}
        <LookFields type={type} changed={changed} />
        <span className="text-neutral-400">{status}</span>
      </div>
    </div>
  );
}
const roundBox = (b: { min: number[]; max: number[] }) => ({
  min: b.min.map(round) as [number, number, number],
  max: b.max.map(round) as [number, number, number],
});

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// how far (screen px) from an edge still grabs it
const EDGE_GRAB = 6;
const VIEW_MAX: Record<ViewName, [number, number]> = { front: [520, 300], side: [250, 260], top: [250, 260] };

type Drag = {
  view: ViewName;
  part: number;
  // the edges dragged (all four: moving it)
  edges: { u0: boolean; u1: boolean; v0: boolean; v1: boolean };
  start: { u: number; v: number };
  from: PropPart;
};

export function PropEditor() {
  const state = useSyncExternalStore(propEdit.subscribe, propEdit.get);
  const name = state.name;
  const type = name ? PROP_TYPES[name] : undefined;
  const [images, setImages] = useState<Partial<Record<ViewName, HTMLImageElement | null>>>({});
  const [showDepth, setShowDepth] = useState(false);
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState(true);
  const canvases = useRef<Partial<Record<ViewName, HTMLCanvasElement | null>>>({});
  const drag = useRef<Drag | null>(null);
  // re-render on edits made in place
  const [, setTick] = useState(0);

  const views = type?.kind === "views" ? type : null;

  const load = useCallback(async () => {
    if (!views) return;
    const bust = `?t=${Date.now()}`;
    const entries = await Promise.all(
      VIEWS.map(async (v) => [v, await loadImage(`${import.meta.env.BASE_URL}textures/${views.views}_${v}/${showDepth ? "depth" : "diffuse"}.png${bust}`)] as const),
    );
    setImages(Object.fromEntries(entries));
  }, [views, showDepth]);

  useEffect(() => {
    load();
  }, [load]);

  // the views painted over and saved: shown anew
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onChange = () => load();
    hot.on("voidcrew:texture-changed", onChange);
    return () => hot.off("voidcrew:texture-changed", onChange);
  }, [load]);

  const changed = useCallback(() => {
    setSaved(false);
    setTick((t) => t + 1);
    propEdit.changed();
  }, []);

  // ---- drawing ----
  const draw = useCallback(() => {
    if (!views) return;
    const frames = viewFrames(views);
    for (const view of VIEWS) {
      const canvas = canvases.current[view];
      const img = images[view];
      if (!canvas) continue;
      const ctx = canvas.getContext("2d")!;
      const [maxW, maxH] = VIEW_MAX[view];
      const iw = img?.width ?? 100;
      const ih = img?.height ?? 100;
      const zoom = Math.min(maxW / iw, maxH / ih);
      // (room around it for boxes reaching past the view)
      const pad = 24;
      canvas.width = Math.round(iw * zoom) + pad * 2;
      canvas.height = Math.round(ih * zoom) + pad * 2;
      canvas.dataset.zoom = String(zoom);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#1b1d22";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // a checkerboard where the view is transparent
      ctx.fillStyle = "#2a2d34";
      for (let y = 0; y < ih * zoom; y += 8) for (let x = (y / 8) % 2 ? 8 : 0; x < iw * zoom; x += 16) ctx.fillRect(pad + x, pad + y, 8, 8);
      if (img) ctx.drawImage(img, pad, pad, iw * zoom, ih * zoom);
      else {
        ctx.fillStyle = "#e06060";
        ctx.fillText("no image", pad + 4, pad + 14);
      }
      ctx.strokeStyle = "#555b66";
      ctx.strokeRect(pad - 0.5, pad - 0.5, iw * zoom + 1, ih * zoom + 1);
      const frame = frames[view];
      const order = views.parts.map((_, i) => i).filter((i) => i !== state.part);
      order.push(state.part);
      const screen = (r: ReturnType<typeof rectOf>) => ({
        x: pad + r.u0 * iw * zoom,
        y: pad + r.v0 * ih * zoom,
        w: (r.u1 - r.u0) * iw * zoom,
        h: (r.v1 - r.v0) * ih * zoom,
      });
      for (const i of order) {
        const part = views.parts[i];
        if (!part) continue;
        const picked = i === state.part;
        // (its faces cut from elsewhere in this view: where it stands, faint)
        if (picked && part.src?.[view]) {
          const b = screen(rectOf(part, frame));
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
          ctx.lineWidth = 1;
          ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
          ctx.setLineDash([]);
        }
        const { x, y, w, h } = screen(rectOf(shownIn(part, view), frame));
        if (picked) {
          ctx.fillStyle = "rgba(255, 210, 63, 0.12)";
          ctx.fillRect(x, y, w, h);
        }
        ctx.strokeStyle = picked ? "#ffd23f" : "rgba(63, 208, 255, 0.9)";
        ctx.lineWidth = picked ? 2 : 1;
        if (part.src?.[view]) ctx.setLineDash([6, 3]);
        // (a round part from above: its circle)
        if (part.shape === "cylinder" && view === "top") {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2 - 0.5), Math.max(1, h / 2 - 0.5), 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.35;
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
          ctx.globalAlpha = 1;
        } else ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.setLineDash([]);
        ctx.fillStyle = picked ? "#ffd23f" : "#3fd0ff";
        ctx.font = "10px monospace";
        ctx.fillText(String(i), x + 3, y + 11);
      }
    }
  }, [views, images, state.part]);

  useEffect(() => {
    draw();
  });

  // ---- dragging ----
  const at = (view: ViewName, e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvases.current[view]!;
    const img = images[view];
    const zoom = Number(canvas.dataset.zoom) || 1;
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) * canvas.width) / rect.width - 24;
    const sy = ((e.clientY - rect.top) * canvas.height) / rect.height - 24;
    const iw = (img?.width ?? 100) * zoom;
    const ih = (img?.height ?? 100) * zoom;
    return { u: sx / iw, v: sy / ih, iw, ih };
  };

  const onDown = (view: ViewName, e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!views) return;
    const frame = viewFrames(views)[view];
    const p = at(view, e);
    const grabU = EDGE_GRAB / p.iw;
    const grabV = EDGE_GRAB / p.ih;
    const edgesOf = (i: number) => {
      const r = rectOf(shownIn(views.parts[i], view), frame);
      const inV = p.v > r.v0 - grabV && p.v < r.v1 + grabV;
      const inU = p.u > r.u0 - grabU && p.u < r.u1 + grabU;
      return {
        u0: inV && Math.abs(p.u - r.u0) < grabU,
        u1: inV && Math.abs(p.u - r.u1) < grabU,
        v0: inU && Math.abs(p.v - r.v0) < grabV,
        v1: inU && Math.abs(p.v - r.v1) < grabV,
        inside: p.u > r.u0 && p.u < r.u1 && p.v > r.v0 && p.v < r.v1,
        area: (r.u1 - r.u0) * (r.v1 - r.v0),
      };
    };
    // the picked box's edges first, then the smallest box under the pointer
    let part = state.part;
    let hit = views.parts[part] ? edgesOf(part) : null;
    const onEdge = hit && (hit.u0 || hit.u1 || hit.v0 || hit.v1);
    if (!onEdge) {
      const under = views.parts
        .map((_, i) => ({ i, h: edgesOf(i) }))
        .filter(({ h }) => h.inside || h.u0 || h.u1 || h.v0 || h.v1)
        .sort((a, b) => a.h.area - b.h.area)[0];
      if (!under) return;
      part = under.i;
      hit = under.h;
      if (part !== state.part) propEdit.set({ part });
    }
    const edges = hit!.u0 || hit!.u1 || hit!.v0 || hit!.v1 ? { u0: hit!.u0, u1: hit!.u1, v0: hit!.v0, v1: hit!.v1 } : { u0: true, u1: true, v0: true, v1: true };
    const from = shownIn(views.parts[part], view);
    drag.current = { view, part, edges, start: { u: p.u, v: p.v }, from: { min: [...from.min], max: [...from.max] } };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (view: ViewName, e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    const canvas = canvases.current[view];
    if (!views || !canvas) return;
    const p = at(view, e);
    if (!d || d.view !== view) {
      canvas.style.cursor = "crosshair";
      return;
    }
    const frame = viewFrames(views)[view];
    const img = images[view];
    const part: PropPart = { min: [...d.from.min], max: [...d.from.max] };
    // each image axis: its edges shifted, snapped to the view's pixels
    for (const [ax, lo, hi, delta, pixels] of [
      [frame.u, d.edges.u0, d.edges.u1, p.u - d.start.u, img?.width ?? 100],
      [frame.v, d.edges.v0, d.edges.v1, p.v - d.start.v, img?.height ?? 100],
    ] as const) {
      const snap = (t: number) => Math.round(t * pixels) / pixels;
      const move = (key: "min" | "max") => {
        const t = snap(ax.fromValue(d.from[key][ax.axis]) + delta);
        part[key][ax.axis] = round(ax.toValue(t));
      };
      // (the low image edge is the box's min on an axis that grows that way)
      if (lo) move(ax.minAtLow ? "min" : "max");
      if (hi) move(ax.minAtLow ? "max" : "min");
      if (part.min[ax.axis] > part.max[ax.axis]) [part.min[ax.axis], part.max[ax.axis]] = [part.max[ax.axis], part.min[ax.axis]];
    }
    // (the part itself - or, its faces not following it, its place in this view)
    const target = views.parts[d.part];
    if (target.src?.[view]) target.src[view] = { min: part.min, max: part.max };
    else {
      target.min = part.min;
      target.max = part.max;
    }
    changed();
  };

  const onUp = () => {
    drag.current = null;
  };

  // ---- fields ----
  if (!name || !type || !propEditable(type)) return null;
  if (!views) return <PlainPropPanel key={name} name={name} type={type} />;

  const setPart = (i: number, key: "min" | "max", axis: Axis, value: number) => {
    if (!Number.isFinite(value)) return;
    views.parts[i][key][axis] = value;
    changed();
  };
  const setSize = (axis: Axis, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    views.size[axis] = value;
    changed();
  };
  const fitPx = () => {
    if (!images.front || !images.side || !images.top) return;
    views.px = {
      front: [images.front.width, images.front.height],
      side: [images.side.width, images.side.height],
      top: [images.top.width, images.top.height],
    };
    changed();
  };
  const addPart = () => {
    const from = views.parts[state.part] ?? { min: [-0.1, 0, -0.1], max: [0.1, 0.1, 0.1] };
    views.parts.push(structuredClone(from));
    propEdit.set({ part: views.parts.length - 1 });
    changed();
  };
  const removePart = () => {
    if (views.parts.length <= 1) return;
    views.parts.splice(state.part, 1);
    propEdit.set({ part: Math.max(0, state.part - 1) });
    changed();
  };
  const save = async () => {
    const edit: PropEdit = {
      ...commonEdit(views),
      parts: views.parts.map((p) => ({
        ...roundBox(p),
        ...(p.shape === "cylinder" ? { shape: p.shape } : {}),
        ...(p.src
          ? { src: Object.fromEntries(Object.entries(p.src).map(([v, b]) => [v, roundBox(b!)])) as PropPart["src"] }
          : {}),
        ...(p.off?.length ? { off: p.off } : {}),
      })),
      ...(views.px ? { px: views.px } : {}),
      ...(views.elevation ? { elevation: views.elevation } : {}),
    };
    const result = await postEdit(name, edit);
    setStatus(result);
    if (result.startsWith("saved")) setSaved(true);
  };

  const num = (value: number, onChange: (v: number) => void, step = 0.005) => (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onKeyDown={(e) => e.stopPropagation()}
      className="w-16 bg-neutral-800 border border-neutral-700 px-1 py-0.5 text-right"
    />
  );
  const picked = views.parts[state.part];

  return (
    <div
      className="absolute top-2 left-2 bottom-2 z-40 w-[560px] overflow-y-auto bg-neutral-950/92 border border-neutral-700 rounded-sm p-2 text-[11px] text-neutral-200 font-mono"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-200">Prop boxes</span>
        <PropSelect name={name} />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showDepth} onChange={(e) => setShowDepth(e.target.checked)} />
          depth
        </label>
        <button type="button" className="px-2 py-0.5 bg-neutral-800 border border-neutral-600 hover:bg-neutral-700" onClick={load}>
          Reload images
        </button>
        <button
          type="button"
          className={`px-2 py-0.5 border ${saved ? "bg-neutral-800 border-neutral-600" : "bg-amber-700 border-amber-500"} hover:bg-neutral-700`}
          onClick={save}
        >
          Save
        </button>
        <button type="button" className="ml-auto px-2 py-0.5 bg-neutral-800 border border-neutral-600 hover:bg-neutral-700" onClick={() => propEdit.set({ name: null })}>
          ✕
        </button>
      </div>
      <div className="text-neutral-500 mb-2">
        drag a box to move it, its edge to resize (snaps to the view's pixels) · images: public/textures/{views.views}_front|side|top/
        diffuse.png, depth.png - save in GIMP, they reload here and in the game
      </div>

      {VIEWS.map((view) =>
        view === "front" ? (
          <div key={view} className="mb-1">
            <div className="text-neutral-400">front (x →, y ↑)</div>
            <canvas
              ref={(c) => {
                canvases.current[view] = c;
              }}
              onPointerDown={(e) => onDown(view, e)}
              onPointerMove={(e) => onMove(view, e)}
              onPointerUp={onUp}
              className="block max-w-full"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        ) : null,
      )}
      <div className="flex gap-2 mb-2">
        {(["side", "top"] as const).map((view) => (
          <div key={view}>
            <div className="text-neutral-400">{view === "side" ? "side (front ← z, y ↑)" : "top (x →, front ↓)"}</div>
            <canvas
              ref={(c) => {
                canvases.current[view] = c;
              }}
              onPointerDown={(e) => onDown(view, e)}
              onPointerMove={(e) => onMove(view, e)}
              onPointerUp={onUp}
              className="block max-w-full"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-neutral-400">size</span>
        x {num(views.size[0], (v) => setSize(0, v))} y {num(views.size[1], (v) => setSize(1, v))} z {num(views.size[2], (v) => setSize(2, v))}
        <span className="text-neutral-400 ml-2">elevation</span>
        {num(views.elevation ?? 0, (v) => {
          views.elevation = v || undefined;
          changed();
        })}
        <LookFields type={views} changed={changed} />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-neutral-400">px</span>
        {views.px ? (
          <span>
            front {views.px.front.join("×")} · side {views.px.side.join("×")} · top {views.px.top.join("×")}
          </span>
        ) : (
          <span className="text-neutral-500">none: each view stretched over the whole size</span>
        )}
        <button type="button" className="px-2 py-0.5 bg-neutral-800 border border-neutral-600 hover:bg-neutral-700" onClick={fitPx} title="Each view at the front view's pixel scale">
          from the images
        </button>
        {views.px && (
          <button
            type="button"
            className="px-2 py-0.5 bg-neutral-800 border border-neutral-600 hover:bg-neutral-700"
            onClick={() => {
              views.px = undefined;
              changed();
            }}
          >
            clear
          </button>
        )}
      </div>

      <table className="w-full mb-2">
        <thead className="text-neutral-500">
          <tr>
            <td>#</td>
            <td>min x</td>
            <td>min y</td>
            <td>min z</td>
            <td>max x</td>
            <td>max y</td>
            <td>max z</td>
          </tr>
        </thead>
        <tbody>
          {views.parts.map((part, i) => (
            <tr key={i} className={i === state.part ? "bg-amber-900/40" : ""} onClick={() => propEdit.set({ part: i })}>
              <td className={i === state.part ? "text-amber-300" : "text-sky-300"}>{i}</td>
              {(["min", "max"] as const).flatMap((key) =>
                ([0, 1, 2] as const).map((axis) => <td key={key + axis}>{num(part[key][axis], (v) => setPart(i, key, axis, v))}</td>),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {picked && (
        <div className="flex flex-wrap items-center gap-3 mb-2 border border-amber-800/60 px-2 py-1">
          <span className="text-amber-300">#{state.part}</span>
          <label className="flex items-center gap-1">
            shape
            <select
              value={picked.shape ?? "box"}
              onChange={(e) => {
                picked.shape = e.target.value === "cylinder" ? "cylinder" : undefined;
                changed();
              }}
              className="bg-neutral-800 border border-neutral-700 px-1 py-0.5"
            >
              <option value="box">box</option>
              <option value="cylinder">cylinder</option>
            </select>
          </label>
          <label className="flex items-center gap-1" title="Off: drag it in each view separately - its faces cut from there, wherever it stands">
            <input
              type="checkbox"
              checked={!picked.src}
              onChange={(e) => {
                if (e.target.checked) delete picked.src;
                else picked.src = { front: structuredClone({ min: picked.min, max: picked.max }), side: structuredClone({ min: picked.min, max: picked.max }), top: structuredClone({ min: picked.min, max: picked.max }) };
                changed();
              }}
            />
            views follow the box
          </label>
          <span className="flex items-center gap-2">
            faces
            {FACES.map((f) => (
              <label key={f} className="flex items-center gap-0.5">
                <input
                  type="checkbox"
                  checked={!picked.off?.includes(f)}
                  onChange={(e) => {
                    const off = new Set(picked.off ?? []);
                    if (e.target.checked) off.delete(f);
                    else off.add(f);
                    picked.off = off.size ? FACES.filter((x) => off.has(x)) : undefined;
                    changed();
                  }}
                />
                {f}
              </label>
            ))}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" className="px-2 py-0.5 bg-neutral-800 border border-neutral-600 hover:bg-neutral-700" onClick={addPart}>
          + box (copy of #{state.part})
        </button>
        <button type="button" className="px-2 py-0.5 bg-neutral-800 border border-neutral-600 hover:bg-neutral-700" onClick={removePart}>
          − remove #{state.part}
        </button>
        <span className="text-neutral-400">{status}</span>
      </div>
    </div>
  );
}
