import * as OBC from "@thatopen/components";
import { SelectionManager } from "./SelectionManager";
import { TreeManager } from "./TreeManager";
import { PropertyDisplayManager } from "./PropertyDisplayManager";
import { StoreyDataManager } from "./StoreyDataManager";
import type { StoreyInfo } from "./StoreyDataManager";
import { GhostModeManager } from "./GhostModeManager";

export class PropertiesPanelModule {
  private components: OBC.Components;
  private container: HTMLElement;
  
  public selectionManager: SelectionManager;
  public treeManager: TreeManager;
  public propertyDisplayManager: PropertyDisplayManager;
  public storeyDataManager: StoreyDataManager;
  public ghostModeManager: GhostModeManager;

  // DOM Elements
  private panelEl!: HTMLDivElement;
  private storeyListEl!: HTMLDivElement;
  
  private activeModelId: string | null = null;
  private activeElementId: number | null = null;

  constructor(components: OBC.Components, container: HTMLElement) {
    this.components = components;
    this.container = container;
    
    // Create UI Panel
    this.createPanelDOM();

    // Initialize sub-managers
    this.selectionManager = new SelectionManager(components);
    this.treeManager = new TreeManager(this.panelEl.querySelector("#tree-tab-pane")!);
    this.propertyDisplayManager = new PropertyDisplayManager(this.panelEl.querySelector("#props-tab-pane")!);
    this.storeyDataManager = new StoreyDataManager(components);
    this.ghostModeManager = new GhostModeManager(components);
  }

  /**
   * Initializes all sub-managers and registers events.
   */
  public init(world: OBC.World, loader: any): void {
    this.selectionManager.init(world);
    this.ghostModeManager.init();
    this.wireExportTools(loader);

    // Bind selection changed event
    this.selectionManager.onSelectionChanged = async (modelId, elementId, source) => {
      this.activeModelId = modelId;
      this.activeElementId = elementId;

      const fragmentsManager = this.components.get(OBC.FragmentsManager);
      const model: any = fragmentsManager.list.get(modelId);
      if (model) {
        try {
          const itemsData = await model.getItemsData([elementId], {
            attributesDefault: true,
            relationsDefault: { attributes: true, relations: false },
          });
          let itemData: any = Array.isArray(itemsData) ? itemsData[0] : undefined;
          if (!itemData && typeof model.getItems === "function") {
            const raw = await model.getItems([elementId]);
            itemData = raw?.get?.(elementId);
          }
          this.propertyDisplayManager.render(elementId, itemData);
          // Only auto-switch to PROPS on explicit user intent (right-click / tree click)
          if (source === "contextmenu" || source === "tree") {
            this.switchTab("props");
          }
        } catch (e) {
          console.error("Error loading properties for element:", elementId, e);
        }
      }

      if (this.ghostModeManager.isEnabled) {
        await this.ghostModeManager.applyGhosting(modelId, elementId);
      }
    };

    // Bind selection cleared event
    this.selectionManager.onSelectionCleared = () => {
      this.activeModelId = null;
      this.activeElementId = null;
      this.propertyDisplayManager.clear();
      this.ghostModeManager.clearGhosting();
    };

    // Tree clicks → select element AND open PROPS pane
    this.treeManager.onNodeClicked((modelId, elementId) => {
      this.selectionManager.selectElement(modelId, elementId, true, "tree");
    });
  }

  /**
   * Sets the active model to populate the tree and storey data.
   */
  public async setActiveModel(modelId: string, model: any): Promise<void> {
    this.activeModelId = modelId;
    this.clearUI();

    // 1. Load spatial tree
    try {
      const spatialTree = await model.getSpatialStructure();
      if (spatialTree) {
        this.treeManager.render(modelId, spatialTree, model);
        
        // 2. Load storey data
        const storeys = await this.storeyDataManager.getStoreys(modelId, model, spatialTree);
        this.renderStoreysList(modelId, storeys);
      }
    } catch (e) {
      console.error("Error populating model properties panel data:", e);
    }
  }

  /**
   * Clears the UI states.
   */
  public clearUI(): void {
    this.treeManager.clear();
    this.propertyDisplayManager.clear();
    this.storeyListEl.innerHTML = `
      <div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 20px; font-size: 13px;">
        No storey data found.
      </div>
    `;
    this.activeModelId = null;
    this.activeElementId = null;
  }

  private createPanelDOM(): void {
    const panel = document.createElement("div");
    panel.className = "properties-panel glass-panel";
    
    // Position panel on the right side of the screen
    Object.assign(panel.style, {
      position: "absolute",
      top: "20px",
      right: "20px",
      bottom: "100px", // leave space for bottom toolbar
      width: "390px",
      zIndex: "10",
      display: "flex",
      flexDirection: "column",
      pointerEvents: "auto",
      overflow: "hidden"
    });

    panel.innerHTML = `
      <!-- Tab Headers -->
      <div class="panel-tabs" style="display: flex; border-bottom: 1px solid var(--border-color); background: rgba(31, 58, 110, 0.05);">
        <button class="tab-btn active-tab" data-tab="tree" style="flex: 1; padding: 12px 4px; font-family: var(--font-title); font-size: 11px; font-weight: 700; color: var(--primary-purple); text-align: center; border-bottom: 2px solid var(--primary-purple); letter-spacing: 0.5px;">
          <i class="fa-solid fa-folder-tree" style="margin-right: 4px;"></i> TREE
        </button>
        <button class="tab-btn" data-tab="props" style="flex: 1; padding: 12px 4px; font-family: var(--font-title); font-size: 11px; font-weight: 700; color: var(--text-muted); text-align: center; border-bottom: 2px solid transparent; letter-spacing: 0.5px;">
          <i class="fa-solid fa-circle-info" style="margin-right: 4px;"></i> PROPS
        </button>
        <button class="tab-btn" data-tab="storeys" style="flex: 1; padding: 12px 4px; font-family: var(--font-title); font-size: 11px; font-weight: 700; color: var(--text-muted); text-align: center; border-bottom: 2px solid transparent; letter-spacing: 0.5px;">
          <i class="fa-solid fa-layer-group" style="margin-right: 4px;"></i> LEVELS
        </button>
        <button class="tab-btn" data-tab="ghost" style="flex: 1; padding: 12px 4px; font-family: var(--font-title); font-size: 11px; font-weight: 700; color: var(--text-muted); text-align: center; border-bottom: 2px solid transparent; letter-spacing: 0.5px;">
          <i class="fa-solid fa-ghost" style="margin-right: 4px;"></i> GHOST
        </button>
        <button class="tab-btn" data-tab="export" style="flex: 1; padding: 12px 4px; font-family: var(--font-title); font-size: 11px; font-weight: 700; color: var(--text-muted); text-align: center; border-bottom: 2px solid transparent; letter-spacing: 0.5px;">
          <i class="fa-solid fa-camera" style="margin-right: 4px;"></i> EXPORT
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="panel-content" style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
        <div id="tree-tab-pane" class="tab-pane" style="display: block;">
          <div class="empty-state" style="color: var(--text-muted); font-style: italic; text-align: center; padding: 24px; font-size: 12px;">
            Load a model to see the IFC hierarchy.
          </div>
        </div>
        <div id="props-tab-pane" class="tab-pane" style="display: none;">
          <div class="empty-state" style="color: var(--text-muted); font-style: italic; text-align: center; padding: 24px; font-size: 12px;">
            Select an element in the tree or 3D view to inspect its properties.
          </div>
        </div>

        <div id="storeys-tab-pane" class="tab-pane" style="display: none; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
            <button id="reset-storey-visibility" class="btn-primary" style="padding: 6px 12px; font-size: 11px; background: #ffffff; color: var(--primary-purple); box-shadow: none; border: 1.5px solid var(--primary-purple);">
              <i class="fa-solid fa-eye" style="margin-right: 4px;"></i> Show All
            </button>
          </div>
          <div id="storeys-list" style="display: flex; flex-direction: column; gap: 8px;">
            <div class="empty-state" style="color: var(--text-muted); font-style: italic; text-align: center; padding: 20px; font-size: 12px;">
              Load a model to see its levels.
            </div>
          </div>
        </div>
        
        <div id="ghost-tab-pane" class="tab-pane" style="display: none; flex-direction: column; gap: 12px;">
          <h4 style="font-size: 13px; color: var(--primary-purple); margin-bottom: 6px; font-family: var(--font-title);">Ghost Mode</h4>
          <p style="font-size: 12px; color: var(--text-muted); line-height: 1.4; margin-bottom: 8px;">
            Enabling Ghost Mode renders all unselected elements as semi-transparent gray, letting you see selected components in their spatial context.
          </p>
          <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-hover); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <span style="font-size: 12px; font-weight: 500; color: var(--text-main);">Enable Ghost Mode</span>
            <input type="checkbox" id="ghost-mode-toggle" style="width: 18px; height: 18px; accent-color: var(--primary-purple); cursor: pointer;" />
          </div>
        </div>

        <div id="export-tab-pane" class="tab-pane" style="display: none; flex-direction: column; gap: 12px;">
          <h4 style="font-size: 13px; color: var(--primary-purple); margin-bottom: 6px; font-family: var(--font-title);">Export Tools</h4>
          <p style="font-size: 11px; color: var(--text-muted); line-height: 1.4; display: block; padding-bottom: 6px;">
            Export the loaded model's geometry and parameters, or capture a PNG snapshot of the 3D canvas.
          </p>

          <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border-color); padding-top: 10px;">
            <span style="font-family: var(--font-title); font-weight: 700; font-size: 11px; color: var(--text-muted); letter-spacing: 0.5px; margin-bottom: 4px;">GEOMETRY EXPORTS</span>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
              <button class="export-btn btn-primary" data-format="frag" style="padding: 8px; font-size: 11px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); box-shadow: none; display: flex; align-items: center; justify-content: center; gap: 4px;">
                <i class="fa-solid fa-download"></i> .frag
              </button>
              <button class="export-btn btn-primary" data-format="gltf" style="padding: 8px; font-size: 11px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); box-shadow: none; display: flex; align-items: center; justify-content: center; gap: 4px;">
                <i class="fa-solid fa-download"></i> .gltf
              </button>
              <button class="export-btn btn-primary" data-format="glb" style="padding: 8px; font-size: 11px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); box-shadow: none; display: flex; align-items: center; justify-content: center; gap: 4px;">
                <i class="fa-solid fa-download"></i> .glb
              </button>
              <button class="export-btn btn-primary" data-format="usdz" style="padding: 8px; font-size: 11px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); box-shadow: none; display: flex; align-items: center; justify-content: center; gap: 4px;">
                <i class="fa-solid fa-download"></i> .usdz
              </button>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border-color); padding-top: 10px;">
            <span style="font-family: var(--font-title); font-weight: 700; font-size: 11px; color: var(--text-muted); letter-spacing: 0.5px; margin-bottom: 4px;">DATA & MEDIA</span>
            <button class="export-btn btn-primary" data-format="json" style="padding: 8px; font-size: 11px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); box-shadow: none; display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%;">
              <i class="fa-solid fa-file-lines"></i> Export JSON Properties
            </button>
            <button id="panel-screenshot-btn" class="btn-primary" style="padding: 8px; font-size: 11px; background: var(--purple-gradient); color: var(--text-bright); display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; margin-top: 4px;">
              <i class="fa-solid fa-camera"></i> Take PNG Screenshot
            </button>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(panel);
    this.panelEl = panel;
    this.storeyListEl = panel.querySelector("#storeys-list")!;

    // Bind tab button click listeners
    const tabBtns = panel.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const tabName = btn.getAttribute("data-tab")!;
        this.switchTab(tabName);
      });
    });

    // Bind storey show all click
    const showAllBtn = panel.querySelector("#reset-storey-visibility")!;
    showAllBtn.addEventListener("click", async () => {
      await this.storeyDataManager.resetVisibility();
      showAllBtn.classList.add("disabled-btn"); // visual feedback
    });

    // Bind ghost mode toggle checkbox
    const ghostToggle = panel.querySelector("#ghost-mode-toggle") as HTMLInputElement;
    ghostToggle.addEventListener("change", () => {
      const active = ghostToggle.checked;
      this.ghostModeManager.setEnabled(active, this.activeModelId || undefined, this.activeElementId || undefined);
    });
  }

  private switchTab(tabName: string): void {
    const buttons = this.panelEl.querySelectorAll(".tab-btn");
    buttons.forEach(btn => {
      const bTab = btn.getAttribute("data-tab");
      if (bTab === tabName) {
        btn.classList.add("active-tab");
        Object.assign((btn as HTMLElement).style, {
          color: "var(--primary-purple)",
          background: "rgba(31, 58, 110, 0.10)",
          borderBottom: "3px solid var(--primary-purple)",
        });
      } else {
        btn.classList.remove("active-tab");
        Object.assign((btn as HTMLElement).style, {
          color: "var(--text-muted)",
          background: "transparent",
          borderBottom: "3px solid transparent",
        });
      }
    });

    // Toggle panes display
    const panes = this.panelEl.querySelectorAll(".tab-pane");
    panes.forEach(pane => {
      const id = pane.getAttribute("id")!;
      if (id === `${tabName}-tab-pane`) {
        if (tabName === "storeys" || tabName === "ghost" || tabName === "export") {
          (pane as HTMLElement).style.display = "flex";
        } else {
          (pane as HTMLElement).style.display = "block";
        }
      } else {
        (pane as HTMLElement).style.display = "none";
      }
    });
  }

  private renderStoreysList(modelId: string, storeys: StoreyInfo[]): void {
    if (storeys.length === 0) {
      this.storeyListEl.innerHTML = `
        <div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 20px; font-size: 13px;">
          No storey data found.
        </div>
      `;
      return;
    }

    this.storeyListEl.innerHTML = "";

    storeys.forEach(storey => {
      const storeyItem = document.createElement("div");
      storeyItem.className = "storey-item glass-panel";
      
      Object.assign(storeyItem.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        background: "rgba(31, 58, 110, 0.06)",
        border: "1px solid var(--border-color)",
        transition: "border-color var(--transition-fast)"
      });

      storeyItem.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span style="font-size: 12px; font-weight: 600; color: var(--primary-purple);">${storey.name}</span>
          <span style="font-size: 10px; color: var(--text-muted);">Elevation: ${storey.elevation.toFixed(2)}m (${storey.elementIds.length} items)</span>
        </div>
        <button class="btn-primary isolate-btn" style="padding: 5px 10px; font-size: 10px; font-family: var(--font-title); font-weight: 700; border-radius: var(--radius-xs); border: 1px solid var(--primary-purple); box-shadow: none;">
          Isolate
        </button>
      `;

      // Isolate button listener
      const isolateBtn = storeyItem.querySelector(".isolate-btn")!;
      isolateBtn.addEventListener("click", async () => {
        await this.storeyDataManager.isolateStorey(modelId, storey.elementIds);
      });

      this.storeyListEl.appendChild(storeyItem);
    });
  }

  private wireExportTools(loader: any): void {
    const pane = this.panelEl.querySelector("#export-tab-pane")!;
    if (!pane) return;

    const exportBtns = pane.querySelectorAll(".export-btn");
    exportBtns.forEach(btn => {
      btn.addEventListener("click", async () => {
        if (loader.loadedModels.size === 0) {
          alert("Please load an IFC or FRAG model first.");
          return;
        }

        // Grab first active model
        const model = Array.from(loader.loadedModels.values())[0] as any;
        const format = btn.getAttribute("data-format");
        const modelName = model.name || "model";

        btn.setAttribute("disabled", "true");
        const oldHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

        try {
          if (format === "frag") {
            const buffer = await loader.exportToFrag(model);
            this.downloadFile(buffer, `${modelName}.frag`, "application/octet-stream");
          } else if (format === "gltf") {
            const text = await loader.exportToGLTF(model);
            this.downloadFile(text, `${modelName}.gltf`, "application/json");
          } else if (format === "glb") {
            const buffer = await loader.exportToGLB(model);
            this.downloadFile(buffer, `${modelName}.glb`, "application/octet-stream");
          } else if (format === "usdz") {
            const buffer = await loader.exportToUSDZ(model);
            this.downloadFile(buffer, `${modelName}.usdz`, "application/octet-stream");
          } else if (format === "json") {
            const text = await loader.exportToJSONProperties(model);
            this.downloadFile(text, `${modelName}_properties.json`, "application/json");
          }
        } catch (err: any) {
          console.error(`Export to .${format} failed:`, err);
          alert(`Export failed: ${err.message || err}`);
        } finally {
          btn.removeAttribute("disabled");
          btn.innerHTML = oldHtml;
        }
      });
    });

    const screenshotBtn = pane.querySelector("#panel-screenshot-btn")!;
    screenshotBtn.addEventListener("click", () => {
      if (loader.loadedModels.size === 0) {
        alert("Please load a model to take a screenshot.");
        return;
      }
      try {
        const dataUrl = loader.takeScreenshot();
        this.downloadFile(dataUrl, "ruknbim_screenshot.png", "image/png");
      } catch (e: any) {
        alert(`Screenshot failed: ${e.message || e}`);
      }
    });
  }

  private downloadFile(data: string | ArrayBuffer, filename: string, mimeType: string): void {
    let blob: Blob;
    if (typeof data === "string") {
      if (data.startsWith("data:image/png;base64,")) {
        const link = document.createElement("a");
        link.href = data;
        link.download = filename;
        link.click();
        return;
      }
      blob = new Blob([data], { type: mimeType });
    } else {
      blob = new Blob([data], { type: mimeType });
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
