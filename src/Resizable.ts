/**
 * Adds resize handles to an absolutely-positioned panel. Handles are invisible
 * but show the appropriate cursor on hover. Size persists in localStorage.
 */
export interface ResizableOptions {
  storageKey?: string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  edges?: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean };
}

type Edge = "t" | "r" | "b" | "l" | "tr" | "br" | "bl" | "tl";

const CURSOR: Record<Edge, string> = {
  t: "ns-resize",
  b: "ns-resize",
  l: "ew-resize",
  r: "ew-resize",
  tr: "nesw-resize",
  br: "nwse-resize",
  bl: "nesw-resize",
  tl: "nwse-resize",
};

const EDGE_THICKNESS = 8;
const CORNER_SIZE = 14;

export function makeResizable(panel: HTMLElement, opts: ResizableOptions = {}): void {
  const minW = opts.minWidth ?? 240;
  const minH = opts.minHeight ?? 140;
  const maxW = opts.maxWidth ?? Infinity;
  const maxH = opts.maxHeight ?? Infinity;
  const enabled = opts.edges ?? { top: true, right: true, bottom: true, left: true };

  // Pin explicit width/height so resize math works regardless of right/bottom anchoring.
  const pinSize = () => {
    const r = panel.getBoundingClientRect();
    if (!panel.style.width || panel.style.width === "auto") panel.style.width = `${r.width}px`;
    if (!panel.style.height || panel.style.height === "auto") panel.style.height = `${r.height}px`;
    if (!panel.style.left || panel.style.left === "auto") panel.style.left = `${r.left}px`;
    if (!panel.style.top || panel.style.top === "auto") panel.style.top = `${r.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  };

  // Restore saved size. Defer to next frame because the panel may not be in DOM yet.
  if (opts.storageKey) {
    requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(opts.storageKey!);
        if (raw) {
          const { width, height } = JSON.parse(raw);
          if (typeof width === "number") panel.style.width = `${clamp(width, minW, maxW)}px`;
          if (typeof height === "number") panel.style.height = `${clamp(height, minH, maxH)}px`;
        }
      } catch { /* ignore */ }
    });
  }

  const edges: Edge[] = [];
  if (enabled.top) edges.push("t");
  if (enabled.right) edges.push("r");
  if (enabled.bottom) edges.push("b");
  if (enabled.left) edges.push("l");
  if (enabled.top && enabled.right) edges.push("tr");
  if (enabled.bottom && enabled.right) edges.push("br");
  if (enabled.bottom && enabled.left) edges.push("bl");
  if (enabled.top && enabled.left) edges.push("tl");

  for (const e of edges) panel.appendChild(buildHandle(e, panel, () => {
    pinSize();
    return {
      onResize: (rect) => {
        const w = clamp(rect.width, minW, maxW);
        const h = clamp(rect.height, minH, maxH);
        panel.style.width = `${w}px`;
        panel.style.height = `${h}px`;
        if (rect.leftChanged) panel.style.left = `${rect.left}px`;
        if (rect.topChanged) panel.style.top = `${rect.top}px`;
      },
      onRelease: () => {
        if (!opts.storageKey) return;
        try {
          localStorage.setItem(opts.storageKey, JSON.stringify({
            width: panel.offsetWidth,
            height: panel.offsetHeight,
          }));
        } catch { /* ignore */ }
      },
    };
  }));
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

interface ResizeContext {
  onResize: (rect: { width: number; height: number; left: number; top: number; leftChanged: boolean; topChanged: boolean }) => void;
  onRelease: () => void;
}

function buildHandle(edge: Edge, panel: HTMLElement, startSession: () => ResizeContext): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `resize-handle resize-${edge}`;
  Object.assign(el.style, baseHandleStyle(edge));
  el.style.cursor = CURSOR[edge];

  let active = false;
  let startX = 0, startY = 0;
  let origLeft = 0, origTop = 0, origW = 0, origH = 0;
  let ctx: ResizeContext | null = null;

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    active = true;
    el.setPointerCapture(e.pointerId);
    ctx = startSession();
    const r = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    origLeft = r.left;
    origTop = r.top;
    origW = r.width;
    origH = r.height;
  });

  el.addEventListener("pointermove", (e) => {
    if (!active || !ctx) return;
    e.preventDefault();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const next = compute(edge, origLeft, origTop, origW, origH, dx, dy);
    ctx.onResize(next);
  });

  const end = (e: PointerEvent) => {
    if (!active) return;
    active = false;
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    ctx?.onRelease();
    ctx = null;
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  return el;
}

function compute(edge: Edge, l: number, t: number, w: number, h: number, dx: number, dy: number) {
  let left = l, top = t, width = w, height = h;
  let leftChanged = false, topChanged = false;
  if (edge.includes("r")) width = w + dx;
  if (edge.includes("b")) height = h + dy;
  if (edge.includes("l")) { left = l + dx; width = w - dx; leftChanged = true; }
  if (edge.includes("t")) { top = t + dy; height = h - dy; topChanged = true; }
  return { left, top, width, height, leftChanged, topChanged };
}

function baseHandleStyle(edge: Edge): Partial<CSSStyleDeclaration> {
  const s: Partial<CSSStyleDeclaration> = {
    position: "absolute",
    background: "transparent",
    zIndex: "5",
    userSelect: "none",
    touchAction: "none",
  };
  switch (edge) {
    case "t": Object.assign(s, { top: "0", left: "0", right: "0", height: `${EDGE_THICKNESS}px` }); break;
    case "b": Object.assign(s, { bottom: "0", left: "0", right: "0", height: `${EDGE_THICKNESS}px` }); break;
    case "l": Object.assign(s, { top: "0", bottom: "0", left: "0", width: `${EDGE_THICKNESS}px` }); break;
    case "r": Object.assign(s, { top: "0", bottom: "0", right: "0", width: `${EDGE_THICKNESS}px` }); break;
    case "tr": Object.assign(s, { top: "0", right: "0", width: `${CORNER_SIZE}px`, height: `${CORNER_SIZE}px` }); break;
    case "br": Object.assign(s, { bottom: "0", right: "0", width: `${CORNER_SIZE}px`, height: `${CORNER_SIZE}px` }); break;
    case "bl": Object.assign(s, { bottom: "0", left: "0", width: `${CORNER_SIZE}px`, height: `${CORNER_SIZE}px` }); break;
    case "tl": Object.assign(s, { top: "0", left: "0", width: `${CORNER_SIZE}px`, height: `${CORNER_SIZE}px` }); break;
  }
  return s;
}
