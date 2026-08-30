import type { EventPointRule, ValePassDef, ValePassTier } from '@mistvale/shared';

/**
 * The Vale Pass — the launch season (C38).
 *
 * **One season, thirty tiers, running monthly.** Monthly rather than a hand-cut window for
 * the reason the events seed already argues: *a calendar that has to be re-cut by hand is a
 * calendar that stops being cut, and at EA there is nobody running live-ops.* A pass that
 * goes dark on the first of the month because nobody authored the next one is worse than
 * one that repeats — and a *themed* season, with its own name and art, is exactly the
 * `window` schedule the operator reaches for once there is somebody to cut it.
 *
 * ## The numbers, and where they came from
 *
 * The season is thirty tiers at a flat **500 points each**, so tier N wants `500 × N` and
 * the whole track is **15,000**. Flat rather than a curve, deliberately: a pass is read as
 * "how many more tiers", and a ladder whose rungs cost more as you climb turns that into
 * arithmetic. The curve that matters is in the *rewards*, which climb.
 *
 * The **daily ceiling is 600**, which is the number that makes it a season rather than a
 * weekend. An ordinary evening — two energy bars through the campaign or the Depths, a
 * handful of levels, the day's quests — earns comfortably past 600, so a player who turns
 * up most days banks the ceiling. Thirty tiers at 500 against 600 a day is **25 days of the
 * month**, which is the shape a pass wants: finishable by somebody who shows up, not
 * finishable by somebody who does not, and not finishable in a weekend by anybody.
 *
 * Its own test pins both ends of that, because either alone can be satisfied by a mistake:
 * a whole month at the ceiling must finish the track, and no single day can.
 *
 * ## The two columns
 *
 * The free track pays **every** tier, because a track that pays on a quarter of its rungs
 * is a track most players stop looking at. It is sized as a modest top-up — roughly a
 * fortnight of daily-quest silver over the month, plus the sigils and crystals below.
 *
 * The season's own track is **900 crystals**, which is about a fortnight of crystal income
 * for an active account (ECONOMY §9: 40–70 a day plus weeklies). That is the honest price
 * for a game with no payments: high enough to be a real choice against a ×10 Gleaming pull,
 * low enough that a player who wants it can have it every month without saving all year.
 * It pays roughly three times the free column and ends in a **Radiant Sigil** at tier 30 —
 * the one thing in the game that falls nowhere and is only ever given.
 */

const rule = (
  type: EventPointRule['type'],
  points: number,
  label: string,
  filters: EventPointRule['filters'] = {},
): EventPointRule => ({ type, points, label, filters });

/** Points a tier wants. Flat, so "three more tiers" is a countable thought. */
const POINTS_PER_TIER = 15_000 / 30;

/**
 * The season's ladder, generated rather than hand-written.
 *
 * Thirty tiers by hand is thirty chances to mistype a threshold, and the campaign's 252
 * stages already established the answer: generate from a plan, review in Admin. What is
 * authored here is the *shape* — which tiers are the big ones — and the arithmetic is the
 * seed's.
 */
function tier(
  index: number,
  free: Record<string, number>,
  premium: Record<string, number>,
): ValePassTier {
  return { points: POINTS_PER_TIER * index, free, premium };
}

/**
 * Every fifth tier is a landmark and the thirtieth is the season's own reward.
 *
 * The pattern is the genre's and it is about *reading* the track: a rail of thirty
 * identical parcels tells a player nothing about where to aim, and one where every fifth is
 * visibly bigger gives the next fortnight a destination.
 */
const TIERS: ValePassTier[] = Array.from({ length: 30 }, (_, slot) => {
  const index = slot + 1;
  const landmark = index % 5 === 0;
  const final = index === 30;

  if (final) {
    return tier(
      index,
      { crystals: 150, sigil_gleaming: 2, silver: 60_000 },
      { sigil_radiant: 1, crystals: 300, tome_epic: 2 },
    );
  }
  if (landmark) {
    return tier(
      index,
      { crystals: 40, sigil_faded: 2 },
      { sigil_gleaming: 1, crystals: 80, emblem_gold: 40 },
    );
  }
  // The ordinary rungs alternate so a week's climb is never four of the same parcel: the
  // materials a player is always short of, then the energy to go and spend them.
  return index % 2 === 0
    ? tier(index, { silver: 12_000 }, { emblem_silver: 40, tome_rare: 1 })
    : tier(index, { energy: 60 }, { silver: 25_000, crystals: 20 });
});

export const VALE_PASSES: ValePassDef[] = [
  {
    key: 'pass_first_light',
    sortOrder: 1,
    name: 'The Vale Pass',
    description:
      'A season of the reclamation. Everything you do in the vale earns favour, and favour walks the track — a little every day, for as long as the month lasts.',
    bannerAsset: '',
    // Monthly, so the season turns over with the calendar and nothing has to be re-cut.
    schedule: { kind: 'monthly' },
    pointRules: [
      // Broad on purpose: a pass should reward *whatever* somebody plays rather than
      // sending them to one mode, which is what separates it from an event. Every rule
      // here is a report the goal engine already fans out.
      rule('battleWin', 30, 'Each battle won'),
      rule('stageClear', 20, 'Each stage cleared'),
      rule('championLevelUp', 15, 'Each champion level'),
      rule('gearUpgrade', 10, 'Each relic upgrade'),
      rule('questClaim', 120, 'Each errand collected'),
      rule('dungeonClear', 60, 'Each floor of the Depths'),
      rule('arenaWin', 80, 'Each arena win'),
      rule('summon', 40, 'Each summon'),
    ],
    tiers: TIERS,
    // About a fortnight of crystal income for an active account (ECONOMY §9), which is a
    // real choice against a ×10 Gleaming pull rather than an afterthought or a wall.
    unlockCost: 900,
    // The number that makes it a season: an ordinary evening clears it, a heavy weekend
    // cannot buy more of it, and thirty tiers is twenty-five days of turning up.
    dailyPointCap: 600,
    // Level 7, with the events screen it sits beside. Below that an account is still being
    // told what the game is, and a thirty-tier track is not the thing to explain next.
    unlockLevel: 7,
    active: true,
  },
];
