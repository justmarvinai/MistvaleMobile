import { Slot } from '@/fui/components/Slot.ts';
import { Fui } from '@/fui/react';
import { usePlayerStore } from '@/state/playerStore';
import { useRosterStore } from '@/state/rosterStore';
import { Heading } from '@/ui/Heading/Heading';
import { Panel } from '@/ui/Panel/Panel';
import { DOCK_SCREENS, isScreenUnlocked, type ScreenId } from '@/app/screens';
import { StarterChoice } from './StarterChoice';
import styles from './HavenScreen.module.scss';

/**
 * The Haven — home base and the screen the player lands on.
 *
 * Each station is a route into a system, drawn as a painted socket with the place's own
 * icon in it — a shrine, a gate, a crown — and a locked one keeps its socket and takes
 * the shroud, because seeing what is coming is part of the pull forward (UI_UX §2). The
 * drifting mist behind it comes from the Pixi stage.
 */
export function HavenScreen({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const player = usePlayerStore((state) => state.player);
  const champions = useRosterStore((state) => state.champions);
  const unlocks = usePlayerStore((state) => state.unlocks);

  // The camp's stations are the dock's destinations, minus the Haven itself — the same
  // predicate rather than a second list, because a deny-list of "not haven, not settings"
  // silently adopts every screen added later. It had already adopted `battle`, which put a
  // tile in the camp that walked into a battle screen with no battle behind it.
  const stations = DOCK_SCREENS.filter((screen) => screen.id !== 'haven');

  return (
    <div className={styles.screen}>
      <StarterChoice />

      <Heading
        tagline={
          player
            ? `The lanterns are lit, Warden ${player.profileName}. The vale waits.`
            : 'The lanterns are lit.'
        }
      >
        The Haven
      </Heading>

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
                <Fui
                  of={Slot}
                  className={styles.stationSocket}
                  options={{
                    size: 'lg',
                    locked: !unlocked,
                    item: { icon: screen.art, name: screen.label },
                  }}
                  // The socket is the station's *picture*, not a second control. `Slot` is
                  // built to be one — an inventory cell you click — so left alone it
                  // renders a focusable `role="button"` inside this button, which is a
                  // control a screen reader announces and a keyboard lands on with nothing
                  // to do. The station around it already carries the name, the tooltip and
                  // the click.
                  attrs={{
                    role: 'presentation',
                    tabindex: undefined,
                    'aria-label': undefined,
                    title: undefined,
                  }}
                />
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
                {/* Was a hardcoded `0`. The home screen told every warden they owned no
                    champions while the roster screen counted them correctly. */}
                <dd>
                  {champions.length} / {player?.rosterCapacity ?? '—'}
                </dd>
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
