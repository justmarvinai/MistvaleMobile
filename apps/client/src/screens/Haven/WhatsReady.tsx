import { useMemo } from 'react';
import {
  isBrimming,
  type DungeonDef,
  type MultiBattleState,
  type Readiness,
} from '@mistvale/shared';
import type { ScreenId } from '@/app/screens';
import { Icon, type IconName } from '@/ui/Icon/Icon';
import { useContentStore } from '@/state/contentStore';
import { usePlayerStore } from '@/state/playerStore';
import styles from './WhatsReady.module.scss';

/**
 * What is waiting, on the screen a player lands on.
 *
 * A warden coming back after a day wants four or five things answered before they decide
 * anything: is there something to collect, are my arena tokens full and wasting the
 * regeneration, are my Titan keys unspent, which spring is open today, and how many farm
 * runs are left. Every one of those was already computed somewhere in the game and none of
 * them was on the Haven (owner's list, 2026-08-22).
 *
 * **It reads the snapshot the shell already holds** — the dock pips and `readiness`, both
 * server-computed — so the card costs no round trips and cannot disagree with the pip on
 * the tile it points at. Nothing here is polled and nothing is derived: the client
 * displays.
 *
 * **A row only appears when it is actionable.** A card that always says "0 quests, 0 keys,
 * 0 runs" is a card a player learns to ignore in a week; one that is empty most mornings
 * and has two lines on it after a night away is one they read. When there is nothing, the
 * card is not drawn at all.
 */
export interface ReadyRow {
  key: string;
  icon: IconName;
  label: string;
  /** The number or word on the right — what there is to do. */
  value: string;
  screen: ScreenId;
  /** Set for the thing that is being *wasted* rather than merely available. */
  urgent?: boolean;
}

/**
 * The rows, in the order a player would deal with them.
 *
 * Collecting first, because it is free and instant; then the things that are capped and
 * therefore losing value; then the ones that simply expire at the reset. Pure so the
 * ordering and the "only when actionable" rule can be tested without a browser.
 */
export function readyRows(
  readiness: Readiness,
  badges: { quests: number; missions: number; events: number; calendar: number; mail: number },
  multi: Pick<MultiBattleState, 'unlocked' | 'runsLeftToday'>,
  springNames: ReadonlyMap<string, string>,
): ReadyRow[] {
  const rows: ReadyRow[] = [];

  if (badges.calendar > 0) {
    rows.push({
      key: 'calendar',
      icon: 'nav-calendar',
      label: 'The day’s gift',
      value: 'Waiting',
      screen: 'calendar',
      urgent: true,
    });
  }
  if (badges.quests > 0) {
    rows.push({
      key: 'quests',
      icon: 'nav-quests',
      label: 'Errands finished',
      value: `${badges.quests} to claim`,
      screen: 'quests',
      urgent: true,
    });
  }
  if (badges.missions > 0) {
    rows.push({
      key: 'missions',
      icon: 'nav-missions',
      label: 'The Path',
      value: `${badges.missions} to claim`,
      screen: 'missions',
    });
  }
  if (badges.events > 0) {
    rows.push({
      key: 'events',
      icon: 'nav-events',
      label: 'Event rungs',
      value: `${badges.events} to claim`,
      screen: 'events',
    });
  }

  // Capped and therefore losing value: a full token bar has stopped regenerating, which is
  // the one thing on this card that gets *worse* while it is ignored.
  if (readiness.arenaTokens && readiness.arenaTokens.value > 0) {
    const full = isBrimming(readiness.arenaTokens);
    rows.push({
      key: 'arena',
      icon: 'nav-arena',
      label: full ? 'Arena tokens are full' : 'Arena tokens',
      value: `${readiness.arenaTokens.value} / ${readiness.arenaTokens.cap}`,
      screen: 'arena',
      ...(full ? { urgent: true } : {}),
    });
  }

  // Expire at the reset rather than filling up: unspent is unspent, and tomorrow is a
  // fresh two either way.
  if (readiness.titanKeys && readiness.titanKeys.value > 0) {
    rows.push({
      key: 'titan',
      icon: 'nav-titan',
      label: 'Titan keys unspent',
      value: `${readiness.titanKeys.value} of ${readiness.titanKeys.cap}`,
      screen: 'titan',
    });
  }

  if (readiness.openSprings.length > 0) {
    // Naming them is the useful part when it is one or two, and a sentence rather than an
    // answer when it is five — which is exactly what a new account sees, because the grace
    // period opens every spring at once. So the grace says so instead, and says the part a
    // player can act on: it ends. The server decides whether a grace is running (a spring
    // authored open every day is not one), so the card can never promise a deadline that
    // does not exist.
    rows.push({
      key: 'springs',
      icon: 'nav-depths',
      label: readiness.springsInGrace ? 'Every spring is open' : 'Open today',
      value: readiness.springsInGrace
        ? 'While the grace lasts'
        : readiness.openSprings.map((key) => springNames.get(key) ?? key).join(' · '),
      screen: 'depths',
      ...(readiness.springsInGrace ? { urgent: true } : {}),
    });
  }

  // The allowance is counted for every account from the day it registers, whether or not
  // multi-battle has opened — so the *unlock* is what decides this row, not the number.
  // Without it a level-1 warden was offered "Farm runs left today · 30" for a feature five
  // levels away, on the one card whose whole rule is that it says nothing about things a
  // player has never seen. A browser found it; the arithmetic never could.
  if (multi.unlocked && multi.runsLeftToday > 0) {
    rows.push({
      key: 'multi',
      icon: 'nav-campaign',
      label: 'Farm runs left today',
      value: `${multi.runsLeftToday}`,
      screen: 'campaign',
    });
  }

  return rows;
}

export function WhatsReady({
  onNavigate,
}: {
  onNavigate: (id: ScreenId) => void;
}): JSX.Element | null {
  const badges = usePlayerStore((state) => state.badges);
  const readiness = usePlayerStore((state) => state.readiness);
  const multi = usePlayerStore((state) => state.multiBattle);
  const bundle = useContentStore((state) => state.bundle);

  const springNames = useMemo(
    () =>
      new Map(
        (bundle?.dungeons ?? [])
          .filter((dungeon: DungeonDef) => dungeon.kind === 'springs')
          .map((dungeon: DungeonDef) => [dungeon.key, dungeon.name]),
      ),
    [bundle],
  );

  const rows = useMemo(
    () => readyRows(readiness, badges, multi, springNames),
    [readiness, badges, multi, springNames],
  );

  // Nothing waiting is not a state worth drawing. A card that says "all quiet" every
  // morning is one a player stops reading, and the rail behind it is the screen.
  if (rows.length === 0) return null;

  return (
    <section className={styles.card} aria-label="What is waiting">
      <h2 className={styles.title}>Waiting for you</h2>
      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              className={styles.row}
              data-urgent={row.urgent === true}
              onClick={() => onNavigate(row.screen)}
            >
              <Icon name={row.icon} className={styles.icon} />
              <span className={styles.label}>{row.label}</span>
              <span className={styles.value}>{row.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
