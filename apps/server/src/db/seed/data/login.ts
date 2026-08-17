import type { LoginTrackDay, LoginTrackDef } from '@mistvale/shared';

/**
 * The two login tracks (ECONOMY §11, GAME_DESIGN §7).
 *
 * **The calendar (30 days, forever).** A day is given on the Nth *claim*, so somebody who
 * misses a Tuesday loses that Tuesday and not their place — the track measures showing up,
 * not attendance. Sigil days land on 7 / 14 / 21 / 28 as the design asked, climbing
 * Gleaming → Gleaming ×2 → Mistwoven → Mistwoven ×2, and day 30 is the **Epic selector**:
 * a choice of four, not a roll, because thirty days of turning up should end in the
 * champion the player wanted rather than the one the game picked.
 *
 * The Radiant Sigil is deliberately *not* on this track. The monthly quest set already pays
 * one, and a second guaranteed Radiant every thirty days would make the rarest pull in the
 * game a subscription.
 *
 * **Crystals: ~315 a month**, on days 5 / 10 / 15 / 20 / 25 and the finale. ECONOMY §9
 * targets 40–70 crystals a day for an active account; the Crystal Mine that was to supply
 * the bulk of that is post-EA, so today's real faucet is the daily chest's 10 plus weeklies
 * — roughly 15/day. The calendar brings that to about 25, which closes part of the gap the
 * Mine will finish rather than overshooting a target nothing else is meeting.
 *
 * **The welcome track (7 days, once).** A newcomer's first week, ending in Gleaming ×2 and
 * a relic set — four Ironroot and two Swiftwind, which is two copies of the HP bonus and
 * one of the speed bonus. Six of nine slots, so it teaches that sets stack and that two can
 * be worn at once, and still leaves the three accessory slots to earn. Rank 2 uncommon:
 * one step above what chapter 1 drops, and nowhere near what the Depths will.
 *
 * Both tracks are ordinary content. An operator re-cutting August's calendar edits thirty
 * rows in one draft and publishes it — no deploy, no migration.
 */

const day = (
  n: number,
  rewards: Record<string, number>,
  grants: Partial<LoginTrackDay['grants']> = {},
): LoginTrackDay => ({
  day: n,
  rewards,
  grants: { champions: [], choices: [], relics: [], ...grants },
});

/**
 * The four the day-30 selector offers.
 *
 * One of each role, and none of them a starter — a player already owns one of those, and
 * the point of a choice is that it fills the hole in *their* roster. Deliberately content
 * rather than "every Epic that is not a starter" computed at runtime: which four are on
 * offer is a curation decision an operator should be able to change for a season.
 */
const EPIC_SELECTOR = [
  'darius', // attack — Wayfarers
  'castellan_ordwin', // defense — Vale Sentinels
  'lady_merrow', // support — Hollowborn
  'aldemar_the_cartographer', // hp — Wayfarers
];

const CALENDAR_DAYS: LoginTrackDay[] = [
  day(1, { silver: 3_000, playerXp: 100 }),
  day(2, { energy_pack_small: 1 }),
  day(3, { silver: 4_000 }),
  day(4, { essence_pure: 1 }),
  day(5, { crystals: 20 }),
  day(6, { emblem_bronze: 10 }),
  day(7, { sigil_gleaming: 1, silver: 5_000 }),
  day(8, { silver: 5_000, playerXp: 200 }),
  day(9, { tome_rare: 1 }),
  day(10, { crystals: 25 }),
  day(11, { essence_pure: 2 }),
  day(12, { energy_pack_small: 2 }),
  day(13, { emblem_bronze: 15 }),
  day(14, { sigil_gleaming: 2, silver: 6_000 }),
  day(15, { crystals: 30 }),
  day(16, { silver: 7_000, playerXp: 300 }),
  day(17, { tome_rare: 2 }),
  day(18, { essence_pure: 2 }),
  day(19, { emblem_silver: 5 }),
  day(20, { crystals: 40 }),
  day(21, { sigil_mistwoven: 1, silver: 8_000 }),
  day(22, { energy_pack_large: 1 }),
  day(23, { silver: 9_000, playerXp: 400 }),
  day(24, { tome_epic: 1 }),
  day(25, { crystals: 50 }),
  day(26, { emblem_silver: 8 }),
  day(27, { essence_pure: 3 }),
  day(28, { sigil_mistwoven: 2, silver: 10_000 }),
  day(29, { energy_pack_large: 2 }),
  day(30, { crystals: 150, playerXp: 1_000 }, { choices: EPIC_SELECTOR }),
];

/** Four Ironroot and two Swiftwind — see the note at the top of the file. */
const WELCOME_RELICS: LoginTrackDef['days'][number]['grants']['relics'] = [
  { setKey: 'ironroot', slot: 'weapon', rank: 2, rarity: 'uncommon' },
  { setKey: 'ironroot', slot: 'helm', rank: 2, rarity: 'uncommon' },
  { setKey: 'ironroot', slot: 'shield', rank: 2, rarity: 'uncommon' },
  { setKey: 'ironroot', slot: 'gauntlets', rank: 2, rarity: 'uncommon' },
  { setKey: 'swiftwind', slot: 'cuirass', rank: 2, rarity: 'uncommon' },
  { setKey: 'swiftwind', slot: 'boots', rank: 2, rarity: 'uncommon' },
];

const WELCOME_DAYS: LoginTrackDay[] = [
  day(1, { silver: 5_000, energy_pack_small: 1 }),
  day(2, { sigil_faded: 3 }),
  day(3, { silver: 6_000, essence_pure: 2 }),
  day(4, { emblem_bronze: 20 }),
  day(5, { crystals: 30, tome_rare: 1 }),
  day(6, { silver: 8_000, energy_pack_large: 1 }),
  day(7, { sigil_gleaming: 2, playerXp: 500 }, { relics: WELCOME_RELICS }),
];

export const LOGIN_TRACKS: LoginTrackDef[] = [
  {
    key: 'calendar_the_long_watch',
    name: 'The Long Watch',
    description:
      'Thirty days of keeping the lantern lit. Miss one and you lose the day, not your place — the watch counts the nights you stood it.',
    track: 'calendar',
    days: CALENDAR_DAYS,
    active: true,
    sortOrder: 10,
  },
  {
    key: 'welcome_first_week',
    name: 'A Warden’s First Week',
    description:
      'What the Vale gives someone who has only just arrived. Seven days, walked once, and then never again.',
    track: 'welcome',
    days: WELCOME_DAYS,
    active: true,
    sortOrder: 20,
  },
];
