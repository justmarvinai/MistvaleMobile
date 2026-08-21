import type { ChampionDef, RosterChampion } from '@mistvale/shared';

/**
 * The faces an account may wear.
 *
 * One entry per *champion* rather than per copy, which is the whole difference between
 * this picker and the showcase's. Three Anurias are one face; offering the same portrait
 * three times asks a question with no answer. The strongest copy of each is the one drawn,
 * because if a player is going to look at one of their Anurias it may as well be the good
 * one — and it makes the ordering below stable.
 *
 * Food is left out for the reason the showcase leaves it out: a Broodling is a resource
 * with a portrait, and a warden wearing one has misunderstood something the game should not
 * have let them misunderstand. The server refuses it too, so this is the polite half of a
 * rule that is enforced either way.
 *
 * A roster entry whose champion is not in the published bundle is dropped rather than
 * drawn: a copy can outlive the content that defined it, and a card with no name and no art
 * is worse than one fewer choice.
 */
export interface Face {
  champion: RosterChampion;
  def: ChampionDef;
}

export function avatarFaces(
  champions: readonly RosterChampion[],
  defs: readonly ChampionDef[],
): Face[] {
  const byKey = new Map(defs.map((def) => [def.key, def]));
  const best = new Map<string, Face>();

  for (const champion of champions) {
    const def = byKey.get(champion.championKey);
    if (!def || def.isFood) continue;
    const held = best.get(def.key);
    if (!held || champion.power > held.champion.power) best.set(def.key, { champion, def });
  }

  return [...best.values()].sort(
    (a, b) => b.champion.power - a.champion.power || a.def.name.localeCompare(b.def.name),
  );
}
