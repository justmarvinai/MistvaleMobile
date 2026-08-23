import {
  CONTENT_REGISTRY,
  type CampaignChapterDef,
  type ChampionDef,
  type DungeonDef,
  type EnemyDef,
  type GameConfigEntry,
  type GearSetDef,
  type GearSlotDef,
  type GearStatDef,
  type SkillDef,
  type StageDef,
  type StatusDef,
} from '@mistvale/shared';
import { buildSeedContent } from '@mistvale/server/seeds';
import { borrowedTeam } from '@mistvale/server/battle-preset';
import { gearEconomyFrom, gearTablesFrom } from '@mistvale/server/gear-math';
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
  /** The relic tables, for the one fight whose gear comes from content rather than a roll. */
  gearStats: GearStatDef[];
  gearSlots: GearSlotDef[];
  gearSets: GearSetDef[];
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
    gearStats: list<GearStatDef>('gearStat'),
    gearSlots: list<GearSlotDef>('gearSlot'),
    gearSets: list<GearSetDef>('gearSet'),
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

/** What a scripted fight looked like, beyond whether it was won. */
export interface ColdOpenResult extends StageResult {
  /**
   * Across winning runs, the median of the lowest health any ally *reached*.
   *
   * Sampled during the fight rather than read off the final frame, and that distinction is
   * the whole measurement: a team with a healer ends every fight topped up, so the closing
   * state says "untouched" about a battle somebody nearly lost. The drama beat is a moment,
   * not an ending, so the moment is what gets measured.
   */
  medianWorstHp: number;
}

/**
 * Fights a `tutorial` stage with the team it carries.
 *
 * Uses the server's own `borrowedTeam`, not a re-implementation: a gate that protects a
 * differently-assembled team protects a fight nobody plays. The relics come out identical
 * because they are rolled from the stage key rather than from the run.
 */
export function simulateColdOpen(
  content: LoadedContent,
  stageKey: string,
  runs: number,
  seedBase = 1,
): ColdOpenResult {
  const stage = content.stages.get(stageKey);
  if (!stage) throw new Error(`No stage "${stageKey}" in the seeds.`);
  if (stage.presetTeam.length === 0) {
    throw new Error(`Stage "${stageKey}" carries no team to fight with.`);
  }

  const combat = combatConfigFrom(content.config);
  const scaling = championScalingFrom(content.config);
  const rules = buildRules(stage.mode, content.skills, content.statuses);
  const gear = {
    tables: gearTablesFrom({
      gearStats: content.gearStats,
      gearSlots: content.gearSlots,
      gearSets: content.gearSets,
    }),
    economy: gearEconomyFrom(content.config),
  };
  const entries = borrowedTeam(stage, content.champions, scaling, gear);

  let wins = 0;
  const winningTurns: number[] = [];
  const worstHp: number[] = [];
  const started = performance.now();

  for (let run = 0; run < runs; run += 1) {
    const allies = buildTeam(entries, scaling, stage.mode);
    const waves = buildStageWaves(stage, content.enemies);
    const { state } = createBattle(
      { seed: seedBase + run, mode: stage.mode, allies, waves },
      rules,
      combat,
    );

    // Stepped rather than auto-resolved, so the low-water mark is observed rather than
    // inferred. `advance` without `auto` runs until an ally is due to act and then stops;
    // calling it again with no action lets the AI take that turn. Sampling between calls
    // catches the turn the fight looked lost.
    let lowest = 1;
    const sample = () => {
      for (const ally of state.allies) {
        lowest = Math.min(lowest, ally.alive ? ally.hp / ally.maxHp : 0);
      }
    };
    // Bounded by the engine's own turn cap plus slack: a fight that will not finish is a
    // turn-limit loss, and the loop must not outlive it.
    for (let step = 0; step < 2000 && !state.finished; step += 1) {
      advance(state, rules, combat, { auto: false });
      sample();
    }

    if (state.outcome !== 'victory') continue;
    wins += 1;
    winningTurns.push(state.turn);
    worstHp.push(lowest);
  }

  const elapsed = performance.now() - started;
  const sortedTurns = [...winningTurns].sort((a, b) => a - b);
  const sortedHp = [...worstHp].sort((a, b) => a - b);

  return {
    stageKey,
    runs,
    wins,
    winRate: wins / runs,
    averageTurns: winningTurns.length
      ? winningTurns.reduce((sum, turns) => sum + turns, 0) / winningTurns.length
      : Number.NaN,
    medianTurns: sortedTurns.length ? sortedTurns[Math.floor(sortedTurns.length / 2)]! : Number.NaN,
    medianWorstHp: sortedHp.length ? sortedHp[Math.floor(sortedHp.length / 2)]! : Number.NaN,
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

// ── The Titan ───────────────────────────────────────────────────────────────

/** What a Titan run managed, which is the only number the mode is about. */
export interface TitanResult {
  stageKey: string;
  runs: number;
  /** Damage dealt to the Titan, per run, sorted ascending. */
  damage: number[];
  medianDamage: number;
  bestDamage: number;
  worstDamage: number;
  /** How many runs ended by the turn cap rather than by the team falling. */
  cappedRate: number;
  /** How many runs actually killed it — should be none at EA. */
  killRate: number;
  medianTurns: number;
  msPerRun: number;
}

/**
 * Fights a Titan and measures how far a team gets.
 *
 * The Titan is the one mode a win rate says nothing about — it is authored so that nobody
 * wins — so what is simulated here is the *distribution of damage*, which is what the
 * ladder is priced against. A ladder whose top rung nobody reaches is a rung that does not
 * exist, and one whose top rung everybody reaches is a mode with no ceiling; both are
 * failures this can see and a win rate cannot.
 *
 * The turn cap comes from the keep, exactly as the battle route applies it, because a run
 * measured against the global 300-turn guard is a run nobody will ever fight.
 */
export function simulateTitan(
  content: LoadedContent,
  stageKey: string,
  team: readonly TeamSpec[],
  turnCap: number,
  runs: number,
  seedBase = 1,
): TitanResult {
  const stage = content.stages.get(stageKey);
  if (!stage) throw new Error(`No stage "${stageKey}" in the seeds.`);

  const combat = { ...combatConfigFrom(content.config), maxTurns: turnCap };
  const scaling = championScalingFrom(content.config);
  const rules = buildRules('titan', content.skills, content.statuses);

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

  const damage: number[] = [];
  const turns: number[] = [];
  let capped = 0;
  let killed = 0;
  const started = performance.now();

  for (let run = 0; run < runs; run += 1) {
    const allies = buildTeam(entries, scaling, 'titan');
    const waves = buildStageWaves(stage, content.enemies);
    const opened = createBattle(
      { seed: seedBase + run, mode: 'titan', allies, waves },
      rules,
      combat,
    );
    const result = advance(opened.state, rules, combat, { auto: true });
    const events = [...opened.events, ...result.events];

    // The same fold the server settles with: absorbed damage counts, and a blow the
    // Titan landed on itself does not.
    let dealt = 0;
    for (const event of events) {
      if (event.type !== 'damage') continue;
      if (event.target.side !== 'enemy' || event.source.side === 'enemy') continue;
      dealt += event.amount + event.absorbed;
    }
    damage.push(dealt);
    turns.push(result.state.turn);
    if (result.state.outcome === 'turnLimit') capped += 1;
    if (result.state.outcome === 'victory') killed += 1;
  }

  const elapsed = performance.now() - started;
  const sorted = [...damage].sort((a, b) => a - b);
  const sortedTurns = [...turns].sort((a, b) => a - b);

  return {
    stageKey,
    runs,
    damage: sorted,
    medianDamage: sorted[Math.floor(sorted.length / 2)] ?? 0,
    bestDamage: sorted[sorted.length - 1] ?? 0,
    worstDamage: sorted[0] ?? 0,
    cappedRate: capped / runs,
    killRate: killed / runs,
    medianTurns: sortedTurns[Math.floor(sortedTurns.length / 2)] ?? 0,
    msPerRun: elapsed / runs,
  };
}
