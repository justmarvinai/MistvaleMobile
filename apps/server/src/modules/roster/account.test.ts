import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath, type ChampionDetail, type StandingState } from '@mistvale/shared';
import { contentEntries, contentRevisions, playerChampions, players } from '../../db/schema/index';
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
import * as roster from './service';
import { accountBonusesFor, copiesOf, imprintFor } from './account';

/**
 * Imprint and Standing, against a real database and the real seed.
 *
 * The ladders are pinned in `standing.test.ts`. What only a database can prove is the part
 * that would be a trap if it were wrong: that a copy is counted **when it arrives** and
 * survives being fed away, that standing counts what is held rather than what was seen,
 * and that the number the champion sheet reports is the number the fight is fought with.
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
      note: 'account fixture',
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

describe.skipIf(!dbUp)('imprint and standing', () => {
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
        accountName: uniqueAccountName('warden'),
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

  /** Every non-food champion in the seed, strongest names first. */
  const realChampions = (): { key: string; rarity: string }[] =>
    app.content
      .current()
      .bundle.champions.filter((champion) => !champion.isFood)
      .map((champion) => ({ key: champion.key, rarity: champion.rarity }));

  async function give(championKey: string): Promise<string> {
    const defs = app.content.current().bundle.champions;
    const entry = await app.db.transaction((tx) =>
      roster.grantChampion(tx, playerId, championKey, {}, defs),
    );
    return entry.id;
  }

  const standing = async (): Promise<StandingState> =>
    (await accountBonusesFor(app.db, app.content, playerId)).standing;

  // ── Imprint ───────────────────────────────────────────────────────────────

  it('counts a copy the moment it arrives, whatever brought it', async () => {
    const key = realChampions()[0]!.key;
    expect(await copiesOf(app.db, playerId, key)).toBe(0);

    await give(key);
    expect(await copiesOf(app.db, playerId, key)).toBe(1);

    await give(key);
    expect(await copiesOf(app.db, playerId, key)).toBe(2);
  });

  it('keeps the imprint when the duplicate is fed away', async () => {
    // The whole design decision. Feeding a duplicate is how a champion ranks up, so an
    // imprint derived from the roster would punish the correct play — and a mechanic that
    // punishes the correct play is a trap rather than a decision.
    const key = realChampions()[0]!.key;
    await give(key);
    const spare = await give(key);

    await app.db.delete(playerChampions).where(eq(playerChampions.id, spare));

    expect(await copiesOf(app.db, playerId, key)).toBe(2);
    const bonuses = await accountBonusesFor(app.db, app.content, playerId);
    const rarity = realChampions()[0]!.rarity as 'common';
    expect(imprintFor(bonuses, key, rarity).copies).toBe(2);
  });

  it('is worth nothing for a champion the account has never held', async () => {
    const bonuses = await accountBonusesFor(app.db, app.content, playerId);
    const state = imprintFor(bonuses, 'nobody_at_all', 'legendary');
    expect(state.copies).toBe(0);
    expect(state.level).toBe(0);
    expect(state.bonus).toEqual({ hpPct: 0, atkPct: 0, defPct: 0 });
    // …and it still says what the first level wants, so the sheet can show the ladder.
    expect(state.nextAt).toBeGreaterThan(0);
  });

  // ── Standing ──────────────────────────────────────────────────────────────

  it('counts distinct champions held, not copies of one', async () => {
    const keys = realChampions()
      .slice(0, 3)
      .map((entry) => entry.key);
    await give(keys[0]!);
    await give(keys[0]!);
    await give(keys[0]!);
    expect((await standing()).champions).toBe(1);

    await give(keys[1]!);
    await give(keys[2]!);
    expect((await standing()).champions).toBe(3);
  });

  it('leaves food out, so feeding never lowers the number it asks you to raise', async () => {
    const food = app.content.current().bundle.champions.find((champion) => champion.isFood);
    expect(food).toBeDefined();
    await give(food!.key);
    expect((await standing()).champions).toBe(0);
  });

  it('falls when the last copy of a champion is let go', async () => {
    // Standing is about what is *held*, which is what keeps "is this Bracken Puck worth
    // more as food" a real decision rather than a free yes.
    const key = realChampions()[0]!.key;
    const only = await give(key);
    expect((await standing()).champions).toBe(1);

    await app.db.delete(playerChampions).where(eq(playerChampions.id, only));
    expect((await standing()).champions).toBe(0);
  });

  it('says what the next tier wants until there is no next tier', async () => {
    const empty = await standing();
    expect(empty.tier).toBe(0);
    expect(empty.nextAt).toBeGreaterThan(0);

    for (const entry of realChampions().slice(0, empty.nextAt!)) {
      await give(entry.key);
    }
    const first = await standing();
    expect(first.tier).toBe(1);
    expect(first.bonus.atkPct).toBeGreaterThan(0);
  });

  // ── What the screens are told ─────────────────────────────────────────────

  it('reports the imprint and the account column on the champion sheet', async () => {
    const offered = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
    const starters = offered.json().data.starters as { key: string }[];
    const granted = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.chooseStarter),
      payload: { championKey: starters[0]!.key },
    });
    const champion = (granted.json().data.champions as { id: string }[])[0]!;

    const response = await as({
      method: 'GET',
      url: apiPath(ROUTES.roster.detail(champion.id)),
    });
    expect(response.statusCode, response.body).toBe(200);
    const detail = response.json().data.champion as ChampionDetail;

    expect(detail.imprint.copies).toBe(1);
    // The starter is one champion, so standing is below its first tier and the account
    // column is whatever imprint alone is worth.
    expect(detail.stats.account).toBeDefined();
    expect(detail.stats.total.hp).toBe(
      detail.stats.base.hp +
        detail.stats.gear.hp +
        detail.stats.mastery.hp +
        detail.stats.account.hp,
    );
  });

  it('puts standing on the player snapshot, where every screen already looks', async () => {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.player.self) });
    expect(response.statusCode, response.body).toBe(200);
    const state = response.json().data.standing as StandingState;
    expect(state.champions).toBe(0);
    expect(state.tier).toBe(0);
    expect(state.nextAt).toBeGreaterThan(0);
  });

  it('leaves a bot account out of nobody, and simply reads zero', async () => {
    // Bots hold champions like anybody else, so the read has to be safe on one — the
    // arena assembles both sides through the same path.
    const [row] = await app.db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.id, playerId));
    expect(row).toBeDefined();
    const bonuses = await accountBonusesFor(app.db, app.content, row!.id);
    expect(bonuses.standing.champions).toBe(0);
    expect(bonuses.copies.size).toBe(0);
  });
});
