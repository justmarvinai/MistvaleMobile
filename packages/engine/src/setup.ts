import type {
  Aura,
  ChampionDef,
  EnemyDef,
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
  /** Flat stat additions from gear, sets, Hall of Valor and masteries. */
  bonuses?: Partial<Record<Stat, number>>;
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
    return makeUnit({
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
export function buildWave(entries: readonly EnemyEntry[]): BattleUnit[] {
  return entries.map((entry) => {
    const anchor = entry.def.baseStats;
    const factor = Math.pow(entry.def.growth, entry.level - entry.def.anchorLevel);
    const stats = emptyStats();
    stats.hp = Math.max(1, Math.round(anchor.hp * factor));
    stats.atk = Math.max(1, Math.round(anchor.atk * factor));
    stats.def = Math.max(1, Math.round(anchor.def * factor));
    stats.spd = anchor.spd;
    stats.critRate = anchor.critRate ?? 15;
    stats.critDmg = anchor.critDmg ?? 50;
    stats.res = anchor.res ?? 30;
    stats.acc = anchor.acc ?? 0;

    return makeUnit({
      side: 'enemy',
      slot: entry.slot,
      defKey: entry.def.key,
      name: entry.def.name,
      element: entry.def.element,
      level: entry.level,
      stats,
      skills: entry.def.skills,
      isBoss: entry.def.isBoss,
      boss: {
        almightyImmunity: entry.def.bossMechanics.almightyImmunity,
        tmReductionImmune: entry.def.bossMechanics.tmReductionImmune,
      },
    });
  });
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
    return buildWave(entries);
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
