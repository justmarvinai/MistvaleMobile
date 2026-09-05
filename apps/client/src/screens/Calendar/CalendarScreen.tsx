import { useEffect, useMemo, useState } from 'react';
import type { LoginTrackKind, LoginTrackStanding } from '@mistvale/shared';
import { DailyRewards } from '@/fui/components/DailyRewards.ts';
import { ChampionCard as FuiChampionCard } from '@/fui/components/ChampionCard.ts';
import { Fui } from '@/fui/react';
import { Empty } from '../../ui/Empty/Empty';
import { Panel } from '../../ui/Panel/Panel';
import { ScreenInfo } from '../../ui/ScreenInfo/ScreenInfo';
import { Button } from '../../ui/Button/Button';
import { Modal } from '../../ui/Modal/Modal';
import { describeRewards, useRewardName } from '../../ui/Rewards/Rewards';
import { rewardArt } from '../../ui/Rewards/art';
import { useContentStore } from '../../state/contentStore';
import { useLoginStore } from '../../state/loginStore';
import { toast } from '../../state/uiStore';
import { trackTiles } from './trackTiles';
import styles from './CalendarScreen.module.scss';
import { Heading } from '@/ui/Heading/Heading';
import { championArt } from '../../ui/championArt';

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
      <Heading
        tagline="Thirty days of the vale's gratitude, one lantern at a time."
        actions={
          // Each track's own words, behind the i (C44) — they were a paragraph above each
          // grid, and the grid is the thing.
          <ScreenInfo title="The Lantern Calendar" label="About the calendar">
            {[login?.welcome, login?.calendar]
              .filter((track): track is LoginTrackStanding => track !== undefined)
              .map((track) => (
                <p key={track.track}>
                  <strong>{track.name}.</strong> {track.description}
                </p>
              ))}
            <p>
              Each track pays its day N on the Nth claim, so a missed day costs the day and never
              your place in the track.
            </p>
          </ScreenInfo>
        }
      >
        The Lantern Calendar
      </Heading>

      {error && <p className={styles.error}>{error}</p>}

      {loading && !login ? (
        <p className={styles.empty}>Counting the nights…</p>
      ) : !login?.calendar && !login?.welcome ? (
        <Empty
          glyph="glyph-celestial-body"
          title="No track is running"
          message="The Vale keeps its own hours — try again tomorrow."
        />
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
        size="wide"
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
        {/* The painted card, not a name in a box. This is a choice a player makes once and
            cannot revisit, and "take the one your roster is missing" is unanswerable from
            four strings — rarity and affinity are what the decision turns on. Level, stars
            and power are deliberately absent: nobody owns these yet, and a card claiming
            otherwise would be the screen inventing facts. */}
        <ul className={styles.choices}>
          {(selector?.choices ?? []).map((key) => (
            <li key={key}>
              <ChoiceCard championKey={key} picked={picked === key} onPick={() => setPicked(key)} />
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
  const rewardName = useRewardName();
  const next = track.days.find((day) => day.next);
  const tiles = trackTiles(track);

  /**
   * The track's days, as the library's calendar draws them.
   *
   * A day that hands over a champion — or lets the player choose one — is a milestone: the
   * component gives those a double-width tile with gold trim, which is exactly the weight
   * day thirty deserves and exactly what the old flat grid could not give it.
   */
  const days = useMemo(
    () =>
      track.days.map((day) => {
        const rewards = Object.entries(day.rewards).filter(([, amount]) => amount > 0);
        const first = rewards[0];
        const champions =
          day.choices.length > 0 ? 'Your pick' : day.champions.map(championName).join(', ');
        const label = [
          champions,
          day.relicCount > 0 ? `${day.relicCount} relics` : '',
          describeRewards(day.rewards, rewardName),
        ]
          .filter(Boolean)
          .join(' · ');
        return {
          icon:
            champions !== ''
              ? 'rune-nova-star'
              : day.relicCount > 0
                ? 'icon-chest'
                : first
                  ? rewardArt(first[0])
                  : 'rune-bronze-disc',
          ...(label ? { label } : {}),
          ...(champions === '' && first && first[1] > 1 ? { qty: first[1] } : {}),
          ...(champions !== '' ? { milestone: true } : {}),
        };
      }),
    [track.days, championName, rewardName],
  );

  return (
    <Panel
      variant="hero"
      title={track.name}
      actions={
        // Where the track stands and today's claim, in the title bar (C44). It was a strip
        // above the grid saying "Day 4 is waiting" over a tile already lit gold and
        // saying the same — and a 170px strip is a row of tiles' worth of room. The button
        // stays a button: the library's tile answers a click, but it is a `div`, and the
        // one thing a player is asked to press every day should be reachable by keyboard.
        <span className={styles.standing}>
          <span className={styles.meta}>
            {track.track === 'calendar' ? `Cycle ${track.cycle} · ` : ''}
            {track.claimsMade} collected
          </span>
          {track.claimedToday ? (
            <span className={styles.done}>Collected today — come back tomorrow.</span>
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
        </span>
      }
    >
      {/* Keyed on what it draws *and* on whether a claim is in flight: the component ticks
          today's tile the moment it is pressed, and the server is what settles a claim —
          so a remount puts the tile back where the server has it until the server moves
          it. Ten columns for the thirty-day cycle and seven for the welcome week, because
          the default is one column per tile and thirty of those is a hairline. */}
      <Fui
        key={`${tiles.currentDay}|${tiles.spent}|${busy}`}
        of={DailyRewards}
        className={styles.grid}
        options={{
          rewards: days,
          // See `trackTiles`: the grid counts tiles, the track counts days, and the two
          // are only the same number while nothing has been claimed today.
          currentDay: tiles.currentDay,
          claimedToday: tiles.spent,
          columns: track.track === 'calendar' ? 10 : 7,
        }}
        on={{
          'daily:claim': () => {
            if (!disabled) onClaim();
          },
        }}
      />
    </Panel>
  );
}

/**
 * One champion on offer at the end of the calendar.
 *
 * Def-only: an unclaimed champion has no level, no rank and no power, so the card carries
 * the three things that are true of it — who it is, how rare it is, and what it is aligned
 * with — and nothing it would have to make up. Same frame as the roster's card, because
 * this is the same act of choosing.
 */
function ChoiceCard({
  championKey,
  picked,
  onPick,
}: {
  championKey: string;
  picked: boolean;
  onPick: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const def = bundle?.champions.find((entry) => entry.key === championKey);
  const art = championArt(def, bundle?.assets);

  return (
    <Fui
      of={FuiChampionCard}
      className={styles.choiceCard}
      options={{
        name: def?.name ?? championKey,
        ...art,
        rarity: def?.rarity ?? 'epic',
        ...(def?.element ? { affinity: def.element } : {}),
        selectable: true,
        selected: picked,
      }}
      // The library toggles its own ring on press, before React decides anything; this
      // puts it back where the state says, which is what makes a second press on the
      // already-picked card a no-op rather than a silent deselect.
      apply={(card, next) => card.setSelected(Boolean(next.selected))}
      on={{ 'champion:select': () => onPick() }}
      attrs={{
        'aria-label': [def?.name ?? championKey, def?.rarity, def?.element]
          .filter(Boolean)
          .join(', '),
      }}
    />
  );
}
