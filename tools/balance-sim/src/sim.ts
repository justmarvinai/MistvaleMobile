import {
  CONTENT_REGISTRY,
  type CampaignChapterDef,
  type ChampionDef,
  type DungeonDef,
  type EnemyDef,
  type GameConfigEntry,
  type SkillDef,
  type StageDef,
  type StatusDef,
} from '@mistvale/shared';
import { buildSeedContent } from '@mistvale/server/seeds';
import {
  advance,
  buildRules,
  buildStageWaves,
  buildTeam,
  championScalingFrom,
  combatConfigFrom,
  createBattle,
  deriveStats,
  type ChampionEntry,
} from '@mistvale/engine';
import type { Stat } from '@mistvale/shared';

/**
 * Batch simulation over the committed content.
 *
 * The engine's own tests use hand-built fixtures so a rebalance cannot break them. This
 * runs the opposite check: the *shipped* champions, enemies, stages and constants, many
 * times over, to answer the question the unit tests deliberately cannot — is the content
 * actually tuned (COMBAT_SYSTEM §14)?
 *
 * Reads the seeds rather than the database, so it works in CI with no PostgreSQL and
 * always reflects what a fresh install would get.
 */

export interface LoadedContent {
  champions: Map<string, ChampionDef>;
  enemies: Map<string, EnemyDef>;
  skills: SkillDef[];
  statuses: StatusDef[];
  stages: Map<string, StageDef>;
  chapters: Map<string, CampaignChapterDef>;
  dungeons: Map<string, DungeonDef>;
  config: Record<string, GameConfigEntry['value']>;
}

/**
 * Parses the seeds through their schemas.
 *
 * Parsing rather than casting matters: it fills schema defaults, so the simulator sees
 * exactly the shape the database would hold after a seed run.
 */
export function loadContent(): LoadedContent {
  const seeds = buildSeedContent();
  const parsed = new Map<string, unknown[]>();

  for (const seed of seeds) {
    const schema = CONTENT_REGISTRY[seed.contentType].schema;
    parsed.set(
      seed.contentType,
      seed.entities.map((entity) => schema.parse(entity.data)),
    );
  }

  const list = <T>(type: string): T[] => (parsed.get(type) ?? []) as T[];
  const byKey = <T extends { key: string }>(type: string): Map<string, T> =>
    new Map(list<T>(type).map((entity) => [entity.key, entity]));

  const config: Record<string, GameConfigEntry['value']> = {};
  for (const entry of list<GameConfigEntry>('gameConfig')) config[entry.key] = entry.value;

  return {
    champions: byKey<ChampionDef>('champion'),
    enemies: byKey<EnemyDef>('enemy'),
    skills: list<SkillDef>('skill'),
    statuses: list<StatusDef>('status'),
    stages: byKey<StageDef>('stage'),
    chapters: byKey<CampaignChapterDef>('campaignChapter'),
    dungeons: byKey<DungeonDef>('dungeon'),
    config,
  };
}

export interface TeamSpec {
  championKey: string;
  level: number;
  rank: number;
  ascension: number;
  /** Flat additions from relics, exactly as the battle route assembles them. */
  bonuses?: Partial<Record<Stat, number>>;
}

/**
 * A representative full set of ★6 relics, as percentages of the champion's own stats.
 *
 * Endgame content is not fought by a bare champion, so measuring it against one measures
 * nothing. These are deliberately *modest* for a maxed account — a real endgame relic set
 * with good substats beats them — so a gate that passes here passes comfortably in a
 * player's hands (docs/ECONOMY_BALANCE.md §4).
 */
export const FULL_RELICS: Readonly<Partial<Record<Stat, number>>> = Object.freeze({
  hp: 55,
  atk: 55,
  def: 40,
  spd: 22,
});

/** Flat ACC/RES/crit additions from the same set — these are points, not percentages. */
const RELIC_POINTS: Readonly<Partial<Record<Stat, number>>> = Object.freeze({
  critRate: 35,
  critDmg: 55,
  acc: 70,
  res: 55,
});

/**
 * Puts a representative relic set on every member of a team.
 *
 * Computed from the champion's own derived stats rather than as flat constants, so the
 * same helper is honest for a level-20 Rare and a level-60 Legendary.
 */
export function withRelics(content: LoadedContent, team: readonly TeamSpec[]): TeamSpec[] {
  const scaling = championScalingFrom(content.config);
  return team.map((member) => {
    const def = content.champions.get(member.championKey);
    if (!def) throw new Error(`No champion "${member.championKey}" in the seeds.`);
    const base = deriveStats(def.baseStats, member, scaling);

    const bonuses: Partial<Record<Stat, number>> = { ...RELIC_POINTS };
    for (const [stat, pct] of Object.entries(FULL_RELICS) as [Stat, number][]) {
      bonuses[stat] = Math.round((base[stat] * pct) / 100);
    }
    return { ...member, bonuses };
  });
}

export interface StageResult {
  stageKey: string;
  runs: number;
  wins: number;
  winRate: number;
  /** Mean turns across winning runs; losses would skew it to the cap. */
  averageTurns: number;
  medianTurns: number;
  /**
   * Share of *all* runs that were won inside `limit` turns.
   *
   * A farm gate cares about the whole distribution rather than the average: "usually
   * fourteen turns" is no comfort if one run in twenty grinds to forty. Losses count
   * against it, because a run that did not finish did not finish quickly either.
   */
  winsWithin: (limit: number) => number;
  /** Wall-clock milliseconds per simulated stage. */
  msPerRun: number;
}

/** Runs one stage many times and reports how the team fared. */
export function simulateStage(
  content: LoadedContent,
  stageKey: string,
  team: readonly TeamSpec[],
  runs: number,
  seedBase = 1,
): StageResult {
  const stage = content.stages.get(stageKey);
  if (!stage) throw new Error(`No stage "${stageKey}" in the seeds.`);

  const combat = combatConfigFrom(content.config);
  const scaling = championScalingFrom(content.config);
  // A floor is fought in its own mode, not in `campaign`: leader auras scoped to the
  // Depths only apply there, and simulating the wrong mode would measure a team the
  // player never fields.
  const mode = stage.mode === 'tutorial' ? 'campaign' : stage.mode;
  const rules = buildRules(mode, content.skills, content.statuses);

  const entries: ChampionEntry[] = team.map((member) => {
    const def = content.champions.get(member.championKey);
    if (!def) throw new Error(`No champion "${member.championKey}" in the seeds.`);
    return {
      def,
      level: member.level,
      rank: member.rank,
      ascension: member.ascension,
      ...(member.bonuses ? { bonuses: member.bonuses } : {}),
    };
  });

  let wins = 0;
  const winningTurns: number[] = [];
  const started = performance.now();

  for (let run = 0; run < runs; run += 1) {
    const allies = buildTeam(entries, scaling, mode);
    const waves = buildStageWaves(stage, content.enemies);
    const { state } = createBattle({ seed: seedBase + run, mode, allies, waves }, rules, combat);
    advance(state, rules, combat, { auto: true });

    if (state.outcome === 'victory') {
      wins += 1;
      winningTurns.push(state.turn);
    }
  }

  const elapsed = performance.now() - started;
  const sorted = [...winningTurns].sort((a, b) => a - b);

  return {
    stageKey,
    runs,
    wins,
    winRate: wins / runs,
    averageTurns: winningTurns.length
      ? winningTurns.reduce((sum, turns) => sum + turns, 0) / winningTurns.length
      : Number.NaN,
    medianTurns: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : Number.NaN,
    winsWithin: (limit) => winningTurns.filter((turns) => turns <= limit).length / runs,
    msPerRun: elapsed / runs,
  };
}

/** The starter champions a new account chooses between (CONTENT_PLAN §7). */
export function starterKeys(content: LoadedContent): string[] {
  return [...content.champions.values()]
    .filter((champion) => champion.starter)
    .map((champion) => champion.key)
    .sort();
}

/**
 * Every campaign stage of one chapter at one difficulty, in play order.
 *
 * Resolves the chapter by its `number` and reads the key from the definition rather than
 * reconstructing it, so renaming a chapter key never silently empties this list.
 */
export function campaignStages(
  content: LoadedContent,
  chapter: number,
  difficulty: StageDef['difficulty'],
): StageDef[] {
  const parent = [...content.chapters.values()].find((entry) => entry.number === chapter);
  if (!parent) return [];

  return [...content.stages.values()]
    .filter(
      (stage) =>
        stage.mode === 'campaign' &&
        stage.difficulty === difficulty &&
        stage.parentKey === parent.key,
    )
    .sort((a, b) => a.number - b.number);
}

/** Every floor of one dungeon, in play order. */
export function dungeonFloors(content: LoadedContent, dungeonKey: string): StageDef[] {
  return [...content.stages.values()]
    .filter((stage) => stage.mode !== 'campaign' && stage.parentKey === dungeonKey)
    .sort((a, b) => a.number - b.number);
}
