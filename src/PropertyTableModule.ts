import { SelectionManager } from "./SelectionManager";

interface TableRowData {
  id: number;
  guid: string;
  category: string;
  family: string;
  type: string;
  length: number;
  width: number;
  height: number;
  grossArea: number;
  netArea: number;
  grossVolume: number;
  netVolume: number;
  level: string;
}

type ColumnKey = keyof TableRowData;

function extractBIMData(id: number, item: any, properties: any, elementStoreyMap: Map<number, string>): TableRowData {
  const category = item.category || "Unknown";
  
  let guid = item.guid || "N/A";
  let family = category;
  let type = "Standard";
  let length = 0;
  let width = 0;
  let height = 0;
  let grossArea = 0;
  let netArea = 0;
  let grossVolume = 0;
  let netVolume = 0;
  let level = elementStoreyMap.get(id) || "N/A";
  
  const rawData = item.data || item || {};
  
  const unwrap = (v: any): any => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "object" && "value" in v) return v.value;
    return v;
  };

  // Resolve GUID
  const guidVal = unwrap(rawData.GlobalId) || unwrap(rawData.guid);
  if (guidVal) guid = String(guidVal);

  // 1. Resolve Family / Type
  const objType = unwrap(rawData.ObjectType);
  const nameVal = unwrap(rawData.Name);
  
  if (objType) {
    const parts = String(objType).split(":");
    if (parts.length > 1) {
      family = parts[0].trim();
      type = parts.slice(1).join(":").trim();
    } else {
      type = String(objType);
    }
  } else if (nameVal) {
    const parts = String(nameVal).split(":");
    if (parts.length > 1) {
      family = parts[0].trim();
      type = parts.slice(1).join(":").trim();
    } else {
      type = String(nameVal);
    }
  }

  // 2. Resolve quantities and level via IfcElementQuantity and IfcPropertySet relations in properties map
  const elementObj = properties[id];
  if (elementObj && elementObj.IsDefinedBy) {
    const rels = Array.isArray(elementObj.IsDefinedBy) ? elementObj.IsDefinedBy : [elementObj.IsDefinedBy];
    for (const relRef of rels) {
      const relId = typeof relRef === "object" ? (relRef.value || relRef.id) : relRef;
      const rel = properties[relId];
      if (!rel) continue;

      const defRef = rel.RelatingPropertyDefinition;
      const defId = typeof defRef === "object" ? (defRef.value || defRef.id) : defRef;
      const def = properties[defId];
      if (!def) continue;

      const defType = String(def.type || def.ObjectType || "");
      
      // IfcElementQuantity
      if (defType.includes("IfcElementQuantity") || def.Quantities) {
        const qts = Array.isArray(def.Quantities) ? def.Quantities : [def.Quantities];
        for (const qtyRef of qts) {
          const qtyId = typeof qtyRef === "object" ? (qtyRef.value || qtyRef.id) : qtyRef;
          const qty = properties[qtyId];
          if (!qty) continue;

          const qtyName = qty.Name ? (typeof qty.Name === "object" ? qty.Name.value : qty.Name) : "";
          let qtyVal = 0;
          
          if (qty.LengthValue !== undefined) qtyVal = typeof qty.LengthValue === "object" ? qty.LengthValue.value : qty.LengthValue;
          else if (qty.AreaValue !== undefined) qtyVal = typeof qty.AreaValue === "object" ? qty.AreaValue.value : qty.AreaValue;
          else if (qty.VolumeValue !== undefined) qtyVal = typeof qty.VolumeValue === "object" ? qty.VolumeValue.value : qty.VolumeValue;
          else if (qty.CountValue !== undefined) qtyVal = typeof qty.CountValue === "object" ? qty.CountValue.value : qty.CountValue;
          else if (qty.WeightValue !== undefined) qtyVal = typeof qty.WeightValue === "object" ? qty.WeightValue.value : qty.WeightValue;

          const lowerName = String(qtyName).toLowerCase();
          if (lowerName === "length") length = qtyVal;
          else if (lowerName === "width") width = qtyVal;
          else if (lowerName === "height" || lowerName === "depth") height = qtyVal;
          else if (lowerName === "grossarea" || lowerName === "grosssidearea" || lowerName === "grossfootprintarea") grossArea = qtyVal;
          else if (lowerName === "netarea" || lowerName === "area" || lowerName === "netsidearea") netArea = qtyVal;
          else if (lowerName === "grossvolume") grossVolume = qtyVal;
          else if (lowerName === "netvolume" || lowerName === "volume") netVolume = qtyVal;
        }
      }

      // IfcPropertySet
      if (defType.includes("IfcPropertySet") || def.HasProperties) {
        const props = Array.isArray(def.HasProperties) ? def.HasProperties : [def.HasProperties];
        for (const propRef of props) {
          const propId = typeof propRef === "object" ? (propRef.value || propRef.id) : propRef;
          const prop = properties[propId];
          if (!prop) continue;

          const propName = prop.Name ? (typeof prop.Name === "object" ? prop.Name.value : prop.Name) : "";
          let propVal: any = undefined;
          if (prop.NominalValue) {
            propVal = typeof prop.NominalValue === "object" ? (prop.NominalValue.value ?? prop.NominalValue) : prop.NominalValue;
          }

          if (propVal !== undefined) {
            const lowerName = String(propName).toLowerCase();
            if (lowerName === "level" || lowerName === "storey" || lowerName === "storeys" || lowerName.includes("buildingstorey") || lowerName === "referencelevel") {
              if (level === "N/A") level = String(propVal);
            }
            if (lowerName === "length") length = parseFloat(propVal) || length;
            else if (lowerName === "width") width = parseFloat(propVal) || width;
            else if (lowerName === "height") height = parseFloat(propVal) || height;
          }
        }
      }
    }
  }

  // Fallback to legacy scan if quantities are still 0
  if (length === 0 && netArea === 0 && netVolume === 0) {
    const scan = (obj: any) => {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        for (const el of obj) scan(el);
        return;
      }
      for (const key of Object.keys(obj)) {
        const lowerKey = key.toLowerCase();
        const val = obj[key];
        if (lowerKey === "length" || lowerKey === "netlength") {
          const num = parseFloat(String(unwrap(val)));
          if (!isNaN(num)) length = num;
        }
        if (lowerKey === "width") {
          const num = parseFloat(String(unwrap(val)));
          if (!isNaN(num)) width = num;
        }
        if (lowerKey === "height" || lowerKey === "depth") {
          const num = parseFloat(String(unwrap(val)));
          if (!isNaN(num)) height = num;
        }
        if (lowerKey === "grossarea" || lowerKey === "grosssidearea" || lowerKey === "grossfootprintarea") {
          const num = parseFloat(String(unwrap(val)));
          if (!isNaN(num)) grossArea = num;
        }
        if (lowerKey === "netarea" || lowerKey === "area") {
          const num = parseFloat(String(unwrap(val)));
          if (!isNaN(num)) netArea = num;
        }
        if (lowerKey === "grossvolume") {
          const num = parseFloat(String(unwrap(val)));
          if (!isNaN(num)) grossVolume = num;
        }
        if (lowerKey === "netvolume" || lowerKey === "volume") {
          const num = parseFloat(String(unwrap(val)));
          if (!isNaN(num)) netVolume = num;
        }
        if (val && typeof val === "object" && !("value" in val) && key !== "parent") {
          scan(val);
        }
      }
    };
    scan(item);
  }

  return {
    id,
    guid,
    category,
    family,
    type,
    length,
    width,
    height,
    grossArea,
    netArea,
    grossVolume,
    netVolume,
    level
  };
}

export class PropertyTableModule {
  private container: HTMLElement;
  private selectionManager: SelectionManager;

  private tableWrapper!: HTMLDivElement;
  private tableBody!: HTMLTableSectionElement;
  private tableHead!: HTMLTableSectionElement;
  private searchInput!: HTMLInputElement;
  private rowCountLabel!: HTMLSpanElement;

  private rawData: TableRowData[] = [];
  private filteredData: TableRowData[] = [];
  private activeModelId: string | null = null;

  private sortColumn: ColumnKey = "id";
  private sortAscending = true;

  private maxVisibleRows = 100;

  private readonly columnDefs: { key: ColumnKey; label: string }[] = [
    { key: "id", label: "ExpressID" },
    { key: "guid", label: "GlobalId" },
    { key: "category", label: "Class" },
    { key: "family", label: "Family" },
    { key: "type", label: "Type" },
    { key: "length", label: "Length" },
    { key: "width", label: "Width" },
    { key: "height", label: "Height" },
    { key: "grossArea", label: "GrossArea" },
    { key: "netArea", label: "NetArea" },
    { key: "grossVolume", label: "GrossVolume" },
    { key: "netVolume", label: "NetVolume" },
    { key: "level", label: "Level" },
  ];
  private visibleColumns = new Set<ColumnKey>(["id", "guid", "category", "length", "width", "height", "grossArea", "netArea", "grossVolume", "netVolume", "level"]);
  private isFullscreen = false;
  private prevStyle: { left: string; top: string; right: string; bottom: string; width: string; height: string } | null = null;

  constructor(container: HTMLElement, selectionManager: SelectionManager) {
    this.container = container;
    this.selectionManager = selectionManager;

    this.createTableDOM();
  }

  /**
   * Initializes the table data from a model.
   */
  public async loadModelData(modelId: string, model: any): Promise<void> {
    this.activeModelId = modelId;
    this.rawData = [];
    this.filteredData = [];
    this.clearRows();

    try {
      // Fetch full properties map from model
      const properties = (await model.getProperties()) || model.properties || {};

      // Build storey map using IfcRelContainedInSpatialStructure
      const elementStoreyMap = new Map<number, string>();
      for (const key of Object.keys(properties)) {
        const obj = properties[key];
        if (obj) {
          const typeStr = String(obj.type || obj.ObjectType || "").toUpperCase();
          if (typeStr.includes("RELCONTAINEDINSPATIALSTRUCTURE") || obj.type === 13123) {
            const relatedRef = obj.RelatedElements;
            const storeyRef = obj.RelatingStructure;
            if (relatedRef && storeyRef) {
              const storeyId = typeof storeyRef === "object" ? (storeyRef.value || storeyRef.id) : storeyRef;
              const storey = properties[storeyId];
              const storeyName = storey ? (storey.Name ? (typeof storey.Name === "object" ? storey.Name.value : storey.Name) : "Unknown Level") : "Level";
              
              const elements = Array.isArray(relatedRef) ? relatedRef : [relatedRef];
              for (const elRef of elements) {
                const elId = typeof elRef === "object" ? (elRef.value || elRef.id) : elRef;
                elementStoreyMap.set(Number(elId), String(storeyName));
              }
            }
          }
        }
      }

      const itemsMap = await model.getItems();
      
      for (const [id, item] of itemsMap.entries()) {
        const category = item.category || "Unknown";
        const isSpatial = ["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY"].includes(category.toUpperCase());
        
        if (isSpatial) continue; // Exclude spatial hierarchy components

        const dataRow = extractBIMData(id, item, properties, elementStoreyMap);
        this.rawData.push(dataRow);
      }

      this.filteredData = [...this.rawData];
      this.sortData();
      this.renderTableRows();

    } catch (e) {
      console.error("Error populating property table:", e);
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="4" style="color: var(--accent-pink); text-align: center; padding: 12px; font-style: italic;">
            Failed to load elements data.
          </td>
        </tr>
      `;
    }
  }

  /**
   * Toggles the table display visibility.
   */
  public toggle(visible: boolean): void {
    this.tableWrapper.style.display = visible ? "flex" : "none";
  }

  /**
   * Clears all table data.
   */
  public clear(): void {
    this.rawData = [];
    this.filteredData = [];
    this.activeModelId = null;
    this.clearRows();
  }

  private clearRows(): void {
    this.tableBody.innerHTML = `
      <tr>
        <td colspan="4" style="color: var(--text-muted); text-align: center; padding: 24px; font-style: italic;">
          No model loaded or selected.
        </td>
      </tr>
    `;
  }

  private createTableDOM(): void {
    const wrapper = document.createElement("div");
    wrapper.className = "property-table-wrapper glass-panel";
    
    // Bottom slide-up panel styles
    Object.assign(wrapper.style, {
      position: "absolute",
      left: "20px",
      right: "400px", // leave space for right panel
      bottom: "20px",
      height: "280px",
      zIndex: "10",
      display: "none", // Hidden by default, toggled via toolbar
      flexDirection: "column",
      pointerEvents: "auto",
      overflow: "hidden",
      padding: "14px"
    });

    wrapper.innerHTML = `
      <!-- Toolbar (drag handle) -->
      <div class="table-header-bar" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-table" style="color: var(--primary-purple); font-size: 14px;"></i>
          <span style="font-family: var(--font-title); font-weight: 700; color: var(--primary-purple); font-size: 13px; letter-spacing: 0.5px;">BULK ELEMENT SLICER</span>
          <span class="table-row-count" style="font-family: var(--font-body); font-size: 11px; color: var(--text-muted); margin-left: 4px;"></span>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="position: relative; width: 200px;">
            <input type="text" class="table-search" placeholder="Search…" style="width: 100%; padding: 6px 28px 6px 28px; background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-main); font-family: var(--font-body); font-size: 11px; outline: none;" />
            <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 9px; top: 8px; color: var(--text-muted); font-size: 10px;"></i>
          </div>

          <button class="tb-btn tb-select" title="Select all visible rows in 3D" data-no-drag>
            <i class="fa-solid fa-cubes"></i><span>Select in 3D</span>
          </button>
          <button class="tb-btn tb-columns" title="Show/hide columns" data-no-drag>
            <i class="fa-solid fa-table-columns"></i><span>Columns</span>
          </button>
          <button class="tb-btn tb-icon tb-expand" title="Toggle fullscreen" data-no-drag>
            <i class="fa-solid fa-expand"></i>
          </button>
          <button class="tb-btn tb-icon tb-more" title="More actions" data-no-drag>
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
      </div>

      <div style="flex: 1; overflow: auto; border: 1px solid var(--border-color); border-radius: var(--radius-xs);">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-family: var(--font-body); font-size: 11px;">
          <thead class="table-head" style="background: rgba(31, 58, 110, 0.10); position: sticky; top: 0; z-index: 2;"></thead>
          <tbody class="table-body"></tbody>
        </table>
      </div>
    `;

    // Inject toolbar button styles once
    if (!document.getElementById("tb-btn-style")) {
      const st = document.createElement("style");
      st.id = "tb-btn-style";
      st.innerHTML = `
        .tb-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px;
                  font-family: var(--font-body); font-size: 11px; font-weight: 600;
                  color: var(--text-secondary); background: transparent;
                  border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer;
                  transition: background var(--transition-fast), color var(--transition-fast); }
        .tb-btn:hover { background: var(--bg-hover); color: var(--primary-purple); border-color: var(--border-color); }
        .tb-btn.tb-icon { padding: 6px 8px; }
        .tb-btn.tb-active { background: var(--bg-active); color: var(--primary-purple); border-color: var(--primary-purple); }
        .tb-menu { position: absolute; background: #fff; border: 1px solid var(--border-color);
                   box-shadow: 0 8px 24px -6px rgba(20,42,85,0.18); border-radius: var(--radius-sm);
                   padding: 6px; min-width: 180px; z-index: 50; display: flex; flex-direction: column; gap: 2px; }
        .tb-menu button { display: flex; align-items: center; gap: 10px; padding: 8px 10px;
                          background: transparent; color: var(--text-main); font-size: 12px;
                          border-radius: var(--radius-xs); cursor: pointer; text-align: left; }
        .tb-menu button:hover { background: var(--bg-hover); color: var(--primary-purple); }
        .tb-menu label { display: flex; align-items: center; gap: 10px; padding: 8px 10px;
                         color: var(--text-main); font-size: 12px; cursor: pointer;
                         border-radius: var(--radius-xs); }
        .tb-menu label:hover { background: var(--bg-hover); }
      `;
      document.head.appendChild(st);
    }

    this.container.appendChild(wrapper);
    this.tableWrapper = wrapper;
    this.tableBody = wrapper.querySelector(".table-body")!;
    this.tableHead = wrapper.querySelector(".table-head")!;
    this.searchInput = wrapper.querySelector(".table-search")!;
    this.rowCountLabel = wrapper.querySelector(".table-row-count")!;

    this.searchInput.addEventListener("input", () => this.handleSearch());

    (wrapper.querySelector(".tb-select") as HTMLButtonElement).addEventListener("click", () => this.selectVisibleIn3D());
    (wrapper.querySelector(".tb-columns") as HTMLButtonElement).addEventListener("click", (e) => this.openColumnsMenu(e.currentTarget as HTMLElement));
    (wrapper.querySelector(".tb-expand") as HTMLButtonElement).addEventListener("click", () => this.toggleFullscreen());
    (wrapper.querySelector(".tb-more") as HTMLButtonElement).addEventListener("click", (e) => this.openMoreMenu(e.currentTarget as HTMLElement));

    this.renderHeader();
    this.clearRows();
  }

  private renderHeader(): void {
    this.tableHead.innerHTML = "";
    const tr = document.createElement("tr");
    for (const { key, label } of this.columnDefs) {
      if (!this.visibleColumns.has(key)) continue;
      const isActive = this.sortColumn === key;
      const icon = isActive ? (this.sortAscending ? "fa-sort-up" : "fa-sort-down") : "fa-sort";
      const color = isActive ? "var(--primary-purple)" : "var(--text-muted)";
      const th = document.createElement("th");
      th.dataset.col = key;
      th.style.cssText = "padding: 8px; font-weight: 700; color: var(--primary-purple); border-bottom: 1px solid var(--border-color); cursor: pointer; user-select: none;";
      th.innerHTML = `${label} <i class="fa-solid ${icon}" style="margin-left: 4px; font-size: 9px; color: ${color};"></i>`;
      th.addEventListener("click", () => this.handleSort(key, th));
      tr.appendChild(th);
    }
    this.tableHead.appendChild(tr);
  }

  /** Selects every currently-filtered row's element in the 3D view. */
  private selectVisibleIn3D(): void {
    if (!this.activeModelId || this.filteredData.length === 0) return;
    // Only highlight the first (selectElement is single-pick); user can multi-select via Ctrl in future.
    // For now: select the first visible row to confirm the action.
    this.selectionManager.selectElement(this.activeModelId, this.filteredData[0].id, true);
  }

  private openColumnsMenu(anchor: HTMLElement): void {
    this.closeOpenMenus();
    const menu = document.createElement("div");
    menu.className = "tb-menu tb-active-menu";
    for (const { key, label } of this.columnDefs) {
      const id = `col-${key}-${Math.random().toString(36).slice(2, 7)}`;
      const row = document.createElement("label");
      row.innerHTML = `<input type="checkbox" id="${id}" ${this.visibleColumns.has(key) ? "checked" : ""} /> ${label}`;
      (row.querySelector("input") as HTMLInputElement).addEventListener("change", (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        if (checked) this.visibleColumns.add(key); else this.visibleColumns.delete(key);
        if (this.visibleColumns.size === 0) { this.visibleColumns.add("id"); (e.target as HTMLInputElement).checked = false; }
        this.renderHeader();
        this.renderTableRows();
      });
      menu.appendChild(row);
    }
    this.positionMenu(menu, anchor);
  }

  private openMoreMenu(anchor: HTMLElement): void {
    this.closeOpenMenus();
    const menu = document.createElement("div");
    menu.className = "tb-menu tb-active-menu";
    const csv = document.createElement("button");
    csv.innerHTML = `<i class="fa-solid fa-file-csv" style="color: #15803d;"></i> Export to CSV`;
    csv.addEventListener("click", () => { this.exportCSV(); menu.remove(); });
    const print = document.createElement("button");
    print.innerHTML = `<i class="fa-solid fa-print" style="color: var(--primary-purple);"></i> Print`;
    print.addEventListener("click", () => { this.printTable(); menu.remove(); });
    menu.appendChild(csv);
    menu.appendChild(print);
    this.positionMenu(menu, anchor);
  }

  private positionMenu(menu: HTMLDivElement, anchor: HTMLElement): void {
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth)}px`;
    const closer = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node) && ev.target !== anchor) {
        menu.remove();
        document.removeEventListener("mousedown", closer, true);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", closer, true), 0);
  }

  private closeOpenMenus(): void {
    document.querySelectorAll(".tb-active-menu").forEach((el) => el.remove());
  }

  private exportCSV(): void {
    const cols = this.columnDefs.filter((c) => this.visibleColumns.has(c.key));
    const header = cols.map((c) => `"${c.label}"`).join(",");
    const rows = this.filteredData.map((row) =>
      cols.map((c) => `"${String(row[c.key]).replace(/"/g, '""')}"`).join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `properties_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private printTable(): void {
    const cols = this.columnDefs.filter((c) => this.visibleColumns.has(c.key));
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = this.filteredData.map((r) =>
      `<tr>${cols.map((c) => `<td>${String(r[c.key])}</td>`).join("")}</tr>`,
    ).join("");
    w.document.write(`<!doctype html><html><head><title>Properties</title>
      <style>
        body { font-family: sans-serif; padding: 16px; color: #0f1d36; }
        h1 { font-size: 16px; margin: 0 0 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
        th { background: #f4eee2; color: #1f3a6e; }
      </style></head><body>
      <h1>RUKNBIM — Element Properties (${this.filteredData.length} rows)</h1>
      <table><thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  private toggleFullscreen(): void {
    const w = this.tableWrapper;
    const expandBtn = w.querySelector(".tb-expand i") as HTMLElement;
    if (!this.isFullscreen) {
      this.prevStyle = { left: w.style.left, top: w.style.top, right: w.style.right, bottom: w.style.bottom, width: w.style.width, height: w.style.height };
      Object.assign(w.style, { left: "12px", top: "12px", right: "12px", bottom: "12px", width: "auto", height: "auto" });
      expandBtn.className = "fa-solid fa-compress";
      this.isFullscreen = true;
    } else {
      if (this.prevStyle) Object.assign(w.style, this.prevStyle);
      expandBtn.className = "fa-solid fa-expand";
      this.isFullscreen = false;
    }
  }

  private handleSearch(): void {
    const val = this.searchInput.value.toLowerCase().trim();
    if (val === "") {
      this.filteredData = [...this.rawData];
    } else {
      this.filteredData = this.rawData.filter(item => {
        return (
          item.id.toString().includes(val) ||
          item.guid.toLowerCase().includes(val) ||
          item.category.toLowerCase().includes(val) ||
          item.family.toLowerCase().includes(val) ||
          item.type.toLowerCase().includes(val) ||
          item.level.toLowerCase().includes(val)
        );
      });
    }

    this.renderTableRows();
  }

  private handleSort(column: keyof TableRowData, headerEl: Element): void {
    if (this.sortColumn === column) {
      this.sortAscending = !this.sortAscending;
    } else {
      this.sortColumn = column;
      this.sortAscending = true;
    }

    // Update headers icons
    const allHeaders = this.tableWrapper.querySelectorAll("thead th");
    allHeaders.forEach(th => {
      const icon = th.querySelector("i")!;
      icon.className = "fa-solid fa-sort";
      icon.style.color = "var(--text-muted)";
    });

    const activeIcon = headerEl.querySelector("i")!;
    activeIcon.className = this.sortAscending ? "fa-solid fa-sort-up" : "fa-solid fa-sort-down";
    activeIcon.style.color = "var(--primary-purple)";

    this.sortData();
    this.renderTableRows();
  }

  private sortData(): void {
    this.filteredData.sort((a, b) => {
      let valA = a[this.sortColumn];
      let valB = b[this.sortColumn];

      if (typeof valA === "number" && typeof valB === "number") {
        return this.sortAscending ? valA - valB : valB - valA;
      }

      valA = valA.toString().toLowerCase();
      valB = valB.toString().toLowerCase();

      if (valA < valB) return this.sortAscending ? -1 : 1;
      if (valA > valB) return this.sortAscending ? 1 : -1;
      return 0;
    });
  }

  private renderTableRows(): void {
    this.tableBody.innerHTML = "";

    if (this.rowCountLabel) {
      this.rowCountLabel.innerText = `(${this.filteredData.length} items)`;
    }

    const totalCols = this.columnDefs.filter(c => this.visibleColumns.has(c.key)).length;

    if (this.filteredData.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="${totalCols}" style="color: var(--text-muted); text-align: center; padding: 16px; font-style: italic;">
            No matching elements found.
          </td>
        </tr>
      `;
      return;
    }

    // Only render the first maxVisibleRows to maintain visual responsiveness
    const rowsToRender = this.filteredData.slice(0, this.maxVisibleRows);

    rowsToRender.forEach(row => {
      const tr = document.createElement("tr");
      
      // Inline styles for glass table rows
      Object.assign(tr.style, {
        borderBottom: "1px solid var(--border-color)",
        cursor: "pointer",
        transition: "background 0.2s"
      });

      let cellsHtml = "";
      for (const { key } of this.columnDefs) {
        if (!this.visibleColumns.has(key)) continue;
        const val = row[key];
        
        let style = "padding: 8px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;";
        const isQuantity = ["length", "width", "height", "grossArea", "netArea", "grossVolume", "netVolume"].includes(key);
        if (key === "id") {
          style = "padding: 8px; font-weight: 500; font-family: monospace; color: var(--text-muted);";
        } else if (key === "category" || key === "level" || key === "guid") {
          style = "padding: 8px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;";
        } else if (isQuantity) {
          style = "padding: 8px; font-family: monospace; text-align: right; color: var(--primary-purple);";
        }
        
        let displayVal = "";
        if (typeof val === "number") {
          displayVal = val > 0 ? val.toFixed(2) : "0.00";
        } else {
          displayVal = String(val ?? "N/A");
        }
        
        cellsHtml += `<td style="${style}" title="${displayVal}">${displayVal}</td>`;
      }
      
      tr.innerHTML = cellsHtml;

      tr.addEventListener("mouseenter", () => {
        tr.style.background = "var(--bg-hover)";
      });
      tr.addEventListener("mouseleave", () => {
        tr.style.background = "none";
      });

      // Selection row click event
      tr.addEventListener("click", () => {
        if (this.activeModelId) {
          this.selectionManager.selectElement(this.activeModelId, row.id, true);
        }
      });

      this.tableBody.appendChild(tr);
    });

    // If there are more elements, show a count notice
    if (this.filteredData.length > this.maxVisibleRows) {
      const trNotice = document.createElement("tr");
      trNotice.innerHTML = `
        <td colspan="${totalCols}" style="color: var(--text-muted); text-align: center; padding: 8px; font-style: italic; background: var(--bg-hover);">
          Showing ${this.maxVisibleRows} of ${this.filteredData.length} items (use search to narrow down results)
        </td>
      `;
      this.tableBody.appendChild(trNotice);
    }
  }
}
