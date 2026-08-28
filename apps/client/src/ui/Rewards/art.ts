/**
 * What a reward key looks like.
 *
 * Content pays in a flat `{silver: 5000, sigil_gleaming: 1}`, and since the design rework
 * every place that shows a payout — the results screen, a mail attachment, a quest's
 * claim, a shop's price — draws it as a painted chip rather than as a word and a number.
 * That needs an icon per key, and this is the one place that decides.
 *
 * **Families rather than keys.** There are four sigils, several tomes and a growing list
 * of essences, and an operator adding `sigil_umbral` in Admin must not have to touch the
 * client — which is the whole point of content being data. So the wallet keys are named
 * exactly and everything else matches on its prefix, with a fallback that is a real icon
 * rather than a blank: a reward the player is actually receiving must never render as
 * nothing.
 *
 * The ids are FantasyUIs asset ids, so they follow the theme like everything else.
 */

/** Wallet keys, which are not items and so are not in the content bundle. */
const EXACT: Readonly<Record<string, string>> = Object.freeze({
  silver: 'rune-jade-coin',
  crystals: 'rune-radiant-gem',
  valorMedals: 'crest-gilded-crown',
  playerXp: 'rune-nova-star',
  championXp: 'rune-starfall',
  energy: 'fire-golden-flame',
  xpBoostHours: 'rune-starfall',
});

/** Item families, longest prefix first so a more specific rule can be added above. */
const FAMILIES: readonly (readonly [string, string])[] = Object.freeze([
  ['energy_pack', 'fire-golden-flame'],
  ['sigil_', 'rune-flame-sigil'],
  ['essence_', 'earth-crystal-bloom'],
  ['tome_', 'rune-gilded-script'],
  ['emblem_', 'crest-warded-shield'],
  ['shard_', 'rune-crystal-shard'],
] as const);

/** The generic "you were given something" chip. */
export const REWARD_ART_FALLBACK = 'rune-bronze-disc';

/** The painted icon for a reward key. Never returns nothing. */
export function rewardArt(key: string): string {
  const exact = EXACT[key];
  if (exact) return exact;
  for (const [prefix, art] of FAMILIES) {
    if (key.startsWith(prefix)) return art;
  }
  return REWARD_ART_FALLBACK;
}
