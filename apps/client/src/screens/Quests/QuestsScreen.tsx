import { useEffect, useMemo, useState } from 'react';
import { QUEST_PERIODS, type QuestPeriod, type QuestStanding } from '@mistvale/shared';
import { CountdownTimer } from '@/fui/components/CountdownTimer.ts';
import { SegmentedControl } from '@/fui/components/SegmentedControl.ts';
import { Fui } from '@/fui/react';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { Rewards, describeRewards, useRewardName } from '../../ui/Rewards/Rewards';
import { useQuestStore } from '../../state/questStore';
import { useContentStore } from '../../state/contentStore';
import { toast } from '../../state/uiStore';
import { Ledger, type LedgerEntry } from '../../ui/Ledger/Ledger';
import { FirstWins } from './FirstWins';
import styles from './QuestsScreen.module.scss';
import { highlightable } from '../../app/highlight';
import { Heading } from '@/ui/Heading/Heading';
import { ScreenInfo } from '../../ui/ScreenInfo/ScreenInfo';

/**
 * The checklist.
 *
 * Three tabs, because three cadences are three different decisions: what to do before bed,
 * what to plan a week around, and what to keep an eye on. They are tabs rather than three
 * stacked lists because the daily is what a player opens this screen for, every day, and
 * it should never require scrolling past a monthly they finished on the 3rd.
 *
 * The chest sits at the top of its tab rather than the bottom of the list. It is the
 * reason the eighth quest is worth doing when the first seven have already paid, and a
 * reason you cannot see until you scroll is not a reason (docs/UI_UX_DESIGN.md §3,
 * screen 19).
 */

const PERIOD_LABELS: Readonly<Record<QuestPeriod, string>> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export function QuestsScreen(): JSX.Element {
  const quests = useQuestStore((state) => state.quests);
  const loading = useQuestStore((state) => state.loading);
  const busy = useQuestStore((state) => state.busy);
  const error = useQuestStore((state) => state.error);
  const load = useQuestStore((state) => state.load);
  const claim = useQuestStore((state) => state.claim);
  const claimChest = useQuestStore((state) => state.claimChest);
  const lastPaid = useQuestStore((state) => state.lastPaid);
  const clearPaid = useQuestStore((state) => state.clearPaid);

  const bundle = useContentStore((state) => state.bundle);
  const rewardName = useRewardName();
  const [tab, setTab] = useState<QuestPeriod>('daily');

  // Re-read on every visit: a battle fought two screens ago moved this list.
  useEffect(() => {
    void load();
  }, [load]);

  // The wallet in the top bar moves on its own; the toast is what names *which* reward
  // landed, which a changing number cannot.
  useEffect(() => {
    if (!lastPaid) return;
    const line = describeRewards(lastPaid, rewardName);
    if (line) toast.success(`Claimed — ${line}.`);
    clearPaid();
  }, [lastPaid, clearPaid, rewardName]);

  /** Quest definitions by key — the names, descriptions and icons live in content. */
  const defOf = useMemo(() => {
    const defs = new Map((bundle?.quests ?? []).map((def) => [def.key, def]));
    return (key: string) => defs.get(key);
  }, [bundle]);

  const periodOf = (standing: QuestStanding): QuestPeriod | undefined =>
    defOf(standing.questKey)?.period;

  const visible = (quests?.quests ?? []).filter((standing) => periodOf(standing) === tab);
  const chest = quests?.chests.find((entry) => entry.period === tab);

  /** The tab's quests, in the shape every claimable list in the game is drawn from. */
  const entries = useMemo<LedgerEntry[]>(
    () =>
      visible.map((standing) => {
        const def = defOf(standing.questKey);
        return {
          id: standing.questKey,
          name: def?.name ?? standing.questKey,
          ...(def?.description ? { description: def.description } : {}),
          goals: standing.goals.map((entry) => ({
            type: entry.goal.type,
            progress: entry.progress,
            target: entry.goal.target,
          })),
          rewards: standing.rewards,
          ...(standing.claimed ? { claimed: true } : {}),
        };
      }),
    [visible, defOf],
  );

  const countFor = (period: QuestPeriod): number => {
    const ready = (quests?.quests ?? []).filter(
      (standing) => periodOf(standing) === period && standing.complete && !standing.claimed,
    ).length;
    const chestReady = quests?.chests.find((entry) => entry.period === period)?.claimable ? 1 : 0;
    return ready + chestReady;
  };

  return (
    <div className={styles.screen}>
      <Heading
        tagline="The day's work, the week's, and the month's."
        actions={
          <ScreenInfo title="Errands" label="About errands">
            <p>
              Three cadences, three different decisions: what to do before bed, what to plan a week
              around, and what to keep an eye on across a month. Each tab keeps its own list and its
              own reset.
            </p>
            <p>
              Every quest pays on its own, and the tab&rsquo;s <strong>chest</strong> pays again for
              claiming enough of them — which is what makes the eighth quest worth doing when the
              first seven have already paid.
            </p>
            <p>
              The <strong>first win</strong> strip is not a quest list: there is nothing to claim,
              because the bonus lands with the victory. It is there to answer &ldquo;what have I not
              done today&rdquo; before you go and fight.
            </p>
          </ScreenInfo>
        }
      >
        Errands
      </Heading>

      <div className={styles.main}>
        <header className={styles.head}>
          {/* Keyed on the counts, because the badges are what move: a claim empties one
              and the control takes its segments at construction. */}
          <Fui
            key={QUEST_PERIODS.map(countFor).join(',')}
            of={SegmentedControl}
            className={styles.tabs}
            attrs={{ 'aria-label': 'Quest periods' }}
            options={{
              value: tab,
              segments: QUEST_PERIODS.map((period) => {
                const waiting = countFor(period);
                return {
                  value: period,
                  label: PERIOD_LABELS[period],
                  ...(waiting > 0 ? { badge: waiting } : {}),
                };
              }),
            }}
            on={{ 'segment:change': (value: string) => setTab(value as QuestPeriod) }}
          />

          {quests &&
            (tab === 'daily' ? (
              // Anchored to the server's own reset time rather than counting ticks, so a
              // tab left open overnight is not an hour out when it is looked at again.
              <Fui
                key={quests.dailyResetAt}
                of={CountdownTimer}
                className={styles.resets}
                options={{
                  endsAt: new Date(quests.dailyResetAt).getTime(),
                  label: 'Resets',
                  glyph: 'glyph-hourglass',
                  variant: 'chip',
                  doneText: 'Resetting…',
                }}
              />
            ) : (
              <p className={styles.resets}>
                {tab === 'weekly'
                  ? `Week of ${quests.weekAnchor}`
                  : `Month of ${quests.monthAnchor.slice(0, 7)}`}
              </p>
            ))}
        </header>

        <FirstWins bonuses={quests?.firstWins ?? []} />

        {error && <p className={styles.error}>{error}</p>}

        {chest && (
          <Panel variant="hero" className={styles.chest}>
            <div className={styles.chestBody}>
              <div>
                <h3 className={styles.chestTitle}>
                  {tab === 'daily' ? 'The day’s chest' : 'Completion chest'}
                </h3>
                <p className={styles.chestNote}>
                  Claim all {chest.required} to open it — {chest.claimedQuests} so far.
                </p>
                <Rewards rewards={chest.rewards} signed />
              </div>
              <div className={styles.chestAction}>
                <Meter value={chest.claimedQuests} of={chest.required} />
                <Button
                  disabled={!chest.claimable || busy !== null}
                  onClick={() => void claimChest(tab)}
                >
                  {chest.claimed
                    ? 'Claimed'
                    : busy === `chest:${tab}`
                      ? 'Opening…'
                      : 'Open the chest'}
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {loading && !quests ? (
          <p className={styles.empty}>Reading the ledger…</p>
        ) : (
          <Ledger
            className={styles.list}
            attrs={highlightable(`panel:quest-${tab}`)}
            entries={entries}
            emptyText={`Nothing here yet — ${PERIOD_LABELS[
              tab
            ].toLowerCase()} quests open as your account grows.`}
            onClaim={(key) => {
              if (busy === null) void claim(key);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** A blocky progress meter — squares rather than a bar, to stay in the pixel kit. */
function Meter({ value, of }: { value: number; of: number }): JSX.Element {
  return (
    <div className={styles.meter} role="img" aria-label={`${value} of ${of} claimed`}>
      {Array.from({ length: of }, (_, index) => (
        <span
          key={index}
          className={[styles.notch, index < value ? styles.notchFull : '']
            .filter(Boolean)
            .join(' ')}
        />
      ))}
    </div>
  );
}
