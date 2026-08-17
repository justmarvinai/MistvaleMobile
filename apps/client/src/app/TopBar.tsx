import { useSyncExternalStore } from 'react';
import type { EnergyState } from '@mistvale/shared';
import { usePlayerStore } from '@/state/playerStore';
import { useProfileStore } from '@/state/profileStore';
import { useSessionStore } from '@/state/sessionStore';
import { Button } from '@/ui/Button/Button';
import styles from './TopBar.module.scss';

/**
 * The persistent resource bar.
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

  const energy = useLiveEnergy(player?.energy ?? null, clockSkewMs);

  if (!player) return null;

  const xpPercent =
    player.xpToNextLevel > 0
      ? Math.min(100, Math.round((player.xp / player.xpToNextLevel) * 100))
      : 100;

  return (
    <header className={styles.bar}>
      {/* The chip is the way into your own card — the same one the ladder shows other
          people, which is what makes "choose your four" a decision rather than a form. */}
      <button
        type="button"
        className={styles.profile}
        aria-label="Your profile card"
        onClick={() => void showProfile(player.id)}
      >
        <div className={styles.avatar} aria-hidden="true">
          {player.profileName.charAt(0).toUpperCase()}
        </div>
        <div className={styles.profileText}>
          <span className={styles.name}>{player.profileName}</span>
          <span className={styles.level}>
            Level {player.level}
            <span className={styles.xpTrack} aria-hidden="true">
              <span className={styles.xpFill} style={{ width: `${xpPercent}%` }} />
            </span>
          </span>
        </div>
      </button>

      <div className={styles.resources}>
        <EnergyPill energy={energy} />
        <ResourcePill label="Silver" value={player.silver} tone="silver" glyph="◎" />
        <ResourcePill label="Crystals" value={player.crystals} tone="crystal" glyph="◆" />
      </div>

      <div className={styles.tools}>
        {/* Mail carries the one pip up here: it is the only thing in the top bar that can
            be waiting on the player rather than merely available to them. */}
        <span className={styles.tool}>
          <Button variant="ghost" size="sm" onClick={onOpenMail} aria-label="Mail">
            ✉
          </Button>
          {waitingMail > 0 && (
            <span className={styles.pip} aria-hidden="true">
              {waitingMail > 9 ? '9+' : waitingMail}
            </span>
          )}
          {waitingMail > 0 && <span className="mv-sr-only">{waitingMail} waiting</span>}
        </span>
        <Button variant="ghost" size="sm" onClick={onOpenNews} aria-label="News">
          ☰
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label="Settings">
          ⚙
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </header>
  );
}

function EnergyPill({ energy }: { energy: EnergyState }) {
  const percent = Math.min(100, Math.round((energy.value / energy.cap) * 100));
  const full = energy.value >= energy.cap;

  return (
    <div className={`${styles.pill} ${styles.energy}`} title={full ? 'Energy full' : undefined}>
      <span className={styles.pillGlyph} aria-hidden="true">
        ⚡
      </span>
      <span className={styles.pillBody}>
        <span className={styles.pillValue}>
          {energy.value}
          <span className={styles.pillCap}>/{energy.cap}</span>
        </span>
        <span className={styles.energyTrack} aria-hidden="true">
          <span className={styles.energyFill} style={{ width: `${percent}%` }} />
        </span>
      </span>
      <span className="mv-sr-only">
        {energy.value} of {energy.cap} energy
      </span>
    </div>
  );
}

function ResourcePill({
  label,
  value,
  tone,
  glyph,
}: {
  label: string;
  value: number;
  tone: 'silver' | 'crystal';
  glyph: string;
}) {
  return (
    <div className={`${styles.pill} ${styles[tone]}`}>
      <span className={styles.pillGlyph} aria-hidden="true">
        {glyph}
      </span>
      <span className={styles.pillValue}>{formatNumber(value)}</span>
      <span className="mv-sr-only">
        {label}: {value}
      </span>
    </div>
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

/**
 * Shows energy ticking up between server refreshes.
 *
 * The displayed value is *derived* from the server's snapshot plus the current time
 * rather than copied into local state, so it can never drift from what the server said.
 * Any action re-syncs the snapshot; this only animates the gap.
 */
function useLiveEnergy(source: EnergyState | null, clockSkewMs: number): EnergyState {
  const now = useSyncExternalStore(subscribeToClock, clockSnapshot, () => 0);

  if (!source) return EMPTY_ENERGY;
  return projectEnergy(source, now + clockSkewMs);
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

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString('en-US');
}
