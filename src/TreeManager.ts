import type { SpatialTreeItem } from "@thatopen/fragments";

type TreeNode = SpatialTreeItem & {
  isCategoryGroup?: boolean;
  groupLabel?: string;
  count?: number;
};

const SPATIAL_CATEGORIES = new Set([
  "IFCPROJECT",
  "IFCSITE",
  "IFCBUILDING",
  "IFCBUILDINGSTOREY",
]);

export class TreeManager {
  private treeContainer: HTMLElement;
  private onNodeClickedCallback: (modelId: string, elementId: number) => void = () => {};
  private currentModel: any = null;
  private nameCache = new Map<number, string>();
  private spatialNameById = new Map<number, string>();

  constructor(treeContainer: HTMLElement) {
    this.treeContainer = treeContainer;
    this.clear();
  }

  public clear(): void {
    this.currentModel = null;
    this.nameCache.clear();
    this.spatialNameById.clear();
    this.treeContainer.innerHTML = `
      <div class="empty-state" style="color: var(--text-muted); font-style: italic; text-align: center; padding: 24px; font-size: 12px;">
        Load a model to see the IFC hierarchy.
      </div>
    `;
  }

  public onNodeClicked(callback: (modelId: string, elementId: number) => void): void {
    this.onNodeClickedCallback = callback;
  }

  /**
   * Renders the spatial tree. When `model` is provided, expanding a category
   * folder will lazy-fetch element Names so leaves show the real instance label
   * instead of just the category + id.
   */
  public async render(modelId: string, root: SpatialTreeItem, model?: any): Promise<void> {
    this.treeContainer.innerHTML = "";
    this.currentModel = model || null;
    this.nameCache.clear();
    this.spatialNameById.clear();

    if (model) {
      await this.prefetchSpatialNames(root, model);
    }

    // Model root row (filename + visibility eye), then the spatial tree.
    const modelRoot = this.buildModelRootRow(model, modelId);
    this.treeContainer.appendChild(modelRoot);

    const transformed = this.transformTree(root);
    const treeRootUl = this.buildTreeNodeElement(modelId, transformed, 0);
    Object.assign(treeRootUl.style, { paddingLeft: "14px" });
    this.treeContainer.appendChild(treeRootUl);
  }

  /** Fetch names for project/site/building/storey nodes so we can label them properly. */
  private async prefetchSpatialNames(root: SpatialTreeItem, model: any): Promise<void> {
    const ids: number[] = [];
    const walk = (n: SpatialTreeItem) => {
      const cat = (n.category || "").toUpperCase();
      if (SPATIAL_CATEGORIES.has(cat) && typeof n.localId === "number") {
        ids.push(n.localId);
      }
      n.children?.forEach(walk);
    };
    walk(root);
    if (ids.length === 0) return;

    try {
      if (typeof model.getItemsData === "function") {
        const datas = await model.getItemsData(ids, {
          attributesDefault: true,
          relationsDefault: { attributes: false, relations: false },
        });
        if (Array.isArray(datas)) {
          for (let i = 0; i < ids.length; i++) {
            const name = this.extractName(datas[i]);
            if (name) this.spatialNameById.set(ids[i], name);
          }
        }
      }
    } catch (e) {
      console.warn("[TreeManager] spatial name prefetch failed:", e);
    }
  }

  /** Top-level row: visibility eye + filename. */
  private buildModelRootRow(model: any, modelId: string): HTMLDivElement {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 8px",
      fontSize: "13px",
      fontWeight: "700",
      color: "var(--text-main)",
      borderBottom: "1px solid var(--border-color)",
      marginBottom: "4px",
    });

    const eye = document.createElement("button");
    let visible = (model?.object?.visible ?? true) as boolean;
    const setIcon = () => {
      eye.innerHTML = `<i class="fa-solid ${visible ? "fa-eye" : "fa-eye-slash"}"></i>`;
    };
    setIcon();
    Object.assign(eye.style, {
      width: "20px",
      height: "20px",
      color: "var(--primary-purple)",
      cursor: "pointer",
      fontSize: "13px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
    });
    eye.title = "Toggle model visibility";
    eye.addEventListener("click", () => {
      visible = !visible;
      if (model?.object) model.object.visible = visible;
      setIcon();
    });

    const label = document.createElement("span");
    label.innerText = model?.name ?? modelId;
    label.title = modelId;
    Object.assign(label.style, {
      flex: "1",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });

    wrap.appendChild(eye);
    wrap.appendChild(label);
    return wrap;
  }

  private transformTree(node: SpatialTreeItem): TreeNode {
    const out: TreeNode = { ...node, children: [] };
    if (!node.children || node.children.length === 0) return out;

    const cat = (node.category || "").toUpperCase();

    if (cat === "IFCBUILDINGSTOREY") {
      const buckets = new Map<string, SpatialTreeItem[]>();
      for (const child of node.children) {
        const key = child.category || "Element";
        const list = buckets.get(key);
        if (list) list.push(child); else buckets.set(key, [child]);
      }
      const sortedKeys = [...buckets.keys()].sort((a, b) => a.localeCompare(b));
      for (const key of sortedKeys) {
        const elements = buckets.get(key)!;
        out.children!.push({
          category: key,
          localId: null,
          children: elements,
          isCategoryGroup: true,
          groupLabel: this.prettyCategoryLabel(key),
          count: elements.length,
        } as TreeNode);
      }
    } else if (SPATIAL_CATEGORIES.has(cat)) {
      let mapped = node.children.map((c) => this.transformTree(c));

      // If we just expanded a building, sort its storeys by parsed numeric name.
      if (cat === "IFCBUILDING") {
        mapped = mapped.sort((a, b) => this.compareStoreys(a, b));
      }
      out.children = mapped;
    } else {
      out.children = node.children;
    }

    return out;
  }

  private compareStoreys(a: TreeNode, b: TreeNode): number {
    const aIsStorey = (a.category || "").toUpperCase() === "IFCBUILDINGSTOREY";
    const bIsStorey = (b.category || "").toUpperCase() === "IFCBUILDINGSTOREY";
    if (!aIsStorey || !bIsStorey) return aIsStorey ? -1 : bIsStorey ? 1 : 0;

    const an = (typeof a.localId === "number" && this.spatialNameById.get(a.localId)) || "";
    const bn = (typeof b.localId === "number" && this.spatialNameById.get(b.localId)) || "";
    const ap = this.parseStoreySortKey(an);
    const bp = this.parseStoreySortKey(bn);
    if (ap !== null && bp !== null && ap !== bp) return ap - bp;
    return an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
  }

  private parseStoreySortKey(name: string): number | null {
    // Pull the first number out of names like "099", "Level 100", "100.5 - Mezz"
    const m = name.match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  private buildTreeNodeElement(modelId: string, node: TreeNode, depth: number): HTMLUListElement {
    const ul = document.createElement("ul");
    Object.assign(ul.style, {
      listStyleType: "none",
      paddingLeft: depth === 0 ? "0" : "14px",
      margin: "0",
    });

    const li = document.createElement("li");
    li.style.margin = "2px 0";

    const nodeContent = document.createElement("div");
    nodeContent.className = "tree-node-content";
    Object.assign(nodeContent.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "5px 8px",
      borderRadius: "var(--radius-xs)",
      cursor: "pointer",
      transition: "background var(--transition-fast)",
      fontSize: "13px",
      color: "var(--text-main)",
      userSelect: "none",
    });

    nodeContent.addEventListener("mouseenter", () => {
      if (!nodeContent.classList.contains("selected-node")) {
        nodeContent.style.background = "var(--bg-hover)";
      }
    });
    nodeContent.addEventListener("mouseleave", () => {
      if (!nodeContent.classList.contains("selected-node")) {
        nodeContent.style.background = "transparent";
      }
    });

    const hasChildren = !!(node.children && node.children.length > 0);
    const startCollapsed = depth >= 2 && hasChildren;

    const toggleSpan = document.createElement("span");
    Object.assign(toggleSpan.style, {
      width: "12px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "9px",
      color: "var(--text-muted)",
      flexShrink: "0",
    });

    let childrenUl: HTMLUListElement | null = null;
    let labelEls: { id: number; el: HTMLSpanElement }[] = [];

    if (hasChildren) {
      const chev = startCollapsed ? "chevron-right" : "chevron-down";
      toggleSpan.innerHTML = `<i class="fa-solid fa-${chev}"></i>`;
      toggleSpan.style.cursor = "pointer";
      toggleSpan.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!childrenUl) return;
        const collapsed = childrenUl.style.display === "none";
        childrenUl.style.display = collapsed ? "block" : "none";
        toggleSpan.innerHTML = `<i class="fa-solid fa-${collapsed ? "chevron-down" : "chevron-right"}"></i>`;
        // Lazy fetch names for category-group leaves the first time they're shown
        if (collapsed && node.isCategoryGroup && labelEls.length > 0) {
          this.populateNames(labelEls);
        }
      });
    } else {
      toggleSpan.innerHTML = '<i class="fa-solid fa-circle" style="font-size: 4px; opacity: 0.4;"></i>';
    }
    nodeContent.appendChild(toggleSpan);

    const icon = document.createElement("span");
    icon.style.flexShrink = "0";
    icon.innerHTML = this.getCategoryIcon(node);
    nodeContent.appendChild(icon);

    const label = document.createElement("span");
    Object.assign(label.style, {
      flex: "1",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    label.innerText = this.getDisplayName(node);

    if (node.isCategoryGroup && node.count !== undefined) {
      const badge = document.createElement("span");
      badge.innerText = String(node.count);
      Object.assign(badge.style, {
        marginLeft: "6px",
        padding: "1px 6px",
        background: "var(--bg-hover)",
        color: "var(--primary-purple)",
        borderRadius: "var(--radius-full)",
        fontSize: "10px",
        fontFamily: "monospace",
        fontWeight: "600",
      });
      label.appendChild(badge);
    } else if (
      node.localId !== null &&
      node.localId !== undefined &&
      !SPATIAL_CATEGORIES.has((node.category || "").toUpperCase())
    ) {
      const idTag = document.createElement("span");
      idTag.innerText = `#${node.localId}`;
      Object.assign(idTag.style, {
        marginLeft: "6px",
        color: "var(--text-muted)",
        fontSize: "10px",
        fontFamily: "monospace",
      });
      label.appendChild(idTag);
    }

    nodeContent.appendChild(label);

    nodeContent.addEventListener("click", () => {
      const prev = this.treeContainer.querySelectorAll(".selected-node");
      prev.forEach((el) => {
        const e = el as HTMLElement;
        e.classList.remove("selected-node");
        e.style.background = "transparent";
        e.style.color = "var(--text-main)";
      });
      nodeContent.classList.add("selected-node");
      nodeContent.style.background = "var(--bg-active)";
      nodeContent.style.color = "var(--text-main)";

      if (node.localId !== null && node.localId !== undefined && !node.isCategoryGroup) {
        this.onNodeClickedCallback(modelId, node.localId);
      }

      // Automatically expand/collapse folder nodes on row click
      if (hasChildren && childrenUl) {
        const collapsed = childrenUl.style.display === "none";
        childrenUl.style.display = collapsed ? "block" : "none";
        toggleSpan.innerHTML = `<i class="fa-solid fa-${collapsed ? "chevron-down" : "chevron-right"}"></i>`;
        
        if (collapsed && node.isCategoryGroup && labelEls.length > 0) {
          this.populateNames(labelEls);
        }
      }
    });

    li.appendChild(nodeContent);

    if (hasChildren) {
      childrenUl = document.createElement("ul");
      Object.assign(childrenUl.style, {
        listStyleType: "none",
        paddingLeft: "20px",
        margin: "0",
        display: startCollapsed ? "none" : "block",
      });
      for (const child of node.children!) {
        const sub = this.buildTreeNodeElement(modelId, child as TreeNode, depth + 1);
        Array.from(sub.children).forEach((c) => childrenUl!.appendChild(c));
      }
      li.appendChild(childrenUl);

      // Collect label refs for leaves of category groups so we can lazy-fetch names
      if (node.isCategoryGroup) {
        labelEls = this.collectLeafLabels(childrenUl, node);
        // If group was expanded by default (depth<2), kick off the fetch immediately
        if (!startCollapsed && labelEls.length > 0) {
          this.populateNames(labelEls);
        }
      }
    }

    ul.appendChild(li);
    return ul;
  }

  /** Walk the direct children of a category group's <ul> and pair each leaf node's label span with its localId. */
  private collectLeafLabels(childrenUl: HTMLUListElement, group: TreeNode): { id: number; el: HTMLSpanElement }[] {
    const out: { id: number; el: HTMLSpanElement }[] = [];
    const lis = Array.from(childrenUl.children) as HTMLLIElement[];
    const groupChildren = group.children || [];
    for (let i = 0; i < lis.length && i < groupChildren.length; i++) {
      const child = groupChildren[i];
      if (child.localId === null || child.localId === undefined) continue;
      const labelSpan = lis[i].querySelector(".tree-node-content > span:last-child") as HTMLSpanElement | null;
      if (!labelSpan) continue;
      out.push({ id: child.localId as number, el: labelSpan });
    }
    return out;
  }

  /** Batch-fetch element Names from the active model and rewrite leaf labels. */
  private async populateNames(items: { id: number; el: HTMLSpanElement }[]): Promise<void> {
    if (!this.currentModel) return;
    const toFetch = items.filter((i) => !this.nameCache.has(i.id));
    if (toFetch.length > 0) {
      try {
        const ids = toFetch.map((i) => i.id);
        let datas: any[] | undefined;
        if (typeof this.currentModel.getItemsData === "function") {
          datas = await this.currentModel.getItemsData(ids, {
            attributesDefault: true,
            relationsDefault: { attributes: false, relations: false },
          });
        }
        if (!Array.isArray(datas)) datas = [];
        for (let i = 0; i < ids.length; i++) {
          const name = this.extractName(datas[i]);
          if (name) this.nameCache.set(ids[i], name);
        }
      } catch (e) {
        console.warn("[TreeManager] could not fetch element names:", e);
      }
    }
    for (const item of items) {
      const name = this.nameCache.get(item.id);
      if (!name) continue;
      // Rebuild label: name + #id tag
      item.el.innerHTML = "";
      item.el.append(document.createTextNode(name));
      const idTag = document.createElement("span");
      idTag.innerText = `#${item.id}`;
      Object.assign(idTag.style, {
        marginLeft: "6px",
        color: "var(--text-muted)",
        fontSize: "10px",
        fontFamily: "monospace",
      });
      item.el.appendChild(idTag);
      item.el.title = `${name} (#${item.id})`;
    }
  }

  private extractName(itemData: any): string | undefined {
    if (!itemData || typeof itemData !== "object") return undefined;
    // Flat shape: Name is a top-level attribute object {type, value}
    const n = itemData.Name ?? itemData.name;
    if (n === undefined || n === null) {
      // Raw shape fallback
      const raw = itemData.data?.Name;
      if (raw === undefined || raw === null) return undefined;
      return typeof raw === "object" && "value" in raw ? String(raw.value) : String(raw);
    }
    if (typeof n === "object" && "value" in n) return String(n.value);
    return String(n);
  }

  private getDisplayName(node: TreeNode): string {
    if (node.isCategoryGroup) return node.groupLabel || node.category || "Group";
    const cat = (node.category || "").toUpperCase();
    // Project/Site/Building/Storey — show fetched Name attribute if present
    if (SPATIAL_CATEGORIES.has(cat) && typeof node.localId === "number") {
      const name = this.spatialNameById.get(node.localId);
      if (name) return name;
    }
    return this.prettyCategoryLabel(node.category || "Element");
  }

  private prettyCategoryLabel(cat: string): string {
    if (!cat) return "Element";
    const c = cat.toUpperCase();
    if (c === "IFCPROJECT") return "Project";
    if (c === "IFCSITE") return "Site";
    if (c === "IFCBUILDING") return "Building";
    if (c === "IFCBUILDINGSTOREY") return "Storey";
    return cat.replace(/^IFC/i, "").replace(/([A-Z])/g, " $1").trim();
  }

  private getCategoryIcon(node: TreeNode): string {
    const baseStyle = "width: 14px; text-align: center;";
    if (node.isCategoryGroup) {
      return `<i class="fa-solid fa-folder" style="${baseStyle} color: var(--accent-pink);"></i>`;
    }
    const category = node.category;
    if (!category) return `<i class="fa-solid fa-cube" style="${baseStyle} color: var(--text-muted);"></i>`;

    const cat = category.toUpperCase();
    if (cat === "IFCPROJECT")        return `<i class="fa-solid fa-folder-tree" style="${baseStyle} color: var(--primary-indigo);"></i>`;
    if (cat === "IFCSITE")           return `<i class="fa-solid fa-location-dot" style="${baseStyle} color: var(--primary-indigo);"></i>`;
    if (cat === "IFCBUILDING")       return `<i class="fa-solid fa-building" style="${baseStyle} color: var(--primary-purple);"></i>`;
    if (cat === "IFCBUILDINGSTOREY") return `<i class="fa-solid fa-layer-group" style="${baseStyle} color: var(--primary-purple);"></i>`;
    if (cat.includes("WALL"))        return `<i class="fa-solid fa-border-all" style="${baseStyle} color: var(--text-secondary);"></i>`;
    if (cat.includes("DOOR"))        return `<i class="fa-solid fa-door-open" style="${baseStyle} color: #15803d;"></i>`;
    if (cat.includes("WINDOW"))      return `<i class="fa-solid fa-window-maximize" style="${baseStyle} color: var(--primary-violet);"></i>`;
    if (cat.includes("SLAB"))        return `<i class="fa-solid fa-square" style="${baseStyle} color: #b45309;"></i>`;
    if (cat.includes("COLUMN"))      return `<i class="fa-solid fa-grip-lines-vertical" style="${baseStyle} color: var(--primary-violet);"></i>`;
    if (cat.includes("BEAM"))        return `<i class="fa-solid fa-grip-lines" style="${baseStyle} color: var(--primary-violet);"></i>`;
    if (cat.includes("STAIR"))       return `<i class="fa-solid fa-stairs" style="${baseStyle} color: var(--accent-pink);"></i>`;
    if (cat.includes("ROOF"))        return `<i class="fa-solid fa-house-chimney" style="${baseStyle} color: var(--accent-pink);"></i>`;
    if (cat.includes("OPENING"))     return `<i class="fa-regular fa-square" style="${baseStyle} color: var(--text-muted);"></i>`;
    if (cat.includes("SPACE"))       return `<i class="fa-solid fa-vector-square" style="${baseStyle} color: var(--accent-cyan);"></i>`;
    if (cat.includes("MEMBER"))      return `<i class="fa-solid fa-minus" style="${baseStyle} color: var(--text-secondary);"></i>`;
    if (cat.includes("PLATE"))       return `<i class="fa-solid fa-square" style="${baseStyle} color: var(--text-secondary);"></i>`;
    return `<i class="fa-solid fa-cube" style="${baseStyle} color: var(--primary-purple);"></i>`;
  }
}
