import { Heading } from '@/ui/Heading/Heading';
import { Icon } from '@/ui/Icon/Icon';
import { CardGrid, Page } from '@/ui/Page/Page';
import { usePlayerStore, type DockBadges } from '@/state/playerStore';
import {
  SCREENS,
  isScreenUnlocked,
  screensInHub,
  type HubId,
  type ScreenDefinition,
  type ScreenId,
} from '@/app/screens';
import { HIGHLIGHT_ATTR } from '@/app/highlight';
import styles from './HubScreen.module.scss';

/**
 * A hub — one page of destinations, and the answer to a dock with nineteen things in it.
 *
 * This is the source game's Game Modes screen and it exists for the reason that one does:
 * a game accumulates places faster than a navigation bar can hold them, and the honest fix
 * is a second level rather than smaller icons. Mistvale had reached nineteen dock entries
 * by C11, at which point the bar was a wall of 20px glyphs nobody could tell apart and the
 * owner's word for the whole interface was "overwhelming".
 *
 * One component for all three hubs rather than three screens, because a hub is entirely a
 * *view of the registry*: which places it holds, whether each is open, and what is waiting
 * inside. Adding a mode stays one registry entry — it lands on its hub with nothing else
 * edited, which is the property that made the dock survivable for as long as it did.
 *
 * A locked destination keeps its card and takes the shroud. Seeing what is coming is part
 * of the pull forward (UI_UX §2), and a hub is a much better place to say it than a dock
 * was: there is room here for the sentence about what the place is *for*, which on the dock
 * lived only in a tooltip a phone can never open.
 */
export function HubScreen({
  hub,
  onNavigate,
}: {
  hub: HubId;
  onNavigate: (id: ScreenId) => void;
}): JSX.Element {
  const unlocks = usePlayerStore((state) => state.unlocks);
  const badges = usePlayerStore((state) => state.badges);
  const definition = SCREENS.find((screen) => screen.id === hub);
  const places = screensInHub(hub);

  return (
    <Page width="wide">
      <Heading tagline={definition?.blurb ?? ''}>{definition?.label ?? 'Places'}</Heading>

      <CardGrid min="hub" className={styles.places}>
        {places.map((place) => (
          <Destination
            key={place.id}
            screen={place}
            unlocked={isScreenUnlocked(place, unlocks)}
            waiting={badges[place.id as keyof DockBadges] ?? 0}
            onNavigate={() => onNavigate(place.id)}
          />
        ))}
      </CardGrid>
    </Page>
  );
}

/**
 * One place, as a card.
 *
 * Deliberately *large*: art across the top, the name at a size worth reading, and the whole
 * blurb rather than a clamped first line. The dock could give a destination twenty pixels
 * and a word; this can give it a picture and a sentence, and that difference is most of
 * what the restructure buys.
 *
 * The art is a background rather than an `<img>` for the same reason the Haven's stations
 * use one: FantasyUIs addresses its artwork by id through a custom property, so drawing a
 * place with a different piece is a one-word change in the registry and no new import.
 */
function Destination({
  screen,
  unlocked,
  waiting,
  onNavigate,
}: {
  screen: ScreenDefinition;
  unlocked: boolean;
  waiting: number;
  onNavigate: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={styles.card}
      data-locked={!unlocked}
      onClick={() => unlocked && onNavigate()}
      aria-disabled={!unlocked}
      // The tutorial points at destinations by screen id, and it pointed at dock buttons
      // before C12. Carrying the same attribute here means a step that says "go to the
      // campaign" still has something to circle now that the campaign is inside a hub.
      {...{ [HIGHLIGHT_ATTR]: `place:${screen.id}` }}
    >
      <span
        className={styles.art}
        style={{ '--mv-place-art': `var(--fui-img-${screen.art})` } as React.CSSProperties}
        aria-hidden="true"
      />
      <span className={styles.gloom} aria-hidden="true" />

      {!unlocked && (
        <span className={styles.seal} aria-hidden="true">
          <Icon name="nav-locked" size={32} />
        </span>
      )}

      {unlocked && waiting > 0 && (
        <span className={styles.pip} aria-label={`${waiting} waiting`}>
          {waiting}
        </span>
      )}

      <span className={styles.body}>
        <span className={styles.name}>
          <Icon name={screen.icon} size={22} />
          {screen.label}
        </span>
        <span className={styles.blurb}>
          {unlocked ? screen.blurb : (screen.lockedHint ?? 'Not yet open to you.')}
        </span>
      </span>
    </button>
  );
}
