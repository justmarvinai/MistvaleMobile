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

/**
 * A scene handed over before the stage existed.
 *
 * `initStage` is asynchronous — it waits on a WebGL context — and a screen that mounts in
 * the same commit as the canvas calls `setScene` a tick or two before that resolves.
 * `setScene` used to answer `if (!app) return;`, which drops the scene on the floor
 * silently: the screen believes it attached one, the stage never had one, and the fight
 * plays out over ambient fog for as long as the player stays on the screen.
 *
 * Held here instead, and attached the moment the stage is ready.
 */
let pendingScene: Scene | null = null;

/**
 * Which canvas the live application draws into.
 *
 * `initStage` used to answer `if (app) return app;` — "there is an application, have it" —
 * without checking that it had been built for the canvas being asked about. `PixiStage`
 * mounts a fresh `<canvas>` whenever it remounts, and `Application.init` is asynchronous,
 * so a remount that landed while a previous init was still coming up left the finished
 * application bound to a node that had already left the document. Every frame after that —
 * the mist, the ground plate, the champions, the health bars — was rendered into a canvas
 * nobody could see, while the DOM half of the game carried on perfectly.
 *
 * That is the empty battlefield, and why it never reproduced here: it is a race between the
 * graphics context starting and the session resolving, and which one wins depends on the
 * machine.
 */
let appCanvas: HTMLCanvasElement | null = null;

/** The in-flight init, so two callers cannot build two applications for one canvas. */
let initInFlight: Promise<Application | null> | null = null;
let initCanvas: HTMLCanvasElement | null = null;

/**
 * Bumped whenever the stage is torn down or re-pointed.
 *
 * An `Application.init` that resolves after its canvas has been abandoned must throw its own
 * work away rather than install itself.
 */
let generation = 0;

/** Why the last attempt to build a stage failed, if it did. */
let failure: string | null = null;

/**
 * A teardown waiting to see whether the canvas is really going away.
 *
 * React unmounts and immediately remounts against the *same* canvas node — every time in
 * development under StrictMode, and whenever a parent re-keys in production. Tearing the
 * application down between the two halves kills the WebGL context on a canvas the
 * replacement is already building against, which is a lost context and a page of shader
 * errors. Deferred by a task, so a canvas that comes straight back keeps its stage.
 */
let teardownTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Builds — or returns — the application drawing into this canvas.
 *
 * Resolves to null rather than throwing when there is no graphics context to be had. A
 * browser with WebGL switched off is a thing that happens, and the game is still playable
 * without a battlefield: every number, every outcome and the whole HUD live elsewhere. What
 * is not acceptable is what used to happen — an unhandled rejection, `app` null forever, and
 * a black rectangle with no explanation anywhere.
 */
export async function initStage(canvas: HTMLCanvasElement): Promise<Application | null> {
  // The canvas is back before its teardown ran: keep what we have.
  if (teardownTimer !== null) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }

  if (app && appCanvas === canvas) return app;
  if (initInFlight && initCanvas === canvas) return initInFlight;

  // A different canvas: whatever exists now draws somewhere that no longer matters.
  teardown();

  const token = generation;
  const application = new Application();
  initCanvas = canvas;
  initInFlight = (async () => {
    try {
      await application.init({
        canvas,
        background: 0x0c0a09,
        antialias: false, // Pixel art must never be smoothed.
        // Guarded rather than bare: this module is exercised outside a browser, and a
        // `ReferenceError` here would be indistinguishable from "this machine has no WebGL".
        resolution: (typeof window === 'undefined' ? 1 : window.devicePixelRatio) || 1,
        autoDensity: true,
        powerPreference: 'low-power', // Integrated graphics are the target.
        resizeTo: canvas.parentElement ?? undefined,
      });
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : 'the graphics context could not start';
      console.error('Mistvale: no graphics context —', cause);
      if (token === generation) {
        initInFlight = null;
        initCanvas = null;
      }
      return null;
    }

    // Abandoned while the context was coming up. Destroying it here is the whole point:
    // installing it would be the orphaned-canvas bug all over again.
    if (token !== generation) {
      destroyApplication(application);
      return null;
    }

    app = application;
    appCanvas = canvas;
    failure = null;
    initInFlight = null;
    initCanvas = null;

    application.ticker.add((ticker) => {
      currentScene?.update?.(ticker);
    });

    // Anything a screen handed over while the context was coming up.
    if (pendingScene) {
      const scene = pendingScene;
      pendingScene = null;
      setScene(scene);
    }

    return application;
  })();

  return initInFlight;
}

/**
 * Throws an application away without touching the page.
 *
 * `removeView: false`, emphatically. React owns every `<canvas>` this module is handed;
 * tearing one out of the document detaches the node a replacement application may already
 * be building against, and every frame after that goes to a lost context.
 */
function destroyApplication(application: Application): void {
  application.destroy({ removeView: false }, { children: true });
}

/** Drops the live application, keeping any scene a screen is waiting to show. */
function teardown(): void {
  generation += 1;
  initInFlight = null;
  initCanvas = null;

  if (currentScene) {
    // Back to pending rather than destroyed: a screen that attached a scene still wants it,
    // and the next stage should pick it up rather than open on fog.
    app?.stage.removeChild(currentScene.root);
    pendingScene?.destroy();
    pendingScene = currentScene;
    currentScene = null;
  }

  if (app) destroyApplication(app);
  app = null;
  appCanvas = null;
}

export function getStage(): Application | null {
  return app;
}

/** Why there is no stage, when there is none. Null while one exists or is still starting. */
export function stageFailure(): string | null {
  return failure;
}

/**
 * Whether a scene is attached.
 *
 * `initStage` is async, so the backdrop's "show the mist" runs a microtask after it
 * resolves — and a screen that attached its own scene in the meantime would have it
 * replaced by fog. Reachable on a reload straight into a battle.
 */
export function hasScene(): boolean {
  return currentScene !== null || pendingScene !== null;
}

/**
 * Whether *this* scene is the one the stage is showing.
 *
 * A screen that owns a scene has to be able to ask, because it is not the only thing that
 * attaches one. `PixiStage` re-initialising — a remount, a lost WebGL context — destroys
 * the stage and then attaches the ambient mist, which is right when nothing else wants it
 * and silently fatal when a battle is running: the fight plays on correctly with the HUD
 * over an empty field, and nothing anywhere says so. Screens check and re-attach rather
 * than assuming the last `setScene` still stands.
 */
export function isSceneAttached(scene: Scene): boolean {
  return currentScene === scene || pendingScene === scene;
}

/** Swaps in a new scene, destroying the previous one. */
export function setScene(scene: Scene | null): void {
  if (!app) {
    // Before the context exists there is nothing to attach to, but the caller's scene must
    // not be lost — see `pendingScene`. A later `setScene(null)` on the way out clears it,
    // so a screen that comes and goes during start-up leaves nothing behind.
    pendingScene?.destroy();
    pendingScene = scene;
    return;
  }

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

/**
 * Tears the stage down — but only on behalf of the canvas that owns it, and only if that
 * canvas does not come straight back.
 *
 * Neither guard is theoretical. A `PixiStage` unmounting is usually the *old* one leaving
 * after a new one has already taken over, and tearing the stage down there took the live
 * application with it; and React's unmount-then-remount against the same node would
 * otherwise destroy the context the remount is building on.
 */
export function destroyStage(canvas?: HTMLCanvasElement): void {
  if (canvas && appCanvas !== null && appCanvas !== canvas && initCanvas !== canvas) return;

  if (teardownTimer !== null) clearTimeout(teardownTimer);
  teardownTimer = setTimeout(() => {
    teardownTimer = null;
    teardown();
    pendingScene?.destroy();
    pendingScene = null;
  }, 0);
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
