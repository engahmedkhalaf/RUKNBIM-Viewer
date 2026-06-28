export class PropertyDisplayManager {
  private displayContainer: HTMLElement;

  constructor(displayContainer: HTMLElement) {
    this.displayContainer = displayContainer;
    this.clear();
  }

  /**
   * Clears the displayed properties.
   */
  public clear(): void {
    this.displayContainer.innerHTML = `
      <div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 20px; font-size: 13px;">
        Select an element in the viewer or the project tree to inspect its properties.
      </div>
    `;
  }

  /**
   * Renders properties for a selected element.
   * Accepts either the raw shape ({ category, guid, data }) or the new
   * fragments 3.x flat shape where the item is itself the attribute bag.
   */
  public render(elementId: number, itemData: any): void {
    if (!itemData || (typeof itemData === "object" && Object.keys(itemData).length === 0)) {
      this.displayContainer.innerHTML = `
        <div style="color: #b45309; text-align: center; padding: 20px; font-size: 13px;">
          No property data found for element ID: ${elementId}.
        </div>
      `;
      return;
    }

    // Normalize: derive category, guid, and the attribute source map.
    let category: string | undefined;
    let guid: string | undefined;
    let attrSource: Record<string, any>;
    let relationsSource: Record<string, any[]> = {};

    if (itemData.data && (itemData.category || itemData.guid)) {
      // Raw shape
      category = itemData.category;
      guid = itemData.guid;
      attrSource = itemData.data || {};
    } else {
      // Flat shape: top-level keys are either attributes or arrays of related ItemData
      attrSource = {};
      for (const key of Object.keys(itemData)) {
        const v = itemData[key];
        if (Array.isArray(v)) {
          relationsSource[key] = v;
        } else {
          attrSource[key] = v;
        }
      }
      category = this.unwrap(attrSource["category"]) || this.unwrap(attrSource["Category"]);
      guid = this.unwrap(attrSource["GlobalId"]) || this.unwrap(attrSource["guid"]);
    }

    const attributes: Record<string, any> = {};
    const propertySets: Record<string, any> = {};

    const standardAttrs = ["Name", "Description", "GlobalId", "ObjectType", "Tag", "PredefinedType", "category", "Category"];
    for (const key in attrSource) {
      const v = attrSource[key];
      if (standardAttrs.includes(key) || v === null || v === undefined || typeof v !== "object" || "value" in v) {
        attributes[key] = v;
      } else {
        propertySets[key] = v;
      }
    }

    // Promote relation arrays (IsDefinedBy → Pset_*, HasAssociations → classifications, etc.) into propertySets
    for (const relKey of Object.keys(relationsSource)) {
      const arr = relationsSource[relKey];
      for (let i = 0; i < arr.length; i++) {
        const rel = arr[i];
        const setName = this.unwrap(rel?.Name) || `${relKey}[${i}]`;
        propertySets[setName] = this.flattenAttributes(rel);
      }
    }

    // Classify into Sub-Tabs: Summary, Location, Material, PartOf, Properties
    const summaryProps: Record<string, any> = {
      "Express ID": elementId,
      "Category": category || "Element",
      "GUID": guid || "N/A",
      "Name": this.unwrap(attributes["Name"]) || "Unnamed Element",
      "Description": this.unwrap(attributes["Description"]) || "N/A",
      "Type Name": this.unwrap(attributes["ObjectType"]) || "Standard",
      "Predefined Type": this.unwrap(attributes["PredefinedType"]) || "NOTDEFINED",
      "Tag": this.unwrap(attributes["Tag"]) || "N/A"
    };

    const locationProps: Record<string, any> = {};
    const materialProps: Record<string, any> = {};
    const partOfProps: Record<string, any> = {};
    const allProps: Record<string, any> = { ...propertySets };

    // Search and pull properties into location, material, partOf
    const extractProps = (setName: string, map: Record<string, any>) => {
      const lowerSetName = setName.toLowerCase();
      
      // Material sets
      if (lowerSetName.includes("material")) {
        for (const k of Object.keys(map)) {
          materialProps[k] = map[k];
        }
      }
      
      // Location / Quantities
      if (lowerSetName.includes("quantity") || lowerSetName.includes("location") || lowerSetName.includes("basequantities")) {
        for (const k of Object.keys(map)) {
          locationProps[k] = map[k];
        }
      }

      // Scan individual keys
      for (const k of Object.keys(map)) {
        const lowerK = k.toLowerCase();
        const val = map[k];
        
        if (lowerK.includes("material")) {
          materialProps[k] = val;
        }
        if (lowerK.includes("level") || lowerK.includes("storey") || lowerK.includes("buildingstorey") || lowerK.includes("referencelevel")) {
          partOfProps[k] = val;
        }
        if (["length", "area", "volume", "height", "width", "netlength", "netarea", "netvolume", "grossvolume", "grossarea"].includes(lowerK)) {
          locationProps[k] = val;
        }
      }
    };

    // Scan standard attributes and property sets
    extractProps("Core Attributes", attributes);
    for (const setName of Object.keys(propertySets)) {
      extractProps(setName, propertySets[setName]);
    }

    // Default Fallbacks
    if (Object.keys(locationProps).length === 0) locationProps["Location Status"] = "Standard Spatial Coordinates";
    if (Object.keys(materialProps).length === 0) materialProps["Material Name"] = "Default Material Assignment";
    if (Object.keys(partOfProps).length === 0) partOfProps["Level Context"] = "Default Building Storey Container";

    let html = `
      <div class="property-header" style="padding-bottom: 6px; margin-bottom: 8px;">
        <span class="category-badge" style="background: var(--purple-gradient); color: var(--text-bright); padding: 3px 8px; border-radius: var(--radius-xs); font-family: var(--font-title); font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">${category || "Element"}</span>
        <h3 style="margin-top: 6px; font-size: 14px; color: var(--text-main); margin-bottom: 4px;">Element Properties</h3>
      </div>

      <!-- Property Sub-Tabs -->
      <div class="prop-sub-tabs" style="display: flex; gap: 2px; border-bottom: 1px solid var(--border-color); margin-bottom: 12px; background: rgba(255,255,255,0.02); padding: 2px 2px 0;">
        <button class="prop-sub-btn active-subtab" data-subtab="summary" style="flex: 1; padding: 6px 2px; font-family: var(--font-title); font-size: 9px; font-weight: 700; color: var(--primary-purple); text-align: center; border-bottom: 2px solid var(--primary-purple); background: none; border: none; cursor: pointer; letter-spacing: 0.5px;">SUMMARY</button>
        <button class="prop-sub-btn" data-subtab="location" style="flex: 1; padding: 6px 2px; font-family: var(--font-title); font-size: 9px; font-weight: 700; color: var(--text-muted); text-align: center; border-bottom: 2px solid transparent; background: none; border: none; cursor: pointer; letter-spacing: 0.5px;">LOCATION</button>
        <button class="prop-sub-btn" data-subtab="material" style="flex: 1; padding: 6px 2px; font-family: var(--font-title); font-size: 9px; font-weight: 700; color: var(--text-muted); text-align: center; border-bottom: 2px solid transparent; background: none; border: none; cursor: pointer; letter-spacing: 0.5px;">MATERIAL</button>
        <button class="prop-sub-btn" data-subtab="partof" style="flex: 1; padding: 6px 2px; font-family: var(--font-title); font-size: 9px; font-weight: 700; color: var(--text-muted); text-align: center; border-bottom: 2px solid transparent; background: none; border: none; cursor: pointer; letter-spacing: 0.5px;">PART OF</button>
        <button class="prop-sub-btn" data-subtab="all" style="flex: 1; padding: 6px 2px; font-family: var(--font-title); font-size: 9px; font-weight: 700; color: var(--text-muted); text-align: center; border-bottom: 2px solid transparent; background: none; border: none; cursor: pointer; letter-spacing: 0.5px;">PROPERTIES</button>
      </div>

      <!-- Tab Content Panes -->
      <div class="prop-sub-pane" id="pane-summary" style="display: block;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
    `;

    // Render Summary Table
    for (const key in summaryProps) {
      const val = this.formatValue(summaryProps[key]);
      html += `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="color: var(--text-muted); font-weight: 500; width: 40%; padding: 6px 4px 6px 0; vertical-align: top;">${key}</td>
          <td style="color: var(--text-main); font-weight: 600; padding: 6px 0 6px 4px; vertical-align: top; word-break: break-word;">${val}</td>
        </tr>
      `;
    }
    html += `</table></div>`;

    // Render Location Table
    html += `<div class="prop-sub-pane" id="pane-location" style="display: none;">
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">`;
    for (const key in locationProps) {
      const val = this.formatValue(locationProps[key]);
      html += `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="color: var(--text-muted); font-weight: 500; width: 40%; padding: 6px 4px 6px 0; vertical-align: top;">${key}</td>
          <td style="color: var(--text-main); font-weight: 600; padding: 6px 0 6px 4px; vertical-align: top; word-break: break-word;">${val}</td>
        </tr>
      `;
    }
    html += `</table></div>`;

    // Render Material Table
    html += `<div class="prop-sub-pane" id="pane-material" style="display: none;">
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">`;
    for (const key in materialProps) {
      const val = this.formatValue(materialProps[key]);
      html += `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="color: var(--text-muted); font-weight: 500; width: 40%; padding: 6px 4px 6px 0; vertical-align: top;">${key}</td>
          <td style="color: var(--text-main); font-weight: 600; padding: 6px 0 6px 4px; vertical-align: top; word-break: break-word;">${val}</td>
        </tr>
      `;
    }
    html += `</table></div>`;

    // Render PartOf Table
    html += `<div class="prop-sub-pane" id="pane-partof" style="display: none;">
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">`;
    for (const key in partOfProps) {
      const val = this.formatValue(partOfProps[key]);
      html += `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="color: var(--text-muted); font-weight: 500; width: 40%; padding: 6px 4px 6px 0; vertical-align: top;">${key}</td>
          <td style="color: var(--text-main); font-weight: 600; padding: 6px 0 6px 4px; vertical-align: top; word-break: break-word;">${val}</td>
        </tr>
      `;
    }
    html += `</table></div>`;

    // Render Properties (All) Table
    html += `<div class="prop-sub-pane" id="pane-all" style="display: none;">`;
    if (Object.keys(allProps).length === 0) {
      html += `<div style="color: var(--text-muted); font-style: italic; padding: 8px 0; font-size: 12px;">No additional property sets available.</div>`;
    } else {
      for (const setName in allProps) {
        const setVal = allProps[setName];
        if (typeof setVal === "object" && setVal !== null) {
          html += `
            <div class="property-section" style="margin-bottom: 14px;">
              <h4 style="font-size: 11px; color: var(--primary-purple); border-left: 2px solid var(--accent-pink); padding-left: 6px; margin-bottom: 6px; font-family: var(--font-title); text-transform: uppercase;">${setName}</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          `;
          let hasProps = false;
          for (const propKey in setVal) {
            hasProps = true;
            const val = this.formatValue(setVal[propKey]);
            html += `
              <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="color: var(--text-muted); font-weight: 500; width: 40%; padding: 4px 4px 4px 0; vertical-align: top;">${propKey}</td>
                <td style="color: var(--text-main); font-weight: 600; padding: 4px 0 4px 4px; vertical-align: top; word-break: break-word;">${val}</td>
              </tr>
            `;
          }
          if (!hasProps) {
            html += `<tr><td colspan="2" style="color: var(--text-muted); font-style: italic; padding: 4px 0;">Empty property set</td></tr>`;
          }
          html += `</table></div>`;
        }
      }
    }
    html += `</div>`;

    this.displayContainer.innerHTML = html;

    // Wire up property tab buttons click listeners
    const tabBtns = this.displayContainer.querySelectorAll(".prop-sub-btn");
    const panes = this.displayContainer.querySelectorAll(".prop-sub-pane");

    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-subtab")!;
        
        tabBtns.forEach(b => {
          b.classList.remove("active-subtab");
          (b as HTMLElement).style.color = "var(--text-muted)";
          (b as HTMLElement).style.borderBottomColor = "transparent";
        });

        btn.classList.add("active-subtab");
        (btn as HTMLElement).style.color = "var(--primary-purple)";
        (btn as HTMLElement).style.borderBottomColor = "var(--primary-purple)";

        panes.forEach(pane => {
          const id = pane.getAttribute("id")!;
          if (id === `pane-${targetTab}`) {
            (pane as HTMLElement).style.display = "block";
          } else {
            (pane as HTMLElement).style.display = "none";
          }
        });
      });
    });
  }

  private formatValue(value: any): string {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "object") {
      if ("value" in value) return this.formatValue((value as any).value);
      return JSON.stringify(value);
    }
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return value.toString();
  }

  /** Returns the unwrapped primitive from a fragments attribute or a primitive itself. */
  private unwrap(v: any): any {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "object" && "value" in v) return (v as any).value;
    return v;
  }

  /** Flattens a relation item (nested ItemData) into a plain key→value map for table rendering. */
  private flattenAttributes(item: any): Record<string, any> {
    if (!item || typeof item !== "object") return {};
    const out: Record<string, any> = {};
    for (const k of Object.keys(item)) {
      const v = item[k];
      if (Array.isArray(v)) {
        // Skip deeper relations to keep the table readable
        continue;
      }
      out[k] = v;
    }
    return out;
  }
}
