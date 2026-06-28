import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import { ViewerInitializer } from "./ViewerInitializer";
import { IFCLoaderModule } from "./IFCLoaderModule";
import { PerformanceMonitor } from "./PerformanceMonitor";
import { PropertiesPanelModule } from "./PropertiesPanelModule";
import { PropertyTableModule } from "./PropertyTableModule";

export class IFCViewer {
  public components: OBC.Components;
  public container: HTMLDivElement;
  private _isInitialized = false;

  // World and renderer references
  public world!: OBC.SimpleWorld<OBC.ShadowedScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>;

  // Feature Modules
  public loader!: IFCLoaderModule;
  public performanceMonitor!: PerformanceMonitor;
  public propertiesPanel!: PropertiesPanelModule;
  public propertyTable!: PropertyTableModule;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.components = new OBC.Components();
    
    console.log("RUKNBIM IFCViewer Instantiated.");
  }

  /**
   * Initializes the core 3D viewer components, registers feature modules, and starts loops.
   */
  public async init(): Promise<void> {
    if (this._isInitialized) return;
    
    console.log("Initializing RUKNBIM Viewer world...");
    
    // 1. Initialize the 3D world (Scene, Camera, Renderer, Lighting, Shadows, Grids)
    this.world = ViewerInitializer.initWorld(this.components, this.container);

    // 2. Initialize the IFC/Fragments loader module
    this.loader = new IFCLoaderModule(this.components, this.world);
    await this.loader.init();

    // 3. Initialize the performance monitoring overlay
    this.performanceMonitor = new PerformanceMonitor(this.container);
    this.performanceMonitor.start();

    // 4. Initialize the property inspection panel UI (Tree, attributes, storeys, ghost mode)
    this.propertiesPanel = new PropertiesPanelModule(this.components, this.container);
    this.propertiesPanel.init(this.world, this.loader);

    // 5. Initialize the spreadsheet element property table UI
    this.propertyTable = new PropertyTableModule(this.container, this.propertiesPanel.selectionManager);

    // 6. Bind loader events to UI panels
    this.setupIntegrationEvents();

    // 7. Bind double middle-click (wheel double-click) to zoom extents
    this.bindMiddleDoubleClick();

    this._isInitialized = true;
    console.log("RUKNBIM Viewer fully initialized.");
  }

  /**
   * Disposes of the viewer and all related modules.
   */
  public async dispose(): Promise<void> {
    if (!this._isInitialized) return;
    
    this.performanceMonitor.stop();
    this.loader.clearAll();
    
    await this.components.dispose();
    this._isInitialized = false;
    console.log("RUKNBIM Viewer disposed.");
  }

  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  // --- Event Wireup & Integration ---

  private setupIntegrationEvents(): void {
    // Direct callback: fires for both IFC and FRAG loads (FragmentsManager's
    // own event only triggers from one code path and is unreliable here).
    this.loader.onModelLoaded = async (modelId, model) => {
      console.log(`[Integration] Model loaded: ${modelId}. Populating UI...`);
      await this.propertiesPanel.setActiveModel(modelId, model);
      await this.propertyTable.loadModelData(modelId, model);
    };

    // When the selection clears, reset the tree highlight and clear properties
    this.propertiesPanel.selectionManager.onSelectionCleared = () => {
      this.propertiesPanel.propertyDisplayManager.clear();
      this.propertiesPanel.ghostModeManager.clearGhosting();
      // Additional actions on selection cleared can be wired here
    };
  }

  private bindMiddleDoubleClick(): void {
    const canvas = this.container.querySelector("canvas");
    if (!canvas) return;

    let lastMiddleClickTime = 0;
    canvas.addEventListener("mousedown", async (e: MouseEvent) => {
      if (e.button === 1) { // Middle mouse button (scroll wheel click)
        e.preventDefault();
        const now = performance.now();
        if (now - lastMiddleClickTime < 300) { // 300ms double-click window
          console.log("[Viewer] Middle mouse double-click detected. Zooming to extents...");
          await this.loader.zoomExtents();
        }
        lastMiddleClickTime = now;
      }
    });

    // Prevent default quick-scroll overlay when clicking scroll wheel on Windows browsers
    canvas.addEventListener("click", (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    });
  }
}
