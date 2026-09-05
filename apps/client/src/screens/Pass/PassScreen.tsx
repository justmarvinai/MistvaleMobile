import { useEffect } from 'react';
import type { ValePassStanding, ValePassTierStanding, ValePassTrack } from '@mistvale/shared';
import { CountdownTimer } from '@/fui/components/CountdownTimer.ts';
import { Fui } from '@/fui/react';
import { Button } from '../../ui/Button/Button';
import { Empty } from '../../ui/Empty/Empty';
import { Heading } from '../../ui/Heading/Heading';
import { Panel } from '../../ui/Panel/Panel';
import { ScreenInfo } from '../../ui/ScreenInfo/ScreenInfo';
import { describeRewards, useRewardName } from '../../ui/Rewards/Rewards';
import { PassLadder } from './PassLadder';
import { usePassStore } from '../../state/passStore';
import { usePlayerStore } from '../../state/playerStore';
import { toast } from '../../state/uiStore';
import styles from './PassScreen.module.scss';

/**
 * The Vale Pass (C38).
 *
 * One ladder, two columns. The season has a free column and the season's own, and they are
 * drawn as one rail of tier columns with both rewards on each rung — because the question
 * is "how far to the next thing", asked twice about the same distance, and two lists would
 * ask a player to line up rungs by eye.
 *
 * **The day's ceiling is on the screen**, in the standing line. It is the number the whole
 * design rests on, and a ceiling nobody can see is indistinguishable from points that have
 * quietly stopped arriving — which is the one way this feature can look broken while
 * working perfectly.
 *
 * The ladder is Mistvale's own (`PassLadder`, C43) rather than the library's `RewardTrack`,
 * which the first cut used for D9's reason and which turned out to be the wrong shape: it
 * spreads its nodes along one line by the favour they sit at, right for six milestones and
 * unreadable at thirty. What stays the library's is the countdown chip in the title bar.
 */
export function PassScreen(): JSX.Element {
  const pass = usePassStore((state) => state.pass);
  const loading = usePassStore((state) => state.loading);
  const error = usePassStore((state) => state.error);
  const load = usePassStore((state) => state.load);
  const lastPaid = usePassStore((state) => state.lastPaid);
  const clearPaid = usePassStore((state) => state.clearPaid);
  const rewardName = useRewardName();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lastPaid) return;
    const line = describeRewards(lastPaid, rewardName);
    if (line) toast.success(`Collected — ${line}.`);
    clearPaid();
  }, [lastPaid, clearPaid, rewardName]);

  return (
    <div className={styles.screen}>
      <Heading
        tagline="A season of the reclamation. Play, and the track walks with you."
        actions={
          <ScreenInfo title="The Vale Pass">
            {/* The season's own description first — it was a paragraph above the ladder,
                and the ladder is the thing (C44). */}
            {pass?.passes.map((season) => (
              <p key={season.passKey}>
                <strong>{season.name}.</strong> {season.description}
              </p>
            ))}
            <p>
              Everything you do in the vale earns favour, and favour walks the track. There is a{' '}
              <strong>ceiling on each day</strong> — a season is thirty tiers over a month, not a
              weekend, so a heavy Saturday cannot buy the rest of it.
            </p>
            <p>
              The upper rail is open to everybody. The lower one is the season’s own, taken up with
              crystals — which are earned in the vale like everything else. Taking it up opens every
              tier you have already passed, and they are collected one at a time.
            </p>
            <p>
              The season turns over with the calendar. Anything you have reached stays collectable
              for a few days after it closes.
            </p>
          </ScreenInfo>
        }
      >
        The Vale Pass
      </Heading>

      {error && <p className={styles.error}>{error}</p>}

      {loading && !pass ? (
        <p className={styles.empty}>Reading the season…</p>
      ) : (pass?.passes.length ?? 0) === 0 ? (
        <Empty
          glyph="glyph-hourglass"
          title="No season is running"
          message="The vale keeps its own calendar. A new season will open."
        />
      ) : (
        pass?.passes.map((season) => (
          <SeasonPanel
            key={`${season.passKey}:${season.season}`}
            season={season}
            today={pass.today}
          />
        ))
      )}
    </div>
  );
}

function SeasonPanel({ season, today }: { season: ValePassStanding; today: string }): JSX.Element {
  const busy = usePassStore((state) => state.busy);
  const claim = usePassStore((state) => state.claim);
  const unlock = usePassStore((state) => state.unlock);
  const crystals = usePlayerStore((state) => state.player?.crystals ?? 0);

  const press = (track: ValePassTrack, tier: ValePassTierStanding): void => {
    if (!tier.reached || busy !== null) return;
    if (track === 'free' && tier.freeClaimed) return;
    if (track === 'premium' && (tier.premiumClaimed || tier.premiumLocked)) return;
    if (Object.keys(track === 'free' ? tier.free : tier.premium).length === 0) return;
    void claim(season.passKey, tier.index, track);
  };

  const nextTier = season.tiers.find((tier) => !tier.reached);
  const capped = season.dailyCap > 0 && season.pointsToday >= season.dailyCap;

  return (
    <Panel
      variant="hero"
      title={season.name}
      actions={
        season.live ? (
          <Fui
            key={season.endsOn}
            of={CountdownTimer}
            className={styles.live}
            options={{
              endsAt: new Date(`${season.endsOn}T23:59:59Z`).getTime(),
              label: today === season.endsOn ? 'Last day' : 'Season ends',
              glyph: 'glyph-hourglass',
              variant: 'chip',
              doneText: 'Season closed',
            }}
          />
        ) : (
          <span className={styles.closed}>Closed — collect by {season.claimsCloseOn}</span>
        )
      }
    >
      {/* The standing strip: where you are, what today still allows, and what is next. The
          ceiling is stated whether or not it has been hit — a limit a player only meets by
          running into it is one they read as the game having stopped paying. */}
      <div className={styles.standing}>
        <span className={styles.figure}>
          <strong>{season.points.toLocaleString()}</strong> favour
        </span>
        {season.dailyCap > 0 && (
          <span className={styles.today} data-capped={capped}>
            {capped
              ? `Today’s ${season.dailyCap.toLocaleString()} is earned — the rest comes back tomorrow`
              : `${season.pointsToday.toLocaleString()} of ${season.dailyCap.toLocaleString()} today`}
          </span>
        )}
        {nextTier && (
          <span className={styles.next}>
            {(nextTier.points - season.points).toLocaleString()} to tier {nextTier.index + 1}
          </span>
        )}
      </div>

      <div className={styles.rules}>
        {season.rules.map((rule, index) => (
          <span key={index} className={styles.rule}>
            <span className={styles.rulePoints}>{rule.points.toLocaleString()}</span>
            {rule.label}
          </span>
        ))}
      </div>

      <PassLadder season={season} busy={busy !== null} onClaim={press} />

      {/* Offered only where it can be pressed. A permanently disabled button on a closed
          season reads as something broken, and the sentence beside it says which it is. */}
      {!season.unlocked &&
        (season.live ? (
          <div className={styles.buy}>
            <span className={styles.buyLine}>
              Take up the season’s track for{' '}
              <strong>{season.unlockCost.toLocaleString()} crystals</strong> — every tier you have
              already passed opens with it.
            </span>
            <Button
              onClick={() => void unlock(season.passKey)}
              disabled={busy !== null || crystals < season.unlockCost}
            >
              {busy === `${season.passKey}:unlock`
                ? 'Taking it up…'
                : crystals < season.unlockCost
                  ? `Needs ${(season.unlockCost - crystals).toLocaleString()} more`
                  : 'Take it up'}
            </Button>
          </div>
        ) : (
          <p className={styles.buyClosed}>
            The season has closed, so its own track can no longer be taken up. What you reached on
            the open rail is still yours to collect.
          </p>
        ))}
    </Panel>
  );
}
