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

    let html = `
      <div class="property-header" style="border-bottom: 2px solid var(--border-color); padding-bottom: 10px; margin-bottom: 14px;">
        <span class="category-badge" style="background: var(--purple-gradient); color: var(--text-bright); padding: 3px 8px; border-radius: var(--radius-xs); font-family: var(--font-title); font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">${category || "Element"}</span>
        <h3 style="margin-top: 6px; font-size: 15px; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
          ID: ${elementId}
        </h3>
        ${guid ? `<span style="font-family: monospace; font-size: 11px; color: var(--text-muted); word-break: break-all;">GUID: ${guid}</span>` : ""}
      </div>
    `;

    // 1. Direct Attributes Table
    html += `
      <div class="property-section" style="margin-bottom: 18px;">
        <h4 style="font-size: 12px; color: var(--primary-purple); border-left: 3px solid var(--primary-purple); padding-left: 8px; margin-bottom: 8px; font-family: var(--font-title);">Core Attributes</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
    `;
    
    // Add express ID and GUID as attributes if present
    const allAttributes = { ...attributes };
    if (guid) allAttributes["GlobalId"] = guid;

    if (Object.keys(allAttributes).length === 0) {
      html += `<tr><td colspan="2" style="color: var(--text-muted); font-style: italic; padding: 4px 0;">No attributes available</td></tr>`;
    } else {
      for (const attrKey in allAttributes) {
        const val = this.formatValue(allAttributes[attrKey]);
        html += `
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="color: var(--text-muted); font-weight: 500; width: 40%; padding: 6px 4px 6px 0; vertical-align: top;">${attrKey}</td>
            <td style="color: var(--text-main); font-weight: 600; padding: 6px 0 6px 4px; vertical-align: top; word-break: break-word;">${val}</td>
          </tr>
        `;
      }
    }
    html += `</table></div>`;

    // 2. Property Sets / Nested Groups
    if (Object.keys(propertySets).length > 0) {
      for (const setName in propertySets) {
        const setVal = propertySets[setName];
        if (typeof setVal === "object" && setVal !== null) {
          html += `
            <div class="property-section" style="margin-bottom: 18px;">
              <h4 style="font-size: 12px; color: var(--primary-purple); border-left: 3px solid var(--accent-pink); padding-left: 8px; margin-bottom: 8px; font-family: var(--font-title);">${setName}</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          `;
          
          let hasProps = false;
          for (const propKey in setVal) {
            hasProps = true;
            const val = this.formatValue(setVal[propKey]);
            html += `
              <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="color: var(--text-muted); font-weight: 500; width: 40%; padding: 6px 4px 6px 0; vertical-align: top;">${propKey}</td>
                <td style="color: var(--text-main); font-weight: 600; padding: 6px 0 6px 4px; vertical-align: top; word-break: break-word;">${val}</td>
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

    this.displayContainer.innerHTML = html;
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
