import type { SpatialTreeItem } from "@thatopen/fragments";
import * as OBC from "@thatopen/components";

export interface StoreyInfo {
  id: number;
  name: string;
  elevation: number;
  elementIds: number[];
}

export class StoreyDataManager {
  private hider: OBC.Hider;

  constructor(components: OBC.Components) {
    this.hider = components.get(OBC.Hider);
  }

  /**
   * Traverses the spatial structure tree to identify all IFCBUILDINGSTOREY storeys
   * and extract all element IDs belonging to each storey.
   */
  public async getStoreys(_modelId: string, model: any, root: SpatialTreeItem): Promise<StoreyInfo[]> {
    const storeyNodes: SpatialTreeItem[] = [];
    this.findStoreyNodes(root, storeyNodes);

    const validNodes = storeyNodes.filter((n) => n.localId !== null && n.localId !== undefined);
    const properties = model.properties || {};

    const storeysList: StoreyInfo[] = [];
    for (const node of validNodes) {
      const id = node.localId as number;
      const data = properties[id];
      const elementIds = this.getDescendantElementIds(node);

      const name = this.readName(data) ?? `Level [${id}]`;
      const elevation = this.readElevation(data);

      storeysList.push({
        id,
        name,
        elevation,
        elementIds,
      });
    }

    return storeysList.sort((a, b) => {
      if (a.elevation !== b.elevation) return a.elevation - b.elevation;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }

  private readName(data: any): string | undefined {
    if (!data) return undefined;
    const src = data.data ?? data;
    const n = src?.Name;
    if (n === undefined || n === null) return undefined;
    if (typeof n === "object" && "value" in n) return String(n.value);
    return String(n);
  }

  private readElevation(data: any): number {
    if (!data) return 0;
    const src = data.data ?? data;
    const e = src?.Elevation;
    if (e === undefined || e === null) return 0;
    const raw = typeof e === "object" && "value" in e ? e.value : e;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    // Heuristic: convert mm→m if implausibly large
    return Math.abs(n) > 100 ? n / 1000 : n;
  }

  /**
   * Isolates a specific storey in the 3D scene by hiding all other elements.
   */
  public async isolateStorey(modelId: string, elementIds: number[]): Promise<void> {
    const modelIdMap: OBC.ModelIdMap = {
      [modelId]: new Set(elementIds)
    };
    await this.hider.isolate(modelIdMap);
  }

  /**
   * Resets visibility, showing all elements in all models.
   */
  public async resetVisibility(): Promise<void> {
    await this.hider.set(true);
  }

  // --- Helper Methods ---

  private findStoreyNodes(node: SpatialTreeItem, results: SpatialTreeItem[]): void {
    if (node.category && node.category.toUpperCase() === "IFCBUILDINGSTOREY") {
      results.push(node);
    }
    if (node.children) {
      node.children.forEach(child => this.findStoreyNodes(child, results));
    }
  }

  private getDescendantElementIds(node: SpatialTreeItem): number[] {
    let ids: number[] = [];
    
    // We only collect elements that represent actual geometry (i.e. exclude the storey node itself or building nodes)
    const isSpatialStructure = ["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY"].includes(node.category?.toUpperCase() || "");
    
    if (node.localId !== null && !isSpatialStructure) {
      ids.push(node.localId);
    }
    
    if (node.children) {
      node.children.forEach(child => {
        ids = ids.concat(this.getDescendantElementIds(child));
      });
    }
    
    return ids;
  }
}
