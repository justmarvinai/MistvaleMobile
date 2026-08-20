import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { EnergyState, PlayerSummary } from '@mistvale/shared';
import { StatBar } from '@/fui/components/StatBar.ts';
import { TopBar as FuiTopBar } from '@/fui/components/TopBar.ts';
import { Fui, useFui, useFuiAttrs } from '@/fui/react';
import { usePlayerStore } from '@/state/playerStore';
import { useProfileStore } from '@/state/profileStore';
import { useSessionStore } from '@/state/sessionStore';
import styles from './TopBar.module.scss';

/**
 * The persistent resource bar.
 *
 * Painted by the library since the design rework — the avatar, the currency rail, the tool
 * buttons and their badges are all its `TopBar`. What stays Mistvale's is everything that
 * moves:
 *
 * Energy counts up locally between server responses: the server sends the value and the
 * timestamp of the next tick, and this component animates towards it. It never credits
 * energy on its own — any action re-syncs from the server (docs/ARCHITECTURE.md §4.4).
 * The projection is unchanged; only where the number is drawn moved.
 *
 * And the account's own progress, which used to be a thin arc drawn around the avatar. A
 * ring is a shape that can say "some of the way" and nothing else — it has no room for the
 * two numbers a player actually wants, which are how much experience they have and how
 * much is left. So the ring is off and there is a real bar under the name instead, with
 * both numbers beside it (see `LevelProgress`).
 */
export function TopBar({
  onOpenSettings,
  onOpenMail,
  onOpenNews,
}: {
  onOpenSettings: () => void;
  onOpenMail: () => void;
  onOpenNews: () => void;
}) {
  const player = usePlayerStore((state) => state.player);
  const clockSkewMs = usePlayerStore((state) => state.clockSkewMs);
  const waitingMail = usePlayerStore((state) => state.badges.mail);
  const logout = useSessionStore((state) => state.logout);
  const showProfile = useProfileStore((state) => state.show);

  // One clock for both readings. The projection and the countdown have to agree about
  // "now" — reading the wall clock a second time would let the bar say 3 and the counter
  // say 4 in the same frame — and reading it during render at all is impure, which is
  // exactly what `subscribeToClock` exists to avoid.
  const now = useSyncExternalStore(subscribeToClock, clockSnapshot, () => 0);
  const energy = projectEnergy(player?.energy ?? EMPTY_ENERGY, now + clockSkewMs);

  // Hooks first, always: an early return above `useFui` would change the hook order
  // between a signed-out render and a signed-in one.
  const secondsToTick = energy.nextTickAt
    ? Math.max(0, Math.round((new Date(energy.nextTickAt).getTime() - now - clockSkewMs) / 1000))
    : 0;

  const { ref, instance } = useFui(
    FuiTopBar,
    {
      class: styles.bar,
      style: { '--mv-avatar-initial': `"${(player?.profileName ?? '?').charAt(0).toUpperCase()}"` },
      name: player?.profileName ?? '',
      level: player?.level ?? 1,
      // Deliberately not passed: the ring it drives is off (see TopBar.module.scss), and
      // the same fraction is drawn as a bar under the name where it can carry its numbers.
      resources: [
        // Energy first: it is the one number that decides whether the next thing the
        // player wanted to do is possible at all.
        {
          id: 'energy',
          art: 'fire-golden-flame',
          label: 'Energy',
          value: energy.value,
          max: energy.cap,
          refillIn: secondsToTick,
        },
        {
          id: 'silver',
          art: 'rune-jade-coin',
          label: 'Silver',
          value: player?.silver ?? 0,
          color: 'var(--fui-gold-soft)',
        },
        {
          id: 'crystals',
          art: 'rune-radiant-gem',
          label: 'Crystals',
          value: player?.crystals ?? 0,
          color: '#c58ce8',
        },
      ],
      // Mail carries the one badge up here: it is the only thing in the top bar that can
      // be *waiting on* the player rather than merely available to them.
      actions: [
        {
          id: 'mail',
          glyph: 'glyph-burning-scroll',
          label: 'Mail',
          ...(waitingMail > 0 ? { badge: waitingMail > 9 ? '9+' : waitingMail } : {}),
        },
        { id: 'news', glyph: 'glyph-spell-book', label: 'News' },
        { id: 'settings', glyph: 'glyph-arcane-symbol', label: 'Settings' },
        { id: 'logout', glyph: 'glyph-broken-shackle', label: 'Sign out' },
      ],
    },
    {
      // The chip is the way into your own card — the same one the ladder shows other
      // people, which is what makes "choose your four" a decision rather than a form.
      'top:profile': () => {
        if (player) void showProfile(player.id);
      },
      'top:action': (id: string) => {
        if (id === 'mail') onOpenMail();
        else if (id === 'news') onOpenNews();
        else if (id === 'settings') onOpenSettings();
        else if (id === 'logout') void logout();
      },
    },
    // Everything that ticks. Options are construction-time; a bar rebuilt once a second
    // would restart the fill animation on every tick and lose focus mid-click.
    (bar, next) => {
      for (const res of next.resources) bar.setResource(res.id, res.value, res.max);
      if (next.resources[0]?.refillIn != null) bar.setRefill('energy', next.resources[0].refillIn);
    },
  );

  // The chip's accessible name, which has to carry two things the library's does not.
  //
  // It labels the chip with the player's name — that says *who*, not what pressing it
  // does, and it opens the profile card the ladder shows other people. And the level is
  // drawn as a bare numeral on the avatar's corner, which is the genre's own shape and
  // what the library's examples do, but "1" on its own is not something a screen reader
  // can make sense of. Both go in the label instead.
  useFuiAttrs(instance?.el.querySelector<HTMLElement>('.fui-topbar__player'), {
    'aria-label': player
      ? `Your profile card — ${player.profileName}, level ${player.level}`
      : 'Your profile card',
  });

  // The chip is the library's, and the progress under the name is Mistvale's — so it is
  // portalled into the chip rather than passed to it. The chip element is built once and
  // kept for the life of the bar (see `useFui`), so the target is stable.
  const chip = instance?.el.querySelector<HTMLElement>('.fui-topbar__player') ?? null;

  if (!player) return null;

  return (
    <>
      <div ref={ref} style={{ display: 'contents' }} />
      {chip && createPortal(<LevelProgress player={player} />, chip)}
    </>
  );
}

/**
 * How far into the level, in the two numbers that answer it.
 *
 * `xpToNextLevel` is the span of the *current* level rather than a running total, so the
 * fraction is `xp / xpToNextLevel` and the remainder is the subtraction — no cumulative
 * table, and nothing here that the server has not already worked out.
 *
 * The bar is the library's `StatBar` on its `xp` artwork, kept live through its own
 * `set`/`setMax` rather than rebuilt: a bar that is reconstructed when the number changes
 * restarts its fill animation from empty, which is the one thing a progress bar must not
 * do at the moment it advances.
 *
 * At the level cap there is no next level and no span to divide by. The bar reads full and
 * the caption says so, which is a better answer than a bar stuck at zero.
 */
function LevelProgress({ player }: { player: PlayerSummary }): JSX.Element {
  const capped = player.xpToNextLevel <= 0;
  const value = capped ? 1 : Math.min(player.xp, player.xpToNextLevel);
  const max = capped ? 1 : player.xpToNextLevel;
  const left = Math.max(0, player.xpToNextLevel - player.xp);

  return (
    <span className={styles.progress}>
      <Fui
        of={StatBar}
        className={styles.xpBar}
        options={{
          kind: 'xp',
          value,
          max,
          // No `label` and no `readout`: both draw *inside* the bar, and the two numbers
          // are already beside it where they have room to be read. The name the bar needs
          // is the one a screen reader asks for, which goes on the element instead.
          readout: 'none',
          width: '100%',
          trail: false,
        }}
        attrs={{ 'aria-label': 'Experience toward the next level' }}
        apply={(bar, next) => {
          bar.setMax(next.max ?? 1);
          bar.set(next.value ?? 0);
        }}
      />
      <span className={styles.xpNumbers}>
        {capped ? (
          'Level cap'
        ) : (
          <>
            {player.xp.toLocaleString('en-US')} / {player.xpToNextLevel.toLocaleString('en-US')}
            <span className={styles.xpLeft}>
              {' '}
              · {left.toLocaleString('en-US')} to Lv {player.level + 1}
            </span>
          </>
        )}
      </span>
    </span>
  );
}

const EMPTY_ENERGY: EnergyState = {
  value: 0,
  cap: 0,
  regenSeconds: 180,
  nextTickAt: null,
  fullAt: null,
};

/**
 * A one-second clock, exposed as an external store.
 *
 * The wall clock is exactly the kind of mutable outside value `useSyncExternalStore`
 * exists for; reading it during render directly would make rendering impure.
 *
 * The snapshot is a *cached* timestamp rather than `Date.now` itself. A getSnapshot that
 * returns a fresh value on every call has no fixed point — React compares consecutive
 * reads to decide whether to re-render, so an ever-changing snapshot is an infinite loop
 * with a warning in front of it. The tick updates the cache; every reader in one render
 * pass then sees the same instant, which is also what stops two components animating
 * against slightly different "now"s.
 *
 * One interval serves every subscriber, started with the first and stopped with the last.
 */
let clockNow = Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: number | null = null;

function subscribeToClock(onChange: () => void): () => void {
  clockListeners.add(onChange);
  clockTimer ??= window.setInterval(() => {
    clockNow = Date.now();
    for (const listener of clockListeners) listener();
  }, 1000);

  return () => {
    clockListeners.delete(onChange);
    if (clockListeners.size === 0 && clockTimer !== null) {
      window.clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/** The cached instant. Changes only when the tick fires. */
function clockSnapshot(): number {
  return clockNow;
}

/** Advances a server energy snapshot to `now` without ever exceeding the cap. */
function projectEnergy(source: EnergyState, now: number): EnergyState {
  if (!source.nextTickAt || source.value >= source.cap) return source;

  const tickMs = source.regenSeconds * 1000;
  const nextTick = new Date(source.nextTickAt).getTime();
  if (now < nextTick) return source;

  const sinceTick = now - nextTick;
  const gained = 1 + Math.floor(sinceTick / tickMs);
  const value = Math.min(source.cap, source.value + gained);

  if (value >= source.cap) {
    return { ...source, value: source.cap, nextTickAt: null, fullAt: null };
  }

  return {
    ...source,
    value,
    nextTickAt: new Date(now + (tickMs - (sinceTick % tickMs))).toISOString(),
  };
}
