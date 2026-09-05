import { useMemo } from 'react';
import type { CampaignChapterDef, Difficulty, StageDef } from '@mistvale/shared';
import { Heading } from '@/ui/Heading/Heading';
import { Icon } from '@/ui/Icon/Icon';
import { Portrait } from '@/ui/Portrait/Portrait';
import { championArt } from '@/ui/championArt';
import { Panel } from '@/ui/Panel/Panel';
import { ScreenInfo } from '@/ui/ScreenInfo/ScreenInfo';
import { useContentStore } from '@/state/contentStore';
import { usePlayerStore } from '@/state/playerStore';
import { useProgressStore } from '@/state/progressStore';
import { stageBoss } from '@/ui/BossCard/bossRules';
import { highlightable } from '@/app/highlight';
import { useTip } from '@/ui/Tooltip/useTooltip';
import { regionGlyph } from '@/ui/regionArt';
import {
  STARS_PER_CHAPTER_DIFFICULTY,
  chestTiers,
  dropLine,
  stageRows,
  type StageRow,
} from './chapterView';
import styles from './ChapterStages.module.scss';

/**
 * One chapter, opened.
 *
 * The campaign's second step since the rework (the owner's call, 2026-08-21): the map is
 * the whole first screen, a chapter is a page of its own, and the team chooser is what a
 * stage opens. It replaces a seven-disc strip that lived under the map and could say
 * nothing about any stage on it — a disc has room for a number and a padlock, and every
 * question a player actually has before spending energy ("what drops here", "how many
 * waves", "what beat me last time") had nowhere to go.
 *
 * Each stage is a row and the row is the button, which is both what the reference game
 * does and the only shape that fits stars, drops, a best time and a cost at once.
 */

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  normal: 'Normal',
  hard: 'Hard',
  brutal: 'Brutal',
};

export function ChapterStages({
  chapter,
  difficulty,
  stages,
  onBack,
  onPick,
  actions,
}: {
  chapter: CampaignChapterDef;
  difficulty: Difficulty;
  stages: readonly StageDef[];
  onBack: () => void;
  onPick: (stage: StageDef) => void;
  /** The difficulty control, owned by the screen so both views share one. */
  actions: React.ReactNode;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const standings = useProgressStore((state) => state.stages);
  const parentStars = useProgressStore((state) => state.parentStars);
  const claimedChests = useProgressStore((state) => state.claimedChests);
  const energy = usePlayerStore((state) => state.player?.energy.value ?? 0);

  const rows = useMemo(() => stageRows(chapter, stages, standings), [chapter, stages, standings]);

  const earned = rows.reduce((total, row) => total + row.stars, 0);
  const warlord = stages.length > 0 ? stageBoss(stages[stages.length - 1]!, bundle?.enemies) : null;
  const tiers = chestTiers(chapter, claimedChests);
  const allStars = parentStars[chapter.key] ?? 0;

  return (
    <div className={styles.page}>
      <Heading
        tagline={
          <>
            {chapter.region} · {earned}/{STARS_PER_CHAPTER_DIFFICULTY}★ on{' '}
            {DIFFICULTY_LABEL[difficulty]} · {energy} energy
          </>
        }
        actions={
          <>
            <button type="button" className={styles.back} onClick={onBack}>
              ‹ The Vale
            </button>
            {actions}
            <ScreenInfo title={chapter.name}>
              <Panel title="This chapter">
                <p className={styles.note}>{chapter.lore}</p>
                {warlord && (
                  <p className={styles.note}>
                    <span className={styles.warlord}>{warlord.name}</span> holds the last stage.
                    What it does is written on the team screen, before the energy is spent.
                  </p>
                )}
                <p className={styles.note}>
                  Every stage in a chapter drops the same relic set, and each stage number drops its
                  own slots — so a chapter is a farm for something specific rather than a lottery.
                </p>
              </Panel>
              <Panel title="Chapter chests" variant="inset">
                <p className={styles.note}>
                  Stars count across all three difficulties. You have {allStars} here.
                </p>
                <ul className={styles.chests}>
                  {tiers.map((tier) => (
                    <li key={tier.stars} className={styles.chest} data-paid={tier.claimed}>
                      <span className={styles.chestStars}>{tier.stars}★</span>
                      <span className={styles.chestState}>
                        {tier.claimed ? 'Claimed' : allStars >= tier.stars ? 'Ready' : 'Locked'}
                      </span>
                    </li>
                  ))}
                  {tiers.length === 0 && (
                    <li className={styles.chest}>No chests on this chapter.</li>
                  )}
                </ul>
              </Panel>
            </ScreenInfo>
          </>
        }
      >
        {`${chapter.number}. ${chapter.name}`}
      </Heading>

      <div className={styles.body}>
        <div className={styles.column}>
          <ol className={styles.list} aria-label={`Stages in ${chapter.name}`}>
            {rows.map((row) => (
              <StageEntry
                key={row.stage.key}
                row={row}
                chapter={chapter}
                energy={energy}
                onPick={() => onPick(row.stage)}
              />
            ))}
          </ol>

          {rows.length === 0 && (
            <p className={styles.empty}>Nothing here on {DIFFICULTY_LABEL[difficulty]} yet.</p>
          )}
        </div>

        {/* The chapter's own brief, beside the stages rather than behind an info button.
            It is the half of the page the list does not need, and every line of it is a
            reason to keep pressing rows: what the place is, who is at the end of it, and
            what the next chest costs. */}
        <aside className={styles.brief} aria-label="About this chapter">
          <Panel title={chapter.region || 'The chapter'}>
            {chapter.lore && <p className={styles.note}>{chapter.lore}</p>}
            {warlord && (
              <p className={styles.note}>
                <span className={styles.warlord}>{warlord.name}</span> holds the last stage. What it
                does about being fought is on the team screen, before the energy is spent.
              </p>
            )}
          </Panel>

          <Panel title="Chapter chests" variant="inset">
            <p className={styles.note}>{allStars}★ earned here, counting every difficulty.</p>
            <ul className={styles.chests}>
              {tiers.map((tier) => (
                <li key={tier.stars} className={styles.chest} data-paid={tier.claimed}>
                  <span className={styles.chestStars}>{tier.stars}★</span>
                  <span className={styles.chestState}>
                    {tier.claimed ? 'Claimed' : allStars >= tier.stars ? 'Ready' : 'Locked'}
                  </span>
                </li>
              ))}
              {tiers.length === 0 && <li className={styles.chest}>No chests on this chapter.</li>}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/**
 * One stage.
 *
 * Its own component because it carries a tooltip, and a tooltip is a hook. The row *is*
 * the button: a "Battle" control beside a clickable row is two ways to do one thing, and
 * on a phone the row is the target a thumb actually finds.
 */
function StageEntry({
  row,
  chapter,
  energy,
  onPick,
}: {
  row: StageRow;
  chapter: CampaignChapterDef;
  energy: number;
  onPick: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const drops = dropLine(row.stage, chapter, bundle?.gearSets ?? [], bundle?.gearSlots ?? []);
  const affordable = energy >= row.stage.energyCost;

  const ref = useTip({
    title: row.label,
    subtitle: row.boss ? 'The warlord’s stage' : `${row.stage.waves.length} waves`,
    stats: [
      { label: 'Energy', value: `${row.stage.energyCost}`, tone: affordable ? 'plain' : 'bad' },
      { label: 'Silver', value: `${row.stage.rewards.silverMin}–${row.stage.rewards.silverMax}` },
      { label: 'Stars', value: `${row.stars}/3`, tone: row.stars === 3 ? 'good' : 'plain' },
      ...(row.clears > 0
        ? [{ label: 'Cleared', value: `${row.clears}×`, tone: 'plain' as const }]
        : []),
      ...(row.bestTurns !== null
        ? [{ label: 'Best', value: `${row.bestTurns} turns`, tone: 'plain' as const }]
        : []),
      // The other half of "what is this stage for": the warlord drops a relic on nearly
      // every run and the six stages before it on about two in five.
      ...(drops.gearChancePct > 0
        ? [{ label: 'Relic drop', value: `${drops.gearChancePct}%`, tone: 'magic' as const }]
        : []),
    ],
    ...(drops.setName ? { flavor: `Drops ${drops.setName} relics.` } : {}),
    ...(row.open
      ? { hint: 'Click to choose a team' }
      : { requires: [row.lockedReason ?? 'Not open yet'] }),
  });

  return (
    <li className={styles.item}>
      <button
        ref={ref}
        type="button"
        className={styles.row}
        data-boss={row.boss}
        data-next={row.next}
        data-locked={!row.open}
        disabled={!row.open}
        onClick={onPick}
        {...highlightable(`stage:${row.stage.key}`)}
      >
        <span className={styles.disc} aria-hidden="true">
          {row.boss ? (
            <span
              className={styles.bossGlyph}
              style={
                {
                  '--mv-glyph': `var(--fui-img-${regionGlyph(chapter.region)})`,
                } as React.CSSProperties
              }
            />
          ) : (
            row.stage.number
          )}
        </span>

        {/* Who is waiting on the stage (C44): the first wave's line-up as faces, the way
            the team chooser shows every wave. A row that says "3 waves" and nothing else
            asks a player to open the chooser to learn what a stage is, which is the one
            thing a row exists to save them. */}
        <span className={styles.foes} aria-hidden="true">
          {(row.stage.waves[0] ?? []).slice(0, 4).map((unit, index) => {
            const foe = bundle?.enemies.find((entry) => entry.key === unit.enemyKey);
            return (
              <Portrait
                key={`${unit.enemyKey}:${index}`}
                src={championArt(foe, bundle?.assets).portrait ?? null}
                name={foe?.name}
                size={44}
                className={styles.foe}
              />
            );
          })}
        </span>

        <span className={styles.main}>
          <span className={styles.line}>
            <span className={styles.label}>{row.label}</span>
            <Stars earned={row.stars} />
            {row.boss && <span className={styles.tag}>Warlord</span>}
            {row.next && row.open && <span className={styles.here}>You are here</span>}
          </span>

          <span className={styles.detail}>
            {row.open ? (
              <>
                {drops.setName && <span className={styles.set}>{drops.setName}</span>}
                {drops.slotNames.length > 0 && (
                  <span className={styles.slots}>{drops.slotNames.join(' · ')}</span>
                )}
                <span className={styles.waves}>{row.stage.waves.length} waves</span>
                {row.bestTurns !== null && (
                  <span className={styles.best}>best {row.bestTurns} turns</span>
                )}
              </>
            ) : (
              <span className={styles.shut}>{row.lockedReason ?? 'Not open yet'}</span>
            )}
          </span>
        </span>

        <span className={styles.end}>
          <span className={styles.cost} data-short={!affordable}>
            <Icon name="energy" size={14} />
            {row.stage.energyCost}
          </span>
          <span className={styles.go}>{row.open ? 'Battle' : 'Shut'}</span>
        </span>
      </button>
    </li>
  );
}

/** Three stars, lit as far as the clear went. */
function Stars({ earned }: { earned: number }): JSX.Element {
  return (
    <span className={styles.stars} aria-label={`${earned} of 3 stars`}>
      {[1, 2, 3].map((star) => (
        <span key={star} className={styles.star} data-lit={star <= earned} aria-hidden="true" />
      ))}
    </span>
  );
}
