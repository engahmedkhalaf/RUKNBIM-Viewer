import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";

export class ViewerInitializer {
  /**
   * Initializes the core 3D scene, lighting, camera controls, shadows, and infinite grid.
   * Uses PostproductionRenderer for advanced ambient occlusion, SMAA, and outlines.
   */
  public static initWorld(
    components: OBC.Components,
    container: HTMLDivElement
  ): OBC.SimpleWorld<OBC.ShadowedScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer> {
    const worlds = components.get(OBC.Worlds);
    
    // Create world with ShadowedScene, OrthoPerspectiveCamera, and PostproductionRenderer
    const world = worlds.create<OBC.ShadowedScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>();

    world.scene = new OBC.ShadowedScene(components);
    
    // Create PostproductionRenderer with high-quality parameters (antialias, high-precision, high-performance)
    world.renderer = new OBCF.PostproductionRenderer(components, container, {
      antialias: true,
      powerPreference: "high-performance",
      precision: "highp",
    });
    
    // Set device pixel ratio to match local screen resolution (capped at 2.0 to balance performance and sharp visual quality)
    world.renderer.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    world.camera = new OBC.OrthoPerspectiveCamera(components);

    // Initializing components framework
    components.init();

    // Configure the shadowed scene (lighting + shadows + background)
    world.scene.setup({
      backgroundColor: new THREE.Color("#ede5d4"), // Cream, matches --bg-app
      ambientLight: {
        color: new THREE.Color("#ffffff"),
        intensity: 1.4
      },
      directionalLight: {
        color: new THREE.Color("#ffffff"),
        intensity: 2.0,
        position: new THREE.Vector3(50, 100, 50)
      },
      shadows: {
        cascade: 2,
        resolution: 2048
      }
    });

    // Explicitly enable shadows
    world.scene.shadowsEnabled = true;

    // Enable high-quality post-processing effects (ambient occlusion, outlines, etc.)
    const post = world.renderer.postproduction;
    post.enabled = true;
    post.outlinesEnabled = true;
    post.style = OBCF.PostproductionAspect.COLOR_SHADOWS;

    // Setup the infinite grid component
    const grids = components.get(OBC.Grids);
    const grid = grids.create(world);
    grid.setup({
      visible: true,
      color: new THREE.Color("#1f3a6e"), // Navy grid matches --primary-purple
      primarySize: 1,
      secondarySize: 10,
      distance: 500
    });
    grid.fade = true;

    // Set initial camera perspective parameters
    world.camera.controls.setLookAt(20, 20, 20, 0, 0, 0);

    // Setup window resize handlers
    window.addEventListener("resize", () => {
      world.renderer?.resize();
      world.camera.updateAspect();
    });

    console.log("RUKNBIM 3D Viewport initialized successfully.");
    return world;
  }
}
