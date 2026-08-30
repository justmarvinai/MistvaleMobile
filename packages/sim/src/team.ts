import { RARITIES, championMeets, type Stat, type TeamRestriction } from '@mistvale/shared';
import { championScalingFrom, deriveStats } from '@mistvale/engine';
import type { LoadedContent } from './content';

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
    if (!def) throw new Error(`No champion "${member.championKey}" in the content.`);
    const base = deriveStats(def.baseStats, member, scaling);

    const bonuses: Partial<Record<Stat, number>> = { ...RELIC_POINTS };
    for (const [stat, pct] of Object.entries(FULL_RELICS) as [Stat, number][]) {
      bonuses[stat] = Math.round((base[stat] * pct) / 100);
    }
    return { ...member, bonuses };
  });
}

/**
 * What a *finished collection* is worth on top of the relics (C10b).
 *
 * A maxed account does not only have maxed relics — it has duplicates of the champions it
 * built and it holds most of the roster, and both of those pay. Leaving them out would
 * make every "a built team can do X" gate quietly understate a real endgame team, which is
 * the wrong direction for a ceiling gate to be wrong in.
 *
 * Deliberately **not** applied to the fresh and par teams: a new account has no duplicates
 * and a handful of champions, so the entry gates measure what a beginner actually fields.
 *
 * Values track `standing.ts`'s shipped ladders — imprint level 3 (a realistic amount of
 * duplication on a champion somebody chose to build, not the level-5 ceiling) plus a full
 * standing tier. If those ladders are retuned, this moves with them.
 */
const COLLECTION_PCT = 10 + 8;

export function withCollection(content: LoadedContent, team: readonly TeamSpec[]): TeamSpec[] {
  const scaling = championScalingFrom(content.config);
  return team.map((member) => {
    const def = content.champions.get(member.championKey);
    if (!def) throw new Error(`No champion "${member.championKey}" in the content.`);
    const base = deriveStats(def.baseStats, member, scaling);
    const bonuses: Partial<Record<Stat, number>> = { ...member.bonuses };
    // HP, ATK and DEF only — the ladders grant no speed by construction, which is the one
    // thing that would move turn order and with it every boss built around a turn count.
    for (const stat of ['hp', 'atk', 'def'] as const) {
      bonuses[stat] = (bonuses[stat] ?? 0) + Math.round((base[stat] * COLLECTION_PCT) / 100);
    }
    return { ...member, bonuses };
  });
}

/**
 * The four champions a *ward* allows, at a given investment.
 *
 * The Mistspire's whole balance question is not "can a good team clear floor 27" — it is
 * **"can the four best `hp`-role champions in the game clear floor 27"**, which is a very
 * different question and the only one worth gating. A ward the account's actual best four
 * happen to satisfy is not a ward; a ward only an impossible team could pass is a wall.
 *
 * "Best" is by rarity then by raw offence, which is a crude proxy and deliberately so: a
 * real player picks by kit, and a gate that passes with a crudely-picked team passes
 * comfortably with a thoughtfully-picked one. Returns fewer than four only when content
 * cannot supply them, which publish validation already refuses.
 */
export function wardedTeam(
  content: LoadedContent,
  restriction: TeamRestriction,
  level: number,
  rank: number,
  ascension: number,
): TeamSpec[] {
  const eligible = [...content.champions.values()]
    .filter((def) => !def.isFood)
    .filter((def) =>
      championMeets(restriction, {
        key: def.key,
        name: def.name,
        factionKey: def.factionKey,
        element: def.element,
        role: def.role,
        rarity: def.rarity,
      }),
    )
    .sort((a, b) => {
      const byRarity = RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity);
      if (byRarity !== 0) return byRarity;
      return b.baseStats.atk + b.baseStats.hp / 10 - (a.baseStats.atk + a.baseStats.hp / 10);
    });
  return eligible.slice(0, 4).map((def) => ({
    championKey: def.key,
    level,
    rank,
    ascension,
  }));
}

/**
 * The three teams a stage is worth measuring against.
 *
 * Named rather than described, because a sandbox and a CI gate that both say "a modest
 * team" have to mean the same four champions at the same investment or the two numbers are
 * not comparable — and comparing them is the entire reason an operator opens the sandbox
 * after a gate has told them something.
 *
 * They are the shapes the gates already used: `fresh` is the "at par recommended power"
 * team chapter 1 expects, `modest` is that team after a difficulty, and `built` is the
 * ceiling — maxed, geared and holding a collection.
 */
export const BENCH_TIERS = ['fresh', 'modest', 'built'] as const;
export type BenchTier = (typeof BENCH_TIERS)[number];

/** What each rung is, in the words an operator reads on the button. */
export const BENCH_LABELS: Readonly<Record<BenchTier, string>> = Object.freeze({
  fresh: 'Fresh — four Rares at 20 / ★3, no relics',
  modest: 'Modest — level 50 / ★5 / asc 2, with relics',
  built: 'Built — level 60 / ★6 / asc 6, relics and a collection',
});

const BENCH_INVESTMENT: Readonly<
  Record<BenchTier, { level: number; rank: number; ascension: number }>
> = Object.freeze({
  fresh: { level: 20, rank: 3, ascension: 0 },
  modest: { level: 50, rank: 5, ascension: 2 },
  built: { level: 60, rank: 6, ascension: 6 },
});

/**
 * The four champions a bench team is made of.
 *
 * The first four summonable Rares by key, which is arbitrary and deliberately stable: what
 * a benchmark measures is the *stage*, so the team has to be the same one every time it is
 * asked, whoever asks and whenever. Sorted by key rather than by strength for the same
 * reason — "the best four" moves the moment a champion is retuned, and a benchmark whose
 * baseline drifts under it cannot be compared to yesterday's answer.
 *
 * Rare rather than Legendary because that is what a player has when the campaign is in
 * front of them, and because the ceiling is measured by putting the *same* four at `built`
 * rather than by swapping in better ones.
 */
function benchRoster(content: LoadedContent): string[] {
  return [...content.champions.values()]
    .filter((champion) => champion.rarity === 'rare' && !champion.isFood && champion.summonable)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, 4)
    .map((champion) => champion.key);
}

/**
 * A named bench team, ready to fight.
 *
 * Fewer than four only when content cannot supply four — the same rule `wardedTeam`
 * follows, and the honest one for a sandbox: a fight with two champions is a real fight,
 * and refusing to run it would be the tool being stricter than the game. Throws only when
 * there is nobody at all to field, because that is not a thin roster, it is no roster.
 */
export function benchTeam(content: LoadedContent, tier: BenchTier): TeamSpec[] {
  const roster = benchRoster(content);
  if (roster.length === 0) {
    throw new Error('The content holds no summonable Rare champion to bench.');
  }
  const investment = BENCH_INVESTMENT[tier];
  const bare = roster.map((championKey) => ({ championKey, ...investment }));

  if (tier === 'fresh') return bare;
  if (tier === 'modest') return withRelics(content, bare);
  return withCollection(content, withRelics(content, bare));
}
