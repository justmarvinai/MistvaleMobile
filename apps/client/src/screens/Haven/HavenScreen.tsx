import { usePlayerStore } from '@/state/playerStore';
import { Panel } from '@/ui/Panel/Panel';
import { SCREENS, isScreenUnlocked, type ScreenId } from '@/app/screens';
import styles from './HavenScreen.module.scss';

/**
 * The Haven — home base and the screen the player lands on.
 *
 * At P0 it shows the camp's stations (each a route into a system) with locked ones
 * shrouded, plus the news panel. The animated backdrop comes from the Pixi stage
 * behind it; the illustrated camp art arrives in the P10 art pass.
 */
export function HavenScreen({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const player = usePlayerStore((state) => state.player);
  const unlocks = usePlayerStore((state) => state.unlocks);

  const stations = SCREENS.filter((screen) => screen.id !== 'haven' && screen.id !== 'settings');

  return (
    <div className={styles.screen}>
      <div className={styles.welcome}>
        <h1 className={styles.heading}>The Haven</h1>
        <p className={styles.subheading}>
          {player
            ? `The lanterns are lit, Warden ${player.profileName}. The vale waits.`
            : 'The lanterns are lit.'}
        </p>
      </div>

      <div className={styles.layout}>
        <section className={styles.stations} aria-label="Locations">
          {stations.map((screen) => {
            const unlocked = isScreenUnlocked(screen, unlocks);
            return (
              <button
                key={screen.id}
                type="button"
                className={`${styles.station} ${unlocked ? '' : styles.shrouded}`}
                onClick={() => unlocked && onNavigate(screen.id)}
                aria-disabled={!unlocked}
                title={unlocked ? undefined : screen.lockedHint}
              >
                <span className={styles.stationGlyph} aria-hidden="true">
                  {unlocked ? screen.glyph : '🔒'}
                </span>
                <span className={styles.stationLabel}>{screen.label}</span>
                {!unlocked && <span className={styles.stationHint}>{screen.lockedHint}</span>}
              </button>
            );
          })}
        </section>

        <aside className={styles.sidebar}>
          <Panel title="Dispatches" className={styles.news}>
            <article className={styles.newsItem}>
              <h3 className={styles.newsTitle}>The Sskarn are moving</h3>
              <p className={styles.newsBody}>
                Scouts report serpentfolk columns pushing out of the Sunken Marches. The campaign
                trail opens soon — gather your warband.
              </p>
              <span className={styles.newsTag}>Early Access · Phase 0</span>
            </article>
          </Panel>

          <Panel title="Your standing" variant="inset" className={styles.standing}>
            <dl className={styles.stats}>
              <div className={styles.stat}>
                <dt>Level</dt>
                <dd>{player?.level ?? '—'}</dd>
              </div>
              <div className={styles.stat}>
                <dt>Roster</dt>
                <dd>0 / {player?.rosterCapacity ?? '—'}</dd>
              </div>
              <div className={styles.stat}>
                <dt>Silver</dt>
                <dd>{player?.silver.toLocaleString('en-US') ?? '—'}</dd>
              </div>
              <div className={styles.stat}>
                <dt>Crystals</dt>
                <dd>{player?.crystals.toLocaleString('en-US') ?? '—'}</dd>
              </div>
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
