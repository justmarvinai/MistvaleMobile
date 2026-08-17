import type { EventDef, EventMilestone, EventPointRule } from '@mistvale/shared';

/**
 * The three launch events (CONTENT_PLAN §169, ECONOMY §11).
 *
 * All three are **weekly and staggered**, rather than the absolute two-week calendar the
 * planning docs sketched. The absolute form is still supported and is what an operator
 * schedules for a one-off launch weekend — but a calendar that has to be re-cut by hand
 * every fortnight is a calendar that stops being cut, and at EA there is nobody running
 * live-ops. Recurring means the game always has something on:
 *
 *   Mon–Fri  Champion Training   (5 days — the long one, for the levelling week)
 *   Fri–Sun  Depths Delve        (3 days — the weekend farm)
 *   Sat–Sun  Summon Surge        (2 days — the short, loud one)
 *
 * **Each event carries its own `unlockLevel`** rather than deferring to a global gate. That
 * is more expressive — the Delve wants level 10 because that is when the Depths open, and
 * Training wants nothing — and it avoids a second knob saying the same thing twice. The
 * *screen* opens at level 7 like every other dock destination; an event that scores below
 * that simply banks the points, the same kindness the quest list does.
 *
 * Ladders are sized to ~60–70% completion for a daily-active player (ECONOMY §11 ⚙), so
 * the top milestone is a stretch rather than a formality and the fourth or fifth is what
 * most people actually finish. The budgets those numbers came from, so a retune has
 * something to argue with rather than a feeling:
 *
 *   Training  ~3,000–5,600 over five days — 60–90 champion levels, 3–5 rank-ups, 1–2
 *             ascensions and 5–10 mastery nodes, which is a normal week of roster work.
 *   Delve     ~6,800 over the weekend — two energy caps a day, most of it into the
 *             Depths: roughly 45 floors and 9 floor bosses.
 *   Surge     ~50–150 over two days. This is the one that needed thinking about. The
 *             source game's ladder assumes hundreds of pulls a weekend; Mistvale's sigil
 *             faucet is about 8 Faded and 2 Gleaming (ECONOMY §5), or double that for
 *             somebody who saved for it — call it 50 points, 150 if they hoarded. So the
 *             top rung is **200**, sized to the sigils a player can actually spend rather
 *             than to the weights.
 *
 *             A single Radiant pull is 500 and tops the ladder outright. That is
 *             deliberate: the weights are source-faithful because a Radiant pull *should*
 *             be worth more, and "the Radiant I finally pulled finished the event" is a
 *             good moment rather than a bug. Sizing the ladder to a Radiant instead would
 *             make it unreachable for everyone who never sees one, which at EA is most
 *             people.
 *
 * These are the numbers most likely to want moving once somebody has actually played a
 * weekend of them (USER_QUESTIONS Q2), and every one of them is an Admin edit away.
 */

const rule = (
  type: EventPointRule['type'],
  points: number,
  label: string,
  filters: EventPointRule['filters'] = {},
): EventPointRule => ({ type, points, label, filters });

const milestone = (points: number, rewards: Record<string, number>): EventMilestone => ({
  points,
  rewards,
});

let order = 0;

const event = (
  key: string,
  name: string,
  description: string,
  schedule: EventDef['schedule'],
  pointRules: EventPointRule[],
  milestones: EventMilestone[],
  unlockLevel: number,
): EventDef => ({
  key,
  name,
  description,
  bannerAsset: '',
  schedule,
  pointRules,
  milestones,
  unlockLevel,
  active: true,
  sortOrder: (order += 10),
});

export const EVENTS: EventDef[] = [
  event(
    'event_champion_training',
    'Champion Training',
    'The Vale rewards patience this week. Every level fed to a champion, every rank earned and every ascension counts towards the ladder.',
    // Monday through Friday: the week's work, ending before the weekend takes over.
    { kind: 'weekly', startWeekday: 1, durationDays: 5 },
    [
      rule('championLevelUp', 10, 'Each champion level'),
      rule('championRankUp', 400, 'Each rank earned'),
      rule('championAscend', 600, 'Each ascension'),
      rule('masteryLearn', 150, 'Each mastery node'),
    ],
    [
      milestone(400, { silver: 20_000 }),
      milestone(1_000, { energy_pack_small: 2 }),
      milestone(1_800, { sigil_faded: 3 }),
      milestone(2_800, { tome_rare: 1, crystals: 30 }),
      milestone(4_200, { sigil_gleaming: 1 }),
      milestone(6_000, { tome_epic: 1, crystals: 60 }),
    ],
    1,
  ),

  event(
    'event_depths_delve',
    'Depths Delve',
    'Something in the keeps is restless. Floors cleared below the Vale are worth more than usual until Sunday closes.',
    // Friday through Sunday: the weekend, when people actually have the energy to farm.
    { kind: 'weekly', startWeekday: 5, durationDays: 3 },
    [
      rule('dungeonClear', 100, 'Each Depths floor'),
      rule('bossKill', 150, 'Each floor boss or warlord'),
      rule('useEnergy', 4, 'Each point of energy spent'),
    ],
    [
      milestone(600, { silver: 25_000 }),
      milestone(1_500, { emblem_bronze: 30 }),
      milestone(2_800, { essence_pure: 3 }),
      milestone(4_300, { emblem_silver: 60, crystals: 40 }),
      milestone(6_300, { sigil_gleaming: 2 }),
      milestone(9_000, { emblem_gold: 80, crystals: 80 }),
    ],
    10,
  ),

  event(
    'event_summon_surge',
    'Summon Surge',
    'The Mistgate is loud this weekend. Every sigil spent scores, and the rarer the sigil the louder it is.',
    // Saturday and Sunday: two days, on top of the Delve, so the weekend has a choice in it.
    { kind: 'weekly', startWeekday: 6, durationDays: 2 },
    [
      // Source-faithful weights: a Radiant pull is worth five hundred Faded ones, which is
      // roughly what it costs to get one.
      rule('summon', 1, 'Each Faded Sigil pull', { poolKey: 'faded' }),
      rule('summon', 20, 'Each Gleaming Sigil pull', { poolKey: 'gleaming' }),
      rule('summon', 120, 'Each Mistwoven Sigil pull', { poolKey: 'mistwoven' }),
      rule('summon', 500, 'Each Radiant Sigil pull', { poolKey: 'radiant' }),
    ],
    [
      milestone(10, { silver: 20_000 }),
      milestone(25, { sigil_faded: 3 }),
      milestone(50, { crystals: 40 }),
      milestone(90, { sigil_gleaming: 1 }),
      milestone(140, { crystals: 80 }),
      milestone(200, { sigil_gleaming: 2, crystals: 60 }),
    ],
    1,
  ),
];
