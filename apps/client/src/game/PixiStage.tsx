import { useEffect, useRef } from 'react';
import { createMistScene, destroyStage, initStage, resizeStage, setScene } from './stage';
import styles from './PixiStage.module.scss';

export interface PixiStageProps {
  /** Which scene to show. More arrive with the battle and summon screens. */
  scene?: 'mist' | 'none';
}

/**
 * Mounts the shared Pixi canvas behind the React shell.
 *
 * Rendered once near the root and kept alive for the session; screens choose which
 * scene it displays.
 */
export function PixiStage({ scene = 'mist' }: PixiStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialised = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || initialised.current) return;
    initialised.current = true;

    let cancelled = false;

    void initStage(canvas).then(() => {
      // The component may have unmounted while the WebGL context was initialising.
      if (cancelled) return;
      setScene(scene === 'mist' ? createMistScene() : null);
    });

    const observer = new ResizeObserver(() => resizeStage());
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    return () => {
      cancelled = true;
      observer.disconnect();
      destroyStage();
      initialised.current = false;
    };
    // Scene switching is handled by the effect below; this one owns the lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialised.current) return;
    setScene(scene === 'mist' ? createMistScene() : null);
  }, [scene]);

  return (
    <div className={styles.stageWrap} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.vignette} />
    </div>
  );
}
