import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, allyRefusal, apiPath, type Warband } from '@mistvale/shared';
import { contentEntries, contentRevisions, players } from '../../db/schema/index';
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

/**
 * Wardens — the friends slice of Warbands (C37).
 *
 * The rules worth pinning are the ones that make a one-way list safe to borrow from at
 * all: **the nomination is the consent**, so nothing may be taken that was not put
 * forward; a borrow is spent when the fight *opens*, because the resource is the attempt;
 * and the lender's own numbers are what the borrowed champion fights at.
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
      note: 'warband fixture',
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

describe.skipIf(!dbUp)('wardens', () => {
  let app: FastifyInstance;

  let meCookie: string;
  let mePlayerId: string;
  let themCookie: string;
  let themPlayerId: string;
  let themName: string;

  beforeAll(async () => {
    app = await buildTestApp();
    await seedContent(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function register(prefix: string) {
    const profileName = uniqueProfileName(prefix);
    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName(prefix.toLowerCase()),
        profileName,
        password: 'a-good-long-password',
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return {
      profileName,
      playerId: response.json().data.player.id as string,
      cookie: extractSessionCookie(response.headers['set-cookie']) as string,
    };
  }

  beforeEach(async () => {
    await truncateAll(app);
    const me = await register('Me');
    meCookie = me.cookie;
    mePlayerId = me.playerId;
    const them = await register('Them');
    themCookie = them.cookie;
    themPlayerId = them.playerId;
    themName = them.profileName;
  });

  const asMe = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: meCookie } });
  const asThem = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: themCookie } });

  const list = async (): Promise<Warband> => {
    const response = await asMe({ method: 'GET', url: apiPath(ROUTES.warband.list) });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data as Warband;
  };

  /** Gives an account a champion and returns the roster id. */
  async function give(playerId: string, championKey: string): Promise<string> {
    const granted = await app.db.transaction((tx) =>
      grantChampion(tx, playerId, championKey, {}, app.content.current().bundle.champions),
    );
    return granted.id;
  }

  describe('keeping a warden', () => {
    it('is by profile name, which is the only handle one player has for another', async () => {
      const response = await asMe({
        method: 'POST',
        url: apiPath(ROUTES.warband.follow),
        payload: { profileName: themName },
      });
      expect(response.statusCode, response.body).toBe(201);
      expect(response.json().data.playerId).toBe(themPlayerId);

      const held = await list();
      expect(held.wardens.map((warden) => warden.playerId)).toEqual([themPlayerId]);
    });

    it('is idempotent — keeping the same warden twice is not an error', async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await asMe({
          method: 'POST',
          url: apiPath(ROUTES.warband.follow),
          payload: { profileName: themName },
        });
        expect(response.statusCode).toBe(201);
      }
      expect((await list()).wardens).toHaveLength(1);
    });

    it('refuses yourself, a name nobody holds, and one of the Arena’s own', async () => {
      const [me] = await app.db
        .select({ profileName: players.profileName })
        .from(players)
        .where(eq(players.id, mePlayerId));

      const self = await asMe({
        method: 'POST',
        url: apiPath(ROUTES.warband.follow),
        payload: { profileName: me!.profileName },
      });
      expect(self.statusCode).toBe(400);

      const nobody = await asMe({
        method: 'POST',
        url: apiPath(ROUTES.warband.follow),
        payload: { profileName: 'Nobody' },
      });
      expect(nobody.statusCode).toBe(404);

      await app.db.update(players).set({ isBot: true }).where(eq(players.id, themPlayerId));
      const bot = await asMe({
        method: 'POST',
        url: apiPath(ROUTES.warband.follow),
        payload: { profileName: themName },
      });
      // Refused by name rather than hidden: a warden who cannot lend is a row that does
      // nothing, and saying so beats a list that quietly ignores what is typed into it.
      expect(bot.statusCode).toBe(400);
    });

    it('lets go, and letting go twice is not an error either', async () => {
      await asMe({
        method: 'POST',
        url: apiPath(ROUTES.warband.follow),
        payload: { profileName: themName },
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await asMe({
          method: 'DELETE',
          url: apiPath(ROUTES.warband.unfollow(themPlayerId)),
        });
        expect(response.statusCode).toBe(200);
      }
      expect((await list()).wardens).toEqual([]);
    });
  });

  describe('the standard-bearer', () => {
    it('is a copy, assembled from its owner’s side, and shows what it is wearing', async () => {
      const championId = await give(themPlayerId, 'anuria');
      const set = await asThem({
        method: 'PUT',
        url: apiPath(ROUTES.warband.standardBearer),
        payload: { championId },
      });
      expect(set.statusCode, set.body).toBe(200);

      await asMe({
        method: 'POST',
        url: apiPath(ROUTES.warband.follow),
        payload: { profileName: themName },
      });
      const held = await list();
      const bearer = held.wardens[0]?.standardBearer;
      expect(bearer?.championKey).toBe('anuria');
      expect(bearer?.power).toBeGreaterThan(0);
      expect(bearer?.relics).toBe(0);
    });

    it('refuses a champion the account does not own, and refuses food', async () => {
      const mine = await give(mePlayerId, 'anuria');
      const theirs = await asThem({
        method: 'PUT',
        url: apiPath(ROUTES.warband.standardBearer),
        payload: { championId: mine },
      });
      expect(theirs.statusCode).toBe(404);

      const food = await give(mePlayerId, 'sskarn_broodguard_ember');
      const asFood = await asMe({
        method: 'PUT',
        url: apiPath(ROUTES.warband.standardBearer),
        payload: { championId: food },
      });
      expect(asFood.statusCode).toBe(400);
    });

    it('is withdrawn by nominating nobody', async () => {
      const championId = await give(mePlayerId, 'anuria');
      await asMe({
        method: 'PUT',
        url: apiPath(ROUTES.warband.standardBearer),
        payload: { championId },
      });
      expect((await list()).standardBearerId).toBe(championId);

      await asMe({
        method: 'PUT',
        url: apiPath(ROUTES.warband.standardBearer),
        payload: { championId: null },
      });
      expect((await list()).standardBearerId).toBeNull();
    });

    it('shows a warden who has nominated nobody rather than hiding them', async () => {
      await asMe({
        method: 'POST',
        url: apiPath(ROUTES.warband.follow),
        payload: { profileName: themName },
      });
      const held = await list();
      expect(held.wardens).toHaveLength(1);
      expect(held.wardens[0]?.standardBearer).toBeNull();
    });
  });

  describe('borrowing', () => {
    /** The pair, ready to fight: I keep them, they have put somebody forward. */
    async function readyToBorrow(): Promise<string> {
      const championId = await give(themPlayerId, 'anuria');
      await asThem({
        method: 'PUT',
        url: apiPath(ROUTES.warband.standardBearer),
        payload: { championId },
      });
      await asMe({
        method: 'POST',
        url: apiPath(ROUTES.warband.follow),
        payload: { profileName: themName },
      });
      return championId;
    }

    async function start(payload: Record<string, unknown>) {
      return asMe({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: {
          mode: 'campaign',
          stageKey: 'c01_s1_normal',
          actionId: crypto.randomUUID(),
          ...payload,
        },
      });
    }

    it('fields the lender’s champion and counts the lend', async () => {
      await readyToBorrow();
      const mine = await give(mePlayerId, 'anuria');

      const battle = await start({ team: [mine], ally: themPlayerId });
      expect(battle.statusCode, battle.body).toBe(200);
      // Two champions on the field: mine, and the one that was put forward.
      expect(battle.json().data.state.allies).toHaveLength(2);

      const [lender] = await app.db
        .select({ lends: players.lendsTotal })
        .from(players)
        .where(eq(players.id, themPlayerId));
      expect(lender?.lends).toBe(1);
    });

    it('spends the day’s allowance when the fight opens, not when it is won', async () => {
      await readyToBorrow();
      const mine = await give(mePlayerId, 'anuria');

      expect((await list()).borrowsLeft).toBe(1);
      const first = await start({ team: [mine], ally: themPlayerId });
      expect(first.statusCode).toBe(200);
      expect((await list()).borrowsLeft).toBe(0);

      await asMe({
        method: 'POST',
        url: apiPath(ROUTES.battle.retreat(first.json().data.id as string)),
        payload: { actionId: crypto.randomUUID() },
      });
      const second = await start({ team: [mine], ally: themPlayerId });
      expect(second.statusCode).toBe(429);
    });

    it('refuses a warden not on the list, and one who has put nobody forward', async () => {
      const mine = await give(mePlayerId, 'anuria');

      // Not kept at all.
      const stranger = await start({ team: [mine], ally: themPlayerId });
      expect(stranger.statusCode).toBe(400);

      await asMe({
        method: 'POST',
        url: apiPath(ROUTES.warband.follow),
        payload: { profileName: themName },
      });
      const empty = await start({ team: [mine], ally: themPlayerId });
      expect(empty.statusCode).toBe(400);
      expect(empty.json().error.message).toContain('put nobody forward');
    });

    it('takes one of the four slots rather than adding a fifth', async () => {
      await readyToBorrow();
      const four = [
        await give(mePlayerId, 'anuria'),
        await give(mePlayerId, 'ashka_torchhand'),
        await give(mePlayerId, 'bracken_puck'),
        await give(mePlayerId, 'brekka_foehammer'),
      ];
      const response = await start({ team: four, ally: themPlayerId });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('borrowed warden takes one of them');
    });

    it('is refused in the modes that must not be rented into', async () => {
      // The rule lives in `allyRefusal` so the team chooser greys out exactly what the
      // server refuses; here it is the *server* half being pinned.
      expect(allyRefusal('arena')).not.toBeNull();
      expect(allyRefusal('worldBoss')).not.toBeNull();
      expect(allyRefusal('spire')).not.toBeNull();
      expect(allyRefusal('titan')).not.toBeNull();
      expect(allyRefusal('trial')).not.toBeNull();
      expect(allyRefusal('deepRun')).not.toBeNull();
      expect(allyRefusal('campaign')).toBeNull();
      expect(allyRefusal('dungeon')).toBeNull();

      await readyToBorrow();
      const mine = await give(mePlayerId, 'anuria');
      const response = await asMe({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: {
          mode: 'practice',
          stageKey: 'c01_s1_normal',
          team: [mine],
          ally: themPlayerId,
          actionId: crypto.randomUUID(),
        },
      });
      // Practice is allowed by `allyRefusal`; this one fails on the sandbox's own rule
      // (nothing cleared yet), which is the point — the ally is not what refused it.
      expect(response.statusCode).toBe(403);
    });

    it('names the lender on the fight, at the slot they stood in', async () => {
      await readyToBorrow();
      const mine = await give(mePlayerId, 'anuria');

      const battle = await start({ team: [mine], ally: themPlayerId });
      expect(battle.statusCode, battle.body).toBe(200);
      // Slot 1, because the borrowed champion is pushed onto the formation *after* the
      // account's own one. The name rather than an id: the results screen has nothing to
      // resolve an id against, since a borrowed champion is in no roster it can read.
      expect(battle.json().data.borrowedFrom).toEqual({ slot: 1, profileName: themName });

      // And it survives a reload, which is the whole reason it is on the row rather than
      // held by the client that asked for the borrow.
      const resumed = await asMe({ method: 'GET', url: apiPath(ROUTES.battle.active) });
      expect(resumed.json().data.battle.borrowedFrom).toEqual({
        slot: 1,
        profileName: themName,
      });
    });

    it('says nobody lent anything on a fight nobody borrowed for', async () => {
      const mine = await give(mePlayerId, 'anuria');
      const battle = await start({ team: [mine] });
      expect(battle.statusCode, battle.body).toBe(200);
      expect(battle.json().data.borrowedFrom).toBeNull();
    });

    it('does not bill for a fight it refused', async () => {
      const mine = await give(mePlayerId, 'anuria');
      await asMe({
        method: 'POST',
        url: apiPath(ROUTES.warband.follow),
        payload: { profileName: themName },
      });
      const before = await list();
      const refused = await start({ team: [mine], ally: themPlayerId });
      expect(refused.statusCode).toBe(400);
      expect((await list()).borrowsLeft).toBe(before.borrowsLeft);
    });
  });
});
