import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ROUTES, apiPath } from '@mistvale/shared';
import { battleSessions, economyLog, summonHistory } from '../db/schema/index';
import {
  buildTestApp,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../test/harness';
import { readActivity } from './activity';

/**
 * The dashboard's activity counters (gap G3).
 *
 * Two things about them are easy to get wrong and would be invisible for a long time: the
 * **windows**, since a figure labelled "today" that quietly counts the week is a figure
 * nobody can act on, and the **economy split**, since faucet and sink are folded out of a
 * JSON object rather than read from columns.
 */

const dbUp = await isDatabaseAvailable();
const DAY_AGO = () => new Date(Date.now() - 26 * 60 * 60 * 1000);
const WEEK_AGO = () => new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

describe.skipIf(!dbUp)('the dashboard activity counters', () => {
  let app: FastifyInstance;
  let playerId: string;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
    // Registered rather than inserted: a player row hangs off an account, and the rows
    // below hang off the player. Going through the door the game uses is the only way to
    // get a subject these three tables will accept.
    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('activity'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    playerId = (response.json().data as { player: { id: string } }).player.id;
  });

  const battle = (mode: string, outcome: string | null, createdAt?: Date) => ({
    playerId,
    mode,
    stageKey: 'c01_s1_normal',
    contentRev: 1,
    seed: 1,
    state: {},
    outcome,
    status: outcome ? 'finished' : 'active',
    ...(createdAt ? { createdAt } : {}),
  });

  it('counts a day inside the week rather than instead of it', async () => {
    await app.db
      .insert(battleSessions)
      .values([
        battle('campaign', 'victory'),
        battle('campaign', 'defeat'),
        battle('campaign', 'victory', DAY_AGO()),
        battle('campaign', 'victory', WEEK_AGO()),
      ]);

    const activity = await readActivity(app.db);
    // Two today, three in the week (the eight-day-old one is outside both).
    expect(activity.battles.day).toBe(2);
    expect(activity.battles.week).toBe(3);
    expect(activity.battles.wonDay).toBe(1);
  });

  it('splits battles by mode, busiest first', async () => {
    await app.db
      .insert(battleSessions)
      .values([
        battle('campaign', 'victory'),
        battle('campaign', 'victory'),
        battle('arena', 'defeat'),
      ]);

    const activity = await readActivity(app.db);
    expect(activity.battles.byMode.map((row) => row.mode)).toEqual(['campaign', 'arena']);
    expect(activity.battles.byMode[0]?.day).toBe(2);
  });

  const pull = (rarity: string, fromMercy = false, createdAt?: Date) => ({
    playerId,
    poolKey: 'gleaming',
    sigilItemKey: 'sigil_gleaming',
    championKey: 'anuria',
    rarity,
    fromMercy,
    ...(createdAt ? { createdAt } : {}),
  });

  it('reads summons by rarity over the week, where a Legendary is not always zero', async () => {
    await app.db
      .insert(summonHistory)
      .values([
        pull('rare'),
        pull('rare'),
        pull('legendary', true, DAY_AGO()),
        pull('epic', false, WEEK_AGO()),
      ]);

    const activity = await readActivity(app.db);
    expect(activity.summons.day).toBe(2);
    expect(activity.summons.week).toBe(3);
    expect(activity.summons.byRarity).toEqual([
      { rarity: 'rare', week: 2 },
      { rarity: 'legendary', week: 1 },
    ]);
    expect(activity.summons.mercyWeek).toBe(1);
  });

  it('splits the economy into faucet and sink rather than netting them off', async () => {
    // A net of zero is produced both by a healthy economy and by nothing happening at all,
    // and those want very different responses from an operator.
    await app.db.insert(economyLog).values([
      { playerId, source: 'battle:c01_s1', deltas: { silver: 1200, crystals: 5 } },
      { playerId, source: 'shop', deltas: { silver: -1200 } },
      { playerId, source: 'summon', deltas: { crystals: -5 } },
    ]);

    const activity = await readActivity(app.db);
    expect(activity.economy).toEqual([
      { currency: 'silver', faucet: 1200, sink: 1200 },
      { currency: 'crystals', faucet: 5, sink: 5 },
    ]);
  });

  it('leaves yesterday out of the economy, which is a day rather than a week', async () => {
    await app.db.insert(economyLog).values([
      { playerId, source: 'battle', deltas: { silver: 10 } },
      { playerId, source: 'battle', deltas: { silver: 999 }, createdAt: DAY_AGO() },
    ]);
    const activity = await readActivity(app.db);
    expect(activity.economy).toEqual([{ currency: 'silver', faucet: 10, sink: 0 }]);
  });

  it('reports zeroes rather than throwing on a game nobody has played', async () => {
    // The state a fresh install is in, and the one a dashboard has to survive.
    const activity = await readActivity(app.db);
    expect(activity.battles).toEqual({ day: 0, week: 0, wonDay: 0, byMode: [] });
    expect(activity.summons.week).toBe(0);
    expect(activity.economy).toEqual([]);
  });
});
