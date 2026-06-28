import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { IFCViewer } from "./IFCViewer";

type RibbonButton = {
  id: string;
  label: string;
  icon: string;
  type: "panel" | "action";
  build?: (panelBody: HTMLDivElement, viewer: IFCViewer) => void | (() => void);
  action?: (viewer: IFCViewer) => void;
};

export class LeftRibbonModule {
  private viewer: IFCViewer;
  private container: HTMLElement;
  private root!: HTMLDivElement;
  private ribbon!: HTMLDivElement;
  private panel!: HTMLDivElement;
  private panelTitle!: HTMLSpanElement;
  private panelBody!: HTMLDivElement;
  private activeId: string | null = null;
  private currentTeardown: (() => void) | null = null;

  private buttons: RibbonButton[] = [
    {
      id: "models",
      label: "Models",
      icon: "fa-solid fa-cube",
      type: "panel",
      build: (body, viewer) => this.buildModelsPanel(body, viewer),
    },
    {
      id: "tree",
      label: "Hierarchy",
      icon: "fa-solid fa-folder-tree",
      type: "action",
      action: () => this.openPropsTab("tree"),
    },
    {
      id: "levels",
      label: "Levels",
      icon: "fa-solid fa-layer-group",
      type: "action",
      action: () => this.openPropsTab("storeys"),
    },
    {
      id: "props",
      label: "Properties",
      icon: "fa-solid fa-circle-info",
      type: "action",
      action: () => this.openPropsTab("props"),
    },
    {
      id: "table",
      label: "Properties Table",
      icon: "fa-solid fa-table",
      type: "action",
      action: (viewer) => viewer.propertyTable.toggle(true),
    },
    {
      id: "ghost",
      label: "Ghost Mode",
      icon: "fa-solid fa-ghost",
      type: "action",
      action: () => this.openPropsTab("ghost"),
    },
    {
      id: "export",
      label: "Export Tools",
      icon: "fa-solid fa-camera",
      type: "action",
      action: () => this.openPropsTab("export"),
    },
    {
      id: "settings",
      label: "Settings",
      icon: "fa-solid fa-gear",
      type: "panel",
      build: (body) => this.buildSettingsPanel(body),
    },
  ];

  constructor(viewer: IFCViewer, container: HTMLElement) {
    this.viewer = viewer;
    this.container = container;
  }

  public mount(): void {
    this.root = document.createElement("div");
    this.root.className = "left-ribbon-root";
    Object.assign(this.root.style, {
      position: "absolute",
      top: "20px",
      left: "20px",
      bottom: "100px",
      display: "flex",
      zIndex: "15",
      pointerEvents: "auto",
      gap: "0",
    });

    this.ribbon = this.buildRibbon();
    this.panel = this.buildPanel();

    this.root.appendChild(this.ribbon);
    this.root.appendChild(this.panel);
    this.container.appendChild(this.root);
  }

  private buildRibbon(): HTMLDivElement {
    const ribbon = document.createElement("div");
    ribbon.className = "glass-panel";
    Object.assign(ribbon.style, {
      width: "52px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "10px 0",
      gap: "4px",
      borderTopRightRadius: "0",
      borderBottomRightRadius: "0",
    });

    for (const btn of this.buttons) {
      const el = document.createElement("button");
      el.className = "ribbon-btn";
      el.dataset.id = btn.id;
      el.title = btn.label;
      Object.assign(el.style, {
        width: "36px",
        height: "36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        background: "transparent",
        color: "var(--text-secondary)",
        fontSize: "15px",
        cursor: "pointer",
        transition: "background var(--transition-fast), color var(--transition-fast)",
        border: "1px solid transparent",
      });
      el.innerHTML = `<i class="${btn.icon}"></i>`;
      el.addEventListener("mouseenter", () => {
        if (this.activeId !== btn.id) {
          el.style.background = "var(--bg-hover)";
          el.style.color = "var(--primary-purple)";
        }
      });
      el.addEventListener("mouseleave", () => {
        if (this.activeId !== btn.id) {
          el.style.background = "transparent";
          el.style.color = "var(--text-secondary)";
        }
      });
      el.addEventListener("click", () => this.handleClick(btn));
      ribbon.appendChild(el);
    }

    return ribbon;
  }

  private buildPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = "glass-panel";
    Object.assign(panel.style, {
      width: "0",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      transition: "width var(--transition-normal)",
      borderTopLeftRadius: "0",
      borderBottomLeftRadius: "0",
      borderLeft: "0",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 14px",
      borderBottom: "1px solid var(--border-color)",
      flexShrink: "0",
    });

    const titleWrap = document.createElement("div");
    titleWrap.style.display = "flex";
    titleWrap.style.flexDirection = "column";
    titleWrap.style.gap = "2px";

    const title = document.createElement("span");
    Object.assign(title.style, {
      fontFamily: "var(--font-title)",
      fontSize: "15px",
      fontWeight: "700",
      color: "var(--text-main)",
    });
    title.innerText = "";
    titleWrap.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
    Object.assign(closeBtn.style, {
      width: "26px",
      height: "26px",
      borderRadius: "var(--radius-xs)",
      color: "var(--text-muted)",
      cursor: "pointer",
      fontSize: "13px",
    });
    closeBtn.addEventListener("click", () => this.closePanel());

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    Object.assign(body.style, {
      flex: "1",
      overflow: "auto",
      padding: "14px",
    });

    panel.appendChild(header);
    panel.appendChild(body);

    this.panelTitle = title;
    this.panelBody = body;
    return panel;
  }

  private handleClick(btn: RibbonButton): void {
    if (btn.type === "action") {
      this.highlightTransient(btn.id);
      btn.action?.(this.viewer);
      return;
    }
    if (this.activeId === btn.id) {
      this.closePanel();
      return;
    }
    this.openPanel(btn);
  }

  private openPanel(btn: RibbonButton): void {
    this.currentTeardown?.();
    this.currentTeardown = null;
    this.activeId = btn.id;
    this.panelTitle.innerText = btn.label;
    this.panelBody.innerHTML = "";
    const result = btn.build?.(this.panelBody, this.viewer);
    if (typeof result === "function") this.currentTeardown = result;
    const panelWidth = btn.id === "models" ? "360px" : "280px";
    this.panel.style.width = panelWidth;
    this.refreshActiveStyling();
  }

  private closePanel(): void {
    this.activeId = null;
    this.currentTeardown?.();
    this.currentTeardown = null;
    this.panel.style.width = "0";
    this.refreshActiveStyling();
  }

  private highlightTransient(id: string): void {
    const el = this.ribbon.querySelector(`[data-id="${id}"]`) as HTMLButtonElement | null;
    if (!el) return;
    el.style.background = "var(--bg-active)";
    el.style.color = "var(--primary-purple)";
    setTimeout(() => {
      if (this.activeId !== id) {
        el.style.background = "transparent";
        el.style.color = "var(--text-secondary)";
      }
    }, 220);
  }

  private refreshActiveStyling(): void {
    const els = this.ribbon.querySelectorAll<HTMLButtonElement>(".ribbon-btn");
    els.forEach((el) => {
      const isActive = el.dataset.id === this.activeId;
      el.style.background = isActive ? "var(--bg-active)" : "transparent";
      el.style.color = isActive ? "var(--primary-purple)" : "var(--text-secondary)";
      el.style.borderColor = isActive ? "var(--primary-purple)" : "transparent";
    });
  }

  private openPropsTab(tab: string): void {
    // PropertiesPanelModule keeps switchTab private; we re-open by simulating a tab click.
    const panel = (this.viewer.propertiesPanel as any)?.panelEl as HTMLElement | undefined;
    if (!panel) return;
    const btn = panel.querySelector(`.tab-btn[data-tab="${tab}"]`) as HTMLButtonElement | null;
    btn?.click();
  }

  /** Models list with visibility, focus, and remove actions. */
  private buildModelsPanel(body: HTMLDivElement, viewer: IFCViewer): () => void {
    const render = () => {
      body.innerHTML = "";

      // Load button (always at top)
      const loadBtn = document.createElement("button");
      loadBtn.className = "btn-primary";
      loadBtn.innerHTML = `<i class="fa-solid fa-file-import"></i> Load IFC / FRAG`;
      Object.assign(loadBtn.style, {
        width: "100%",
        marginBottom: "12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        fontSize: "12px",
      });
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".ifc,.frag";
      fileInput.multiple = true;
      fileInput.style.display = "none";
      fileInput.addEventListener("change", async () => {
        if (!fileInput.files || fileInput.files.length === 0) return;
        loadBtn.disabled = true;
        loadBtn.style.opacity = "0.5";
        for (const file of Array.from(fileInput.files)) {
          try {
            if (file.name.toLowerCase().endsWith(".ifc")) await viewer.loader.loadIFC(file);
            else if (file.name.toLowerCase().endsWith(".frag")) await viewer.loader.loadFrag(file);
          } catch (e) { console.error(e); }
        }
        loadBtn.disabled = false;
        loadBtn.style.opacity = "1";
        fileInput.value = "";
        render();
      });
      loadBtn.addEventListener("click", () => fileInput.click());
      body.appendChild(loadBtn);
      body.appendChild(fileInput);

      const models = Array.from(viewer.loader.loadedModels.entries());
      if (models.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "color: var(--text-muted); font-style: italic; text-align: center; padding: 24px 0; font-size: 12px;";
        empty.innerText = "No models loaded yet.";
        body.appendChild(empty);
        return;
      }
      const list = document.createElement("div");
      Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "5px" });

      for (const [id, model] of models) {
        const row = document.createElement("div");
        Object.assign(row.style, {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "5px 8px",
          background: "var(--bg-hover)",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-sm)",
        });

        const eye = document.createElement("button");
        let visible = (model.object?.visible ?? true) as boolean;
        const setEyeIcon = () => {
          eye.innerHTML = `<i class="fa-solid ${visible ? "fa-eye" : "fa-eye-slash"}"></i>`;
        };
        setEyeIcon();
        Object.assign(eye.style, {
          width: "24px",
          height: "24px",
          color: "var(--primary-purple)",
          cursor: "pointer",
          fontSize: "11px",
          flexShrink: "0",
        });
        eye.addEventListener("click", () => {
          visible = !visible;
          if (model.object) model.object.visible = visible;
          setEyeIcon();
        });

        const label = document.createElement("div");
        Object.assign(label.style, {
          flex: "1",
          fontSize: "12px",
          color: "var(--text-main)",
          wordBreak: "break-all",
          lineHeight: "1.3",
        });
        label.innerText = model.name ?? id;
        label.title = model.name ?? id;

        const focus = document.createElement("button");
        focus.innerHTML = `<i class="fa-solid fa-crosshairs"></i>`;
        focus.title = "Focus on model";
        Object.assign(focus.style, {
          width: "24px",
          height: "24px",
          color: "var(--primary-purple)",
          cursor: "pointer",
          fontSize: "11px",
          flexShrink: "0",
        });
        focus.addEventListener("click", async () => {
          const cam: any = (viewer.world as any).camera;
          if (!cam?.controls || !model?.box) return;
          if (typeof cam.controls.fitToBox === "function") {
            await cam.controls.fitToBox(model.box, true);
          }
        });

        const remove = document.createElement("button");
        remove.innerHTML = `<i class="fa-solid fa-trash"></i>`;
        remove.title = "Remove model";
        Object.assign(remove.style, {
          width: "24px",
          height: "24px",
          color: "#b91c1c",
          cursor: "pointer",
          fontSize: "11px",
          flexShrink: "0",
        });
        remove.addEventListener("click", async () => {
          await viewer.loader.unloadModel(id);
          render();
        });

        row.appendChild(eye);
        row.appendChild(label);
        row.appendChild(focus);
        row.appendChild(remove);
        list.appendChild(row);
      }
      body.appendChild(list);
    };

    render();

    // Re-render the models list whenever a new model lands or one is removed.
    const prev = viewer.loader.onModelLoaded;
    viewer.loader.onModelLoaded = async (modelId, model) => {
      if (prev) await prev(modelId, model);
      render();
    };
    return () => {
      viewer.loader.onModelLoaded = prev;
    };
  }

  private buildSettingsPanel(body: HTMLDivElement): void {
    const scene = (this.viewer.world as any).scene;
    const renderer = (this.viewer.world as any).renderer;
    const grids = this.viewer.components.get(OBC.Grids) as any;
    const grid = grids.list.get(this.viewer.world.uuid);

    const isGridVisible = grid ? grid.visible : true;
    const isShadowsEnabled = scene ? scene.shadowsEnabled : true;
    const isPostEnabled = renderer?.postproduction ? renderer.postproduction.enabled : true;
    const isOutlinesEnabled = renderer?.postproduction ? renderer.postproduction.outlinesEnabled : true;

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="display: block; font-size: 11px; color: var(--text-secondary); font-family: var(--font-title); font-weight: 700; letter-spacing: 0.5px; margin-bottom: 6px;">BACKGROUND</label>
          <input type="color" id="settings-bg" value="#ede5d4" style="width: 100%; height: 36px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: white; cursor: pointer;" />
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 12px;">
          <label style="display: block; font-size: 11px; color: var(--text-secondary); font-family: var(--font-title); font-weight: 700; letter-spacing: 0.5px; margin-bottom: 6px;">RENDERER SETTINGS</label>
          
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: var(--text-main); user-select: none;">
            <input type="checkbox" id="settings-grid" ${isGridVisible ? "checked" : ""} style="accent-color: var(--primary-purple);" />
            Show Grid
          </label>
          
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: var(--text-main); user-select: none;">
            <input type="checkbox" id="settings-shadows" ${isShadowsEnabled ? "checked" : ""} style="accent-color: var(--primary-purple);" />
            Enable Shadows
          </label>

          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: var(--text-main); user-select: none;">
            <input type="checkbox" id="settings-post" ${isPostEnabled ? "checked" : ""} style="accent-color: var(--primary-purple);" />
            Enable Postproduction
          </label>

          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: var(--text-main); user-select: none;">
            <input type="checkbox" id="settings-outlines" ${isOutlinesEnabled ? "checked" : ""} style="accent-color: var(--primary-purple);" />
            Render Outlines
          </label>
        </div>
      </div>
    `;

    const bg = body.querySelector("#settings-bg") as HTMLInputElement;
    bg.addEventListener("input", () => {
      if (scene?.three) scene.three.background = new THREE.Color(bg.value);
    });

    const gridCheckbox = body.querySelector("#settings-grid") as HTMLInputElement;
    gridCheckbox.addEventListener("change", () => {
      if (grid) grid.visible = gridCheckbox.checked;
    });

    const shadowsCheckbox = body.querySelector("#settings-shadows") as HTMLInputElement;
    shadowsCheckbox.addEventListener("change", () => {
      if (scene) {
        scene.shadowsEnabled = shadowsCheckbox.checked;
      }
    });

    const postCheckbox = body.querySelector("#settings-post") as HTMLInputElement;
    postCheckbox.addEventListener("change", () => {
      if (renderer?.postproduction) {
        renderer.postproduction.enabled = postCheckbox.checked;
      }
    });

    const outlinesCheckbox = body.querySelector("#settings-outlines") as HTMLInputElement;
    outlinesCheckbox.addEventListener("change", () => {
      if (renderer?.postproduction) {
        renderer.postproduction.outlinesEnabled = outlinesCheckbox.checked;
      }
    });
  }


}
