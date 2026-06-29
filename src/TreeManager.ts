import type { SpatialTreeItem } from "@thatopen/fragments";

type TreeNode = {
  id: string;
  label: string;
  icon: string;
  category?: string;
  localId?: number | null;
  modelId?: string;
  count?: number;
  children?: TreeNode[];
  isModel?: boolean;
  isStorey?: boolean;
  isCategory?: boolean;
  isElement?: boolean;
};

export class TreeManager {
  private treeContainer: HTMLElement;
  private onNodeClickedCallback: (modelId: string, elementId: number) => void = () => {};
  private modelsMap = new Map<string, { model: any; root: SpatialTreeItem }>();
  private nameCache = new Map<string, string>(); // key: `${modelId}_${id}`
  private spatialNameById = new Map<string, string>(); // key: `${modelId}_${id}`

  constructor(treeContainer: HTMLElement) {
    this.treeContainer = treeContainer;
    this.clear();
  }

  public clear(): void {
    this.modelsMap.clear();
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

  public async addModel(modelId: string, root: SpatialTreeItem, model: any): Promise<void> {
    this.modelsMap.set(modelId, { model, root });
    await this.prefetchSpatialNames(modelId, root, model);
    await this.rebuildTree();
  }

  public async removeModel(modelId: string): Promise<void> {
    this.modelsMap.delete(modelId);
    for (const key of Array.from(this.nameCache.keys())) {
      if (key.startsWith(`${modelId}_`)) this.nameCache.delete(key);
    }
    for (const key of Array.from(this.spatialNameById.keys())) {
      if (key.startsWith(`${modelId}_`)) this.spatialNameById.delete(key);
    }
    await this.rebuildTree();
  }

  private async prefetchSpatialNames(modelId: string, root: SpatialTreeItem, model: any): Promise<void> {
    const ids: number[] = [];
    const walk = (n: SpatialTreeItem) => {
      const cat = (n.category || "").toUpperCase();
      const isSpatial = ["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY"].includes(cat);
      if (isSpatial && typeof n.localId === "number") {
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
            if (name) this.spatialNameById.set(`${modelId}_${ids[i]}`, name);
          }
        }
      }
    } catch (e) {
      console.warn("[TreeManager] spatial name prefetch failed:", e);
    }
  }

  private extractName(itemData: any): string | undefined {
    if (!itemData || typeof itemData !== "object") return undefined;
    const n = itemData.Name ?? itemData.name;
    if (n === undefined || n === null) {
      const raw = itemData.data?.Name;
      if (raw === undefined || raw === null) return undefined;
      return typeof raw === "object" && "value" in raw ? String(raw.value) : String(raw);
    }
    if (typeof n === "object" && "value" in n) return String(n.value);
    return String(n);
  }

  private async rebuildTree(): Promise<void> {
    this.treeContainer.innerHTML = "";
    if (this.modelsMap.size === 0) {
      this.treeContainer.innerHTML = `
        <div class="empty-state" style="color: var(--text-muted); font-style: italic; text-align: center; padding: 24px; font-size: 12px;">
          Load a model to see the IFC hierarchy.
        </div>
      `;
      return;
    }

    const wrapper = document.createElement("div");
    Object.assign(wrapper.style, {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
    });

    for (const [modelId, { model, root }] of Array.from(this.modelsMap.entries())) {
      const modelNode = this.buildModelHierarchyNode(modelId, model, root);
      const modelEl = this.renderDOMNode(modelNode);
      wrapper.appendChild(modelEl);
    }

    this.treeContainer.appendChild(wrapper);
  }

  private buildModelHierarchyNode(modelId: string, model: any, root: SpatialTreeItem): TreeNode {
    const storeyNodes: SpatialTreeItem[] = [];
    const findStoreys = (node: SpatialTreeItem) => {
      if (node.category && node.category.toUpperCase() === "IFCBUILDINGSTOREY") {
        storeyNodes.push(node);
      } else {
        node.children?.forEach(findStoreys);
      }
    };
    findStoreys(root);

    const storeyChildren: TreeNode[] = [];

    const collectElements = (n: SpatialTreeItem, elementsList: SpatialTreeItem[]) => {
      const cat = (n.category || "").toUpperCase();
      const isSpatial = ["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY"].includes(cat);
      if (n.localId !== null && !isSpatial) {
        elementsList.push(n);
      }
      n.children?.forEach((c) => collectElements(c, elementsList));
    };

    if (storeyNodes.length > 0) {
      const sortedStoreys = storeyNodes.sort((a, b) => this.compareStoreys(modelId, a, b));
      for (const stNode of sortedStoreys) {
        const storeyId = stNode.localId as number;
        const storeyName = this.spatialNameById.get(`${modelId}_${storeyId}`) || `Level [${storeyId}]`;
        
        const elementsList: SpatialTreeItem[] = [];
        collectElements(stNode, elementsList);

        const categoryGroups = new Map<string, SpatialTreeItem[]>();
        for (const el of elementsList) {
          const cat = el.category || "Element";
          const list = categoryGroups.get(cat) || [];
          list.push(el);
          categoryGroups.set(cat, list);
        }

        const categoryChildren: TreeNode[] = [];
        const sortedCats = Array.from(categoryGroups.keys()).sort((a, b) => a.localeCompare(b));
        for (const cat of sortedCats) {
          const items = categoryGroups.get(cat)!;
          const elementChildren: TreeNode[] = items.map((el) => ({
            id: `${modelId}_el_${el.localId}`,
            label: `${this.prettyCategoryLabel(cat)}`,
            icon: this.getCategoryIcon(cat),
            category: cat,
            localId: el.localId,
            modelId,
            isElement: true,
          }));

          categoryChildren.push({
            id: `${modelId}_cat_${storeyId}_${cat}`,
            label: this.prettyCategoryLabel(cat),
            icon: `<i class="fa-solid fa-folder" style="width: 14px; text-align: center; color: var(--accent-pink);"></i>`,
            children: elementChildren,
            count: items.length,
            modelId,
            isCategory: true,
          });
        }

        storeyChildren.push({
          id: `${modelId}_storey_${storeyId}`,
          label: storeyName,
          icon: `<i class="fa-solid fa-layer-group" style="width: 14px; text-align: center; color: var(--primary-purple);"></i>`,
          children: categoryChildren,
          modelId,
          isStorey: true,
        });
      }
    } else {
      const elementsList: SpatialTreeItem[] = [];
      collectElements(root, elementsList);

      const categoryGroups = new Map<string, SpatialTreeItem[]>();
      for (const el of elementsList) {
        const cat = el.category || "Element";
        const list = categoryGroups.get(cat) || [];
        list.push(el);
        categoryGroups.set(cat, list);
      }

      const sortedCats = Array.from(categoryGroups.keys()).sort((a, b) => a.localeCompare(b));
      for (const cat of sortedCats) {
        const items = categoryGroups.get(cat)!;
        const elementChildren: TreeNode[] = items.map((el) => ({
          id: `${modelId}_el_${el.localId}`,
          label: `${this.prettyCategoryLabel(cat)}`,
          icon: this.getCategoryIcon(cat),
          category: cat,
          localId: el.localId,
          modelId,
          isElement: true,
        }));

        storeyChildren.push({
          id: `${modelId}_cat_nostorey_${cat}`,
          label: this.prettyCategoryLabel(cat),
          icon: `<i class="fa-solid fa-folder" style="width: 14px; text-align: center; color: var(--accent-pink);"></i>`,
          children: elementChildren,
          count: items.length,
          modelId,
          isCategory: true,
        });
      }
    }

    return {
      id: modelId,
      label: model.name || modelId,
      icon: `<i class="fa-solid fa-cube" style="width: 14px; text-align: center; color: var(--primary-purple);"></i>`,
      children: storeyChildren,
      isModel: true,
      modelId,
    };
  }

  private compareStoreys(modelId: string, a: SpatialTreeItem, b: SpatialTreeItem): number {
    const an = (typeof a.localId === "number" && this.spatialNameById.get(`${modelId}_${a.localId}`)) || "";
    const bn = (typeof b.localId === "number" && this.spatialNameById.get(`${modelId}_${b.localId}`)) || "";
    const ap = this.parseStoreySortKey(an);
    const bp = this.parseStoreySortKey(bn);
    if (ap !== null && bp !== null && ap !== bp) return ap - bp;
    return an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
  }

  private parseStoreySortKey(name: string): number | null {
    const m = name.match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  private renderDOMNode(node: TreeNode, depth: number = 0): HTMLDivElement {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      display: "flex",
      flexDirection: "column",
      margin: "0",
      paddingLeft: depth === 0 ? "0" : "14px",
    });

    const row = document.createElement("div");
    row.className = "tree-node-content";
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "4px 8px",
      borderRadius: "var(--radius-xs)",
      cursor: "pointer",
      fontSize: "12.5px",
      color: "var(--text-main)",
      userSelect: "none",
      transition: "background var(--transition-fast)",
    });

    row.addEventListener("mouseenter", () => {
      if (!row.classList.contains("selected-node")) {
        row.style.background = "var(--bg-hover)";
      }
    });
    row.addEventListener("mouseleave", () => {
      if (!row.classList.contains("selected-node")) {
        row.style.background = "transparent";
      }
    });

    const hasChildren = !!(node.children && node.children.length > 0);
    const startCollapsed = depth > 0 && hasChildren;

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

    let childrenContainer: HTMLDivElement | null = null;
    let labelEls: { id: number; el: HTMLSpanElement; modelId: string }[] = [];

    if (hasChildren) {
      const chev = startCollapsed ? "chevron-right" : "chevron-down";
      toggleSpan.innerHTML = `<i class="fa-solid fa-${chev}"></i>`;
      toggleSpan.style.cursor = "pointer";
      toggleSpan.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!childrenContainer) return;
        const collapsed = childrenContainer.style.display === "none";
        childrenContainer.style.display = collapsed ? "flex" : "none";
        toggleSpan.innerHTML = `<i class="fa-solid fa-${collapsed ? "chevron-down" : "chevron-right"}"></i>`;
        
        if (collapsed && node.isCategory && labelEls.length > 0) {
          this.populateNames(labelEls);
        }
      });
    } else {
      toggleSpan.innerHTML = '<i class="fa-solid fa-circle" style="font-size: 4.5px; opacity: 0.35;"></i>';
    }

    if (node.isModel && node.modelId) {
      const modelId = node.modelId;
      const modelObj = this.modelsMap.get(modelId)?.model;
      const eye = document.createElement("button");
      let visible = (modelObj?.object?.visible ?? true) as boolean;
      const setIcon = () => {
        eye.innerHTML = `<i class="fa-solid ${visible ? "fa-eye" : "fa-eye-slash"}"></i>`;
      };
      setIcon();
      Object.assign(eye.style, {
        width: "20px",
        height: "20px",
        color: "var(--primary-purple)",
        cursor: "pointer",
        fontSize: "12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: "0",
      });
      eye.addEventListener("click", (e) => {
        e.stopPropagation();
        visible = !visible;
        if (modelObj?.object) modelObj.object.visible = visible;
        setIcon();
      });
      row.appendChild(eye);
    } else {
      row.appendChild(toggleSpan);
    }

    const iconSpan = document.createElement("span");
    iconSpan.style.flexShrink = "0";
    iconSpan.innerHTML = node.icon;
    row.appendChild(iconSpan);

    const labelSpan = document.createElement("span");
    Object.assign(labelSpan.style, {
      flex: "1",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    labelSpan.innerText = node.label;

    if (node.isCategory && node.count !== undefined) {
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
      labelSpan.appendChild(badge);
    } else if (node.isElement && typeof node.localId === "number") {
      const idTag = document.createElement("span");
      idTag.innerText = `#${node.localId}`;
      Object.assign(idTag.style, {
        marginLeft: "6px",
        color: "var(--text-muted)",
        fontSize: "10.5px",
        fontFamily: "monospace",
      });
      labelSpan.appendChild(idTag);
    }

    row.appendChild(labelSpan);

    row.addEventListener("click", () => {
      const prev = this.treeContainer.querySelectorAll(".selected-node");
      prev.forEach((el) => {
        const e = el as HTMLElement;
        e.classList.remove("selected-node");
        e.style.background = "transparent";
      });
      row.classList.add("selected-node");
      row.style.background = "var(--bg-active)";

      if (node.isElement && node.modelId && typeof node.localId === "number") {
        this.onNodeClickedCallback(node.modelId, node.localId);
      }

      if (hasChildren && childrenContainer) {
        const collapsed = childrenContainer.style.display === "none";
        childrenContainer.style.display = collapsed ? "flex" : "none";
        toggleSpan.innerHTML = `<i class="fa-solid fa-${collapsed ? "chevron-down" : "chevron-right"}"></i>`;
        
        if (collapsed && node.isCategory && labelEls.length > 0) {
          this.populateNames(labelEls);
        }
      }
    });

    wrap.appendChild(row);

    if (hasChildren) {
      childrenContainer = document.createElement("div");
      Object.assign(childrenContainer.style, {
        display: startCollapsed ? "none" : "flex",
        flexDirection: "column",
        gap: "2px",
      });

      for (const child of node.children!) {
        const childEl = this.renderDOMNode(child, depth + 1);
        childrenContainer.appendChild(childEl);
        
        if (node.isCategory && child.isElement && typeof child.localId === "number" && child.modelId) {
          const leafSpan = childEl.querySelector(".tree-node-content > span:last-child") as HTMLSpanElement | null;
          if (leafSpan) {
            labelEls.push({ id: child.localId, el: leafSpan, modelId: child.modelId });
          }
        }
      }

      wrap.appendChild(childrenContainer);

      if (node.isCategory && !startCollapsed && labelEls.length > 0) {
        this.populateNames(labelEls);
      }
    }

    return wrap;
  }

  private async populateNames(items: { id: number; el: HTMLSpanElement; modelId: string }[]): Promise<void> {
    const toFetch = items.filter((i) => !this.nameCache.has(`${i.modelId}_${i.id}`));
    if (toFetch.length > 0) {
      const modelGroups = new Map<string, number[]>();
      for (const i of toFetch) {
        const list = modelGroups.get(i.modelId) || [];
        list.push(i.id);
        modelGroups.set(i.modelId, list);
      }

      for (const [modelId, ids] of Array.from(modelGroups.entries())) {
        const modelObj = this.modelsMap.get(modelId)?.model;
        if (!modelObj) continue;

        try {
          let datas: any[] | undefined;
          if (typeof modelObj.getItemsData === "function") {
            datas = await modelObj.getItemsData(ids, {
              attributesDefault: true,
              relationsDefault: { attributes: false, relations: false },
            });
          }
          if (Array.isArray(datas)) {
            for (let idx = 0; idx < ids.length; idx++) {
              const name = this.extractName(datas[idx]);
              if (name) this.nameCache.set(`${modelId}_${ids[idx]}`, name);
            }
          }
        } catch (e) {
          console.warn(`[TreeManager] could not fetch element names for model ${modelId}:`, e);
        }
      }
    }

    for (const item of items) {
      const name = this.nameCache.get(`${item.modelId}_${item.id}`);
      if (!name) continue;
      
      item.el.innerHTML = "";
      item.el.append(document.createTextNode(name));
      const idTag = document.createElement("span");
      idTag.innerText = `#${item.id}`;
      Object.assign(idTag.style, {
        marginLeft: "6px",
        color: "var(--text-muted)",
        fontSize: "10.5px",
        fontFamily: "monospace",
      });
      item.el.appendChild(idTag);
      item.el.title = `${name} (#${item.id})`;
    }
  }

  private prettyCategoryLabel(cat: string): string {
    if (!cat) return "Element";
    return cat.replace(/^IFC/i, "").replace(/([A-Z])/g, " $1").trim();
  }

  private getCategoryIcon(catName: string): string {
    const baseStyle = "width: 14px; text-align: center;";
    const cat = catName.toUpperCase();
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
