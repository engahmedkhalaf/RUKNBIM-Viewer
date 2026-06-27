/**
 * Makes a panel draggable by a handle. On release, the panel snaps to any
 * viewport edge it's within `snapDistance` pixels of. Position persists in
 * localStorage when `storageKey` is supplied.
 */
export interface DraggableOptions {
  /** Element that captures pointer events for the drag. Defaults to `panel`. */
  handle?: HTMLElement;
  /** localStorage key. Omit to disable persistence. */
  storageKey?: string;
  /** Snap to viewport edges within this many pixels on release. Default 24. */
  snapDistance?: number;
  /** Margin from the viewport edge in pixels. Default 12. */
  margin?: number;
}

const INTERACTIVE_SELECTOR =
  "button, input, select, textarea, a, label, [contenteditable], [data-no-drag]";

export function makeDraggable(panel: HTMLElement, opts: DraggableOptions = {}): void {
  const handle = opts.handle ?? panel;
  const snap = opts.snapDistance ?? 24;
  const margin = opts.margin ?? 12;

  // Visual cue
  handle.style.touchAction = "none";
  if (!handle.style.cursor) handle.style.cursor = "grab";

  // Restore saved position (clamped to current viewport on next frame)
  if (opts.storageKey) {
    try {
      const raw = localStorage.getItem(opts.storageKey);
      if (raw) {
        const { left, top } = JSON.parse(raw);
        if (typeof left === "number" && typeof top === "number") {
          requestAnimationFrame(() => applyPosition(panel, left, top, margin));
        }
      }
    } catch { /* corrupted storage; ignore */ }
  }

  let dragging = false;
  let startX = 0, startY = 0;
  let origLeft = 0, origTop = 0;

  const onDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && target !== handle && target.closest(INTERACTIVE_SELECTOR)) return;
    if (e.button !== 0) return;

    e.preventDefault();
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    handle.style.cursor = "grabbing";

    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    origLeft = rect.left;
    origTop = rect.top;

    // Pin via left/top so dragging works regardless of original right/bottom anchoring
    panel.style.left = `${origLeft}px`;
    panel.style.top = `${origTop}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  };

  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    applyPosition(panel, origLeft + dx, origTop + dy, margin);
  };

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try { handle.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    handle.style.cursor = "grab";

    // Edge snap
    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left;
    let top = rect.top;

    if (left < margin + snap) left = margin;
    else if (vw - (left + rect.width) < margin + snap) left = vw - rect.width - margin;
    if (top < margin + snap) top = margin;
    else if (vh - (top + rect.height) < margin + snap) top = vh - rect.height - margin;

    applyPosition(panel, left, top, margin);

    if (opts.storageKey) {
      const r = panel.getBoundingClientRect();
      try {
        localStorage.setItem(opts.storageKey, JSON.stringify({ left: r.left, top: r.top }));
      } catch { /* quota or disabled */ }
    }
  };

  handle.addEventListener("pointerdown", onDown);
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);

  // Re-clamp on window resize so panels don't end up off-screen
  window.addEventListener("resize", () => {
    const r = panel.getBoundingClientRect();
    applyPosition(panel, r.left, r.top, margin);
  });
}

function applyPosition(panel: HTMLElement, left: number, top: number, margin: number) {
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampedLeft = Math.max(margin, Math.min(left, vw - w - margin));
  const clampedTop = Math.max(margin, Math.min(top, vh - h - margin));
  panel.style.left = `${clampedLeft}px`;
  panel.style.top = `${clampedTop}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
}
