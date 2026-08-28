import type { Goal, QuestDef, QuestPeriod } from '@mistvale/shared';

/**
 * The daily, weekly and monthly checklist.
 *
 * Numbers and rewards are transcribed from ECONOMY_BALANCE §11, which sizes them against
 * the faucet targets in §9 — a fully active free day is meant to land around 40–70
 * crystals, and the dailies are the reliable part of that.
 *
 * The shape is source-mirrored and deliberate: eight dailies covering eight *different*
 * activities, so the checklist reads as "play the game today" rather than "grind one
 * thing". The completion chest is worth more than any single line, which is what makes the
 * eighth quest worth doing when the first seven already paid.
 *
 * Every goal here is validated against the goal registry at publish time, so a daily that
 * could never complete cannot go live (`content/goals.ts`).
 */

let order = 0;

const quest = (
  key: string,
  period: QuestPeriod,
  name: string,
  description: string,
  goals: Goal[],
  rewards: Record<string, number>,
  options: Partial<Pick<QuestDef, 'unlockLevel' | 'countsTowardChest' | 'icon'>> = {},
): QuestDef => ({
  key,
  period,
  name,
  description,
  goals,
  rewards,
  countsTowardChest: options.countsTowardChest ?? true,
  unlockLevel: options.unlockLevel ?? 1,
  icon: options.icon ?? 'mv-quest',
  active: true,
  sortOrder: (order += 10),
});

const goal = (type: Goal['type'], target: number, filters: Goal['filters'] = {}): Goal => ({
  type,
  target,
  filters,
});

// ── Dailies (8) ─────────────────────────────────────────────────────────────
// One per system, so the checklist walks a player through the whole game rather than
// asking them to repeat its cheapest loop eight times.

const DAILIES: QuestDef[] = [
  quest(
    'daily_campaign_wins',
    'daily',
    'Walk the Vale',
    'Win seven campaign battles.',
    [goal('battleWin', 7, { mode: 'campaign' })],
    { silver: 5_000 },
  ),
  quest('daily_energy', 'daily', 'A day’s work', 'Spend fifty energy.', [goal('useEnergy', 50)], {
    essence_pure: 2,
  }),
  quest(
    'daily_summon',
    'daily',
    'Call through the gate',
    'Summon three champions.',
    [goal('summon', 3)],
    { silver: 5_000 },
  ),
  quest(
    'daily_level_champions',
    'daily',
    'Train the warband',
    'Level a champion three times.',
    [goal('championLevelUp', 3)],
    { silver: 5_000 },
  ),
  quest(
    'daily_gear_upgrade',
    'daily',
    'At the forge',
    'Make four relic upgrade attempts.',
    // The *attempt* is the activity, not the success — a daily that punished bad luck
    // would be a daily that some days cannot be finished (ECONOMY §4).
    [goal('gearUpgrade', 4)],
    { silver: 5_000 },
    { unlockLevel: 3 },
  ),
  quest(
    'daily_bazaar',
    'daily',
    'Trade in the Bazaar',
    'Buy something from the Bazaar.',
    [goal('shopPurchase', 1)],
    { energy: 40 },
    { unlockLevel: 5 },
  ),
  quest(
    'daily_arena',
    'daily',
    'Onto the sand',
    'Fight five arena battles.',
    // Fought, not won: the ladder decides whether you win, and a daily should not.
    [goal('arenaBattle', 5)],
    { energy: 40 },
    { unlockLevel: 8 },
  ),
  quest(
    'daily_bosses',
    'daily',
    'Cut off the head',
    'Beat three warlords or floor bosses.',
    [goal('bossKill', 3)],
    { silver: 5_000 },
    { unlockLevel: 4 },
  ),
];

// ── Weeklies (6) ────────────────────────────────────────────────────────────
// Sized so a player who shows up most days finishes them without a marathon, and the
// "claim five days of dailies" line is the one that ties the two cadences together.

const WEEKLIES: QuestDef[] = [
  quest(
    'weekly_dailies',
    'weekly',
    'A steady week',
    'Claim a full day of quests five times.',
    [goal('claimAllDailies', 5)],
    { sigil_gleaming: 1, crystals: 30 },
  ),
  quest(
    'weekly_campaign',
    'weekly',
    'The long road',
    'Win forty campaign battles.',
    [goal('battleWin', 40, { mode: 'campaign' })],
    { silver: 40_000, crystals: 15 },
  ),
  quest(
    'weekly_depths',
    'weekly',
    'Down into the keeps',
    'Clear fifteen Depths floors.',
    [goal('dungeonClear', 15)],
    { emblem_silver: 3, crystals: 15 },
    { unlockLevel: 10 },
  ),
  quest(
    'weekly_arena',
    'weekly',
    'Climb',
    'Win fifteen arena battles.',
    [goal('arenaWin', 15)],
    { crystals: 25 },
    { unlockLevel: 8 },
  ),
  quest(
    'weekly_forge',
    'weekly',
    'Sparks and silver',
    'Make thirty relic upgrade attempts.',
    [goal('gearUpgrade', 30)],
    { silver: 50_000 },
    { unlockLevel: 3 },
  ),
  quest(
    'weekly_summon',
    'weekly',
    'The gate stays open',
    'Summon twenty champions.',
    [goal('summon', 20)],
    { sigil_faded: 5, crystals: 15 },
  ),
];

// ── Monthlies (5) ───────────────────────────────────────────────────────────
// The long cadence, and the only reliable free source of the two rarest sigils.

const MONTHLIES: QuestDef[] = [
  quest(
    'monthly_dailies',
    'monthly',
    'The warden’s month',
    'Claim a full day of quests twenty times.',
    [goal('claimAllDailies', 20)],
    { sigil_radiant: 1, sigil_mistwoven: 1 },
  ),
  quest(
    'monthly_campaign',
    'monthly',
    'Across the Vale',
    'Win one hundred and fifty campaign battles.',
    [goal('battleWin', 150, { mode: 'campaign' })],
    { tome_epic: 1, silver: 100_000 },
  ),
  quest(
    'monthly_depths',
    'monthly',
    'What the keeps hold',
    'Clear sixty Depths floors.',
    [goal('dungeonClear', 60)],
    { emblem_gold: 2, crystals: 40 },
    { unlockLevel: 10 },
  ),
  quest(
    'monthly_arena',
    'monthly',
    'A month on the sand',
    'Win sixty arena battles.',
    [goal('arenaWin', 60)],
    { crystals: 60 },
    { unlockLevel: 8 },
  ),
  quest(
    'monthly_ascend',
    'monthly',
    'Beyond the mist',
    'Ascend a champion three times.',
    [goal('championAscend', 3)],
    { essence_pure: 10, crystals: 30 },
    { unlockLevel: 10 },
  ),
];

export const QUESTS: QuestDef[] = [...DAILIES, ...WEEKLIES, ...MONTHLIES];
