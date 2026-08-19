import { useSyncExternalStore } from 'react';
import type { EnergyState } from '@mistvale/shared';
import { TopBar as FuiTopBar } from '@/fui/components/TopBar.ts';
import { useFui, useFuiAttrs } from '@/fui/react';
import { usePlayerStore } from '@/state/playerStore';
import { useProfileStore } from '@/state/profileStore';
import { useSessionStore } from '@/state/sessionStore';
import styles from './TopBar.module.scss';

/**
 * The persistent resource bar.
 *
 * Painted by the library since the design rework — the avatar with its level ring, the
 * currency rail, the tool buttons and their badges are all its `TopBar`. What stays
 * Mistvale's is everything that moves:
 *
 * Energy counts up locally between server responses: the server sends the value and the
 * timestamp of the next tick, and this component animates towards it. It never credits
 * energy on its own — any action re-syncs from the server (docs/ARCHITECTURE.md §4.4).
 * The projection is unchanged; only where the number is drawn moved.
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
      levelProgress:
        player && player.xpToNextLevel > 0 ? Math.min(1, player.xp / player.xpToNextLevel) : 1,
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
  // drawn as a bare numeral on the avatar ring, which is the genre's own shape and what
  // the library's examples do, but "1" on its own is not something a screen reader can
  // make sense of. Both go in the label instead.
  useFuiAttrs(instance?.el.querySelector<HTMLElement>('.fui-topbar__player'), {
    'aria-label': player
      ? `Your profile card — ${player.profileName}, level ${player.level}`
      : 'Your profile card',
  });

  if (!player) return null;

  return <div ref={ref} style={{ display: 'contents' }} />;
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
