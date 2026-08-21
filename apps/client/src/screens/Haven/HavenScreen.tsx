import { Slot } from '@/fui/components/Slot.ts';
import { Fui } from '@/fui/react';
import { usePlayerStore } from '@/state/playerStore';
import { useRosterStore } from '@/state/rosterStore';
import { Heading } from '@/ui/Heading/Heading';
import { Panel } from '@/ui/Panel/Panel';
import { ScreenInfo } from '@/ui/ScreenInfo/ScreenInfo';
import {
  DOCK_SCREENS,
  isScreenUnlocked,
  type ScreenDefinition,
  type ScreenId,
} from '@/app/screens';
import { StarterChoice } from './StarterChoice';
import { useTip } from '@/ui/Tooltip/useTooltip';
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
        actions={
          <ScreenInfo title="The Haven" label="News and your standing">
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
          </ScreenInfo>
        }
      >
        The Haven
      </Heading>

      <div className={styles.layout}>
        <section className={styles.stations} aria-label="Locations">
          {stations.map((screen) => {
            const unlocked = isScreenUnlocked(screen, unlocks);
            return (
              <Station
                key={screen.id}
                screen={screen}
                unlocked={unlocked}
                onNavigate={() => onNavigate(screen.id)}
              />
            );
          })}
        </section>
      </div>
    </div>
  );
}

/**
 * One place in the Haven.
 *
 * Its own component so it can carry a painted tooltip — a hook, and there are nine of them
 * in a map. What the tooltip adds is what the card cannot: what you go there *for*. A
 * shrouded station said "Reach level 8" in a native `title` and an open one said nothing
 * at all, so the Haven's whole job — showing a player what the game has and what is still
 * ahead of them — was carried by nine icons and nine words.
 */
function Station({
  screen,
  unlocked,
  onNavigate,
}: {
  screen: ScreenDefinition;
  unlocked: boolean;
  onNavigate: () => void;
}): JSX.Element {
  const ref = useTip({
    title: screen.label,
    subtitle: unlocked ? 'Open' : 'Shrouded',
    ...(screen.blurb ? { flavor: screen.blurb } : {}),
    ...(unlocked
      ? { hint: 'Click to go there' }
      : screen.lockedHint
        ? { requires: [screen.lockedHint] }
        : {}),
  });

  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.station} ${unlocked ? '' : styles.shrouded}`}
      onClick={() => unlocked && onNavigate()}
      aria-disabled={!unlocked}
    >
      <Fui
        of={Slot}
        className={styles.stationSocket}
        options={{
          size: 'lg',
          locked: !unlocked,
          item: { icon: screen.art, name: screen.label },
        }}
        // The socket is the station's *picture*, not a second control. `Slot` is built to
        // be one — an inventory cell you click — so left alone it renders a focusable
        // `role="button"` inside this button, which is a control a screen reader announces
        // and a keyboard lands on with nothing to do. The station around it already
        // carries the name, the tooltip and the click.
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
}
