import {
  createRng,
  deriveStats,
  type ChampionEntry,
  type ChampionScalingConfig,
} from '@mistvale/engine';
import type { ChampionDef, StageDef } from '@mistvale/shared';
import {
  assembleGearBonus,
  rollGear,
  type GearEconomyConfig,
  type GearTables,
} from '../gear/stats';

/**
 * The team a `tutorial` stage brings with it.
 *
 * Pure: content in, combatants out, no database anywhere. That is the whole reason it
 * lives in its own file rather than inside the battle service — the cold open is a *balance
 * decision* as much as a feature, and `pnpm sim` has to be able to fight it headlessly with
 * exactly the team the server would build. A second implementation for the gate would be a
 * gate that protects a fight nobody plays.
 *
 * It is everything `assembleEntries` does minus the parts that need a player: no relics
 * read off a `player_champions` row, no masteries, no Hall of Valor — the account these
 * champions are lent to has none of those, and will not for weeks. What the stage names is
 * who, how grown and what they are wearing; the derivation from there is the same one the
 * roster gets, so a borrowed champion's numbers are numbers the game could really produce.
 */

/** Errors as data, so the caller decides whether a missing champion is a 500 or a throw. */
export class PresetTeamError extends Error {}

export function borrowedTeam(
  stage: StageDef,
  champions: ReadonlyMap<string, ChampionDef>,
  scaling: ChampionScalingConfig,
  gear: { tables: GearTables; economy: GearEconomyConfig },
): ChampionEntry[] {
  // Seeded from the *stage key* rather than from the battle. The cold open is a scripted
  // beat — a fight tuned once to be frightening and then won — and a beat that rolls a
  // different weapon for every new account is a beat that lands differently every time.
  const rng = createRng(stageSeed(stage.key));

  return stage.presetTeam.map((member) => {
    const def = champions.get(member.championKey);
    if (!def) {
      throw new PresetTeamError(`Champion "${member.championKey}" is no longer published.`);
    }

    const base = deriveStats(def.baseStats, member, scaling);
    const pieces = member.relics.map((relic) => ({
      ...relic,
      level: 0,
      ...rollGear(rng, gear.tables, gear.economy, relic),
    }));
    const { bonus } = assembleGearBonus(base, pieces, gear.tables, 0);

    return {
      def,
      level: member.level,
      rank: member.rank,
      ascension: member.ascension,
      bonuses: bonus,
      masteries: [],
    };
  });
}

/** A stable 31-bit seed for a stage key, so its borrowed relics are the same every time. */
export function stageSeed(stageKey: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < stageKey.length; index += 1) {
    hash ^= stageKey.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  // The engine's RNG wants a positive 31-bit seed; zero would be a degenerate stream.
  return (hash >>> 1 || 1) % 0x7fff_ffff;
}
