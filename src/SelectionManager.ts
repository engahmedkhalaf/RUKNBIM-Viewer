import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";

export type SelectionSource = "click" | "contextmenu" | "tree" | "api";

export class SelectionManager {
  private components: OBC.Components;
  private highlighter: OBCF.Highlighter;
  private pendingSource: SelectionSource = "click";

  public onSelectionChanged: (modelId: string, elementId: number, source: SelectionSource) => void = () => {};
  public onSelectionCleared: () => void = () => {};

  constructor(components: OBC.Components) {
    this.components = components;
    this.highlighter = components.get(OBCF.Highlighter);
  }

  public init(world: OBC.World): void {

    this.highlighter.setup({
      world: world,
      selectName: "select",
      selectEnabled: true,
      autoHighlightOnClick: true,
    });

    // Navisworks-style sky-blue selection overlay
    this.highlighter.styles.set("select", {
      color: new THREE.Color("#60a5fa"),
      opacity: 0.55,
      transparent: true,
      renderedFaces: 0,
    });

    const selectEvents = this.highlighter.events["select"];
    if (selectEvents) {
      selectEvents.onHighlight.add((selectionMap: any) => {
        const modelIds = Object.keys(selectionMap);
        if (modelIds.length === 0) return;
        const modelId = modelIds[0];
        const ids = Array.from(selectionMap[modelId]) as number[];
        if (ids.length === 0) return;
        const source = this.pendingSource;
        this.pendingSource = "click"; // reset
        this.onSelectionChanged(modelId, ids[0], source);
      });

      selectEvents.onClear.add(() => {
        this.onSelectionCleared();
      });
    }

    this.bindRightClickHandler(world);
  }

  /** Right-click on the canvas → pick element + open properties panel. */
  private bindRightClickHandler(world: OBC.World): void {
    const renderer: any = (world as any).renderer;
    const canvas: HTMLCanvasElement | undefined = renderer?.three?.domElement;
    if (!canvas) return;

    canvas.addEventListener("contextmenu", async (e: MouseEvent) => {
      e.preventDefault();
      try {
        const cameraThree = (world as any).camera?.three;
        if (!cameraThree) return;

        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(e.clientX - rect.left, e.clientY - rect.top);

        const manager = this.components.get(OBC.FragmentsManager);
        const list: any = (manager as any).list;
        if (!list?.values) return;

        // Raycast against every loaded fragments model; keep the closest hit.
        let best: any = null;
        for (const model of list.values() as Iterable<any>) {
          if (typeof model?.raycast !== "function") continue;
          try {
            const hit: any = await model.raycast({ camera: cameraThree, mouse, dom: canvas });
            if (hit && (best === null || hit.distance < best.distance)) {
              best = { hit, modelId: model.modelId };
            }
          } catch { /* skip this model */ }
        }

        if (!best) {
          this.clearSelection();
          return;
        }
        const localId: number | undefined = best.hit.localId ?? best.hit.itemId;
        if (typeof localId === "number" && typeof best.modelId === "string") {
          this.selectElement(best.modelId, localId, false, "contextmenu");
        }
      } catch (err) {
        console.warn("[Selection] right-click pick failed:", err);
      }
    });
  }

  public selectElement(modelId: string, elementId: number, zoom = true, source: SelectionSource = "api"): void {
    this.pendingSource = source;
    const selectionMap: OBC.ModelIdMap = {
      [modelId]: new Set([elementId]),
    };
    this.highlighter.highlightByID("select", selectionMap, true, zoom);
    this.onSelectionChanged(modelId, elementId, source);
  }

  public clearSelection(): void {
    this.highlighter.clear("select");
    this.onSelectionCleared();
  }
}
