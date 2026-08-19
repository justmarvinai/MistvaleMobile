import { Application, BlurFilter, Container, Graphics, type Ticker } from 'pixi.js';

/**
 * The persistent Pixi stage.
 *
 * One `Application` exists for the lifetime of the page: creating and destroying WebGL
 * contexts per screen is slow and eventually loses the context entirely. Screens attach
 * and detach *scenes* on this stage instead (docs/ARCHITECTURE.md §4.1).
 */

/** A scene owns one screen's visuals and cleans up completely when detached. */
export interface Scene {
  readonly root: Container;
  /** Called once per frame while attached. */
  update?(ticker: Ticker): void;
  /** Called on viewport changes so scenes can re-lay-out. */
  resize?(width: number, height: number): void;
  destroy(): void;
}

/** Design canvas; the stage letterboxes and integer-scales around this (UI_UX §7). */
export const VIRTUAL_WIDTH = 960;
export const VIRTUAL_HEIGHT = 540;

let app: Application | null = null;
let currentScene: Scene | null = null;

export async function initStage(canvas: HTMLCanvasElement): Promise<Application> {
  if (app) return app;

  const application = new Application();
  await application.init({
    canvas,
    background: 0x0c0a09,
    antialias: false, // Pixel art must never be smoothed.
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    powerPreference: 'low-power', // Integrated graphics are the target.
    resizeTo: canvas.parentElement ?? undefined,
  });

  application.ticker.add((ticker) => {
    currentScene?.update?.(ticker);
  });

  app = application;
  return application;
}

export function getStage(): Application | null {
  return app;
}

/**
 * Whether a scene is attached.
 *
 * `initStage` is async, so the backdrop's "show the mist" runs a microtask after it
 * resolves — and a screen that attached its own scene in the meantime would have it
 * replaced by fog. Reachable on a reload straight into a battle.
 */
export function hasScene(): boolean {
  return currentScene !== null;
}

/** Swaps in a new scene, destroying the previous one. */
export function setScene(scene: Scene | null): void {
  if (!app) return;

  if (currentScene) {
    app.stage.removeChild(currentScene.root);
    currentScene.destroy();
  }

  currentScene = scene;

  if (scene) {
    app.stage.addChild(scene.root);
    scene.resize?.(app.screen.width, app.screen.height);
  }
}

export function resizeStage(): void {
  if (!app) return;
  app.resize();
  currentScene?.resize?.(app.screen.width, app.screen.height);
}

export function destroyStage(): void {
  setScene(null);
  app?.destroy(true, { children: true });
  app = null;
}

/**
 * The ambient mist backdrop.
 *
 * Drifting, layered fog with a slow parallax — the "living world" baseline that sits
 * behind the Haven and, later, battle scenes. Deliberately cheap: a handful of blurred
 * shapes rather than a particle system, so it costs almost nothing on the target box.
 */
export function createMistScene(): Scene {
  const root = new Container();
  root.label = 'mist-scene';

  const layers: { graphic: Graphics; speed: number; offset: number; amplitude: number }[] = [];

  // Three depth layers, each drifting at its own rate.
  const configs = [
    { color: 0x2b211a, alpha: 0.9, y: 0.62, speed: 0.006, amplitude: 14, blobs: 5 },
    { color: 0x3d2d1f, alpha: 0.7, y: 0.78, speed: 0.011, amplitude: 22, blobs: 4 },
    { color: 0x55381f, alpha: 0.45, y: 0.94, speed: 0.017, amplitude: 30, blobs: 3 },
  ];

  for (const config of configs) {
    const graphic = new Graphics();
    for (let i = 0; i < config.blobs; i += 1) {
      const x = (i / config.blobs) * VIRTUAL_WIDTH * 1.4;
      const radius = 120 + ((i * 37) % 90);
      graphic
        .ellipse(x, VIRTUAL_HEIGHT * config.y, radius, radius * 0.42)
        .fill({ color: config.color, alpha: config.alpha });
    }
    root.addChild(graphic);
    layers.push({ graphic, speed: config.speed, offset: 0, amplitude: config.amplitude });
  }

  // A warm ember glow near the horizon: the light the vale is lit by.
  const glow = new Graphics()
    .ellipse(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT * 0.58, VIRTUAL_WIDTH * 0.62, 130)
    .fill({ color: 0xc2764a, alpha: 0.16 });
  root.addChildAt(glow, 0);

  // Without this the layers read as hard-edged ellipses rather than fog. Low quality is
  // deliberate — it is a soft backdrop, and the target box has integrated graphics.
  root.filters = [new BlurFilter({ strength: 28, quality: 2 })];

  let elapsed = 0;

  return {
    root,
    update(ticker) {
      elapsed += ticker.deltaMS / 1000;
      for (const layer of layers) {
        layer.offset += layer.speed * ticker.deltaTime;
        // Wrap horizontally so the drift never runs out of fog.
        layer.graphic.x = -((layer.offset * 60) % (VIRTUAL_WIDTH * 0.4));
        layer.graphic.y = Math.sin(elapsed * layer.speed * 8) * layer.amplitude * 0.15;
      }
      glow.alpha = 0.9 + Math.sin(elapsed * 0.4) * 0.12;
    },
    resize(width, height) {
      // Fit the virtual canvas while filling the viewport, keeping pixels square.
      const scale = Math.max(width / VIRTUAL_WIDTH, height / VIRTUAL_HEIGHT);
      root.scale.set(scale);
      root.x = (width - VIRTUAL_WIDTH * scale) / 2;
      root.y = (height - VIRTUAL_HEIGHT * scale) / 2;
    },
    destroy() {
      root.destroy({ children: true });
    },
  };
}
