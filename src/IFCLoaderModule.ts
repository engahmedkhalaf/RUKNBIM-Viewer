import * as OBC from "@thatopen/components";
import * as THREE from "three";
import { LogLevel } from "web-ifc";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";

// Web-ifc emits these to console.log directly during conversion; users can't
// act on them and they drown out actual signal. Suppress at the console level.
const SUPPRESSED_PATTERNS = [
  /^Zero length geometry/i,
  /^Object \d+ is more than \d+ meters away from the origin/i,
];
let consoleFilterInstalled = false;
function installConsoleFilter() {
  if (consoleFilterInstalled) return;
  consoleFilterInstalled = true;
  const wrap = (method: "log" | "warn" | "info") => {
    const orig = console[method].bind(console);
    console[method] = (...args: any[]) => {
      const first = args[0];
      if (typeof first === "string" && SUPPRESSED_PATTERNS.some((re) => re.test(first))) return;
      orig(...args);
    };
  };
  wrap("log");
  wrap("warn");
  wrap("info");
}

export class IFCLoaderModule {
  private world: OBC.World;
  private ifcLoader: OBC.IfcLoader;
  private fragmentsManager: OBC.FragmentsManager;
  
  public loadedModels: Map<string, any> = new Map();
  public farOriginWarningCallback?: (distance: number) => void;
  public onModelLoaded?: (modelId: string, model: any) => void | Promise<void>;

  constructor(components: OBC.Components, world: OBC.World) {
    this.world = world;
    this.ifcLoader = components.get(OBC.IfcLoader);
    this.fragmentsManager = components.get(OBC.FragmentsManager);
  }

  /**
   * Initializes the IFC loader settings and web-ifc WASM configuration.
   */
  public async init(): Promise<void> {
    // Set up local web-ifc WASM path served from public folder.
    // Must disable autoSetWasm; otherwise setup() overrides path with a broken
    // unpkg URL built from the semver range in peerDependencies.
    installConsoleFilter();

    await this.ifcLoader.setup({
      autoSetWasm: false,
      wasm: {
        path: window.location.origin + "/",
        absolute: true,
        logLevel: LogLevel.LOG_LEVEL_OFF,
      },
      webIfc: {
        COORDINATE_TO_ORIGIN: true,
      }
    });

    // Initialize the fragments manager with our local web worker
    const workerUrl = window.location.origin + "/worker.mjs";
    this.fragmentsManager.init(workerUrl);

    // Fragments 3.x needs camera updates to recompute LOD/culling.
    const camControls: any = (this.world as any).camera?.controls;
    if (camControls?.addEventListener) {
      camControls.addEventListener("rest", () => {
        this.fragmentsManager.core.update(true);
      });
      camControls.addEventListener("update", () => {
        this.fragmentsManager.core.update();
      });
    }

    // Refresh on projection changes (ortho/perspective swap re-creates camera)
    const cam: any = (this.world as any).camera;
    if (cam?.projection?.onChanged?.add) {
      cam.projection.onChanged.add(() => {
        for (const model of this.loadedModels.values()) {
          if (typeof model.useCamera === "function" && cam.three) {
            model.useCamera(cam.three);
          }
        }
        this.fragmentsManager.core.update(true);
      });
    }

    console.log("RUKNBIM IFCLoaderModule initialized.");
  }

  /**
   * Wires a freshly loaded model to the active camera and pushes it to GPU.
   * Without this, fragments 3.x models load metadata but render no geometry.
   */
  private async attachModelToScene(model: any): Promise<void> {
    const cam: any = (this.world as any).camera;
    const cameraThree = cam?.three;
    if (cameraThree && typeof model.useCamera === "function") {
      model.useCamera(cameraThree);
    }
    if (model.object) {
      this.world.scene.three.add(model.object);
    }
    await this.fragmentsManager.core.update(true);
  }

  /**
   * Loads an IFC file, converts it to fragments, and adds it to the scene.
   */
  public async loadIFC(file: File): Promise<any> {
    const data = await this.readFileAsArrayBuffer(file);
    const uint8Array = new Uint8Array(data);

    // Perform loading
    // load(data, coordinate, name, config)
    const model = await this.ifcLoader.load(uint8Array, true, file.name);

    this.loadedModels.set(model.modelId, model);
    await this.attachModelToScene(model);
    await this.checkFarOrigin(model);
    await this.fitCameraToModel(model);

    if (this.onModelLoaded) await this.onModelLoaded(model.modelId, model);

    return model;
  }

  /**
   * Loads a pre-converted .frag file directly.
   */
  public async loadFrag(file: File): Promise<any> {
    const buffer = await this.readFileAsArrayBuffer(file);
    const uint8Array = new Uint8Array(buffer);

    const modelId = crypto.randomUUID();
    const model = await this.fragmentsManager.core.load(uint8Array, {
      modelId: modelId,
    });

    this.loadedModels.set(model.modelId, model);
    await this.attachModelToScene(model);
    await this.checkFarOrigin(model);
    await this.fitCameraToModel(model);

    if (this.onModelLoaded) await this.onModelLoaded(model.modelId, model);

    return model;
  }

  /**
   * Frames the camera on a loaded model.
   */
  private async fitCameraToModel(model: any): Promise<void> {
    const cam: any = (this.world as any).camera;
    if (!cam?.controls) return;

    let box: THREE.Box3 | undefined = model?.box;
    if (!box) {
      const obj = model?.object as THREE.Object3D | undefined;
      if (!obj) return;
      box = new THREE.Box3().setFromObject(obj);
    }
    if (box.isEmpty()) return;

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    if (sphere.radius === 0) return;

    if (typeof cam.controls.fitToSphere === "function") {
      await cam.controls.fitToSphere(sphere, true);
    } else if (typeof cam.controls.fitToBox === "function") {
      await cam.controls.fitToBox(box, true);
    } else {
      const r = sphere.radius;
      const c = sphere.center;
      cam.controls.setLookAt(
        c.x + r * 1.5, c.y + r * 1.5, c.z + r * 1.5,
        c.x, c.y, c.z,
        true,
      );
    }
  }

  /**
   * Exports the given model to a .frag file.
   */
  public async exportToFrag(model: any): Promise<ArrayBuffer> {
    if (!model || typeof model.getBuffer !== "function") {
      throw new Error("Invalid model: Cannot export to FRAG.");
    }
    return await model.getBuffer();
  }

  /**
   * Exports the given model to a .gltf file (text JSON representation).
   */
  public exportToGLTF(model: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const exporter = new GLTFExporter();
      exporter.parse(
        model.object,
        (gltf) => {
          resolve(JSON.stringify(gltf, null, 2));
        },
        (error) => {
          reject(error);
        },
        { binary: false }
      );
    });
  }

  /**
   * Exports the given model to a .glb file (binary representation).
   */
  public exportToGLB(model: any): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const exporter = new GLTFExporter();
      exporter.parse(
        model.object,
        (gltf) => {
          const raw = gltf as any;
          if (raw.buffer instanceof ArrayBuffer) {
            resolve(raw.buffer);
          } else {
            resolve(raw as ArrayBuffer);
          }
        },
        (error) => {
          reject(error);
        },
        { binary: true }
      );
    });
  }

  /**
   * Exports the given model to a .usdz file.
   */
  public exportToUSDZ(model: any): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const exporter = new USDZExporter();
      exporter.parse(
        model.object,
        (usdz) => {
          const raw = usdz as any;
          resolve(raw.buffer as ArrayBuffer);
        },
        (error) => {
          reject(error);
        }
      );
    });
  }

  /**
   * Exports the model's metadata and element properties as a JSON string.
   */
  public async exportToJSONProperties(model: any): Promise<string> {
    if (!model || typeof model.getItems !== "function") {
      throw new Error("Invalid model: Cannot retrieve properties.");
    }

    const itemsMap = await model.getItems();
    const propertiesObj: Record<string, any> = {};

    for (const [id, item] of itemsMap.entries()) {
      propertiesObj[id.toString()] = {
        category: item.category,
        guid: item.guid,
        data: item.data
      };
    }

    return JSON.stringify(propertiesObj, null, 2);
  }

  /**
   * Takes a PNG screenshot from the active viewer renderer.
   */
  public takeScreenshot(): string {
    const renderer = this.world.renderer!.three;
    // We force a render call first to make sure we don't capture a blank canvas
    this.world.renderer!.update();
    return renderer.domElement.toDataURL("image/png");
  }

  /**
   * Unloads and disposes a model.
   */
  public async unloadModel(modelId: string): Promise<void> {
    const model = this.loadedModels.get(modelId);
    if (model) {
      this.world.scene.three.remove(model.object);
      await this.fragmentsManager.core.disposeModel(modelId);
      this.loadedModels.delete(modelId);
    }
  }

  /**
   * Clears all models.
   */
  public async clearAll(): Promise<void> {
    const ids = Array.from(this.loadedModels.keys());
    for (const id of ids) {
      await this.unloadModel(id);
    }
  }

  // --- Helper Methods ---

  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Checks if the model has a far-origin (> 100km offset) and triggers warning.
   */
  private async checkFarOrigin(model: any): Promise<void> {
    if (!model || !model.box) return;
    const box = model.box as THREE.Box3;
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    const distance = center.length();
    // 100,000 meters = 100km
    if (distance > 100000) {
      console.warn(`Far-origin detected: Model center is ${distance.toFixed(2)}m away from origin.`);
      if (this.farOriginWarningCallback) {
        this.farOriginWarningCallback(distance);
      }
    }
  }

}
