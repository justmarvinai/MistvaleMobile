import type {
  Aura,
  ChampionDef,
  EnemyDef,
  MasteryEffect,
  SkillDef,
  Stat,
  StageDef,
  StatusDef,
} from '@mistvale/shared';
import type { ChampionScalingConfig } from './config';
import { deriveStats } from './stats';
import type { BattleRules, BattleUnit, Side } from './types';

/**
 * Turning published content into combatants.
 *
 * The engine never reads the database or the content cache; the server hands it plain
 * definitions and this module shapes them into units. Keeping the translation here means
 * the balance simulator, the Admin battle inspector and the live battle route all build
 * their teams the same way, so what an operator previews is what a player fights.
 */

/** A champion as the player owns it, before the battle starts. */
export interface ChampionEntry {
  def: ChampionDef;
  level: number;
  rank: number;
  ascension: number;
  /** Flat stat additions from gear, sets, Hall of Valor and unconditional masteries. */
  bonuses?: Partial<Record<Stat, number>>;
  /**
   * Mastery effects the engine has to evaluate during the fight.
   *
   * Only the conditional ones and the procs: anything settled in advance is already in
   * `bonuses`, which is what keeps the champion screen's numbers and the engine's the same.
   */
  masteries?: readonly MasteryEffect[];
}

/** One enemy as a stage's wave describes it. */
export interface EnemyEntry {
  def: EnemyDef;
  level: number;
  stars: number;
  slot: number;
}

function emptyStats(): Record<Stat, number> {
  return { hp: 0, atk: 0, def: 0, spd: 0, critRate: 0, critDmg: 0, res: 0, acc: 0 };
}

function makeUnit(params: {
  side: Side;
  slot: number;
  defKey: string;
  name: string;
  element: BattleUnit['element'];
  level: number;
  stats: Record<Stat, number>;
  skills: readonly string[];
  isBoss: boolean;
  boss: BattleUnit['boss'];
}): BattleUnit {
  return {
    ref: { side: params.side, slot: params.slot },
    defKey: params.defKey,
    name: params.name,
    element: params.element,
    level: params.level,
    stats: Object.freeze({ ...params.stats }),
    maxHp: params.stats.hp,
    hp: params.stats.hp,
    tm: 0,
    skills: params.skills,
    cooldowns: {},
    buffs: [],
    debuffs: [],
    alive: true,
    isBoss: params.isBoss,
    boss: params.boss,
    ccStreak: 0,
    ...(params.isBoss
      ? {
          bossState: {
            shieldHits: params.boss.hitShield?.hits ?? 0,
            shieldRecovering: false,
            bandsPassed: 0,
            enraged: false,
          },
        }
      : {}),
  };
}

/** Enemy stats at a level, scaled from the archetype's authored anchor. */
function scaleEnemyStats(def: EnemyDef, level: number): Record<Stat, number> {
  const anchor = def.baseStats;
  const factor = Math.pow(def.growth, level - def.anchorLevel);
  const stats = emptyStats();
  stats.hp = Math.max(1, Math.round(anchor.hp * factor));
  stats.atk = Math.max(1, Math.round(anchor.atk * factor));
  stats.def = Math.max(1, Math.round(anchor.def * factor));
  stats.spd = anchor.spd;
  stats.critRate = anchor.critRate ?? 15;
  stats.critDmg = anchor.critDmg ?? 50;
  stats.res = anchor.res ?? 30;
  stats.acc = anchor.acc ?? 0;
  return stats;
}

/**
 * Turns a `boss_mechanics` row into the flags the simulation runs on.
 *
 * The one piece of real work is the summon: the engine reads no content mid-battle, so the
 * add is resolved and built *here*, once, and rides inside the boss's flags. A boss whose
 * add no longer exists simply loses the mechanic rather than crashing the fight — publish
 * validation is what stops that reaching players.
 */
function bossFlagsFor(
  def: EnemyDef,
  level: number,
  enemies?: ReadonlyMap<string, EnemyDef>,
): BattleUnit['boss'] {
  const mechanics = def.bossMechanics;
  const summonDef = mechanics.addSummon ? enemies?.get(mechanics.addSummon.unitKey) : undefined;

  return {
    almightyImmunity: mechanics.almightyImmunity,
    tmReductionImmune: mechanics.tmReductionImmune,
    ...(mechanics.hitShield ? { hitShield: { ...mechanics.hitShield } } : {}),
    ...(mechanics.thresholdRetaliation
      ? { thresholdRetaliation: { ...mechanics.thresholdRetaliation } }
      : {}),
    ...(mechanics.addSummon && summonDef
      ? {
          addSummon: {
            perTurn: mechanics.addSummon.perTurn,
            cap: mechanics.addSummon.cap,
            template: makeUnit({
              side: 'enemy',
              // Overwritten the moment it is summoned; a template stands nowhere.
              slot: -1,
              defKey: summonDef.key,
              name: summonDef.name,
              element: summonDef.element,
              level,
              stats: scaleEnemyStats(summonDef, level),
              skills: summonDef.skills,
              isBoss: false,
              boss: { almightyImmunity: false, tmReductionImmune: false },
            }),
          },
        }
      : {}),
    ...(mechanics.enrage ? { enrage: { ...mechanics.enrage } } : {}),
  };
}

/**
 * Builds the player's side.
 *
 * The leader's aura applies to the whole team (COMBAT_SYSTEM §10) and is the last thing
 * added, matching the documented stat pipeline: it modifies the assembled total rather
 * than the champion's bare base.
 */
export function buildTeam(
  entries: readonly ChampionEntry[],
  scaling: ChampionScalingConfig,
  mode: BattleRules['mode'],
): BattleUnit[] {
  const units = entries.map((entry, slot) => {
    const stats = deriveStats(entry.def.baseStats, entry, scaling);
    for (const [stat, bonus] of Object.entries(entry.bonuses ?? {}) as [Stat, number][]) {
      stats[stat] = Math.max(0, stats[stat] + bonus);
    }
    const unit = makeUnit({
      side: 'ally',
      slot,
      defKey: entry.def.key,
      name: entry.def.name,
      element: entry.def.element,
      level: entry.level,
      stats,
      skills: entry.def.skills,
      isBoss: false,
      boss: { almightyImmunity: false, tmReductionImmune: false },
    });
    if (entry.masteries && entry.masteries.length > 0) {
      unit.masteries = entry.masteries;
      unit.masteryState = {
        killStacks: 0,
        a1Uses: 0,
        struckFirst: [],
        debuffsThisTurn: 0,
        livingFoes: 0,
      };
    }
    return unit;
  });

  const leader = entries[0];
  if (leader?.def.aura) applyAura(units, entries, leader.def.aura, mode);
  return units;
}

/** Applies the leader's aura in place. Scope decides who it reaches. */
function applyAura(
  units: BattleUnit[],
  entries: readonly ChampionEntry[],
  aura: Aura,
  mode: BattleRules['mode'],
): void {
  const areaMatches =
    aura.area === 'any' ||
    (aura.area === 'campaign' &&
      (mode === 'campaign' || mode === 'tutorial' || mode === 'practice')) ||
    (aura.area === 'arena' && mode === 'arena') ||
    (aura.area === 'depths' && (mode === 'dungeon' || mode === 'springs' || mode === 'proving'));
  if (!areaMatches) return;

  const leader = entries[0]!.def;
  units.forEach((unit, index) => {
    const def = entries[index]!.def;
    if (aura.scope === 'element' && def.element !== leader.element) return;
    if (aura.scope === 'faction' && def.factionKey !== leader.factionKey) return;

    const stats = { ...unit.stats } as Record<Stat, number>;
    // ACC and RES are flat points; everything else is a percentage of the assembled stat.
    const flat = aura.stat === 'acc' || aura.stat === 'res';
    stats[aura.stat] = flat
      ? stats[aura.stat] + aura.value
      : Math.round(stats[aura.stat] * (1 + aura.value / 100));

    unit.stats = Object.freeze(stats);
    if (aura.stat === 'hp') {
      unit.maxHp = stats.hp;
      unit.hp = stats.hp;
    }
  });
}

/**
 * Builds one enemy wave.
 *
 * Enemy stats grow geometrically around their authored anchor — one `growth` number per
 * archetype is what lets the same lizard serve chapter 1 and chapter 12. The exponent is
 * measured *from `anchorLevel`*, so a wave below it scales down and one above scales up.
 * Measuring from level 1 instead would make the opening stage fight the anchor at full
 * strength, which is exactly the kind of thing the balance simulator exists to catch.
 */
export function buildWave(
  entries: readonly EnemyEntry[],
  enemies?: ReadonlyMap<string, EnemyDef>,
): BattleUnit[] {
  return entries.map((entry) =>
    makeUnit({
      side: 'enemy',
      slot: entry.slot,
      defKey: entry.def.key,
      name: entry.def.name,
      element: entry.def.element,
      level: entry.level,
      stats: scaleEnemyStats(entry.def, entry.level),
      skills: entry.def.skills,
      isBoss: entry.def.isBoss,
      boss: bossFlagsFor(entry.def, entry.level, enemies),
    }),
  );
}

/** Builds every wave of a stage, in order. */
export function buildStageWaves(
  stage: StageDef,
  enemies: ReadonlyMap<string, EnemyDef>,
): BattleUnit[][] {
  return stage.waves.map((wave) => {
    const entries: EnemyEntry[] = [];
    for (const unit of wave) {
      const def = enemies.get(unit.enemyKey);
      // Publish validation guarantees the reference resolves; skipping rather than
      // throwing keeps a corrupted snapshot from taking the whole battle route down.
      if (!def) continue;
      entries.push({ def, level: unit.level, stars: unit.stars, slot: unit.slot });
    }
    return buildWave(entries, enemies);
  });
}

/** Assembles the rule set the simulation reads content through. */
export function buildRules(
  mode: BattleRules['mode'],
  skills: readonly SkillDef[],
  statuses: readonly StatusDef[],
): BattleRules {
  return {
    mode,
    skills: new Map(skills.map((skill) => [skill.key, skill])),
    statuses: new Map(statuses.map((status) => [status.key, status])),
  };
}
