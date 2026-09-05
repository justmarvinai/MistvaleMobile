import { Heading } from '@/ui/Heading/Heading';
import { Icon } from '@/ui/Icon/Icon';
import { useText } from '@/i18n/t';
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
import { liveLine } from './liveLine';
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
  const readiness = usePlayerStore((state) => state.readiness);
  const definition = SCREENS.find((screen) => screen.id === hub);
  const places = screensInHub(hub);
  // The registry keeps its English, which is also the catalogue key, so this reads the same
  // and translates the day a second locale exists (C39).
  const text = useText();

  return (
    <Page width="wide" fills>
      <Heading tagline={definition?.blurb ? text(definition.blurb) : ''}>
        {text(definition?.label ?? 'Places')}
      </Heading>

      <CardGrid min="hub" className={styles.places}>
        {places.map((place) => (
          <Destination
            key={place.id}
            screen={place}
            unlocked={isScreenUnlocked(place, unlocks)}
            waiting={badges[place.id as keyof DockBadges] ?? 0}
            line={liveLine(place.id, readiness)}
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
  line,
  onNavigate,
}: {
  screen: ScreenDefinition;
  unlocked: boolean;
  waiting: number;
  /** Where the account stands with the place, or null where there is nothing to count. */
  line: string | null;
  onNavigate: () => void;
}): JSX.Element {
  const text = useText();

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

      <span className={styles.body}>
        <span className={styles.name}>
          <Icon name={screen.icon} size={22} />
          {text(screen.label)}
        </span>
        {/* A locked place keeps its sentence and gains a line under it, rather than trading
            one for the other. "Opens at level 16" says when and never why, and why is the
            whole reason a shrouded card is still on the screen (UI_UX §2) — a player who
            cannot go yet is exactly the one deciding whether to care. */}
        <span className={styles.blurb}>{screen.blurb ? text(screen.blurb) : ''}</span>
        {/* The live line (C45): where this account stands with the place, under the
            sentence about what the place is for. Only on an open card — a shrouded one
            says when it opens instead, and a count of nothing is not news. */}
        {unlocked && line && <span className={styles.live}>{line}</span>}
        {!unlocked && (
          <span className={styles.gate}>{text(screen.lockedHint ?? 'Not yet open to you.')}</span>
        )}
      </span>

      {/* After the body, not before it — the pip is absolutely positioned so the order
          changes nothing on screen, and it changes everything in the accessible name: with
          the pip first, the one card that always has a claim on it announced itself as
          "2 waiting Calendar …" and could not be found by its own name. */}
      {unlocked && waiting > 0 && (
        <span className={styles.pip} aria-label={`${waiting} waiting`}>
          {waiting}
        </span>
      )}
    </button>
  );
}
