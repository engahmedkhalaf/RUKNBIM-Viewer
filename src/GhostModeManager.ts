import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";

export class GhostModeManager {
  private components: OBC.Components;
  private highlighter: OBCF.Highlighter;
  private isGhostModeEnabledActive = false;

  constructor(components: OBC.Components) {
    this.components = components;
    this.highlighter = components.get(OBCF.Highlighter);
  }

  /**
   * Initializes the ghost mode style in the Highlighter.
   */
  public init(): void {
    // Register the "ghost" style (semi-transparent gray)
    this.highlighter.styles.set("ghost", {
      color: new THREE.Color("#444444"),
      opacity: 0.15,
      transparent: true,
      renderedFaces: 0 // RenderedFaces.ONE
    });
  }

  /**
   * Toggles the ghost mode state.
   */
  public setEnabled(enabled: boolean, modelId?: string, selectedId?: number): void {
    this.isGhostModeEnabledActive = enabled;
    
    if (enabled) {
      if (modelId !== undefined && selectedId !== undefined) {
        this.applyGhosting(modelId, selectedId);
      }
    } else {
      this.clearGhosting();
    }
  }

  public get isEnabled(): boolean {
    return this.isGhostModeEnabledActive;
  }

  /**
   * Applies the ghost material to all elements except the selected one.
   */
  public async applyGhosting(modelId: string, selectedId: number): Promise<void> {
    if (!this.isGhostModeEnabledActive) return;

    const fragmentsManager = this.components.get(OBC.FragmentsManager);
    const model = fragmentsManager.list.get(modelId);
    if (!model) return;

    try {
      const allIds = await model.getLocalIds();
      const ghostIds = allIds.filter((id: number) => id !== selectedId);

      const ghostMap: OBC.ModelIdMap = {
        [modelId]: new Set(ghostIds)
      };

      // Clear any previous ghost highlights
      await this.highlighter.clear("ghost");

      // Apply ghost highlights to unselected items
      await this.highlighter.highlightByID("ghost", ghostMap, true, false);
      
      console.log(`[GhostMode] Ghosting applied to ${ghostIds.length} elements.`);
    } catch (e) {
      console.error("[GhostMode] Error applying ghosting:", e);
    }
  }

  /**
   * Clears the ghosting style.
   */
  public async clearGhosting(): Promise<void> {
    await this.highlighter.clear("ghost");
    console.log("[GhostMode] Ghosting cleared.");
  }
}
