# RUKNBIM — Implementation Plan

> **27-day phased build plan** for the RUKNBIM experimental IFC viewer with AI-powered BIM assistant.

---

## Phase 1 — Project Setup & Scaffolding
**Timeline: Day 1**

### Tasks

#### 1.1 Init Vite + TypeScript Project `easy`
Scaffold with Vite, configure tsconfig, install all dependencies.
```bash
npm create vite@latest
npm install @thatopen/components @thatopen/components-front @thatopen/ui @thatopen/ui-obc three web-ifc
npm install -D typescript vite
```

#### 1.2 Configure vite.config.ts `easy`
WASM support, worker config, alias paths, public dir for `worker.mjs`.

#### 1.3 index.html + Global CSS `easy`
Font Awesome 6.5.1 CDN, base layout, CSS variables for purple gradient theme, glassmorphic styling foundation.

#### 1.4 main.ts + IFCViewer.ts Skeleton `easy`
Entry point and main orchestration class that wires all modules together.

---

## Phase 2 — Core Viewer & IFC Loading
**Timeline: Days 2–4**

### Foundation

#### 2.1 ViewerInitializer.ts `medium`
OBC World setup, scene/camera/renderer, ambient occlusion, cast shadows, grid.
- Set `COORDINATE_TO_ORIGIN = false` for multi-model alignment
- Configure directional and ambient lighting
- Initialize Three.js renderer with shadow maps

#### 2.2 IFCLoaderModule.ts `hard`
IFC → Fragments conversion, direct `.frag` loading, model management.
- Far-origin detection (>100km warning)
- Multi-model coordinate alignment
- Export to: `.frag`, `.gltf`, `.glb`, `.usdz`, `.png` (screenshot), `.json` (properties)
- Alignment protection to prevent mixing incompatible coordinate systems

#### 2.3 PerformanceMonitor.ts `easy`
Real-time FPS counter, frame time, memory usage overlay.

### Properties Panel

#### 2.4 PropertiesPanelModule.ts + Sub-managers `hard`
IFC tree view and element property inspector.

| Sub-module | Responsibility |
|---|---|
| `SelectionManager.ts` | Element click selection |
| `PropertyDisplayManager.ts` | Property value rendering |
| `TreeManager.ts` | IFC hierarchy tree |
| `StoreyDataManager.ts` | Storey/level data |
| `GhostModeManager.ts` | Ghost mode rendering |

#### 2.5 PropertyTableModule.ts `medium`
Excel-like interactive table for bulk property inspection, filtering, and sorting across all loaded elements.

---

## Phase 3 — WebGL Feature Modules
**Timeline: Days 5–9**

#### 3.1 ClipperModule + ClipStylerModule `medium`
Advanced model sectioning following AEC conventions.
- Section X — side view cut (perpendicular to X axis)
- Section Y — horizontal floor plan cut (AEC standard)
- Section Z — vertical elevation cut (AEC standard)
- Double-click to create custom section at any point
- Flip side, clear all, delete key support

#### 3.2 MeasurementModule.ts `medium`
Length, area, and volume measurements with perpendicular guides and element snapping.

#### 3.3 FloorPlanModule.ts `medium`
2D floor plan views with automatic camera positioning per storey and pan/zoom navigation.

#### 3.4 ViewCubeModule.ts `easy`
`@thatopen/ui-obc` ViewCube — face clicks, smooth animated transitions to front/back/left/right/top/bottom.

#### 3.5 FirstPersonControlsModule.ts `hard`
FPS-style walk mode with:
- WASD movement
- Gravity simulation
- Collision detection against loaded IFC geometry

#### 3.6 ClusterModule.ts `hard`
Spatially separate building elements by IFC category.
- Automatic grouping: walls, doors, windows, etc.
- Labeled bounding boxes per cluster
- Color coding per category
- One-click reset to original positions

#### 3.7 ModelTransformModule.ts `medium`
Draggable model alignment panel.
- Model selection dropdown
- XYZ coordinate display and manual input (0.1m precision)
- Arrow key nudging (←/→ = X, ↑/↓ = Y, Shift+↑/↓ = Z)
- Configurable step size, apply/reset

#### 3.8 SpaceVisibility + ColorSplash + AdaptiveQuality `medium`
- `SpaceVisibilityModule.ts` — toggle IfcSpace elements on/off
- `ColorSplashModule.ts` — color highlighting for element groups
- `AdaptiveQualityController.ts` — auto quality scaling by hardware capability

---

## Phase 4 — WebGPU Renderer (Experimental)
**Timeline: Days 10–14**

> ⚠️ Most technically risky phase. Start early if WebGPU is a key requirement.

#### 4.1 WebGPURendererModule.ts + ViewerWebGPUAPI.ts `hard`
Main WebGPU entry point orchestrating all sub-managers.
- Runtime switch between WebGL and WebGPU
- Chunked scene rebuilding for smooth isolation/un-isolation
- Public API via `ViewerWebGPUAPI.ts`

#### 4.2 WebGPUElementSelector + WebGPUColorPicker `hard`
- GPU color picking for instant element identification in merged geometries
- Zero-latency selection via GPU-shared buffers

#### 4.3 WebGPULODManager + WebGPUFog + WebGPUOutlineManager `hard`
- **LOD**: Distance-based geometry simplification
- **Fog**: Linear and exponential atmospheric fog
- **Outlines**: Multi-pass selection highlighting

#### 4.4 Shadows + AO + Edges + Optimizations `hard`
| Module | Feature |
|---|---|
| `WebGPUShadowManager.ts` | High-performance shadows, ghost mode |
| `WebGPUAmbientOcclusion.ts` | SSAO effects |
| `WebGPUEdgeManager.ts` | Frustum culling edge rendering |
| `WebGPUOptimizations.ts` | Adaptive performance scaling |
| `WebGPUProxySceneBuilder.ts` | Scene building without UI freeze |
| `WebGPUMaterialFactory.ts` | Material creation and management |
| `WebGPUCategoryPalette.ts` | Category color management |
| `WebGPUGeometryUtils.ts` | Geometry helpers |

#### 4.5 WebGPUStatsManager + WebGPUStatsOverlay `easy`
Live hardware/memory/render metrics panel — GPU usage, decode speed, triangle count, render time.

---

## Phase 5 — AI BIM Assistant
**Timeline: Days 15–19**

#### 5.1 WebLLMEngine.ts `hard`
Integrate WebLLM with Qwen3 for fully in-browser LLM inference.
- Model download progress display
- GPU usage, decode speed, token metrics
- Privacy-first: no data leaves the browser

#### 5.2 AIIntentEngine + AIRuleEngine `hard`
Natural language command processing.
- Intent detection: select, hide, isolate, count, navigate, camera control
- IFC type mapping ("doors" → `IfcDoor`)
- Pronoun and follow-up resolution ("hide them", "zoom to those")
- Rule-based fallback for fast responses

#### 5.3 AIBimActions.ts + Action Handlers `hard`
Executable BIM actions:
- Select / hide / isolate elements by type
- Count and analyze elements ("how many windows?")
- Camera navigation ("show front view", "zoom to columns")
- Storey navigation ("go to Level 2")

#### 5.4 ConversationalEngine + ConversationContext `medium`
Multi-turn chat orchestration.
- Context tracking across turns
- Smart pronoun resolution from prior commands
- Conversation history management

#### 5.5 AI UI Managers `medium`
| Module | Responsibility |
|---|---|
| `AIAssistantUIManager.ts` | Orchestrates AI chat UI |
| `AIChatManager.ts` | Message bubble handling |
| `AIDomManager.ts` | DOM element creation |
| `AIStyleManager.ts` | AI panel styling |

---

## Phase 6 — Dashboard & Data Slicer
**Timeline: Days 20–23**

#### 6.1 ModelDashboard.ts + ChartManager + DataManager `medium`
Power BI-style analytics panel.
- Element counts by IFC category
- Pie charts and bar graphs
- Storey breakdown
- Volume analytics and material quantities
- JSON export for external reporting

#### 6.2 SlicerDashboard.ts + SlicerDataManager + SlicerChartManager `hard`
Interactive multi-property filtering tool.
- Filter by storey, category, material, or any IFC property
- Real-time 3D highlighting of filtered elements
- Cross-filtering across multiple slicers
- Split-screen mode (slicer panel + 3D view side-by-side)
- Export filtered results as JSON

---

## Phase 7 — UI, Toolbar & Production Polish
**Timeline: Days 24–27**

#### 7.1 ToolbarBuilder + ToolbarHandlers `medium`
Glassmorphic floating bottom toolbar.

| Group | Actions |
|---|---|
| 📂 Load | Upload IFC, Upload Fragments, load sample models |
| 💾 Export | .frag, .gltf, .glb, .usdz, PNG screenshot, JSON properties |
| 👁️ View | Camera controls, space visibility, align models |
| ✂️ Clipper | Section X/Y/Z, flip, clear all |
| ℹ️ Info | Model stats and info |
| 🗑️ Clear | Remove all models |
| ⚙️ Settings | Renderer mode, shadow quality, background color |

Model count badge with hover tooltip showing model names and UUIDs.

#### 7.2 Notification + Loading + Selection + Navigation UI `easy`
- Far-origin model warnings (professional alert banners)
- Loading indicators during IFC conversion
- Selection highlight UI
- Navigation overlays (minimap, coordinates)

#### 7.3 Responsive Design + Mobile Controls `medium`
- One-finger rotate, two-finger pan, pinch-to-zoom
- Responsive toolbar layout
- Mobile-optimized panel sizing

#### 7.4 Production Build & Deploy `easy`
```bash
npm run build    # Output to /dist
npm run preview  # Preview production build
```
- Bundle size optimization
- WASM worker path configuration
- Public asset handling

---

## Complexity Reference

| Label | Meaning |
|---|---|
| 🟢 Easy | Straightforward implementation, low risk |
| 🟡 Medium | Some complexity, known patterns |
| 🔴 Hard | High complexity, careful design required |

---

## Recommended Build Order

1. **Phase 1–2 first** — IFC loading must work before anything else is testable.
2. **Phase 3 in parallel** — WebGL features can be added incrementally once the viewer is stable.
3. **Phase 4 early if critical** — WebGPU is high-risk; validate GPU availability before committing.
4. **Phase 5 alongside Phase 3** — AI assistant only depends on the core viewer.
5. **Phase 6–7 last** — analytics and polish are the finishing layer.

---

## Technology Stack

| Package | Version | Purpose |
|---|---|---|
| `@thatopen/components` | 3.2.0 | Core BIM components |
| `@thatopen/components-front` | 3.2.0 | Frontend BIM tools |
| `@thatopen/ui` | 3.2.0 | UI component library |
| `@thatopen/ui-obc` | 3.2.1 | ViewCube and OBC UI |
| `three` | 0.175.0 | 3D graphics engine |
| `web-ifc` | latest | IFC file parser |
| `Font Awesome` | 6.5.1 | Icon library |
| `Vite` | latest | Build tool |
| `TypeScript` | latest | Type-safe development |
| `WebLLM + Qwen3` | latest | In-browser AI inference |
