import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import type { BattleEvent } from '@mistvale/engine';
import { ROUTES, apiPath, tierFor, titanCounter, type Titan } from '@mistvale/shared';
import {
  contentEntries,
  contentRevisions,
  playerChampions,
  players,
  titanRecords,
} from '../../db/schema/index';
import { buildSeedContent } from '../../db/seed/seeders';
import * as contentRepo from '../../content/repo';
import { validateAndNormalise, type ContentSet } from '../../content/validate';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../../test/harness';
import { damageDealtTo } from './damage';

/**
 * The Solo Titan.
 *
 * Two halves worth testing, and they are different kinds of thing. The scoring is
 * arithmetic over an event log and is checked as arithmetic — including the two cases that
 * would quietly under- or over-pay a run. The rest is a *contract with the player*: a key
 * is spent when the fight opens and not refunded, a run is paid on any ending rather than
 * on a victory, and the record only ever climbs. Those are checked through the API,
 * because they are promises the routes make rather than functions.
 */

const dbUp = await isDatabaseAvailable();

// ── Scoring ────────────────────────────────────────────────────────────────

const hit = (
  id: number,
  from: 'ally' | 'enemy',
  to: 'ally' | 'enemy',
  amount: number,
  absorbed = 0,
): BattleEvent => ({
  id,
  type: 'damage',
  source: { side: from, slot: 0 },
  target: { side: to, slot: 0 },
  amount,
  absorbed,
  quality: 'normal',
  crit: false,
  hitIndex: 0,
  hits: 1,
  remainingHp: 0,
});

describe('damageDealtTo', () => {
  it('adds up what the team put into the Titan', () => {
    expect(
      damageDealtTo([hit(1, 'ally', 'enemy', 500), hit(2, 'ally', 'enemy', 300)], 'enemy'),
    ).toBe(800);
  });

  it('counts a blow a shield swallowed', () => {
    // The shield is the Titan's answer to the hit, not a reason to pretend it missed —
    // and a player watching a 40,000 hit vanish into a shield and score nothing would be
    // right to call that broken.
    expect(damageDealtTo([hit(1, 'ally', 'enemy', 0, 4_000)], 'enemy')).toBe(4_000);
  });

  it('ignores what the Titan did to the team', () => {
    expect(damageDealtTo([hit(1, 'enemy', 'ally', 9_000)], 'enemy')).toBe(0);
  });

  it('ignores damage the Titan did to itself', () => {
    // A reflect, a retaliation, a burn it lit — all `damage` events landing on the enemy
    // side, and none of them something the player did.
    expect(damageDealtTo([hit(1, 'enemy', 'enemy', 7_000)], 'enemy')).toBe(0);
  });

  it('ignores everything that is not a blow', () => {
    const log: BattleEvent[] = [
      { id: 1, type: 'turnStart', unit: { side: 'ally', slot: 0 }, turn: 1 },
      hit(2, 'ally', 'enemy', 120),
    ];
    expect(damageDealtTo(log, 'enemy')).toBe(120);
  });

  it('is zero for a run that never landed anything', () => {
    expect(damageDealtTo([], 'enemy')).toBe(0);
  });
});

// ── The API ────────────────────────────────────────────────────────────────

async function seedContent(app: FastifyInstance): Promise<void> {
  const seeds = buildSeedContent();
  const set: ContentSet = new Map();
  for (const seed of seeds) {
    set.set(seed.contentType, new Map(seed.entities.map((entity) => [entity.key, entity.data])));
  }
  const { result, normalised } = validateAndNormalise(set);
  expect(result.ok, JSON.stringify(result.errors.slice(0, 5))).toBe(true);

  const flattened = seeds.flatMap((seed) =>
    seed.entities.map((entity) => ({
      contentType: seed.contentType,
      key: entity.key,
      data: normalised.get(seed.contentType)?.get(entity.key) ?? entity.data,
    })),
  );

  await app.db.transaction(async (tx) => {
    await tx.delete(contentEntries);
    await tx.delete(contentRevisions);
    await contentRepo.replaceLiveContent(tx, flattened);
    await contentRepo.insertRevision(tx, {
      rev: 1,
      publishedBy: 'test',
      note: 'titan fixture',
      summary: { added: flattened.length, modified: 0, removed: 0 },
      snapshot: Object.fromEntries(
        seeds.map((seed) => [
          seed.contentType,
          Object.fromEntries(normalised.get(seed.contentType) ?? []),
        ]),
      ),
    });
  });

  await app.content.load();
  app.setContentRevision(app.content.rev);
}

describe.skipIf(!dbUp)('the Titan API', () => {
  let app: FastifyInstance;
  let cookie: string;
  let playerId: string;

  beforeAll(async () => {
    app = await buildTestApp();
    await seedContent(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
    const registered = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('titan'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  async function readTitan(): Promise<Titan> {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.titan.overview) });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data.titan as Titan;
  }

  async function setLevel(level: number): Promise<void> {
    await app.db.update(players).set({ level }).where(eq(players.id, playerId));
  }

  /**
   * A real champion to fight with.
   *
   * Not a nicety: `start` checks the team's *shape* before it reaches any of the Titan's
   * own gates, so a run posted with an empty team is refused for the wrong reason and a
   * test written that way passes whatever the key logic does.
   */
  async function team(): Promise<string[]> {
    const offered = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
    const starters = offered.json().data.starters as { key: string }[];
    const chosen = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.chooseStarter),
      payload: { championKey: starters[0]!.key },
    });
    expect(chosen.statusCode, chosen.body).toBe(200);
    const roster = chosen.json().data.champions as { id: string }[];
    return [roster[0]!.id];
  }

  const KEEP = 'titan_valewurm';

  it('lists the Titan with its ladder, shut below its level', async () => {
    const titan = await readTitan();
    expect(titan.titans).toHaveLength(1);
    const keep = titan.titans[0]!;
    expect(keep.dungeonKey).toBe(KEEP);
    expect(keep.open).toBe(false);
    expect(keep.lockedReason).toMatch(/level 16/i);
    // The ladder is visible while the door is shut: what is down there is the reason to
    // get to level 16, and a locked screen that shows nothing teaches nobody anything.
    expect(keep.tiers.length).toBeGreaterThan(0);
    expect(keep.tiers.every((tier) => !tier.reached)).toBe(true);
  });

  it('opens at its level, with a full set of keys and no record', async () => {
    await setLevel(16);
    const keep = (await readTitan()).titans[0]!;
    expect(keep.open).toBe(true);
    expect(keep.lockedReason).toBeNull();
    expect(keep.keysLeft).toBe(keep.keysPerDay);
    expect(keep.bestDamage).toBe(0);
    expect(keep.runs).toBe(0);
  });

  it('counts a key against the keep it was spent on, not against the account', async () => {
    // Two Titans must not share an allowance: a second one published in Admin would
    // silently halve the first one's attempts.
    await setLevel(16);
    await app.db
      .update(players)
      .set({
        dailyCounters: { [titanCounter(KEEP)]: 1 },
        dailyCountersDay: (await readTitan()).today,
      })
      .where(eq(players.id, playerId));

    const keep = (await readTitan()).titans[0]!;
    expect(keep.keysLeft).toBe(keep.keysPerDay - 1);
  });

  it('forgets yesterday’s keys without a reset job', async () => {
    await setLevel(16);
    await app.db
      .update(players)
      .set({ dailyCounters: { [titanCounter(KEEP)]: 99 }, dailyCountersDay: '2020-01-01' })
      .where(eq(players.id, playerId));

    const keep = (await readTitan()).titans[0]!;
    expect(keep.keysLeft).toBe(keep.keysPerDay);
  });

  it('reads a rung as reached from the best run rather than the last one', async () => {
    await setLevel(16);
    const before = (await readTitan()).titans[0]!;
    const rung = before.tiers[0]!;

    await app.db.insert(titanRecords).values({
      playerId,
      dungeonKey: KEEP,
      bestDamage: rung.damage,
      bestTierKey: rung.key,
      // A later, worse run. The rung stays reached: it is a record, not a mood.
      lastDamage: 1,
      runs: 4,
    });

    const keep = (await readTitan()).titans[0]!;
    expect(keep.bestDamage).toBe(rung.damage);
    expect(keep.lastDamage).toBe(1);
    expect(keep.runs).toBe(4);
    expect(keep.tiers[0]!.reached).toBe(true);
    expect(keep.tiers[1]!.reached).toBe(false);
  });

  it('refuses a run below the Titan’s level, without spending a key', async () => {
    await setLevel(10);
    const stageKey = (await readTitan()).titans[0]!.stageKey;
    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.start),
      payload: { mode: 'titan', stageKey, team: await team(), actionId: crypto.randomUUID() },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.json().error.message).toMatch(/level 16/i);

    const keep = (await readTitan()).titans[0]!;
    expect(keep.keysLeft).toBe(keep.keysPerDay);
  });

  it('refuses a run with no keys left', async () => {
    const fighters = await team();
    await setLevel(16);
    const titan = await readTitan();
    const keep = titan.titans[0]!;
    await app.db
      .update(players)
      .set({
        dailyCounters: { [titanCounter(KEEP)]: keep.keysPerDay },
        dailyCountersDay: titan.today,
      })
      .where(eq(players.id, playerId));

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.start),
      payload: {
        mode: 'titan',
        stageKey: keep.stageKey,
        team: fighters,
        actionId: crypto.randomUUID(),
      },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.json().error.message).toMatch(/no keys left/i);
  });

  it('pays a run that was lost, at the rung it reached, and records it', async () => {
    // The promise the whole mode rests on. A Titan is authored so nobody wins, so a payout
    // keyed on victory would mean a mode that never pays — and the run that ends with the
    // team on the floor is the *ordinary* one, not the failure case.
    const fighters = await team();
    // Grown enough to actually mark it. A level-1 starter does *nothing* to a Titan with
    // 1,100 defence — which is correct, and is the empty-handed case the test below is
    // about; it is not what this one is checking.
    await app.db
      .update(playerChampions)
      .set({ level: 50, rank: 6, ascension: 4 })
      .where(eq(playerChampions.id, fighters[0]!));
    await setLevel(16);
    const keep = (await readTitan()).titans[0]!;

    const started = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.start),
      payload: {
        mode: 'titan',
        stageKey: keep.stageKey,
        team: fighters,
        actionId: crypto.randomUUID(),
      },
    });
    expect(started.statusCode, started.body).toBe(200);
    const battleId = started.json().data.id as string;

    // One starter against a Titan settles quickly, either way.
    const resolved = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.action(battleId)),
      payload: { auto: true, actionId: crypto.randomUUID() },
    });
    expect(resolved.statusCode, resolved.body).toBe(200);
    const battle = resolved.json().data as {
      status: string;
      outcome: string;
      rewards: {
        titan: {
          damage: number;
          tierKey: string | null;
          rewards: Record<string, number>;
          personalBest: boolean;
        } | null;
      };
    };
    expect(battle.status).toBe('finished');
    // Anything but a victory: the Valewurm has more health than a starter can spend.
    expect(battle.outcome).not.toBe('victory');

    const run = battle.rewards.titan;
    expect(run, 'a finished Titan run reports what it managed').not.toBeNull();
    expect(run!.damage).toBeGreaterThan(0);
    expect(run!.personalBest).toBe(true);
    // The payout is the *rule* applied to what the run actually managed, rather than a
    // rung this test hard-codes — so it goes on proving the same thing after a retune of
    // either the ladder or the Titan.
    const paid = tierFor(run!.damage, keep.tiers as never);
    expect(run!.tierKey).toBe(paid?.key ?? null);
    expect(run!.rewards).toEqual(paid?.rewards ?? {});

    // And the record is the run, read back through the screen's own route.
    const after = (await readTitan()).titans[0]!;
    expect(after.bestDamage).toBe(run!.damage);
    expect(after.lastDamage).toBe(run!.damage);
    expect(after.runs).toBe(1);
    expect(after.keysLeft).toBe(keep.keysPerDay - 1);
  });

  it('records a run that reached no rung, and pays it nothing', async () => {
    // A key spent on a team that cannot scratch it is a lesson rather than a payout. It
    // still has to be *recorded*, because "you did 400" is the feedback that makes the next
    // attempt a decision rather than a guess.
    const fighters = await team();
    await setLevel(16);
    const keep = (await readTitan()).titans[0]!;

    const started = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.start),
      payload: {
        mode: 'titan',
        stageKey: keep.stageKey,
        team: fighters,
        actionId: crypto.randomUUID(),
      },
    });
    expect(started.statusCode, started.body).toBe(200);
    const resolved = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.action(started.json().data.id as string)),
      payload: { auto: true, actionId: crypto.randomUUID() },
    });
    const run = (
      resolved.json().data as { rewards: { titan: { tierKey: string | null; rewards: object } } }
    ).rewards.titan;
    expect(run.tierKey).toBeNull();
    expect(run.rewards).toEqual({});
    expect((await readTitan()).titans[0]!.runs).toBe(1);
  });

  it('spends the key when the run opens, and a retreat does not hand it back', async () => {
    // An attempt is the resource. Refunding a retreat would make it a free look at the
    // Titan's opening moves, which is the one thing a fixed wall must not offer.
    const fighters = await team();
    await setLevel(16);
    const keep = (await readTitan()).titans[0]!;

    const started = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.start),
      payload: {
        mode: 'titan',
        stageKey: keep.stageKey,
        team: fighters,
        actionId: crypto.randomUUID(),
      },
    });
    expect(started.statusCode, started.body).toBe(200);
    expect((await readTitan()).titans[0]!.keysLeft).toBe(keep.keysPerDay - 1);

    const battleId = started.json().data.id as string;
    const left = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.retreat(battleId)),
      payload: { actionId: crypto.randomUUID() },
    });
    expect(left.statusCode, left.body).toBe(200);

    const after = (await readTitan()).titans[0]!;
    expect(after.keysLeft).toBe(keep.keysPerDay - 1);
    // And it is scored rather than voided: damage only accumulates, so walking out early
    // can only lower the number — there is nothing for a forfeit to protect.
    expect(after.runs).toBe(1);
  });
});

describe('the ladder', () => {
  it('pays the rung a run reached, from the published Titan', () => {
    const seeds = buildSeedContent();
    const keep = seeds
      .find((seed) => seed.contentType === 'dungeon')!
      .entities.find((entity) => entity.key === 'titan_valewurm')!.data as {
      titan: { tiers: { key: string; damage: number }[] };
    };
    const tiers = keep.titan.tiers as never;
    const bottom = keep.titan.tiers[0]!;
    expect(tierFor(bottom.damage - 1, tiers)).toBeNull();
    expect(tierFor(bottom.damage, tiers)?.key).toBe(bottom.key);
  });
});
