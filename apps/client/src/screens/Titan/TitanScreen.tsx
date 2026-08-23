import { useEffect, useMemo, useState } from 'react';
import type { DungeonDef, StageDef, TitanStanding } from '@mistvale/shared';
import { nextTier } from '@mistvale/shared';
import { Button } from '@/ui/Button/Button';
import { Empty } from '@/ui/Empty/Empty';
import { Heading } from '@/ui/Heading/Heading';
import { Panel } from '@/ui/Panel/Panel';
import { Rewards } from '@/ui/Rewards/Rewards';
import { ScreenInfo } from '@/ui/ScreenInfo/ScreenInfo';
import { BossCard } from '@/ui/BossCard/BossCard';
import { dungeonArt } from '@/ui/dungeonArt';
import { useContentStore } from '@/state/contentStore';
import { useTitanStore } from '@/state/titanStore';
import { TeamSelect } from '../Battle/TeamSelect';
import styles from './TitanScreen.module.scss';

/**
 * The Valewurm.
 *
 * The only screen in Mistvale about a fight nobody wins. Everything else on it follows from
 * that: there is no clear to show, no stars, no floor to be on — the whole screen is one
 * number and the ladder it is climbing.
 *
 * Three things are on it, in the order a player wants them:
 *
 *  1. **What you managed.** Your best run, the rung it reached, and what the last key you
 *     spent did — because "did that change help" is the entire loop of the mode and the
 *     answer is a comparison, not a number on its own.
 *  2. **The ladder.** Every rung with what it pays, the ones you have reached marked, and
 *     the next one named — a target is more useful than a list.
 *  3. **What it does.** The Titan's mechanics, stated as the sentences that change what a
 *     player builds, from the same `BossCard` the Depths uses.
 *
 * The keys live in the title bar with the Fight button, which is B1's rule: a screen is the
 * feature, and anything a player can act on stays in the layout rather than becoming a
 * column about itself.
 */
export function TitanScreen(): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const titans = useTitanStore((state) => state.titans);
  const loaded = useTitanStore((state) => state.loaded);
  const load = useTitanStore((state) => state.load);
  const [fighting, setFighting] = useState<{ stage: StageDef; standing: TitanStanding } | null>(
    null,
  );

  // Re-read on mount: keys come back with the daily rollover, and a run just fought is the
  // thing the player came back to look at.
  useEffect(() => {
    void load();
  }, [load]);

  const keeps = useMemo(() => new Map((bundle?.dungeons ?? []).map((d) => [d.key, d])), [bundle]);
  const stages = useMemo(() => new Map((bundle?.stages ?? []).map((s) => [s.key, s])), [bundle]);
  const enemies = bundle?.enemies;

  if (loaded && titans.length === 0) {
    return (
      <div className={styles.screen}>
        <Heading tagline="Something is coiled under the vale.">The Valewurm</Heading>
        <Empty
          glyph="glyph-thorny-branch"
          title="Nothing is stirring"
          message="No Titan is published. An operator adds one in the Admin Suite; it appears here on the next publish."
        />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <Heading
        tagline="It cannot be beaten. It can be measured."
        actions={
          <ScreenInfo title="The Valewurm" label="How a Titan works">
            <p>
              The Valewurm is not a fight you win. It is authored to outlast anybody, and a run ends
              when your last champion falls or the turn cap runs out — whichever comes first.
            </p>
            <p>
              What a run is worth is <strong>how much damage you did to it</strong>. Every run pays
              the highest rung it reached, so a run that ends badly still pays and a run that ends
              slightly better pays slightly better. That is the whole loop: change one thing about
              the team, spend a key, see whether the number moved.
            </p>
            <p>
              Keys come back with the daily reset. They are spent when the fight opens and are not
              refunded — an attempt is the resource, which is what stops the Valewurm from being
              farmed with a big enough energy bar.
            </p>
          </ScreenInfo>
        }
      >
        The Valewurm
      </Heading>

      <div className={styles.keeps}>
        {titans.map((standing) => {
          const keep = keeps.get(standing.dungeonKey);
          const stage = stages.get(standing.stageKey);
          if (!keep || !stage) return null;
          return (
            <Keep
              key={standing.dungeonKey}
              keep={keep}
              standing={standing}
              boss={enemies?.find((enemy) => enemy.key === keep.bossEnemyKey)}
              onFight={() => setFighting({ stage, standing })}
            />
          );
        })}
      </div>

      {fighting && (
        <TeamSelect
          stage={fighting.stage}
          title={keeps.get(fighting.standing.dungeonKey)?.name ?? 'The Titan'}
          titan={fighting.standing}
          onClose={() => {
            setFighting(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Keep({
  keep,
  standing,
  boss,
  onFight,
}: {
  keep: DungeonDef;
  standing: TitanStanding;
  boss: { name: string; bossMechanics?: unknown } | undefined;
  onFight: () => void;
}): JSX.Element {
  const ladder = useMemo(
    () => [...standing.tiers].sort((a, b) => a.damage - b.damage),
    [standing.tiers],
  );
  const ahead = nextTier(standing.bestDamage, ladder as never);
  const reachedTier = ladder.filter((tier) => tier.reached).at(-1);
  const canFight = standing.open && standing.keysLeft > 0;

  return (
    <section className={styles.keep}>
      <header className={styles.head}>
        <span
          className={styles.art}
          style={{ backgroundImage: `var(--fui-img-${dungeonArt(keep.key, keep.kind)})` }}
          aria-hidden="true"
        />
        <div className={styles.title}>
          <h2 className={styles.name}>{keep.name}</h2>
          <p className={styles.tagline}>{keep.tagline}</p>
        </div>
        <div className={styles.entry}>
          <span className={styles.keys} data-spent={standing.keysLeft === 0}>
            {standing.open
              ? `${standing.keysLeft} / ${standing.keysPerDay} keys`
              : (standing.lockedReason ?? 'Closed')}
          </span>
          <Button onClick={onFight} disabled={!canFight}>
            {standing.open ? 'Go down' : 'Locked'}
          </Button>
        </div>
      </header>

      <div className={styles.panes}>
        <Panel title="What you managed" className={styles.record}>
          {standing.runs === 0 ? (
            <p className={styles.none}>
              Nobody has been down yet. The first key is the measurement everything after it is
              compared against.
            </p>
          ) : (
            <>
              <dl className={styles.figures}>
                <div className={styles.figure}>
                  <dt>Best</dt>
                  <dd className={styles.best}>{standing.bestDamage.toLocaleString()}</dd>
                </div>
                <div className={styles.figure}>
                  <dt>Last run</dt>
                  <dd
                    className={styles.last}
                    data-better={standing.lastDamage >= standing.bestDamage}
                  >
                    {standing.lastDamage.toLocaleString()}
                  </dd>
                </div>
                <div className={styles.figure}>
                  <dt>Runs</dt>
                  <dd>{standing.runs}</dd>
                </div>
              </dl>
              <p className={styles.standingLine}>
                {reachedTier
                  ? `Your best reached ${reachedTier.name}.`
                  : 'Your best has not reached the first rung yet.'}
                {ahead
                  ? ` ${(ahead.damage - standing.bestDamage).toLocaleString()} more for ${ahead.name}.`
                  : ' There is nothing above where you have been.'}
              </p>
            </>
          )}
        </Panel>

        <Panel title="The ladder" className={styles.ladder}>
          <ol className={styles.rungs}>
            {ladder.map((tier) => (
              <li key={tier.key} className={styles.rung} data-reached={tier.reached}>
                <span className={styles.rungName}>{tier.name}</span>
                <span className={styles.rungDamage}>{tier.damage.toLocaleString()} damage</span>
                <Rewards rewards={tier.rewards} className={styles.rungRewards} />
              </li>
            ))}
          </ol>
        </Panel>

        {boss && (
          <BossCard
            name={boss.name}
            where={`${standing.turnCap} turns, then it sees you off`}
            mechanics={boss.bossMechanics as never}
            className={styles.boss}
          />
        )}
      </div>
    </section>
  );
}
