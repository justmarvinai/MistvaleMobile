import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { ROUTES, apiPath, type ExpeditionState } from '@mistvale/shared';
import {
  contentEntries,
  contentRevisions,
  playerExpeditions,
  players,
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
import * as roster from '../roster/service';
import { assertAvailable, awayChampionIds } from './expeditions';

/**
 * Expeditions, against a real database and the real seed.
 *
 * The interesting half is not the timer — it is the **unavailability**, which is the whole
 * reason an expedition costs anything. So what is proven here is that a champion who is
 * away cannot be fielded or eaten, that they come back when recalled, and that a finished
 * run pays exactly once however many times the button is pressed.
 */

const dbUp = await isDatabaseAvailable();

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
      note: 'expedition fixture',
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

describe.skipIf(!dbUp)('expeditions', () => {
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
        accountName: uniqueAccountName('sender'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
    // Expeditions open at level 11; every test here is about what happens after that.
    await app.db.update(players).set({ level: 20 }).where(eq(players.id, playerId));
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const actionId = (label: string): string => `${label}-${Math.random().toString(36).slice(2, 12)}`;

  async function give(count: number): Promise<string[]> {
    const defs = app.content.current().bundle.champions.filter((champion) => !champion.isFood);
    const ids: string[] = [];
    for (const def of defs.slice(0, count)) {
      const entry = await app.db.transaction((tx) =>
        roster.grantChampion(tx, playerId, def.key, {}, defs),
      );
      ids.push(entry.id);
    }
    return ids;
  }

  const state = async (): Promise<ExpeditionState> => {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.expeditions.state) });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data.expeditions as ExpeditionState;
  };

  const dispatch = async (key: string, championIds: readonly string[]) =>
    as({
      method: 'POST',
      url: apiPath(ROUTES.expeditions.dispatch(key)),
      payload: { championIds, actionId: actionId('send') },
    });

  /** Winds a run's clock back so it is ready, without waiting four hours. */
  async function finish(runId: string): Promise<void> {
    await app.db
      .update(playerExpeditions)
      .set({ readyAt: sql`now() - interval '1 minute'` })
      .where(eq(playerExpeditions.id, runId));
  }

  // ── Sending ───────────────────────────────────────────────────────────────

  it('offers what the account has reached, and refuses a party of the wrong size', async () => {
    const [one] = await give(1);
    const offers = (await state()).offers;
    expect(offers.length).toBeGreaterThan(0);

    const patrol = offers.find((offer) => offer.partySize === 1);
    expect(patrol).toBeDefined();

    const wrong = offers.find((offer) => offer.partySize > 1);
    expect(wrong).toBeDefined();
    const response = await dispatch(wrong!.key, [one!]);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/party of \d+/i);
  });

  it('sends a party, and reports them away', async () => {
    const [one] = await give(1);
    const patrol = (await state()).offers.find((offer) => offer.partySize === 1)!;

    const response = await dispatch(patrol.key, [one!]);
    expect(response.statusCode, response.body).toBe(200);

    const after = response.json().data.expeditions as ExpeditionState;
    expect(after.running).toHaveLength(1);
    expect(after.awayChampionIds).toEqual([one]);
    expect(after.slotsUsed).toBe(1);
    // Not ready the moment it leaves, whatever the client's clock says.
    expect(after.running[0]!.ready).toBe(false);
  });

  it('prices the yield off the favours the party actually met', async () => {
    const [one] = await give(1);
    const patrol = (await state()).offers.find((offer) => offer.partySize === 1)!;
    await dispatch(patrol.key, [one!]);

    const run = (await state()).running[0]!;
    const met = run.favours.filter((favour) => favour.met);
    const expected = met.reduce((sum, favour) => sum + favour.bonusPct, 0);
    const base = patrol.rewards['silver'] ?? 0;
    expect(run.rewards['silver']).toBe(Math.max(1, Math.floor((base * (100 + expected)) / 100)));
  });

  it('refuses to send the same champion twice, or a champion already away', async () => {
    const [one, two] = await give(2);
    const offers = (await state()).offers;
    const pair = offers.find((offer) => offer.partySize === 2)!;

    const twice = await dispatch(pair.key, [one!, one!]);
    expect(twice.statusCode).toBe(400);

    const patrol = offers.find((offer) => offer.partySize === 1)!;
    expect((await dispatch(patrol.key, [one!])).statusCode).toBe(200);

    const again = await dispatch(pair.key, [one!, two!]);
    expect(again.statusCode).toBe(400);
    expect(again.json().error.message).toMatch(/away on an expedition/i);
  });

  it('stops at the slot cap', async () => {
    const ids = await give(6);
    const patrol = (await state()).offers.find((offer) => offer.partySize === 1)!;
    const slots = (await state()).slots;

    for (let sent = 0; sent < slots; sent += 1) {
      expect((await dispatch(patrol.key, [ids[sent]!])).statusCode).toBe(200);
    }
    const overflow = await dispatch(patrol.key, [ids[slots]!]);
    expect(overflow.statusCode).toBe(400);
    expect(overflow.json().error.message).toMatch(new RegExp(`${slots} expeditions`));

    // …and the offers say so before the button is pressed.
    expect((await state()).offers.every((offer) => offer.blockedReason !== null)).toBe(true);
  });

  // ── Unavailability, which is the whole point ──────────────────────────────

  it('will not let an away champion be fed away', async () => {
    const [keeper, food] = await give(2);
    const patrol = (await state()).offers.find((offer) => offer.partySize === 1)!;
    await dispatch(patrol.key, [food!]);

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.levelUp(keeper!)),
      payload: { foodIds: [food], brews: 0, actionId: actionId('feed') },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/away on an expedition/i);
  });

  it('will not let an away champion be released', async () => {
    const [one] = await give(1);
    const patrol = (await state()).offers.find((offer) => offer.partySize === 1)!;
    await dispatch(patrol.key, [one!]);

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.release),
      payload: { ids: [one], actionId: actionId('release') },
    });
    expect(response.statusCode).toBe(400);
  });

  it('names the away champions in one place, so nothing has to work it out twice', async () => {
    const ids = await give(2);
    const pair = (await state()).offers.find((offer) => offer.partySize === 2)!;
    await dispatch(pair.key, ids);

    const away = await awayChampionIds(app.db, playerId);
    expect([...away].sort()).toEqual([...ids].sort());
    await expect(assertAvailable(app.db, playerId, ids)).rejects.toThrow(/away/i);
    // An empty list is not an error — every guard calls it, including on a borrowed team.
    await expect(assertAvailable(app.db, playerId, [])).resolves.toBeUndefined();
  });

  // ── Coming home ───────────────────────────────────────────────────────────

  it('refuses a claim before they are back', async () => {
    const [one] = await give(1);
    const patrol = (await state()).offers.find((offer) => offer.partySize === 1)!;
    await dispatch(patrol.key, [one!]);
    const run = (await state()).running[0]!;

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.expeditions.claim(run.id)),
      payload: { actionId: actionId('claim') },
    });
    // `COOLDOWN` is the vocabulary's word for "wait", and it maps to 429 here as it does
    // everywhere else — consistent beats clever, even where 409 would read better.
    expect(response.statusCode).toBe(429);
    expect(response.json().error.message).toMatch(/not back yet/i);
  });

  it('pays what it promised, brings them home, and pays only once', async () => {
    const [one] = await give(1);
    const patrol = (await state()).offers.find((offer) => offer.partySize === 1)!;
    await dispatch(patrol.key, [one!]);
    const run = (await state()).running[0]!;
    await finish(run.id);

    const before = (
      await app.db.select({ silver: players.silver }).from(players).where(eq(players.id, playerId))
    )[0]!.silver;

    const claimed = await as({
      method: 'POST',
      url: apiPath(ROUTES.expeditions.claim(run.id)),
      payload: { actionId: actionId('claim') },
    });
    expect(claimed.statusCode, claimed.body).toBe(200);
    const body = claimed.json().data as { championIds: string[]; state: ExpeditionState };
    expect(body.championIds).toEqual([one]);
    expect(body.state.running).toHaveLength(0);
    expect(body.state.awayChampionIds).toEqual([]);

    const after = (
      await app.db.select({ silver: players.silver }).from(players).where(eq(players.id, playerId))
    )[0]!.silver;
    expect(after - before).toBe(run.rewards['silver']);

    // The row *is* the receipt, so a second press finds nothing rather than paying again.
    const twice = await as({
      method: 'POST',
      url: apiPath(ROUTES.expeditions.claim(run.id)),
      payload: { actionId: actionId('claim') },
    });
    expect(twice.statusCode).toBe(404);
  });

  it('recalls a party early for nothing, and only while they are still out', async () => {
    const [one] = await give(1);
    const patrol = (await state()).offers.find((offer) => offer.partySize === 1)!;
    await dispatch(patrol.key, [one!]);
    const run = (await state()).running[0]!;

    const before = (
      await app.db.select({ silver: players.silver }).from(players).where(eq(players.id, playerId))
    )[0]!.silver;

    const recalled = await as({
      method: 'POST',
      url: apiPath(ROUTES.expeditions.recall(run.id)),
      payload: {},
    });
    expect(recalled.statusCode, recalled.body).toBe(200);
    expect(recalled.json().data.championIds).toEqual([one]);

    const after = (
      await app.db.select({ silver: players.silver }).from(players).where(eq(players.id, playerId))
    )[0]!.silver;
    expect(after).toBe(before);
    expect((await state()).awayChampionIds).toEqual([]);
  });

  it('refuses to recall a finished run, which would throw away what it earned', async () => {
    const [one] = await give(1);
    const patrol = (await state()).offers.find((offer) => offer.partySize === 1)!;
    await dispatch(patrol.key, [one!]);
    const run = (await state()).running[0]!;
    await finish(run.id);

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.expeditions.recall(run.id)),
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/already back/i);
  });

  // ── The gate ──────────────────────────────────────────────────────────────

  it('is shut, and empty, below its unlock level', async () => {
    await app.db.update(players).set({ level: 3 }).where(eq(players.id, playerId));
    const shut = await state();
    expect(shut.offers).toEqual([]);
    expect(shut.slots).toBe(0);

    const [one] = await give(1);
    const response = await dispatch('exp_mist_patrol', [one!]);
    expect(response.statusCode).toBe(403);
  });
});
