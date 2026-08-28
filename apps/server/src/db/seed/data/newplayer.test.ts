import { describe, expect, it } from 'vitest';
import { isRewardScalar } from '@mistvale/shared';
import { EVENTS } from './events';
import { LOGIN_TRACKS } from './login';
import { MISSIONS } from './missions';
import { QUESTS } from './quests';
import { SHOPS } from './shops';

/**
 * What a new warden's first days are actually worth (C24).
 *
 * The owner's brief was a number — *"very new players should get at least 2-3k energy
 * overflow in the first couple of hours/days"* — and a number is a thing content can drift
 * away from silently. Every one of these payouts is an ordinary reward map an operator can
 * retune in Admin, so nothing stops a well-meant edit from halving the opening week; what
 * it would look like is a game that feels slower than it did, months later, with no commit
 * to blame.
 *
 * So the shape is pinned rather than the exact figures: **a floor** on what the first hours
 * and the first week hand over, and **a taper** — later content pays less than earlier
 * content — because those two together are the design, and either one alone can be
 * satisfied by a mistake.
 */

const energy = (rewards: Readonly<Record<string, number>>): number => rewards.energy ?? 0;
const boostHours = (rewards: Readonly<Record<string, number>>): number => rewards.xpBoostHours ?? 0;

const welcome = LOGIN_TRACKS.find((track) => track.track === 'welcome');
const calendar = LOGIN_TRACKS.find((track) => track.track === 'calendar');

/** The Path's missions, typed for what this file reads off them. */
const PATH = MISSIONS as { key: string; arc: number; rewards: Record<string, number> }[];

/**
 * Everything a mission arc pays, since the Path is what the first hours are spent on.
 *
 * Filtered on the `arc` field rather than on the key, which is the mistake this test made
 * first: mission keys read `m01_first_blood`, so a filter looking for `arc1_` matched
 * nothing and every floor below it passed against a sum of zero. A guard that cannot see
 * its own subject passes hardest.
 */
function arcEnergy(arc: number): number {
  const missions = PATH.filter((mission) => mission.arc === arc);
  expect(missions.length, `arc ${arc} should have missions in it`).toBeGreaterThan(0);
  return missions.reduce((total, mission) => total + energy(mission.rewards), 0);
}

describe("a new warden's energy", () => {
  it('hands over a real bank in the first session', () => {
    // Arc 1 of the Path is the first hour or two — it is the arc that teaches the campaign
    // — plus the welcome track's first day and whatever the calendar opens with.
    const firstSession =
      arcEnergy(1) +
      energy(welcome!.days[0]!.rewards) +
      calendar!.days.slice(0, 2).reduce((total, day) => total + energy(day.rewards), 0);

    // A campaign stage costs 4–9, so this is several hundred fights: enough that the first
    // evening never stops for a bar, which is the whole of what was asked for.
    expect(firstSession, 'energy inside the first session').toBeGreaterThanOrEqual(1_500);
  });

  it('reaches the first week without a downtime', () => {
    const week =
      welcome!.days.reduce((total, day) => total + energy(day.rewards), 0) +
      arcEnergy(1) +
      arcEnergy(2) +
      calendar!.days.slice(0, 7).reduce((total, day) => total + energy(day.rewards), 0);

    expect(week, "energy across a newcomer's first week").toBeGreaterThanOrEqual(2_000);
  });

  it('tapers, so the generosity is a start rather than a rate', () => {
    // The second half of the owner's instruction, and the half a floor alone cannot check:
    // "later on scale a bit down". Arc 3 is a week or two in.
    expect(arcEnergy(3), 'arc 3 pays less than arc 1').toBeLessThan(arcEnergy(1));
    expect(arcEnergy(2), 'and arc 2 sits between them').toBeLessThan(arcEnergy(1));

    // The calendar is everybody's, so a whole month of it must not out-pay the seven days
    // that exist only for a newcomer — otherwise the "welcome" track is not one.
    const month = calendar!.days.reduce((total, day) => total + energy(day.rewards), 0);
    const welcomeWeek = welcome!.days.reduce((total, day) => total + energy(day.rewards), 0);
    expect(month, 'a month of calendar against a week of welcome').toBeLessThan(welcomeWeek);
  });

  it('gives a newcomer boosts to spend on that bank', () => {
    // Energy with nothing to make it worth more is just a longer evening. The two arrive
    // together on purpose: the boost is what makes the first week's fights worth fighting.
    const hours =
      welcome!.days.reduce((total, day) => total + boostHours(day.rewards), 0) +
      PATH.filter((mission) => mission.arc <= 2).reduce(
        (total, mission) => total + boostHours(mission.rewards),
        0,
      );

    expect(hours, 'hours of XP boost inside the first week').toBeGreaterThanOrEqual(48);
  });
});

describe('the retired rations', () => {
  /**
   * They were a consumable nothing could consume — no screen lists them, no route spends
   * them — and five content families handed them out. Energy is a reward in its own right
   * now, so nothing should pay a ration ever again. The items stay published for anybody
   * still holding one; what must not come back is content that pays a new one.
   */
  const RETIRED = ['energy_pack_small', 'energy_pack_large'];

  const everyRewardMap = (): { where: string; rewards: Record<string, number> }[] => {
    const maps: { where: string; rewards: Record<string, number> }[] = [];
    for (const track of LOGIN_TRACKS) {
      for (const day of track.days)
        maps.push({ where: `${track.key} day ${day.day}`, rewards: day.rewards });
    }
    for (const mission of PATH) {
      maps.push({ where: `mission ${mission.key}`, rewards: mission.rewards });
    }
    for (const quest of QUESTS as { key: string; rewards: Record<string, number> }[]) {
      maps.push({ where: `quest ${quest.key}`, rewards: quest.rewards });
    }
    for (const event of EVENTS as {
      key: string;
      milestones?: { rewards: Record<string, number> }[];
    }[]) {
      for (const [index, milestone] of (event.milestones ?? []).entries()) {
        maps.push({ where: `event ${event.key} rung ${index}`, rewards: milestone.rewards });
      }
    }
    return maps;
  };

  it('is paid by no content at all', () => {
    const offenders = everyRewardMap()
      .filter((map) => RETIRED.some((key) => (map.rewards[key] ?? 0) > 0))
      .map((map) => map.where);
    expect(offenders, 'content still paying a ration nobody can use').toEqual([]);
  });

  it('is sold by no shop', () => {
    const offenders = (SHOPS as { key: string; offers: { key: string; refKey: string }[] }[])
      .flatMap((shop) => shop.offers.map((offer) => ({ shop: shop.key, offer })))
      .filter((entry) => RETIRED.includes(entry.offer.refKey))
      .map((entry) => `${entry.shop}:${entry.offer.key}`);
    expect(offenders, 'a stall charging crystals for an item that does nothing').toEqual([]);
  });
});

describe('the new reward scalars', () => {
  it('pays energy and boost hours in whole, positive amounts', () => {
    // Both are floored on the way in, so `energy: 0.5` publishes cleanly and pays nothing
    // — a reward that silently is not one. Whole numbers only, checked where they are
    // authored rather than where they are dropped.
    const bad: string[] = [];
    for (const track of LOGIN_TRACKS) {
      for (const day of track.days) {
        for (const key of ['energy', 'xpBoostHours'] as const) {
          const amount = day.rewards[key];
          if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) {
            bad.push(`${track.key} day ${day.day}: ${key}=${amount}`);
          }
        }
      }
    }
    for (const mission of PATH) {
      for (const key of ['energy', 'xpBoostHours'] as const) {
        const amount = mission.rewards[key];
        if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) {
          bad.push(`${mission.key}: ${key}=${amount}`);
        }
      }
    }
    expect(bad, 'fractional or empty energy and boost rewards').toEqual([]);
  });

  it('is what the shop now sells, through a kind that used to pay nothing', () => {
    // `currency` was a published offer kind with no payout branch: an offer authored with
    // it took the crystals and granted nothing. Nothing used it, so nobody was charged —
    // and the Bazaar's ration stall is the first, which is why this checks the key resolves.
    const currencyOffers = (SHOPS as { key: string; offers: { kind: string; refKey: string }[] }[])
      .flatMap((shop) => shop.offers)
      .filter((offer) => offer.kind === 'currency');

    expect(currencyOffers.length, 'the Bazaar sells at least one scalar').toBeGreaterThan(0);
    for (const offer of currencyOffers) {
      expect(isRewardScalar(offer.refKey), `${offer.refKey} is payable`).toBe(true);
    }
  });
});
