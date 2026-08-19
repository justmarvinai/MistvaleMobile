import { useEffect, useMemo, useState } from 'react';
import type { LoginDayStanding, LoginTrackKind, LoginTrackStanding } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { Modal } from '../../ui/Modal/Modal';
import { Rewards, describeRewards, useRewardName } from '../../ui/Rewards/Rewards';
import { useContentStore } from '../../state/contentStore';
import { useLoginStore } from '../../state/loginStore';
import { toast } from '../../state/uiStore';
import styles from './CalendarScreen.module.scss';
import { Heading } from '@/ui/Heading/Heading';

/**
 * The login calendar.
 *
 * A thirty-tile grid and, for somebody new, a seven-tile strip above it — the shape
 * UI_UX_DESIGN §3 screen 22 asks for. Exactly one tile per track glows: the one the next
 * claim pays. Everything behind it is spent, everything ahead is a promise, and the
 * difference is legible at a glance without reading a single number.
 *
 * The claim button lives on the tile rather than in a header, because "collect day 12" is
 * the only action on this screen and it should be where the player is already looking.
 */
export function CalendarScreen(): JSX.Element {
  const login = useLoginStore((state) => state.login);
  const loading = useLoginStore((state) => state.loading);
  const busy = useLoginStore((state) => state.busy);
  const error = useLoginStore((state) => state.error);
  const load = useLoginStore((state) => state.load);
  const claim = useLoginStore((state) => state.claim);
  const lastPayout = useLoginStore((state) => state.lastPayout);
  const clearPayout = useLoginStore((state) => state.clearPayout);
  const bundle = useContentStore((state) => state.bundle);
  const rewardName = useRewardName();

  /** The day-30 selector, held open until the player picks. */
  const [choosing, setChoosing] = useState<LoginTrackKind | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const championName = useMemo(() => {
    const names = new Map((bundle?.champions ?? []).map((entry) => [entry.key, entry.name]));
    return (key: string): string => names.get(key) ?? key;
  }, [bundle]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lastPayout) return;
    // The champion first, then the relics, then the coins — in the order the player cares.
    if (lastPayout.champions.length > 0) {
      toast.success(`${lastPayout.champions.map(championName).join(', ')} joins you.`);
    } else if (lastPayout.relics.length > 0) {
      toast.success(`${lastPayout.relics.length} relics are in your vault.`);
    } else {
      const line = describeRewards(lastPayout.paid, rewardName);
      if (line) toast.success(`Day ${lastPayout.day} — ${line}.`);
    }
    clearPayout();
  }, [lastPayout, clearPayout, rewardName, championName]);

  const onClaim = (track: LoginTrackStanding): void => {
    const next = track.days.find((day) => day.next);
    if (next && next.choices.length > 0) {
      setPicked(next.choices[0] ?? null);
      setChoosing(track.track);
      return;
    }
    void claim(track.track);
  };

  const confirmChoice = (): void => {
    if (!choosing || !picked) return;
    void claim(choosing, picked);
    setChoosing(null);
    setPicked(null);
  };

  const selector = choosing
    ? (choosing === 'calendar' ? login?.calendar : login?.welcome)?.days.find((day) => day.next)
    : undefined;

  return (
    <div className={styles.screen}>
      <Heading tagline="Thirty days of the vale's gratitude, one lantern at a time.">
        The Lantern Calendar
      </Heading>

      {error && <p className={styles.error}>{error}</p>}

      {loading && !login ? (
        <p className={styles.empty}>Counting the nights…</p>
      ) : !login?.calendar && !login?.welcome ? (
        <p className={styles.empty}>
          No track is running just now. The Vale keeps its own hours — try again tomorrow.
        </p>
      ) : (
        <>
          {/* The dock shrouds this screen below the gate, so this line is for the rare
              path that reaches it anyway — and it explains rather than merely refusing. */}
          {!login.unlocked && (
            <p className={styles.locked}>
              The calendar opens at account level {login.unlockLevel}. Nothing is lost by arriving
              late — it pays its first day whenever you first take it.
            </p>
          )}
          {login.welcome && (
            <TrackPanel
              track={login.welcome}
              busy={busy === login.welcome.track}
              disabled={busy !== null || !login.unlocked}
              championName={championName}
              onClaim={() => onClaim(login.welcome!)}
            />
          )}
          {login.calendar && (
            <TrackPanel
              track={login.calendar}
              busy={busy === login.calendar.track}
              disabled={busy !== null || !login.unlocked}
              championName={championName}
              onClaim={() => onClaim(login.calendar!)}
            />
          )}
        </>
      )}

      <Modal
        open={choosing !== null}
        title="Choose your reward"
        onClose={() => setChoosing(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setChoosing(null)}>
              Not yet
            </Button>
            <Button variant="primary" disabled={!picked} onClick={confirmChoice}>
              Take {picked ? championName(picked) : 'them'}
            </Button>
          </>
        }
      >
        <p className={styles.choicePrompt}>
          Thirty nights of keeping the lantern lit. One of them comes with you — and the choice is
          not offered twice, so take the one your roster is missing.
        </p>
        <ul className={styles.choices}>
          {(selector?.choices ?? []).map((key) => (
            <li key={key}>
              <button
                type="button"
                className={[styles.choice, picked === key ? styles.choicePicked : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={picked === key}
                onClick={() => setPicked(key)}
              >
                {championName(key)}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

function TrackPanel({
  track,
  busy,
  disabled,
  championName,
  onClaim,
}: {
  track: LoginTrackStanding;
  busy: boolean;
  disabled: boolean;
  championName: (key: string) => string;
  onClaim: () => void;
}): JSX.Element {
  const next = track.days.find((day) => day.next);

  return (
    <Panel
      variant="hero"
      title={track.name}
      actions={
        <span className={styles.meta}>
          {track.track === 'calendar' ? `Cycle ${track.cycle} · ` : ''}
          {track.claimsMade} collected
        </span>
      }
    >
      <p className={styles.blurb}>{track.description}</p>

      <div className={styles.today}>
        {track.claimedToday ? (
          <span className={styles.done}>Collected today. Come back tomorrow.</span>
        ) : next ? (
          <>
            <span className={styles.todayLabel}>Day {next.day} is waiting</span>
            <Button variant="primary" disabled={disabled} onClick={onClaim}>
              {busy ? 'Collecting…' : next.choices.length > 0 ? 'Choose…' : 'Collect'}
            </Button>
          </>
        ) : (
          <span className={styles.done}>Walked to the end.</span>
        )}
      </div>

      <ol className={track.track === 'calendar' ? styles.grid : styles.strip}>
        {track.days.map((day) => (
          <DayTile key={day.day} day={day} championName={championName} />
        ))}
      </ol>
    </Panel>
  );
}

function DayTile({
  day,
  championName,
}: {
  day: LoginDayStanding;
  championName: (key: string) => string;
}): JSX.Element {
  const headline =
    day.choices.length > 0 ? 'Your pick' : day.champions.map(championName).join(', ');

  return (
    <li
      className={[styles.tile, day.claimed ? styles.tileDone : '', day.next ? styles.tileNext : '']
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.tileDay}>{day.day}</span>
      {headline && <span className={styles.tileChampion}>{headline}</span>}
      {day.relicCount > 0 && <span className={styles.tileRelics}>{day.relicCount} relics</span>}
      <Rewards rewards={day.rewards} />
    </li>
  );
}
