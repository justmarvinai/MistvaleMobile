import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath, type PublicProfile } from '@mistvale/shared';
import {
  arenaState,
  contentEntries,
  contentRevisions,
  playerChampions,
  players,
  stageProgress,
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
import { grantChampion } from '../roster/service';
import * as profile from './service';

/**
 * The public profile card.
 *
 * Two things are pinned here above all: that the card shows what somebody *did* and
 * **never what they hold** — a leak of the wallet or the account name would be a privacy
 * bug rather than a cosmetic one — and that the showcase can only ever name champions the
 * owner actually owns.
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
      note: 'profile fixture',
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

describe.skipIf(!dbUp)('the profile card', () => {
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
        accountName: uniqueAccountName('card'),
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

  const ctx = () => ({ db: app.db, content: app.content });
  const read = (id = playerId): Promise<PublicProfile> => profile.card(ctx(), id);

  /** Hands the account some champions and returns their roster ids. */
  async function give(...keys: string[]): Promise<string[]> {
    const ids: string[] = [];
    await app.db.transaction(async (tx) => {
      for (const key of keys) {
        const entry = await grantChampion(tx, playerId, key);
        ids.push(entry.id);
      }
    });
    return ids;
  }

  // ── What it shows ─────────────────────────────────────────────────────────

  it('answers for a fresh account without inventing anything', async () => {
    const card = await read();

    expect(card.playerId).toBe(playerId);
    expect(card.level).toBe(1);
    expect(card.title).toBeNull();
    // Never entered the Arena, so there is no standing rather than a rating of zero.
    expect(card.arena).toBeNull();
    expect(card.furthestStage).toBeNull();
    expect(card.stars).toBe(0);
    expect(card.championsTotal).toBeGreaterThan(0);
    expect(Date.parse(card.joinedAt)).not.toBeNaN();
  });

  it('shows nothing a player holds — only what they have done', async () => {
    await app.db
      .update(players)
      .set({ silver: 999_999, crystals: 4_242 })
      .where(eq(players.id, playerId));

    const card = await read();
    const serialised = JSON.stringify(card);

    // The card is public. A wallet on it would be a privacy bug, not a design choice.
    expect(serialised).not.toContain('999999');
    expect(serialised).not.toContain('4242');
    expect(Object.keys(card)).not.toContain('silver');
    expect(Object.keys(card)).not.toContain('crystals');
    expect(Object.keys(card)).not.toContain('accountName');
    // And nothing that would mark an account as a bot, per the ladder's standing rule.
    expect(Object.keys(card)).not.toContain('isBot');
  });

  it('counts champions against the collectable roster, ignoring food', async () => {
    const bundle = app.content.current().bundle;
    const food = bundle.champions.find((def) => def.isFood)!;
    const real = bundle.champions.filter((def) => !def.isFood).slice(0, 2);
    await give(food.key, ...real.map((def) => def.key));

    const card = await read();
    expect(card.championsOwned).toBe(2);
    expect(card.championsTotal).toBe(bundle.champions.filter((def) => !def.isFood).length);
  });

  it('names the furthest campaign stage the way a player would', async () => {
    const bundle = app.content.current().bundle;
    const chapter = bundle.campaignChapters.find((def) => def.number === 1)!;
    const stage = bundle.stages.find(
      (def) => def.parentKey === chapter.key && def.number === 3 && def.difficulty === 'normal',
    )!;

    await app.db.insert(stageProgress).values({
      playerId,
      stageKey: stage.key,
      parentKey: stage.parentKey,
      mode: 'campaign',
      stars: 3,
      clears: 1,
    });

    const card = await read();
    expect(card.furthestStage).toBe('1-3');
    expect(card.stars).toBe(3);
  });

  it('ranks a harder stage above a deeper one', async () => {
    const bundle = app.content.current().bundle;
    const deepNormal = bundle.stages.find(
      (def) => def.mode === 'campaign' && def.number === 7 && def.difficulty === 'normal',
    )!;
    const shallowHard = bundle.stages.find(
      (def) => def.mode === 'campaign' && def.number === 1 && def.difficulty === 'hard',
    )!;

    await app.db.insert(stageProgress).values([
      {
        playerId,
        stageKey: deepNormal.key,
        parentKey: deepNormal.parentKey,
        mode: 'campaign',
        stars: 3,
        clears: 1,
      },
      {
        playerId,
        stageKey: shallowHard.key,
        parentKey: shallowHard.parentKey,
        mode: 'campaign',
        stars: 1,
        clears: 1,
      },
    ]);

    // Hard 1-1 is further than Normal 12-7: it is the wall that gates everything after it.
    expect((await read()).furthestStage).toMatch(/Hard$/);
  });

  it('leaves a stage nobody actually cleared out of it', async () => {
    const stage = app.content.current().bundle.stages.find((def) => def.mode === 'campaign')!;
    await app.db.insert(stageProgress).values({
      playerId,
      stageKey: stage.key,
      parentKey: stage.parentKey,
      mode: 'campaign',
      stars: 0,
      clears: 0,
    });
    expect((await read()).furthestStage).toBeNull();
  });

  it('reports arena standing and where it sits on the ladder', async () => {
    await app.db.insert(arenaState).values({ playerId, rating: 1_400 });

    const card = await read();
    expect(card.arena?.rating).toBe(1_400);
    expect(card.arena?.tier).toBeTruthy();
    // Alone on the ladder, so first on it.
    expect(card.arena?.position).toBe(1);
  });

  // ── The showcase ──────────────────────────────────────────────────────────

  it('falls back to the strongest champions when nobody has chosen', async () => {
    const bundle = app.content.current().bundle;
    const keys = bundle.champions.filter((def) => !def.isFood).slice(0, 6);
    await give(...keys.map((def) => def.key));

    const card = await read();
    expect(card.showcase.length).toBe(4);
    // Strongest first, so a card is never blank and never arbitrary.
    const powers = card.showcase.map((champion) => champion.power);
    expect([...powers].sort((a, b) => b - a)).toEqual(powers);
  });

  it('keeps the owner’s order once they have chosen', async () => {
    const bundle = app.content.current().bundle;
    const ids = await give(
      ...bundle.champions
        .filter((def) => !def.isFood)
        .slice(0, 4)
        .map((def) => def.key),
    );
    const wanted = [ids[3]!, ids[0]!, ids[2]!];

    const card = await profile.setShowcase(ctx(), playerId, wanted);
    expect(card.showcase.map((champion) => champion.id)).toEqual(wanted);
  });

  it('refuses a champion the player does not own, and a duplicate', async () => {
    const ids = await give('anuria');
    const someoneElse = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('other'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    const theirPlayerId = someoneElse.json().data.player.id as string;
    // A fresh account owns nothing until it picks a starter, so give them one to covet.
    const theirs = await app.db.transaction((tx) => grantChampion(tx, theirPlayerId, 'thordakk'));

    await expect(profile.setShowcase(ctx(), playerId, [theirs.id])).rejects.toMatchObject({
      code: 'VALIDATION',
    });

    await expect(profile.setShowcase(ctx(), playerId, [ids[0]!, ids[0]!])).rejects.toMatchObject({
      code: 'VALIDATION',
    });

    // Neither refusal wrote anything.
    const [row] = await app.db
      .select({ showcase: players.showcase })
      .from(players)
      .where(eq(players.id, playerId));
    expect(row?.showcase).toEqual([]);
  });

  it('hands the choice back to the game when the list is emptied', async () => {
    const bundle = app.content.current().bundle;
    const ids = await give(
      ...bundle.champions
        .filter((def) => !def.isFood)
        .slice(0, 3)
        .map((def) => def.key),
    );
    await profile.setShowcase(ctx(), playerId, [ids[0]!]);
    expect((await read()).showcase).toHaveLength(1);

    const card = await profile.setShowcase(ctx(), playerId, []);
    expect(card.showcase.length).toBe(3);
  });

  it('drops a released champion from the card rather than leaving a hole', async () => {
    const bundle = app.content.current().bundle;
    const ids = await give(
      ...bundle.champions
        .filter((def) => !def.isFood)
        .slice(0, 2)
        .map((def) => def.key),
    );
    await profile.setShowcase(ctx(), playerId, ids);
    await app.db.delete(playerChampions).where(eq(playerChampions.id, ids[0]!));

    const card = await read();
    expect(card.showcase.map((champion) => champion.id)).toEqual([ids[1]]);
  });

  it('never showcases food, even if it is the only thing chosen', async () => {
    const food = app.content.current().bundle.champions.find((def) => def.isFood)!;
    const ids = await give(food.key);

    const card = await profile.setShowcase(ctx(), playerId, ids);
    expect(card.showcase).toHaveLength(0);
  });

  // ── Through the API ───────────────────────────────────────────────────────

  it('serves any warden’s card to any signed-in player', async () => {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.profile.card(playerId)) });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.profile.playerId).toBe(playerId);
  });

  it('answers a card nobody has with a plain not-found', async () => {
    const response = await as({
      method: 'GET',
      url: apiPath(ROUTES.profile.card('00000000-0000-4000-8000-000000000000')),
    });
    expect(response.statusCode).toBe(404);
  });

  it('sets the showcase over HTTP', async () => {
    const ids = await give('anuria');
    const response = await as({
      method: 'PUT',
      url: apiPath(ROUTES.profile.showcase),
      payload: { championIds: ids },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.profile.showcase).toHaveLength(1);
  });

  it('turns an anonymous caller away from both endpoints', async () => {
    const card = await app.inject({
      method: 'GET',
      url: apiPath(ROUTES.profile.card(playerId)),
    });
    const showcase = await app.inject({
      method: 'PUT',
      url: apiPath(ROUTES.profile.showcase),
      payload: { championIds: [] },
    });
    expect([card.statusCode, showcase.statusCode]).toEqual([401, 401]);
  });
});
