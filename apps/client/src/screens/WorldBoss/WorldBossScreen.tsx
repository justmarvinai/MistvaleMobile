import { useEffect, useMemo, useState } from 'react';
import type { WorldBossStanding } from '@mistvale/shared';
import { nextWorldBossTier } from '@mistvale/shared';
import { Button } from '@/ui/Button/Button';
import { Empty } from '@/ui/Empty/Empty';
import { Heading } from '@/ui/Heading/Heading';
import { Panel } from '@/ui/Panel/Panel';
import { Rewards } from '@/ui/Rewards/Rewards';
import { ScreenInfo } from '@/ui/ScreenInfo/ScreenInfo';
import { Hero } from '@/ui/Hero/Hero';
import { Ladder } from '@/ui/Ladder/Ladder';
import { dungeonInk } from '@/ui/dungeonArt';
import { SCREENS } from '@/app/screens';
import { usePlayerStore } from '@/state/playerStore';
import { useWorldBossStore } from '@/state/worldBossStore';
import { useContentStore } from '@/state/contentStore';
import { TeamSelect } from '../Battle/TeamSelect';
import styles from './WorldBossScreen.module.scss';

/**
 * The Wurm Wakes.
 *
 * The only screen in Mistvale showing a number that is not this account's. Everything on it
 * is arranged around that one fact, in the order a warden wants it:
 *
 *  1. **The bar.** How much of it the whole Vale has got through, and how much is left.
 *     Drawn first and drawn big, because it is the only thing here that is *ours* rather
 *     than mine — and because watching it move while you were away is the entire feeling
 *     the mode exists to produce.
 *  2. **Your part in it.** What you have done this wake, where that puts you, and which
 *     rung is next. A shared bar with no personal number beside it is a bar nobody can tell
 *     whether they helped with.
 *  3. **The board.** Ten names and ten numbers. That is the whole social layer: no chat, no
 *     guild, nobody to schedule with — just evidence that other people were here.
 *
 * A strike is an ordinary battle, so the team chooser is the same one the campaign uses.
 */
export function WorldBossScreen(): JSX.Element {
  const view = useWorldBossStore((store) => store.view);
  const loaded = useWorldBossStore((store) => store.loaded);
  const loading = useWorldBossStore((store) => store.loading);
  const load = useWorldBossStore((store) => store.load);
  const claimTier = useWorldBossStore((store) => store.claimTier);
  const claimSpoils = useWorldBossStore((store) => store.claimSpoils);
  const refreshPlayer = usePlayerStore((store) => store.refresh);
  const bundle = useContentStore((store) => store.bundle);

  const [striking, setStriking] = useState<WorldBossStanding | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Re-read on mount, and again after every strike: the bar is the one number on this
  // screen that other people move, so a remembered copy of it is wrong by the time it is
  // drawn.
  useEffect(() => {
    void load();
  }, [load]);

  const stages = useMemo(
    () => new Map((bundle?.stages ?? []).map((stage) => [stage.key, stage])),
    [bundle],
  );

  const act = async (run: () => Promise<void>, said: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await run();
      setNotice(said);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be done.');
    } finally {
      setBusy(false);
    }
  };

  if (loaded && view.bosses.length === 0) {
    return (
      <div className={styles.screen}>
        <Heading tagline="One health bar, and the whole Vale on it.">The Wurm Wakes</Heading>
        <Empty
          glyph="glyph-cursed-eye"
          title="Nothing is stirring"
          message={
            loading
              ? 'Listening under the vale…'
              : 'No world boss is open to you. The Wurm wakes for wardens of level 18 and above.'
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <Heading
        tagline="One health bar, and the whole Vale on it."
        actions={
          <ScreenInfo title="The Wurm Wakes">
            <Panel title="One bar, everybody">
              <p className={styles.note}>
                Every warden in the Vale strikes the same Wurm, and every point of damage comes off
                the same health bar. What you take off on Friday is still gone when somebody else
                arrives on Sunday — nobody has to be online at the same time as anybody.
              </p>
            </Panel>
            <Panel title="What you are paid">
              <p className={styles.note}>
                The <strong>contribution ladder</strong> is counted across the whole wake rather
                than per strike, and each rung is collected once. That is the reliable payout:
                turning up is what it rewards.
              </p>
              <p className={styles.note}>
                If the Vale actually gets through the bar, <strong>everybody who struck it</strong>{' '}
                takes the same chest — the last blow and a single Friday strike are worth exactly
                the same. It is a bonus rather than the point, so a quiet week is still worth
                turning up to.
              </p>
            </Panel>
            <Panel title="Your own fight">
              <p className={styles.note}>
                A strike is fifty turns against something authored to outlast you, so it will still
                be standing in <em>your</em> battle when the fight ends. What falls is the shared
                bar on this screen, not the one over its head.
              </p>
            </Panel>
          </ScreenInfo>
        }
      >
        The Wurm Wakes
      </Heading>

      {notice && <p className={styles.notice}>{notice}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {view.bosses.map((boss) => (
        <BossPanel
          key={boss.dungeonKey}
          boss={boss}
          // Only when there is more than one. The screen is a list and its title is the
          // registry's label, which today is the name of the only wake published — so the
          // panel repeated it, and the tagline under it, a hundred pixels lower.
          named={view.bosses.length > 1}
          busy={busy}
          onStrike={() => setStriking(boss)}
          onClaimTier={(tierKey, tierName) =>
            void act(async () => {
              await claimTier(boss.dungeonKey, tierKey);
              await refreshPlayer();
            }, `${tierName} collected.`)
          }
          onClaimSpoils={() =>
            void act(async () => {
              await claimSpoils(boss.dungeonKey);
              await refreshPlayer();
            }, 'Your share of the spoils. The Vale brought it down together.')
          }
        />
      ))}

      {striking && stages.get(striking.stageKey) && (
        <TeamSelect
          stage={stages.get(striking.stageKey)!}
          title={striking.name}
          attempts={{
            left: striking.attemptsLeft,
            perDay: striking.attemptsPerDay,
            turnCap: striking.turnCap,
            noun: 'strike',
          }}
          onClose={() => {
            setStriking(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

/**
 * A game-day as a warden would say it: "Friday, 28 Aug".
 *
 * The server speaks in `YYYY-MM-DD` because that is what the scheduler compares, and a
 * screen that repeats it is asking a player to work out which day of the week that is —
 * which is the only part of the answer they actually wanted. Parsed as UTC so the date does
 * not slide a day in a western timezone.
 */
function sayDay(day: string): string {
  const at = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return day;
  return at.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Everything about one boss: the shared bar, your part in it, and the board. */
function BossPanel({
  boss,
  named,
  busy,
  onStrike,
  onClaimTier,
  onClaimSpoils,
}: {
  boss: WorldBossStanding;
  busy: boolean;
  onStrike: () => void;
  /** Whether this panel has to say its own name — false when the screen title already did. */
  named: boolean;
  onClaimTier: (tierKey: string, tierName: string) => void;
  onClaimSpoils: () => void;
}): JSX.Element {
  const pct = boss.maxHp > 0 ? Math.min(100, (boss.damageTaken / boss.maxHp) * 100) : 0;
  const left = Math.max(0, boss.maxHp - boss.damageTaken);
  const next = nextWorldBossTier(
    boss.yourDamage,
    boss.tiers.map((tier) => ({
      key: tier.key,
      name: tier.name,
      damage: tier.damage,
      rewards: tier.rewards,
    })),
  );
  const spoilsReady = boss.felled && boss.yourDamage > 0 && !boss.fellingClaimed;

  return (
    <div className={styles.boss}>
      {/* The creature is the room (C46): its painting — the same one its card on the
          Battle hub wears — with the one thing on this screen that is ours rather than
          mine laid across its foot: the bar. Watching it move while you were away is the
          whole feature, and it was a 26px strip at the top of a panel of text. */}
      <Hero
        art={WAKE_ART}
        ink={dungeonInk('titan')}
        title={named ? boss.name : undefined}
        tagline={named ? boss.tagline : undefined}
        label={boss.name}
        className={styles.hero}
      >
        <div className={styles.pool} data-felled={boss.felled ? 'yes' : 'no'}>
          <div className={styles.poolTrack}>
            <div className={styles.poolFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.poolNumbers}>
            <span className={styles.poolPct}>{pct.toFixed(1)}%</span>
            <span className={styles.poolLeft}>
              {boss.felled
                ? 'It fell. The Vale brought it down.'
                : `${left.toLocaleString()} left of ${boss.maxHp.toLocaleString()}`}
            </span>
          </div>
        </div>

        <p className={styles.crowd}>
          <strong>{boss.wardens.toLocaleString()}</strong>{' '}
          {boss.wardens === 1 ? 'warden has' : 'wardens have'} struck it,{' '}
          <strong>{boss.strikes.toLocaleString()}</strong> {boss.strikes === 1 ? 'time' : 'times'}
          {boss.awake && boss.endsOn ? ` · the wake runs to ${sayDay(boss.endsOn)}` : ''}
          {!boss.awake && boss.wakesOn ? ` · it stirs again on ${sayDay(boss.wakesOn)}` : ''}
        </p>

        <div className={styles.strip}>
          <dl className={styles.yours}>
            <div>
              <dt>Your damage</dt>
              <dd>{boss.yourDamage.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Your strikes</dt>
              <dd>{boss.yourStrikes}</dd>
            </div>
            <div>
              <dt>Your place</dt>
              <dd>{boss.yourRank === null ? '—' : `#${boss.yourRank}`}</dd>
            </div>
            <div>
              <dt>Strikes today</dt>
              <dd>
                {boss.attemptsLeft} / {boss.attemptsPerDay}
              </dd>
            </div>
          </dl>

          {boss.blockedReason ? (
            <p className={styles.blocked}>{boss.blockedReason}</p>
          ) : (
            <Button onClick={onStrike} disabled={busy}>
              Strike it
            </Button>
          )}
        </div>

        {next && !boss.felled && (
          <p className={styles.next}>
            {(next.damage - boss.yourDamage).toLocaleString()} more damage to{' '}
            <strong>{next.name}</strong>.
          </p>
        )}
      </Hero>

      <div className={styles.beside}>
        {spoilsReady && (
          <div className={styles.spoils}>
            <div>
              <span className={styles.spoilsTitle}>The Vale felled it</span>
              <Rewards rewards={boss.fellingRewards} signed />
            </div>
            <Button onClick={onClaimSpoils} disabled={busy}>
              Take your share
            </Button>
          </div>
        )}

        {/* The contribution ladder as tiles (C46): counted across the whole wake, each
            rung collected once, so a reached rung is a button until it is taken. */}
        <Panel title="The ladder" className={styles.ladderPanel}>
          <Ladder
            rows={[
              {
                key: 'contribution',
                title: 'Contribution',
                subtitle: 'Counted across the wake, collected once',
              },
            ]}
            tiers={boss.tiers.map((tier, index) => ({
              index,
              points: tier.damage,
              name: tier.name,
              reached: tier.reached,
              tiles: [{ rewards: tier.rewards, claimed: tier.claimed, barred: false }],
            }))}
            scrollKey={`${boss.dungeonKey}:${boss.endsOn ?? ''}`}
            busy={busy}
            label={`${boss.name} contribution ladder`}
            onClaim={(_, tier) => {
              const rung = boss.tiers[tier.index];
              if (rung && rung.reached && !rung.claimed) onClaimTier(rung.key, rung.name);
            }}
          />
        </Panel>

        <Panel title="Who has struck it" className={styles.board}>
          {boss.board.length === 0 ? (
            <p className={styles.note}>Nobody yet. Somebody has to go first.</p>
          ) : (
            <ol className={styles.boardList}>
              {boss.board.map((striker) => (
                <li
                  key={`${striker.rank}-${striker.profileName}`}
                  data-you={striker.you ? 'yes' : 'no'}
                >
                  <span className={styles.boardRank}>{striker.rank}</span>
                  <span className={styles.boardName}>{striker.profileName}</span>
                  <span className={styles.boardDamage}>{striker.damage.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

/**
 * The painting the wake is drawn with — the one its card on the Battle hub wears, read off
 * the registry so the two cannot drift. The Valewurm alone all week is the serpent coil;
 * the creature that comes up at the weekend is drawn as the thing the whole Vale sees.
 */
const WAKE_ART = SCREENS.find((screen) => screen.id === 'worldBoss')?.art ?? 'blood-cursed-beast';
