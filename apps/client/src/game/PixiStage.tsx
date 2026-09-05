import { useEffect, useRef } from 'react';
import {
  createMistScene,
  activeScene,
  destroyStage,
  hasScene,
  initStage,
  resizeStage,
  setScene,
} from './stage';
import { EMBER_SMOKE, wallpaperUrl, type SmokePalette } from '../ui/tabScenery';
import styles from './PixiStage.module.scss';

export interface PixiStageProps {
  /** Which scene to show. More arrive with the battle and summon screens. */
  scene?: 'mist' | 'none';
  /**
   * The tab's painting, behind the fog and a dark wash. Null while signed out and on any
   * tab with no art of its own — the game's own ground shows through, which is what it
   * looked like before there were paintings.
   */
  wallpaper?: string | null;
  /** How hard the wash sits over the painting — see `tabScenery`. */
  wash?: 'deep' | 'light';
  /** What colour the fog drifts in. Follows the tab (C23). */
  smoke?: SmokePalette;
}

/**
 * Mounts the shared Pixi canvas behind the React shell.
 *
 * Rendered once near the root and kept alive for the session; screens choose which
 * scene it displays.
 *
 * Three layers, back to front: the tab's **wallpaper**, a **dark wash** over it so painted
 * panels and white text still read, and the **fog** on the canvas above both. The wash is
 * why the paintings can be as bright as they are — the owner's art is a lit night market
 * and a burning field, and UI over either at full strength is unreadable.
 */
export function PixiStage({
  scene = 'mist',
  wallpaper = null,
  wash = 'deep',
  smoke = EMBER_SMOKE,
}: PixiStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialised = useRef(false);

  /**
   * The palette the *next* scene is built with.
   *
   * The lifecycle effect below runs once and its `initStage` resolves several frames later,
   * by which time the player may have signed in and landed on a tab whose fog is not the
   * one this component first rendered with — a signed-out boot renders with the default.
   * A ref is what lets that effect stay dependency-free and still build the fog the shell
   * is actually asking for, and it is written in an effect rather than during render
   * because a render is not allowed to have side effects at all.
   */
  const smokeRef = useRef(smoke);
  useEffect(() => {
    smokeRef.current = smoke;
  }, [smoke]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || initialised.current) return;
    initialised.current = true;

    let cancelled = false;

    void initStage(canvas).then((application) => {
      // The component may have unmounted while the graphics context was initialising — or
      // there may be no context to be had, which `initStage` reports rather than throwing.
      if (cancelled || !application) return;
      // …and a screen may have attached its own scene while it was. This is a *default*,
      // not a claim on the stage: replacing a battle that is already running with the
      // ambient mist is exactly what a reload into a fight used to do.
      if (hasScene()) return;
      setScene(scene === 'mist' ? createMistScene(smokeRef.current) : null);
    });

    const observer = new ResizeObserver(() => resizeStage());
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    return () => {
      cancelled = true;
      observer.disconnect();
      // Named, so the stage is only torn down on behalf of the canvas that owns it — and
      // deferred inside `destroyStage`, so an unmount that is really a remount keeps it.
      destroyStage(canvas);
      initialised.current = false;
    };
    // Scene switching is handled by the effect below; this one owns the lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only when the caller actually changes what it is asking for; the shared stage's own
  // `scene` prop never changes, so in practice this is the screens' business, not this
  // component's.
  const previousScene = useRef(scene);
  useEffect(() => {
    if (!initialised.current || previousScene.current === scene) return;
    previousScene.current = scene;
    setScene(scene === 'mist' ? createMistScene(smokeRef.current) : null);
  }, [scene]);

  // Re-tint the fog already drifting rather than building a second one: rebuilding on
  // navigation restarts the drift from zero, which reads as the backdrop flinching every
  // time a player changes tab.
  useEffect(() => {
    const live = activeScene();
    if (live && 'setPalette' in live && typeof live.setPalette === 'function') {
      (live as { setPalette(next: SmokePalette): void }).setPalette(smoke);
    }
  }, [smoke]);

  return (
    <div className={styles.stageWrap} aria-hidden="true">
      {wallpaper && (
        <>
          <div
            className={styles.wallpaper}
            style={{ backgroundImage: `url(${wallpaperUrl(wallpaper)})` }}
          />
          {/* Not too dark — the owner's word. Enough that a painted panel and white text
              read over a lit night market, and not so much that the painting becomes a
              texture nobody can make out. */}
          <div className={styles.wash} data-wash={wash} />
        </>
      )}
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.vignette} />
    </div>
  );
}
