
import * as OBC from "@thatopen/components";
import type { IFCViewer } from "./IFCViewer";
import { makeDraggable } from "./Draggable";

export class ContextMenuModule {
  private viewer: IFCViewer;
  private container: HTMLElement;
  private menuEl!: HTMLDivElement;
  private activeModelId: string | null = null;
  private activeElementId: number | null = null;
  private hider: OBC.Hider;

  constructor(viewer: IFCViewer, container: HTMLElement) {
    this.viewer = viewer;
    this.container = container;
    this.hider = viewer.components.get(OBC.Hider);
    this.createMenuDOM();
  }

  public show(x: number, y: number, modelId: string, elementId: number): void {
    this.activeModelId = modelId;
    this.activeElementId = elementId;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuWidth = 200;
    const menuHeight = 260;

    let left = x;
    let top = y;
    if (left + menuWidth > vw - 20) left = vw - menuWidth - 20;
    if (top + menuHeight > vh - 20) top = vh - menuHeight - 20;

    Object.assign(this.menuEl.style, {
      display: "flex",
      left: `${left}px`,
      top: `${top}px`,
    });
  }

  public hide(): void {
    this.menuEl.style.display = "none";
  }

  private createMenuDOM(): void {
    this.menuEl = document.createElement("div");
    this.menuEl.className = "glass-panel context-menu-panel";
    Object.assign(this.menuEl.style, {
      position: "absolute",
      width: "200px",
      display: "none",
      flexDirection: "column",
      zIndex: "999",
      boxShadow: "var(--glass-shadow)",
      borderRadius: "var(--radius-md)",
      overflow: "hidden",
      pointerEvents: "auto",
    });

    this.menuEl.innerHTML = `
      <div class="menu-drag-handle" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(31, 58, 110, 0.08); border-bottom: 1px solid var(--border-color); cursor: grab; font-family: var(--font-title); font-size: 11px; font-weight: 700; color: var(--text-main); user-select: none;">
        <span>QUICK MENU</span>
        <button class="menu-close-btn" style="cursor: pointer; color: var(--text-muted); font-size: 10px; padding: 2px;"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="menu-items-list" style="display: flex; flex-direction: column; padding: 4px 0;">
        <button class="menu-item" data-action="props" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-size: 12px; text-align: left; cursor: pointer; color: var(--text-main);">
          <i class="fa-solid fa-circle-info" style="width: 14px; color: var(--primary-purple);"></i>
          Show Properties
        </button>
        <button class="menu-item" data-action="isolate" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-size: 12px; text-align: left; cursor: pointer; color: var(--text-main);">
          <i class="fa-solid fa-filter" style="width: 14px; color: var(--primary-purple);"></i>
          Isolate Selection
        </button>
        <button class="menu-item" data-action="hide" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-size: 12px; text-align: left; cursor: pointer; color: var(--text-main);">
          <i class="fa-solid fa-eye-slash" style="width: 14px; color: var(--text-secondary);"></i>
          Hide Selection
        </button>
        <button class="menu-item" data-action="show-all" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-size: 12px; text-align: left; cursor: pointer; color: var(--text-main);">
          <i class="fa-solid fa-eye" style="width: 14px; color: var(--primary-purple);"></i>
          Show All Objects
        </button>
        <div style="border-top: 1px solid var(--border-color); margin: 4px 0;"></div>
        <button class="menu-item" data-action="zoom" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-size: 12px; text-align: left; cursor: pointer; color: var(--text-main);">
          <i class="fa-solid fa-crosshairs" style="width: 14px; color: var(--primary-purple);"></i>
          Zoom To Selection
        </button>
        <button class="menu-item" data-action="copy-id" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-size: 12px; text-align: left; cursor: pointer; color: var(--text-main);">
          <i class="fa-solid fa-copy" style="width: 14px; color: var(--primary-purple);"></i>
          Copy Express ID
        </button>
        <button class="menu-item" data-action="issue" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-size: 12px; text-align: left; cursor: pointer; color: var(--text-main);">
          <i class="fa-solid fa-circle-exclamation" style="width: 14px; color: var(--accent-pink);"></i>
          Create Issue
        </button>
      </div>
    `;

    const items = this.menuEl.querySelectorAll(".menu-item");
    items.forEach((item: any) => {
      item.addEventListener("mouseenter", () => {
        item.style.background = "var(--bg-hover)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });
      item.addEventListener("click", () => {
        const action = item.getAttribute("data-action");
        if (action) this.handleAction(action);
      });
    });

    const closeBtn = this.menuEl.querySelector(".menu-close-btn")!;
    closeBtn.addEventListener("click", () => this.hide());

    this.container.appendChild(this.menuEl);

    const dragHandle = this.menuEl.querySelector(".menu-drag-handle") as HTMLDivElement;
    makeDraggable(this.menuEl, { handle: dragHandle });

    document.addEventListener("mousedown", (e: MouseEvent) => {
      if (this.menuEl.style.display !== "none" && !this.menuEl.contains(e.target as Node)) {
        if ((e.target as HTMLElement).closest(".issue-modal-overlay")) return;
        this.hide();
      }
    });
  }

  private async handleAction(action: string): Promise<void> {
    this.hide();
    if (!this.activeModelId || this.activeElementId === null) return;

    const modelId = this.activeModelId;
    const elementId = this.activeElementId;

    switch (action) {
      case "props": {
        const panel = (this.viewer.propertiesPanel as any)?.panelEl as HTMLElement | undefined;
        if (panel) {
          const btn = panel.querySelector(`.tab-btn[data-tab="props"]`) as HTMLButtonElement | null;
          btn?.click();
        }
        break;
      }
      case "isolate": {
        const map: OBC.ModelIdMap = { [modelId]: new Set([elementId]) };
        await this.hider.isolate(map);
        break;
      }
      case "hide": {
        const map: OBC.ModelIdMap = { [modelId]: new Set([elementId]) };
        await this.hider.set(false, map);
        this.viewer.propertiesPanel.selectionManager.clearSelection();
        break;
      }
      case "show-all": {
        await this.hider.set(true);
        break;
      }
      case "zoom": {
        const selectionMap: OBC.ModelIdMap = { [modelId]: new Set([elementId]) };
        const highlighter = this.viewer.propertiesPanel.selectionManager.highlighter;
        highlighter.highlightByID("select", selectionMap, true, true);
        break;
      }
      case "copy-id": {
        try {
          await navigator.clipboard.writeText(String(elementId));
          const toast = document.createElement("div");
          toast.className = "glass-panel";
          Object.assign(toast.style, {
            position: "fixed",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "8px 16px",
            color: "var(--text-bright)",
            background: "var(--purple-gradient)",
            fontSize: "12px",
            borderRadius: "var(--radius-sm)",
            zIndex: "1000",
            pointerEvents: "none",
            animation: "fadeInOut 2s ease forwards",
          });
          toast.innerText = `Copied Express ID #${elementId} to clipboard!`;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 2000);
        } catch (err) {
          alert(`Express ID: ${elementId}`);
        }
        break;
      }
      case "issue": {
        this.openCreateIssueModal(modelId, elementId);
        break;
      }
    }
  }

  private openCreateIssueModal(modelId: string, elementId: number): void {
    const model = this.viewer.loader.loadedModels.get(modelId) as any;
    const modelName = model?.name || "Model";

    const properties = model?.properties || {};
    const element = properties[elementId] || {};
    const category = element.type || element.category || "Element";

    let screenshotUrl = "";
    try {
      screenshotUrl = this.viewer.loader.takeScreenshot();
    } catch (e) {
      console.warn("Screenshot capture failed:", e);
    }

    const overlay = document.createElement("div");
    overlay.className = "issue-modal-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      background: "rgba(15, 29, 54, 0.4)",
      backdropFilter: "blur(6px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10000",
    });

    const modal = document.createElement("div");
    modal.className = "glass-panel";
    Object.assign(modal.style, {
      width: "440px",
      display: "flex",
      flexDirection: "column",
      padding: "20px",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--glass-shadow)",
      background: "var(--bg-panel)",
      border: "1px solid var(--border-color)",
    });

    modal.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 16px;">
        <span style="font-family: var(--font-title); font-size: 15px; font-weight: 700; color: var(--primary-purple);"><i class="fa-solid fa-circle-exclamation"></i> Create BCF Issue</span>
        <button class="close-issue-modal" style="cursor: pointer; color: var(--text-muted); font-size: 14px;"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px; flex: 1; overflow-y: auto; max-height: 480px; padding-right: 4px;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; color: var(--text-secondary);">ISSUE TITLE</label>
          <input type="text" id="issue-title" value="Issue with ${category} #${elementId}" style="padding: 8px 10px; font-size: 12.5px; border-radius: var(--radius-xs); border: 1px solid var(--border-color); background: #ffffff; color: var(--text-main);" />
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; color: var(--text-secondary);">DESCRIPTION</label>
          <textarea id="issue-desc" rows="3" placeholder="Enter problem details..." style="padding: 8px 10px; font-size: 12.5px; border-radius: var(--radius-xs); border: 1px solid var(--border-color); background: #ffffff; color: var(--text-main); font-family: inherit; resize: vertical;"></textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--text-secondary);">PRIORITY</label>
            <select id="issue-priority" style="padding: 8px; font-size: 12px; border-radius: var(--radius-xs); border: 1px solid var(--border-color); background: #ffffff; color: var(--text-main);">
              <option value="Low">Low</option>
              <option value="Medium" selected>Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--text-secondary);">STATUS</label>
            <select id="issue-status" style="padding: 8px; font-size: 12px; border-radius: var(--radius-xs); border: 1px solid var(--border-color); background: #ffffff; color: var(--text-main);">
              <option value="Open" selected>Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--text-secondary);">ASSOCIATED ELEMENT</label>
            <input type="text" value="${category} #${elementId}" disabled style="padding: 8px; font-size: 12px; border-radius: var(--radius-xs); border: 1px solid var(--border-color); background: rgba(31, 58, 110, 0.05); color: var(--text-muted);" />
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--text-secondary);">MODEL FILENAME</label>
            <input type="text" value="${modelName}" disabled style="padding: 8px; font-size: 12px; border-radius: var(--radius-xs); border: 1px solid var(--border-color); background: rgba(31, 58, 110, 0.05); color: var(--text-muted);" />
          </div>
        </div>

        ${screenshotUrl ? `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; color: var(--text-secondary);">VIEWPORT ATTACHMENT</label>
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden; height: 120px; background: #000; position: relative;">
            <img src="${screenshotUrl}" style="width: 100%; height: 100%; object-fit: contain;" />
          </div>
        </div>
        ` : ""}
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 14px; margin-top: 16px;">
        <button class="btn-outline close-issue-modal" style="padding: 8px 16px; font-size: 12px;">Cancel</button>
        <button id="save-issue-btn" class="btn-primary" style="padding: 8px 16px; font-size: 12px; color: var(--text-bright); display: flex; align-items: center; gap: 4px;">
          <i class="fa-solid fa-floppy-disk"></i> Save & Export
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeBtns = overlay.querySelectorAll(".close-issue-modal");
    closeBtns.forEach((btn) => {
      btn.addEventListener("click", () => overlay.remove());
    });

    const saveBtn = overlay.querySelector("#save-issue-btn")!;
    saveBtn.addEventListener("click", () => {
      const title = (overlay.querySelector("#issue-title") as HTMLInputElement).value;
      const desc = (overlay.querySelector("#issue-desc") as HTMLTextAreaElement).value;
      const priority = (overlay.querySelector("#issue-priority") as HTMLSelectElement).value;
      const status = (overlay.querySelector("#issue-status") as HTMLSelectElement).value;

      const issueData = {
        issueId: crypto.randomUUID?.() || Math.random().toString(36).substring(2, 9),
        title,
        description: desc,
        priority,
        status,
        modelId,
        modelName,
        elementId,
        category,
        timestamp: new Date().toISOString(),
        screenshot: screenshotUrl || null,
      };

      const blob = new Blob([JSON.stringify(issueData, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `BCF-Issue-${elementId}.json`;
      link.click();
      URL.revokeObjectURL(link.href);

      overlay.remove();

      const successToast = document.createElement("div");
      successToast.className = "glass-panel";
      Object.assign(successToast.style, {
        position: "fixed",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 16px",
        color: "var(--text-bright)",
        background: "var(--purple-gradient)",
        fontSize: "12px",
        borderRadius: "var(--radius-sm)",
        zIndex: "1000",
        pointerEvents: "none",
        animation: "fadeInOut 2s ease forwards",
      });
      successToast.innerText = `Issue created and exported successfully!`;
      document.body.appendChild(successToast);
      setTimeout(() => successToast.remove(), 2000);
    });
  }
}
