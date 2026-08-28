import { createPortal } from 'react-dom';
import type { EnergyState } from '@mistvale/shared';
import { TopBar as FuiTopBar } from '@/fui/components/TopBar.ts';
import { useFui } from '@/fui/react';
import { ProfileChip } from '@/ui/ProfileChip/ProfileChip';
import { useTooltip } from '@/ui/Tooltip/useTooltip';
import { useClockMs } from '@/ui/useClock';
import { usePlayerStore } from '@/state/playerStore';
import { useProfileStore } from '@/state/profileStore';
import { useSessionStore } from '@/state/sessionStore';
import styles from './TopBar.module.scss';

/**
 * The persistent resource bar.
 *
 * The library paints the ground, the currency rail and the tool buttons. **The player chip
 * is Mistvale's** (`ui/ProfileChip`) — the library's is a 38px disc and a name, which is
 * right for a bar that only has to say whose account this is and far too small for what the
 * owner asked for: a chosen portrait, framed, with the level on it and the experience bar
 * beside the name. The library builds no chip at all here, because it is handed neither a
 * name nor an avatar; ours is portalled into the same painted ground and ordered first.
 *
 * Energy counts up locally between server responses: the server sends the value and the
 * timestamp of the next tick, and this component animates towards it. It never credits
 * energy on its own — any action re-syncs from the server (docs/ARCHITECTURE.md §4.4).
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
  const now = useClockMs();
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
      // No `name` and no `avatar`, which is how the library is told not to build a chip:
      // Mistvale's own is portalled in below. Passing either would draw a second, smaller
      // player beside the first.
      resources: [
        // Energy first: it is the one number that decides whether the next thing the
        // player wanted to do is possible at all.
        {
          id: 'energy',
          art: 'fire-golden-flame',
          label: 'Energy',
          value: energy.value,
          // The real cap, even when the value is forty times it. Energy may sit far above
          // its cap since C24 — the cap governs regeneration and rewards go straight past
          // it — and the honest reading is `2,437 / 20`: a player can see at a glance both
          // what they are holding and how far past the line it is. Substituting the value
          // for the cap makes the cell read `2,437 / 2,437 · Full`, which invents a cap
          // that does not exist and calls a bank a full bar.
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

  // Mistvale's chip goes into the library's painted ground rather than beside it, so it
  // sits on the same leather as the rail. A portal appends, and the rail already claims
  // the slack with `margin-left: auto` — so the chip is ordered first in CSS rather than
  // inserted first in the DOM. The root is built once and kept for the life of the bar
  // (see `useFui`), so the target is stable.
  const ground = instance?.el ?? null;

  // The rail's three cells, in the order they were declared above. There is no id in the
  // library's markup to match on, but the order is the one this file chose, and the cells
  // are built once — so a positional lookup is stable rather than lucky.
  const cells = instance?.el.querySelectorAll<HTMLElement>('.fui-topbar__res');
  const energyCell = cells?.[0] ?? null;
  const silverCell = cells?.[1] ?? null;
  const crystalCell = cells?.[2] ?? null;

  // Above the cap the three lines change what they are about. "3,412 / 61" invites a
  // player to read a fraction that is not one, and "full again: now" is a strange thing to
  // say to somebody holding forty times the bar — so a banked bar reports what it is worth
  // and how much of it is above the line, and says nothing about a clock that has stopped.
  const banked = energy.value > energy.cap;
  useTooltip(energyCell, {
    title: 'Energy',
    subtitle: banked ? 'Banked past the cap' : 'Spent to fight',
    stats: banked
      ? [
          { label: 'Held', value: energy.value.toLocaleString('en-US'), tone: 'good' },
          { label: 'Bar', value: `${energy.cap}`, tone: 'plain' },
          {
            label: 'Above the cap',
            value: (energy.value - energy.cap).toLocaleString('en-US'),
            tone: 'good',
          },
        ]
      : [
          { label: 'Now', value: `${energy.value} / ${energy.cap}`, tone: 'plain' },
          {
            label: energy.value >= energy.cap ? 'Full' : 'Next point',
            value: energy.value >= energy.cap ? '—' : formatWait(secondsToTick),
            tone: energy.value >= energy.cap ? 'good' : 'plain',
          },
          {
            label: 'Full again',
            value:
              energy.value >= energy.cap
                ? 'now'
                : formatWait(secondsToTick + (energy.cap - energy.value - 1) * energy.regenSeconds),
            tone: 'plain',
          },
        ],
    flavor: 'Every stage, floor and keep costs energy. It comes back on its own, awake or not.',
    hint: banked
      ? 'Rewards go straight past the cap and stay there. Nothing above it drains away.'
      : 'Levelling up refills the bar.',
  });

  useTooltip(silverCell, {
    title: 'Silver',
    subtitle: 'The working currency',
    stats: [{ label: 'Held', value: (player?.silver ?? 0).toLocaleString('en-US'), tone: 'plain' }],
    flavor:
      'Levels champions, forges relics and buys room in the vault. Won from every fight, and from selling what you will never wear.',
  });

  useTooltip(crystalCell, {
    title: 'Crystals',
    subtitle: 'The rare currency',
    stats: [
      { label: 'Held', value: (player?.crystals ?? 0).toLocaleString('en-US'), tone: 'magic' },
    ],
    flavor:
      'Sigils at the Mistgate, a fresh row of stalls at the Bazaar, another shelf on it. Earned from quests, the Path, events and the calendar.',
  });

  if (!player) return null;

  return (
    <>
      <div ref={ref} style={{ display: 'contents' }} />
      {ground &&
        createPortal(
          <ProfileChip player={player} onOpenProfile={() => void showProfile(player.id)} />,
          ground,
        )}
    </>
  );
}

const EMPTY_ENERGY: EnergyState = {
  value: 0,
  cap: 0,
  regenSeconds: 180,
  nextTickAt: null,
  fullAt: null,
};

/** A wait in the words a player would use, from a count of seconds. */
function formatWait(seconds: number): string {
  if (seconds <= 0) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
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
