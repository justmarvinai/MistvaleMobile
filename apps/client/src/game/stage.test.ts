import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The stage's ownership rules.
 *
 * These exist because of one bug, and it was the worst one in the game: for weeks, some
 * players' battles rendered *nothing at all* — no champions, no enemies, no ground, not
 * even the ambient fog — while the HUD over the top was perfect and the fight itself
 * resolved correctly on the server. It never reproduced in development.
 *
 * The cause was ownership. `initStage` answered "there is an application, have it" without
 * checking which `<canvas>` that application had been built for. The shell mounts its
 * backdrop in more than one place, `Application.init` is asynchronous, and a mount that
 * happened while a previous init was still coming up left the finished application bound to
 * a canvas that had already left the document. Every frame after that was drawn somewhere
 * invisible. Whether it happened at all came down to a race between the graphics context
 * starting and the session resolving — which is why one machine saw it every time and
 * another never did.
 *
 * Pixi is faked here on purpose. The rules being checked are this module's own — which
 * canvas owns the stage, what happens to a scene handed over too early, who is allowed to
 * tear the stage down — and they are the whole of the bug. Driving a real WebGL context
 * would test the browser instead.
 */

const created: FakeApp[] = [];
/** Every `rendererDestroyOptions` this module has passed to Pixi. */
const destroyCalls: unknown[] = [];

class FakeApp {
  canvas: unknown = null;
  destroyed = false;
  readonly stage = { addChild: vi.fn(), removeChild: vi.fn() };
  readonly screen = { width: 800, height: 600 };
  readonly ticker = { add: vi.fn() };
  /** Resolved by the test, so an init can be left hanging mid-race. */
  release!: () => void;
  private readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise<void>((resolve) => {
      this.release = resolve;
    });
    created.push(this);
  }

  async init(options: { canvas: unknown }): Promise<void> {
    this.canvas = options.canvas;
    await this.ready;
    if (failInit) throw new Error('no graphics context');
  }

  destroy(rendererOptions?: unknown): void {
    this.destroyed = true;
    destroyCalls.push(rendererOptions);
  }

  resize(): void {}
}

let failInit = false;

/** Every colour any `Graphics.fill` has been given, so the fog's palette is checkable. */
const fills: number[] = [];

vi.mock('pixi.js', () => ({
  Application: FakeApp,
  Container: class {
    label = '';
    readonly children: unknown[] = [];
    filters: unknown[] = [];
    scale = { set: vi.fn() };
    x = 0;
    y = 0;
    addChild = vi.fn();
    addChildAt = vi.fn();
    destroy = vi.fn();
  },
  Graphics: class {
    clear() {
      return this;
    }
    ellipse() {
      return this;
    }
    fill(style?: { color?: number }) {
      if (typeof style?.color === 'number') fills.push(style.color);
      return this;
    }
    rect() {
      return this;
    }
  },
  BlurFilter: class {},
}));

const canvasA = { id: 'a' } as unknown as HTMLCanvasElement;
const canvasB = { id: 'b' } as unknown as HTMLCanvasElement;

/** A scene that records whether it was thrown away. */
function fakeScene(): { root: unknown; destroy: () => void; destroyed: () => boolean } {
  let destroyed = false;
  return {
    root: { label: 'scene' },
    destroy: () => {
      destroyed = true;
    },
    destroyed: () => destroyed,
  };
}

/** Lets a deferred teardown run. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function freshModule() {
  vi.resetModules();
  created.length = 0;
  destroyCalls.length = 0;
  fills.length = 0;
  failInit = false;
  return import('./stage');
}

/**
 * The colours the fog was painted in, in painting order, with each run collapsed to one.
 *
 * A band is several blobs of one colour, so the raw list is thirteen entries and says
 * nothing readable. What matters is which colour each band came out in and in what order,
 * which is exactly what a run-length view of it is.
 */
function paintedRuns(): number[] {
  return fills.filter((colour, index) => colour !== fills[index - 1]);
}

afterEach(() => {
  failInit = false;
});

describe('which canvas owns the stage', () => {
  it('never hands back an application built for a canvas that has gone', async () => {
    const stage = await freshModule();

    // The shell's first backdrop starts coming up…
    const first = stage.initStage(canvasA);
    // …and is replaced before the graphics context is ready.
    const second = stage.initStage(canvasB);

    created[0]?.release();
    created[1]?.release();
    await Promise.all([first, second]);

    const live = stage.getStage() as unknown as FakeApp | null;
    expect(live, 'a stage exists').not.toBeNull();
    expect(live?.canvas, 'it draws into the canvas that is actually on the page').toBe(canvasB);
    expect(created[0]?.destroyed, 'the abandoned application is thrown away').toBe(true);
  });

  it('re-points at the new canvas when the shell swaps its backdrop', async () => {
    // The orphan, in its simplest form: the first stage finished, and *then* the shell put
    // a different canvas on the page. The old rule — "there is an application, have it" —
    // handed the finished one straight back, and from that moment every frame went to a
    // node that had left the document.
    const stage = await freshModule();

    const first = stage.initStage(canvasA);
    created[0]?.release();
    await first;
    expect((stage.getStage() as unknown as FakeApp).canvas).toBe(canvasA);

    const second = stage.initStage(canvasB);
    created[1]?.release();
    await second;

    expect(
      (stage.getStage() as unknown as FakeApp).canvas,
      'the live stage draws into the canvas that is on the page',
    ).toBe(canvasB);
    expect(created[0]?.destroyed, 'the orphaned application is torn down').toBe(true);
  });

  it('builds one application per canvas, however many callers ask', async () => {
    const stage = await freshModule();

    const both = Promise.all([stage.initStage(canvasA), stage.initStage(canvasA)]);
    created[0]?.release();
    await both;

    expect(created).toHaveLength(1);
  });

  it('reuses the application when asked again for the same canvas', async () => {
    const stage = await freshModule();
    const pending = stage.initStage(canvasA);
    created[0]?.release();
    await pending;

    await stage.initStage(canvasA);
    expect(created).toHaveLength(1);
  });
});

describe('a stage that cannot be built', () => {
  it('reports the failure instead of rejecting into nothing', async () => {
    const stage = await freshModule();
    failInit = true;

    const pending = stage.initStage(canvasA);
    created[0]?.release();
    // The old code left this an unhandled rejection: `app` stayed null forever, every
    // `setScene` went nowhere, and the only symptom was a black rectangle.
    await expect(pending).resolves.toBeNull();
    expect(stage.getStage()).toBeNull();
    expect(stage.stageFailure()).toContain('no graphics context');
  });

  it('can be built again after a failure', async () => {
    const stage = await freshModule();
    failInit = true;
    const failed = stage.initStage(canvasA);
    created[0]?.release();
    await failed;

    failInit = false;
    const retry = stage.initStage(canvasA);
    created[1]?.release();
    await retry;

    expect(stage.getStage()).not.toBeNull();
    expect(stage.stageFailure()).toBeNull();
  });
});

describe('a scene handed over before the stage exists', () => {
  it('is attached as soon as there is somewhere to put it', async () => {
    const stage = await freshModule();
    const scene = fakeScene();

    const pending = stage.initStage(canvasA);
    stage.setScene(scene as never);
    expect(stage.hasScene(), 'the screen is not told its scene was dropped').toBe(true);
    expect(stage.isSceneAttached(scene as never)).toBe(true);

    created[0]?.release();
    await pending;

    expect(stage.isSceneAttached(scene as never)).toBe(true);
    expect(scene.destroyed()).toBe(false);
  });

  it('survives the stage being re-pointed at a new canvas', async () => {
    // The exact sequence that emptied the battlefield: a screen attaches its scene, and the
    // shell swaps its backdrop underneath it.
    const stage = await freshModule();
    const scene = fakeScene();

    const first = stage.initStage(canvasA);
    created[0]?.release();
    await first;
    stage.setScene(scene as never);

    const second = stage.initStage(canvasB);
    created[1]?.release();
    await second;

    expect(stage.isSceneAttached(scene as never), 'the fight is still on the stage').toBe(true);
    expect(scene.destroyed()).toBe(false);
  });
});

describe('tearing the stage down', () => {
  it('never removes the canvas from the page', async () => {
    // `destroy(true, …)` means `removeView: true`, and the canvas belongs to React. Passing
    // it detached the very node the replacement application had just been built against —
    // which turned every render into "WebGL context may be lost" and a blank page. Found by
    // doing it, in a browser, and watching the shader errors arrive.
    const stage = await freshModule();
    const first = stage.initStage(canvasA);
    created[0]?.release();
    await first;

    const second = stage.initStage(canvasB);
    created[1]?.release();
    await second;

    stage.destroyStage(canvasB);
    await settle();

    expect(destroyCalls.length, 'applications were actually destroyed').toBeGreaterThan(0);
    for (const options of destroyCalls) {
      expect(options, 'the view is left alone').toEqual({ removeView: false });
    }
  });

  it('ignores a canvas that no longer owns the stage', async () => {
    const stage = await freshModule();
    const first = stage.initStage(canvasA);
    created[0]?.release();
    await first;
    const second = stage.initStage(canvasB);
    created[1]?.release();
    await second;

    // The old backdrop unmounting, after the new one has taken over. Destroying the stage
    // here took the live application with it and left the page blank.
    stage.destroyStage(canvasA);
    await settle();
    expect(stage.getStage()).not.toBeNull();

    stage.destroyStage(canvasB);
    await settle();
    expect(stage.getStage()).toBeNull();
  });

  it('survives an unmount that is immediately followed by a remount', async () => {
    // React does exactly this — every time under StrictMode, and whenever a parent re-keys.
    // Tearing the application down in between kills the WebGL context on a canvas the
    // replacement is already building against, which is a page of shader errors and a blank
    // screen. The teardown is deferred so a returning canvas can reclaim it.
    const stage = await freshModule();
    const first = stage.initStage(canvasA);
    created[0]?.release();
    await first;

    stage.destroyStage(canvasA);
    const again = await stage.initStage(canvasA);
    await settle();

    expect(again, 'the same application is handed back').not.toBeNull();
    expect(stage.getStage()).not.toBeNull();
    expect(created, 'no second application was built for the same canvas').toHaveLength(1);
    expect(created[0]?.destroyed).toBe(false);
  });
});

describe('what colour the fog drifts in', () => {
  // The owner's C23 request: the same drifting fog everywhere, tinted to the painting
  // behind it — blue over the Haven's night market, violet at the Mistgate, green over
  // Errands. `ui/tabScenery` decides which palette a tab gets and this is the half that
  // has to actually reach the screen, so these check the *painting* rather than the map.

  /** Four colours nothing in the game uses, so a hard-coded one cannot pass by accident. */
  const FIRST = { bands: [0x010203, 0x040506, 0x070809], glow: 0x0a0b0c } as const;
  const SECOND = { bands: [0x111213, 0x141516, 0x171819], glow: 0x1a1b1c } as const;

  it('paints each band in its own colour, and the glow in the glow', async () => {
    const stage = await freshModule();
    stage.createMistScene(FIRST);

    const glows = fills.filter((colour) => colour === FIRST.glow);
    expect(glows, 'one glow, drawn once').toHaveLength(1);
    expect(
      paintedRuns().filter((colour) => colour !== FIRST.glow),
      'back, middle and front bands, in that order',
    ).toEqual([...FIRST.bands]);
  });

  it('re-tints the fog already drifting rather than being rebuilt', async () => {
    // The whole reason `setPalette` exists. Building a second scene on every change of tab
    // would restart the drift from zero, which reads as the backdrop flinching every time
    // a player presses the dock.
    const stage = await freshModule();
    const scene = stage.createMistScene(FIRST);

    fills.length = 0;
    scene.setPalette(SECOND);

    expect(
      paintedRuns().filter((colour) => colour !== SECOND.glow),
      'the new palette, on the same three bands',
    ).toEqual([...SECOND.bands]);
    expect(
      fills.some((colour) => (FIRST.bands as readonly number[]).includes(colour)),
      'and nothing left over from the old one',
    ).toBe(false);
  });

  it('does not repaint for a palette it is already drawing', async () => {
    // Three of the six tabs share the ember fog, and `tabScenery` hands back the same
    // object for all of them. Stepping between them must cost nothing.
    const stage = await freshModule();
    const scene = stage.createMistScene(FIRST);

    fills.length = 0;
    scene.setPalette(FIRST);

    expect(fills, 'no ellipse was redrawn').toEqual([]);
  });

  it('is reachable for tinting before the graphics context is up', async () => {
    // The shell tints on every change of tab, including the first one — which on a boot
    // straight into the Haven happens while `initStage` is still waiting on WebGL. If the
    // pending scene were invisible to `activeScene`, the first tab a player lands on would
    // keep the fog the shell was built with until they navigated away and back.
    const stage = await freshModule();
    const scene = stage.createMistScene(FIRST);

    stage.initStage(canvasA);
    stage.setScene(scene);

    expect(stage.activeScene(), 'the scene waiting to be attached is the live one').toBe(scene);
  });
});
