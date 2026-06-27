import './index.css';
import { IFCViewer } from './IFCViewer';
import { LeftRibbonModule } from './LeftRibbonModule';
import { makeDraggable } from './Draggable';
import { makeResizable } from './Resizable';

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('viewer-container') as HTMLDivElement;
  const appContainer = document.getElementById('app') as HTMLDivElement;

  if (container && appContainer) {
    try {
      const viewer = new IFCViewer(container);
      await viewer.init();
      console.log("RUKNBIM application successfully bootstrapped.");

      // Setup Control UI Overlay
      createControlsUI(appContainer, viewer);

      // Left ribbon (Navisworks/Speckle-style)
      const ribbon = new LeftRibbonModule(viewer, appContainer);
      ribbon.mount();

      // Make panels draggable. Each persists its own position in localStorage.
      const controlsCard = appContainer.querySelector(".controls-card") as HTMLElement | null;
      if (controlsCard) makeDraggable(controlsCard, { storageKey: "ruknbim.panel.controls" });

      const propsPanel = appContainer.querySelector(".properties-panel") as HTMLElement | null;
      if (propsPanel) makeDraggable(propsPanel, { storageKey: "ruknbim.panel.props" });

      const perfOverlay = appContainer.querySelector(".performance-overlay") as HTMLElement | null;
      if (perfOverlay) makeDraggable(perfOverlay, { storageKey: "ruknbim.panel.perf" });

      const ribbonRoot = appContainer.querySelector(".left-ribbon-root") as HTMLElement | null;
      if (ribbonRoot) makeDraggable(ribbonRoot, { storageKey: "ruknbim.panel.ribbon" });

      const tableRoot = appContainer.querySelector(".property-table-wrapper") as HTMLElement | null;
      if (tableRoot) {
        const handle = tableRoot.querySelector(".table-header-bar") as HTMLElement | null;
        makeDraggable(tableRoot, { handle: handle ?? undefined, storageKey: "ruknbim.panel.table" });
        makeResizable(tableRoot, { storageKey: "ruknbim.size.table", minWidth: 380, minHeight: 200 });
      }

      if (propsPanel) makeResizable(propsPanel, { storageKey: "ruknbim.size.props", minWidth: 280, minHeight: 240 });

    } catch (error) {
      console.error("Failed to initialize RUKNBIM Viewer:", error);
    }
  } else {
    console.error("Critical Error: Viewport elements not found in DOM.");
  }
});

/**
 * Creates and binds a clean floating control panel for file loading, exporting, and toggling tools.
 */
function createControlsUI(parent: HTMLElement, viewer: IFCViewer): void {
  const controlsCard = document.createElement("div");
  controlsCard.className = "controls-card glass-panel";
  
  Object.assign(controlsCard.style, {
    position: "absolute",
    top: "20px",
    left: "20px",
    width: "320px",
    padding: "16px",
    zIndex: "10",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    pointerEvents: "auto"
  });

  controlsCard.innerHTML = `
    <!-- Header Title -->
    <div style="display: flex; align-items: center; gap: 8px;">
      <i class="fa-solid fa-cube" style="color: var(--primary-purple); font-size: 18px; filter: drop-shadow(0 0 8px var(--primary-purple));"></i>
      <h2 style="font-family: var(--font-title); font-size: 16px; font-weight: 800; letter-spacing: 0.5px; background: var(--rainbow-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">RUKNBIM VIEWER</h2>
    </div>

    <!-- Upload Section -->
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <input type="file" id="file-uploader" accept=".ifc,.frag" multiple style="display: none;" />
      <button id="upload-btn" class="btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; width: 100%;">
        <i class="fa-solid fa-file-import"></i> Load IFC / FRAG Models
      </button>
      <div id="file-name-label" style="font-size: 11px; color: var(--text-muted); text-align: center; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">No model loaded</div>
    </div>

    <!-- Toggle Tools Section -->
    <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border-color); padding-top: 10px;">
      <span style="font-family: var(--font-title); font-weight: 700; font-size: 11px; color: var(--primary-purple); letter-spacing: 0.5px; margin-bottom: 2px;">INTERACTIVE PANELS</span>
      <button id="toggle-table-btn" class="btn-primary" style="padding: 8px; font-size: 11px; background: var(--purple-gradient); color: var(--text-bright); display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%;">
        <i class="fa-solid fa-table"></i> Toggle Properties Table
      </button>
    </div>
  `;

  parent.appendChild(controlsCard);

  // Setup Warning Alerts Banner Container
  const alertsContainer = document.createElement("div");
  alertsContainer.id = "alerts-container";
  Object.assign(alertsContainer.style, {
    position: "absolute",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "480px",
    zIndex: "100",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    pointerEvents: "none"
  });
  parent.appendChild(alertsContainer);

  // Wire file loader triggering
  const uploader = controlsCard.querySelector("#file-uploader") as HTMLInputElement;
  const uploadBtn = controlsCard.querySelector("#upload-btn") as HTMLButtonElement;
  const fileNameLabel = controlsCard.querySelector("#file-name-label") as HTMLDivElement;

  uploadBtn.addEventListener("click", () => uploader.click());

  uploader.addEventListener("change", async () => {
    if (!uploader.files || uploader.files.length === 0) return;
    const files = Array.from(uploader.files);

    uploadBtn.disabled = true;
    uploadBtn.style.opacity = "0.5";

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lower = file.name.toLowerCase();
      fileNameLabel.innerText = `Loading ${i + 1}/${files.length}: ${file.name}`;

      try {
        console.log(`Loading file: ${file.name}`);
        if (lower.endsWith(".ifc")) {
          await viewer.loader.loadIFC(file);
        } else if (lower.endsWith(".frag")) {
          await viewer.loader.loadFrag(file);
        } else {
          throw new Error(`Unsupported extension: ${file.name}`);
        }
        succeeded++;
        console.log(`Loaded: ${file.name}`);
      } catch (err: any) {
        failed++;
        console.error(`Error loading ${file.name}:`, err);
        showAlert(`Error loading ${file.name}: ${err.message || err}`, "danger");
      }
    }

    const loaded = viewer.loader.loadedModels.size;
    fileNameLabel.innerText =
      failed === 0
        ? `${succeeded} file${succeeded === 1 ? "" : "s"} loaded (${loaded} total in scene)`
        : `${succeeded} loaded, ${failed} failed`;

    if (succeeded > 1) {
      showAlert(`Loaded ${succeeded} files successfully.`, "success");
    }

    uploadBtn.disabled = false;
    uploadBtn.style.opacity = "1";
    uploader.value = "";
  });

  // Wire toggle properties table button
  const toggleTableBtn = controlsCard.querySelector("#toggle-table-btn")!;
  let isTableVisible = false;
  toggleTableBtn.addEventListener("click", () => {
    isTableVisible = !isTableVisible;
    viewer.propertyTable.toggle(isTableVisible);
  });

  // Register warnings callbacks in loader module
  viewer.loader.farOriginWarningCallback = (distance) => {
    showAlert(
      `Far-Origin Warning: Bounding box center is ${distance.toFixed(1)}m away. Geometry precision errors (jittering) may occur.`,
      "warning",
      10000 // 10s timeout
    );
  };
}



/**
 * Displays a styled temporary banner notification.
 */
function showAlert(message: string, type: "success" | "warning" | "danger" = "success", duration = 5000): void {
  const container = document.getElementById("alerts-container");
  if (!container) return;

  const alert = document.createElement("div");
  alert.className = "glass-panel always-visible";
  
  let accent = "#15803d";  // success — deep green
  let icon = `<i class="fa-solid fa-circle-check" style="color: ${accent}; font-size: 14px;"></i>`;
  if (type === "warning") {
    accent = "#b45309";    // amber-700, readable on cream
    icon = `<i class="fa-solid fa-triangle-exclamation" style="color: ${accent}; font-size: 14px;"></i>`;
  } else if (type === "danger") {
    accent = "#b91c1c";    // red-700
    icon = `<i class="fa-solid fa-circle-xmark" style="color: ${accent}; font-size: 14px;"></i>`;
  }

  Object.assign(alert.style, {
    padding: "12px 16px",
    borderRadius: "var(--radius-sm)",
    fontSize: "13px",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: "var(--text-main)",
    background: "#ffffff",
    pointerEvents: "auto",
    borderLeft: `4px solid ${accent}`,
    border: "1px solid var(--border-color)",
    borderLeftWidth: "4px",
    borderLeftColor: accent,
    boxShadow: "0 8px 24px -8px rgba(20, 42, 85, 0.30)",
    animation: "fadeIn 0.3s ease-out",
  });

  alert.innerHTML = `${icon} <span style="color: var(--text-main);">${message}</span>`;
  container.appendChild(alert);

  // Fade out and remove
  setTimeout(() => {
    alert.style.transition = "opacity 0.5s ease";
    alert.style.opacity = "0";
    setTimeout(() => {
      if (alert.parentNode) {
        alert.parentNode.removeChild(alert);
      }
    }, 500);
  }, duration);
}
