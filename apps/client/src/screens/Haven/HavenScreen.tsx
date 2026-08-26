import { usePlayerStore } from '@/state/playerStore';
import { useRosterStore } from '@/state/rosterStore';
import { Heading } from '@/ui/Heading/Heading';
import { HIGHLIGHT_ATTR } from '../../app/highlight';
import { Icon } from '@/ui/Icon/Icon';
import { Panel } from '@/ui/Panel/Panel';
import { Rail } from '@/ui/Rail/Rail';
import { ScreenInfo } from '@/ui/ScreenInfo/ScreenInfo';
import { PLACES, isScreenUnlocked, type ScreenDefinition, type ScreenId } from '@/app/screens';
import { StarterChoice } from './StarterChoice';
import { WhatsReady } from './WhatsReady';
import { useTip } from '@/ui/Tooltip/useTooltip';
import styles from './HavenScreen.module.scss';

/**
 * The Haven — home base and the screen the player lands on.
 *
 * **A rail of painted places, not a grid of icons** (the owner's call, 2026-08-21). It used
 * to be twelve 64px sockets in a wrapped grid, which is a toolbar: every place in the game
 * the same size as every other, none of them worth looking at, and the whole camp readable
 * in one glance that told you nothing. Now each is a tall painted panel with its own art, its
 * name and what you go there *for*, and they run off the side of the window — so the camp is
 * a place you move through rather than a menu you scan. Dragging is the gesture: a finger on
 * a phone, a mouse anywhere, the two arrows, the wheel or the arrow keys (`ui/Rail`).
 *
 * A locked station keeps its panel and takes the shroud, because seeing what is coming is
 * part of the pull forward (UI_UX §2). The drifting mist behind it comes from the Pixi stage.
 */
export function HavenScreen({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const player = usePlayerStore((state) => state.player);
  const champions = useRosterStore((state) => state.champions);
  const unlocks = usePlayerStore((state) => state.unlocks);

  // Every place, not the dock's six (C12c). The old line filtered `DOCK_SCREENS`, which was
  // the whole game while the dock held nineteen destinations and became the same six the
  // dock already draws the moment C12 made them hubs — a home screen showing you the
  // navigation you just pressed. `PLACES` is the registry's own answer to "somewhere a
  // player goes", so the camp is one press from anywhere and the dock stays six wide.
  const stations = PLACES;

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

      {/* Above the rail rather than beside it: B1's rule is that a screen is the feature,
          and the Haven's feature is the rail. This draws nothing at all when there is
          nothing waiting, which is most mornings. */}
      <WhatsReady onNavigate={onNavigate} />

      <Rail
        label="Locations"
        className={styles.rail}
        hint="Drag the camp sideways to see every place in the vale."
      >
        {stations.map((screen) => (
          <Station
            key={screen.id}
            screen={screen}
            unlocked={isScreenUnlocked(screen, unlocks)}
            onNavigate={() => onNavigate(screen.id)}
          />
        ))}
      </Rail>
    </div>
  );
}

/**
 * One place in the Haven.
 *
 * A painted board: the place's art filling the top of it, its name on a plate at the
 * bottom, and one line saying what a player goes there for. The line used to live only on
 * the hover, which is a place a phone cannot reach — a camp that explains itself only to a
 * mouse explains itself to nobody on the platform this game is going to (`docs/UI_UX`).
 *
 * Still its own component, and still for the same reason: a tooltip is a hook and there are
 * twelve of these in a map. The hover now carries what the panel cannot hold — the
 * unlock's exact wording, and the "click to go there" that a locked one must not say.
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
      className={styles.station}
      data-locked={!unlocked}
      onClick={() => unlocked && onNavigate()}
      aria-disabled={!unlocked}
      // The same key a hub card carries, so a tutorial step that says "go to the campaign"
      // has something to circle whichever of the two routes the player is standing on.
      {...{ [HIGHLIGHT_ATTR]: `place:${screen.id}` }}
    >
      {/* The art, as a background rather than an `<img>`: FantasyUIs addresses its
          artwork by id through a custom property, so a station drawn with a different
          piece is a one-word change in the screen registry and no new import. */}
      <span
        className={styles.art}
        style={{ '--mv-station-art': `var(--fui-img-${screen.art})` } as React.CSSProperties}
        aria-hidden="true"
      />
      <span className={styles.gloom} aria-hidden="true" />

      {!unlocked && (
        <span className={styles.seal} aria-hidden="true">
          <Icon name="nav-locked" size={28} />
        </span>
      )}

      <span className={styles.plate}>
        <span className={styles.name}>{screen.label}</span>
        {screen.blurb && <span className={styles.blurb}>{screen.blurb}</span>}
        <span className={styles.cta}>{unlocked ? 'Enter' : (screen.lockedHint ?? 'Shrouded')}</span>
      </span>
    </button>
  );
}
