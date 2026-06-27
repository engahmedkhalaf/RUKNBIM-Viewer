export class PerformanceMonitor {
  private container: HTMLElement;
  private overlay: HTMLDivElement;
  private active = false;

  private lastTime = performance.now();
  private frames = 0;
  
  // UI Display Elements
  private fpsDisplay!: HTMLSpanElement;
  private timeDisplay!: HTMLSpanElement;
  private memoryDisplay!: HTMLSpanElement;
  private memorySection!: HTMLDivElement;

  private animationFrameId: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.overlay = this.createOverlayElement();
  }

  /**
   * Starts monitoring performance (FPS, frame time, memory).
   */
  public start(): void {
    if (this.active) return;
    this.active = true;
    this.container.appendChild(this.overlay);
    this.lastTime = performance.now();
    this.frames = 0;
    this.loop();
  }

  /**
   * Stops monitoring and removes the overlay.
   */
  public stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }

  private loop = (): void => {
    if (!this.active) return;

    this.frames++;
    const now = performance.now();
    const delta = now - this.lastTime;

    // Calculate frame time for the current frame
    const frameTime = delta / this.frames;

    // Update stats once per second
    if (delta >= 1000) {
      const fps = Math.round((this.frames * 1000) / delta);
      this.updateUI(fps, frameTime);
      
      this.frames = 0;
      this.lastTime = now;
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private updateUI(fps: number, frameTime: number): void {
    // 1. Update FPS Display
    this.fpsDisplay.innerText = `${fps} FPS`;
    
    // Color code based on performance
    const statusDot = this.overlay.querySelector(".status-dot") as HTMLDivElement;
    if (statusDot) {
      if (fps >= 50) {
        statusDot.style.background = "var(--primary-purple)";
        this.fpsDisplay.style.color = "var(--primary-purple)";
      } else if (fps >= 30) {
        statusDot.style.background = "#d97706"; // Moderate (Amber)
        this.fpsDisplay.style.color = "#d97706";
      } else {
        statusDot.style.background = "#b91c1c"; // Low (Red)
        this.fpsDisplay.style.color = "#b91c1c";
      }
    }

    // 2. Update Frame Time Display
    this.timeDisplay.innerText = `${frameTime.toFixed(1)} ms`;

    // 3. Update Memory Display (if API is supported)
    const perf = window.performance as any;
    if (perf && perf.memory) {
      const memory = perf.memory;
      const usedMB = (memory.usedJSHeapSize / (1024 * 1024)).toFixed(0);
      const limitMB = (memory.jsHeapLimit / (1024 * 1024)).toFixed(0);
      this.memoryDisplay.innerText = `${usedMB} MB / ${limitMB} MB`;
      this.memorySection.style.display = "flex";
    } else {
      this.memorySection.style.display = "none";
    }
  }

  private createOverlayElement(): HTMLDivElement {
    const overlay = document.createElement("div");
    overlay.className = "performance-overlay glass-panel";
    
    // Style directly to keep modularity, utilizing design system classes
    Object.assign(overlay.style, {
      position: "absolute",
      bottom: "20px",
      right: "20px",
      width: "180px",
      padding: "12px",
      zIndex: "99",
      fontFamily: "var(--font-body)",
      fontSize: "11px",
      pointerEvents: "none",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      userSelect: "none"
    });

    overlay.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-bottom: 2px;">
        <span style="font-family: var(--font-title); font-weight: 700; color: var(--primary-purple); font-size: 12px; letter-spacing: 0.5px;">MONITOR</span>
        <div class="status-dot" style="width: 6px; height: 6px; border-radius: 50%; background: var(--primary-purple); box-shadow: 0 0 8px currentColor; transition: background 0.3s;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: var(--text-muted);">Frame Rate:</span>
        <span class="perf-fps-val" style="font-weight: 600; color: var(--text-main);">0 FPS</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: var(--text-muted);">Frame Time:</span>
        <span class="perf-time-val" style="font-weight: 600; color: var(--text-main);">0 ms</span>
      </div>
      <div class="perf-mem-section" style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: var(--text-muted);">Memory (Heap):</span>
        <span class="perf-mem-val" style="font-weight: 600; color: var(--text-main);">N/A</span>
      </div>
    `;

    this.fpsDisplay = overlay.querySelector(".perf-fps-val")!;
    this.timeDisplay = overlay.querySelector(".perf-time-val")!;
    this.memoryDisplay = overlay.querySelector(".perf-mem-val")!;
    this.memorySection = overlay.querySelector(".perf-mem-section")!;

    return overlay;
  }
}
