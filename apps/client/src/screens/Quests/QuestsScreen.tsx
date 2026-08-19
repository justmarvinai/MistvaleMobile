import { useEffect, useMemo, useState } from 'react';
import { QUEST_PERIODS, type QuestPeriod, type QuestStanding } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { Rewards, describeRewards, useRewardName } from '../../ui/Rewards/Rewards';
import { useQuestStore } from '../../state/questStore';
import { useContentStore } from '../../state/contentStore';
import { toast } from '../../state/uiStore';
import { QuestRow } from './QuestRow';
import { FirstWins } from './FirstWins';
import styles from './QuestsScreen.module.scss';
import { highlightable } from '../../app/highlight';
import { Heading } from '@/ui/Heading/Heading';

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

  const countFor = (period: QuestPeriod): number => {
    const ready = (quests?.quests ?? []).filter(
      (standing) => periodOf(standing) === period && standing.complete && !standing.claimed,
    ).length;
    const chestReady = quests?.chests.find((entry) => entry.period === period)?.claimable ? 1 : 0;
    return ready + chestReady;
  };

  return (
    <div className={styles.screen}>
      <Heading tagline="The day's work, the week's, and the month's.">Errands</Heading>

      <div className={styles.main}>
        <header className={styles.head}>
          <nav className={styles.tabs} aria-label="Quest periods">
            {QUEST_PERIODS.map((period) => {
              const waiting = countFor(period);
              return (
                <button
                  key={period}
                  type="button"
                  className={[styles.tab, period === tab ? styles.tabActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={period === tab}
                  onClick={() => setTab(period)}
                >
                  {PERIOD_LABELS[period]}
                  {waiting > 0 && (
                    <span className={styles.pip} aria-label={`${waiting} ready to claim`}>
                      {waiting}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {quests && (
            <p className={styles.resets}>
              {tab === 'daily'
                ? `Resets ${relative(quests.dailyResetAt)}`
                : tab === 'weekly'
                  ? `Week of ${quests.weekAnchor}`
                  : `Month of ${quests.monthAnchor.slice(0, 7)}`}
            </p>
          )}
        </header>

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
        ) : visible.length === 0 ? (
          <p className={styles.empty}>
            Nothing here yet — {PERIOD_LABELS[tab].toLowerCase()} quests open as your account grows.
          </p>
        ) : (
          <ul className={styles.list} {...highlightable(`panel:quest-${tab}`)}>
            {visible.map((standing) => (
              <QuestRow
                key={standing.questKey}
                standing={standing}
                def={defOf(standing.questKey)}
                busy={busy === standing.questKey}
                disabled={busy !== null}
                onClaim={() => void claim(standing.questKey)}
              />
            ))}
          </ul>
        )}
      </div>

      <aside className={styles.side}>
        <FirstWins bonuses={quests?.firstWins ?? []} />
      </aside>
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

/** "in 4h 20m" — coarse on purpose, because the exact second is never the question. */
function relative(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'shortly';
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours >= 1) return `in ${hours}h ${minutes % 60}m`;
  return `in ${minutes}m`;
}
