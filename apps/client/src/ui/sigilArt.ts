import { RARITIES, type Rarity } from '@mistvale/shared';

/**
 * What a sigil looks like, and how good the pool behind it is.
 *
 * Same shape and reasoning as `dungeonArt`, `goalArt` and `regionArt`: what a pool *is* —
 * its rates, its mercy, what can come out of it — is content, and what it looks like is
 * chrome, so the picture lives here rather than in the seed. An operator adding a fifth
 * pool in Admin gets a sigil without a code change; it simply gets the plain one.
 *
 * None of the four is `orb-voidspiral`, which is the Mistgate's own art in the registry:
 * the place and the four things inside it are on screen together, and a sigil wearing the
 * room's face is the one that stops reading as a sigil.
 */
const SIGIL_ART: Readonly<Record<string, string>> = Object.freeze({
  faded: 'rune-fractured-stone',
  gleaming: 'rune-silver-knot',
  mistwoven: 'rune-eclipse-mark',
  radiant: 'rune-radiance',
});

/** A pool nobody has drawn a sigil for. Deliberately the plainest of the four. */
const FALLBACK = 'rune-bronze-disc';

export function sigilArt(poolKey: string): string {
  return SIGIL_ART[poolKey] ?? FALLBACK;
}

/**
 * What a pool can produce, worst to best, from its own published rates.
 *
 * Derived rather than authored, which matters twice over: it is what the gate is coloured
 * by, and it is the honest answer to "what is this pool *for*". A hand-written tier could
 * disagree with the rates — this cannot.
 *
 * A **range** rather than a ceiling, because the ceiling alone does not distinguish
 * anything: three of Mistvale's four pools can produce a Legendary, so a line reading "up
 * to Legendary" is true on all three and decides nothing. The floor is what separates
 * them — the Radiant sigil cannot give you a Rare, and that is the whole reason to save
 * one. Gleaming and Mistwoven still read alike, and correctly so: their rates are
 * identical and only the champions behind them differ.
 *
 * Zero-rate entries are excluded, because a rarity a pool lists at 0% is not in it. An
 * empty rate table — a pool an operator has begun and not filled in — reads as common to
 * common rather than throwing on a screen a player is standing in front of.
 */
export function poolRange(rates: Readonly<Record<string, number>>): [Rarity, Rarity] {
  const present = RARITIES.filter((rarity) => (rates[rarity] ?? 0) > 0);
  return [present[0] ?? 'common', present.at(-1) ?? 'common'];
}

/**
 * The best rarity a pool can produce — the half of the range the gate takes its colour
 * from, since "how good does this get" is what a glance down the rail is asking.
 */
export function poolTier(rates: Readonly<Record<string, number>>): Rarity {
  return poolRange(rates)[1];
}

/**
 * The rarities whose mercy a player of this pool is actually counting.
 *
 * The best two the pool can produce, best first. It used to be a fixed epic-and-legendary
 * pair, which is right for the Radiant sigil and leaves the *other three* gates with no
 * clock at all — the Faded pool tops out at Rare, and rare mercy is exactly what somebody
 * pulling on it is waiting for. Common and uncommon are still left off wherever there is
 * something better in the pool, because that is arithmetic nobody waits on.
 */
export function clockRarities(rates: Readonly<Record<string, number>>): Rarity[] {
  return RARITIES.filter((rarity) => (rates[rarity] ?? 0) > 0)
    .reverse()
    .slice(0, 2);
}
