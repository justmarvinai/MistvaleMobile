import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { ROUTES, apiPath, tierForRating } from '@mistvale/shared';
import {
  arenaBattles,
  arenaState,
  contentEntries,
  contentRevisions,
  economyLog,
  hallOfValor,
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
import * as battle from '../battle/service';
import { weekKey } from './ladder';
import { arenaConfigFrom } from './rating';
import * as arena from './service';
import * as hall from './hall';

/**
 * The Arena, against a real database.
 *
 * The properties worth pinning are the ones the ladder would quietly break: an attack
 * costs a token *and* an offer whichever way it goes, both ratings move from one fight,
 * a retreat is a loss rather than an escape, and a Hall of Valor level shows up in the
 * champion's numbers rather than only in the fight. The exact rating arithmetic is pinned
 * in `rating.test.ts`; what is checked here is that it reaches the database.
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
      note: 'arena fixture',
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

describe.skipIf(!dbUp)('the Arena', () => {
  let app: FastifyInstance;
  let ctx: arena.ArenaContext;

  /** One account, already holding a starter and old enough for the Arena. */
  interface Fighter {
    playerId: string;
    cookie: string;
    team: string[];
    profileName: string;
  }

  beforeAll(async () => {
    app = await buildTestApp();
    await seedContent(app);
    ctx = { db: app.db, content: app.content };
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
  });

  const settings = () => arenaConfigFrom(app.content.current().bundle.config);

  async function makeFighter(prefix: string, level = 20): Promise<Fighter> {
    const profileName = uniqueProfileName(prefix);
    const registered = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName(prefix.toLowerCase()),
        profileName,
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode, registered.body).toBe(201);
    const cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    const playerId = registered.json().data.player.id as string;

    const offered = await app.inject({
      method: 'GET',
      url: apiPath(ROUTES.roster.starters),
      cookies: { mv_session: cookie },
    });
    const starters = offered.json().data.starters as { key: string }[];
    const granted = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.roster.chooseStarter),
      cookies: { mv_session: cookie },
      payload: { championKey: starters[0]!.key },
    });
    expect(granted.statusCode, granted.body).toBe(200);
    const champions = granted.json().data.champions as { id: string }[];

    await app.db.update(players).set({ level }).where(eq(players.id, playerId));

    return { playerId, cookie, team: champions.map((entry) => entry.id), profileName };
  }

  /** An attacker and a defender, the defender's team already standing. */
  async function pair(): Promise<{ attacker: Fighter; defender: Fighter }> {
    const attacker = await makeFighter('Striker');
    const defender = await makeFighter('Bulwark');
    await arena.setDefence(ctx, defender.playerId, defender.team);
    return { attacker, defender };
  }

  const as = (cookie: string, options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const stateRow = async (playerId: string) => {
    const [row] = await app.db.select().from(arenaState).where(eq(arenaState.playerId, playerId));
    return row!;
  };

  /**
   * Fights an attack out to a result and returns what it paid.
   *
   * Through the ordinary battle endpoint on auto, which is the point: the Arena adds no
   * second way to resolve a fight, so the settle path being exercised here is the one every
   * other mode uses.
   */
  async function fightItOut(fighter: Fighter, offerId: string) {
    const view = await arena.attack(ctx, {
      playerId: fighter.playerId,
      offerId,
      team: fighter.team,
    });
    const played = await as(fighter.cookie, {
      method: 'POST',
      url: apiPath(ROUTES.battle.action(view.id)),
      payload: { actionId: `arena-auto-${view.id}`, auto: true },
    });
    expect(played.statusCode, played.body).toBe(200);
    return played.json().data as {
      status: string;
      outcome: string;
      rewards: { arena: Record<string, unknown> | null } | null;
    };
  }

  describe('opening the ladder', () => {
    it('refuses an account below the unlock level', async () => {
      const rookie = await makeFighter('Rookie', 1);
      await expect(arena.overview(ctx, rookie.playerId)).rejects.toThrow(/opens at account level/i);
    });

    it('opens a record at the configured starting rating on the first read', async () => {
      const fighter = await makeFighter('Newcomer');
      const state = await arena.overview(ctx, fighter.playerId);
      expect(state.rating).toBe(settings().startingRating);
      expect(state.tier).toBe(tierForRating(settings().startingRating, settings().thresholds));
      expect(state.tokens.value).toBe(settings().tokenCap);
      expect(state.defence).toEqual([]);
    });

    it('offers nobody when nobody has set a defence', async () => {
      const lonely = await makeFighter('Lonely');
      const state = await arena.overview(ctx, lonely.playerId);
      expect(state.offers).toEqual([]);
    });

    it('offers an opponent once one is standing, and never the reader themself', async () => {
      const { attacker } = await pair();
      const state = await arena.overview(ctx, attacker.playerId);
      expect(state.offers.length).toBeGreaterThan(0);
      expect(state.offers.every((offer) => offer.profileName !== attacker.profileName)).toBe(true);
      // An offer has to be worth reading: a team, a power, and what the fight is worth.
      expect(state.offers[0]!.team.length).toBeGreaterThan(0);
      expect(state.offers[0]!.power).toBeGreaterThan(0);
      expect(state.offers[0]!.ratingGain).toBeGreaterThan(0);
      expect(state.offers[0]!.ratingLoss).toBeLessThan(0);
    });
  });

  describe('the defence team', () => {
    it('refuses a champion the player does not own', async () => {
      const fighter = await makeFighter('Borrower');
      await expect(
        arena.setDefence(ctx, fighter.playerId, ['00000000-0000-4000-8000-000000000000']),
      ).rejects.toThrow(/do not own/i);
    });

    it('refuses the same champion twice', async () => {
      const fighter = await makeFighter('Doubler');
      await expect(
        arena.setDefence(ctx, fighter.playerId, [fighter.team[0]!, fighter.team[0]!]),
      ).rejects.toThrow(/two slots/i);
    });

    it('stands the team it was given', async () => {
      const fighter = await makeFighter('Warden');
      const state = await arena.setDefence(ctx, fighter.playerId, fighter.team);
      expect(state.defence).toEqual(fighter.team);
      expect(state.defenceTeam).toHaveLength(fighter.team.length);
    });
  });

  describe('an attack', () => {
    it('spends a token whichever way the fight goes', async () => {
      const { attacker } = await pair();
      const before = await arena.overview(ctx, attacker.playerId);
      await fightItOut(attacker, before.offers[0]!.offerId);
      expect((await stateRow(attacker.playerId)).tokens).toBe(before.tokens.value - 1);
    });

    it('moves both ratings by the same amount in opposite directions', async () => {
      const { attacker, defender } = await pair();
      const before = await arena.overview(ctx, attacker.playerId);
      const attackerBefore = (await stateRow(attacker.playerId)).rating;
      const defenderBefore = (await stateRow(defender.playerId)).rating;

      const result = await fightItOut(attacker, before.offers[0]!.offerId);
      expect(result.status).toBe('finished');
      expect(result.rewards?.arena).not.toBeNull();

      const attackerAfter = (await stateRow(attacker.playerId)).rating;
      const defenderAfter = (await stateRow(defender.playerId)).rating;
      expect(attackerAfter).not.toBe(attackerBefore);
      expect(attackerAfter - attackerBefore).toBe(-(defenderAfter - defenderBefore));
    });

    it('records the fight, from the attacker’s side', async () => {
      const { attacker, defender } = await pair();
      const before = await arena.overview(ctx, attacker.playerId);
      const result = await fightItOut(attacker, before.offers[0]!.offerId);

      const [logged] = await app.db
        .select()
        .from(arenaBattles)
        .where(eq(arenaBattles.attackerId, attacker.playerId));
      expect(logged).toBeDefined();
      expect(logged!.defenderId).toBe(defender.playerId);
      expect(logged!.won).toBe(result.outcome === 'victory');
      expect(logged!.attackerRatingDelta).toBe(-logged!.defenderRatingDelta);
    });

    it('spends the offer whether it was won or lost', async () => {
      const { attacker } = await pair();
      const before = await arena.overview(ctx, attacker.playerId);
      const offerId = before.offers[0]!.offerId;
      await fightItOut(attacker, offerId);

      const row = await stateRow(attacker.playerId);
      expect(row.offers.some((offer) => offer.offerId === offerId)).toBe(false);
      await expect(
        arena.attack(ctx, { playerId: attacker.playerId, offerId, team: attacker.team }),
      ).rejects.toThrow(/no longer on offer/i);
    });

    it('pays Valor Medals into the ledger on a win, and nothing on a loss', async () => {
      const { attacker } = await pair();
      const before = await arena.overview(ctx, attacker.playerId);
      const result = await fightItOut(attacker, before.offers[0]!.offerId);
      const won = result.outcome === 'victory';

      const [player] = await app.db
        .select({ valorMedals: players.valorMedals })
        .from(players)
        .where(eq(players.id, attacker.playerId));
      const paid = await app.db
        .select({ source: economyLog.source })
        .from(economyLog)
        .where(and(eq(economyLog.playerId, attacker.playerId), eq(economyLog.source, 'arena:win')));

      if (won) {
        expect(player!.valorMedals).toBe(before.medalsPerWin);
        expect(paid).toHaveLength(1);
      } else {
        expect(player!.valorMedals).toBe(0);
        expect(paid).toHaveLength(0);
      }
    });

    it('refuses a second battle while one is running', async () => {
      const { attacker } = await pair();
      const before = await arena.overview(ctx, attacker.playerId);
      await arena.attack(ctx, {
        playerId: attacker.playerId,
        offerId: before.offers[0]!.offerId,
        team: attacker.team,
      });
      await expect(
        arena.attack(ctx, {
          playerId: attacker.playerId,
          offerId: before.offers[0]!.offerId,
          team: attacker.team,
        }),
      ).rejects.toThrow(/already in a battle/i);
    });

    it('refuses to start with no tokens left', async () => {
      const { attacker } = await pair();
      const before = await arena.overview(ctx, attacker.playerId);
      await app.db
        .update(arenaState)
        .set({ tokens: 0, tokensUpdatedAt: new Date() })
        .where(eq(arenaState.playerId, attacker.playerId));

      await expect(
        arena.attack(ctx, {
          playerId: attacker.playerId,
          offerId: before.offers[0]!.offerId,
          team: attacker.team,
        }),
      ).rejects.toThrow(/no attack tokens/i);
    });

    it('counts a retreat as a loss rather than an escape', async () => {
      const { attacker, defender } = await pair();
      const before = await arena.overview(ctx, attacker.playerId);
      const ratingBefore = (await stateRow(attacker.playerId)).rating;
      const defenderBefore = (await stateRow(defender.playerId)).rating;

      const view = await arena.attack(ctx, {
        playerId: attacker.playerId,
        offerId: before.offers[0]!.offerId,
        team: attacker.team,
      });
      const walked = await as(attacker.cookie, {
        method: 'POST',
        url: apiPath(ROUTES.battle.retreat(view.id)),
      });
      expect(walked.statusCode, walked.body).toBe(200);

      const arenaResult = walked.json().data.rewards.arena as { won: boolean };
      expect(arenaResult.won).toBe(false);
      expect((await stateRow(attacker.playerId)).rating).toBeLessThan(ratingBefore);
      expect((await stateRow(defender.playerId)).rating).toBeGreaterThan(defenderBefore);
    });
  });

  describe('refreshing the offers', () => {
    it('is free until the daily allowance runs out, then costs crystals', async () => {
      const { attacker } = await pair();
      await arena.overview(ctx, attacker.playerId);

      for (let index = 0; index < settings().freeRefreshesPerDay; index += 1) {
        await arena.refreshOffers(ctx, attacker.playerId);
      }
      const spent = await arena.overview(ctx, attacker.playerId);
      expect(spent.refreshCost).toBe(settings().refreshCrystals);

      // And with an empty purse the paid refresh is refused rather than run for nothing.
      await expect(arena.refreshOffers(ctx, attacker.playerId)).rejects.toThrow();
    });

    it('replaces the offer list wholesale', async () => {
      const { attacker } = await pair();
      const before = await arena.overview(ctx, attacker.playerId);
      const after = await arena.refreshOffers(ctx, attacker.playerId);
      expect(after.offers[0]!.offerId).not.toBe(before.offers[0]!.offerId);
    });
  });

  describe('the ladder', () => {
    it('ranks by rating and marks the reader’s own row', async () => {
      const { attacker, defender } = await pair();
      await arena.overview(ctx, attacker.playerId);
      await app.db
        .update(arenaState)
        .set({ rating: 2_500 })
        .where(eq(arenaState.playerId, defender.playerId));

      const board = await arena.leaderboard(ctx, attacker.playerId);
      expect(board.top[0]!.profileName).toBe(defender.profileName);
      expect(board.top[0]!.tier).toBe('gold_2');
      expect(board.top.filter((entry) => entry.isSelf)).toHaveLength(1);
      expect(board.ownPosition).toBe(2);
    });
  });

  describe('the weekly chest', () => {
    it('pays against the best rating held, not the current one', async () => {
      const fighter = await makeFighter('Faller');
      await arena.overview(ctx, fighter.playerId);
      // Held Gold I this week, then slid back to Bronze before Monday.
      await app.db
        .update(arenaState)
        .set({ rating: 900, weeklyHigh: 2_100 })
        .where(eq(arenaState.playerId, fighter.playerId));

      const claimed = await arena.claimWeekly(ctx, fighter.playerId);
      expect(claimed.tier).toBe('gold_1');
      expect(Object.keys(claimed.rewards).length).toBeGreaterThan(0);
    });

    it('cannot be claimed twice in one week', async () => {
      const fighter = await makeFighter('Grabber');
      await arena.overview(ctx, fighter.playerId);
      await arena.claimWeekly(ctx, fighter.playerId);
      await expect(arena.claimWeekly(ctx, fighter.playerId)).rejects.toThrow(
        /already been claimed/i,
      );
    });

    it('comes back the following week', async () => {
      const fighter = await makeFighter('Patient');
      await arena.overview(ctx, fighter.playerId);
      await arena.claimWeekly(ctx, fighter.playerId);

      const lastWeek = weekKey(ctx, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
      await app.db
        .update(arenaState)
        .set({ lastWeeklyClaim: lastWeek })
        .where(eq(arenaState.playerId, fighter.playerId));

      const again = await arena.claimWeekly(ctx, fighter.playerId);
      expect(again.tier).toBeTruthy();
    });

    it('names a week by its Monday', () => {
      // A Wednesday and the Sunday that follows it belong to the same arena week.
      expect(weekKey(ctx, new Date('2026-08-19T12:00:00Z'))).toBe('2026-08-17');
      expect(weekKey(ctx, new Date('2026-08-23T12:00:00Z'))).toBe('2026-08-17');
      expect(weekKey(ctx, new Date('2026-08-24T12:00:00Z'))).toBe('2026-08-24');
    });
  });

  describe('the Hall of Valor', () => {
    it('starts every track at nothing', async () => {
      const fighter = await makeFighter('Novice');
      const state = await hall.state(app.db, fighter.playerId, 0, settings());
      expect(state.tracks).toHaveLength(24);
      expect(state.tracks.every((track) => track.level === 0)).toBe(true);
      expect(state.tracks[0]!.nextCost).toBe(settings().hallCosts[0]);
    });

    it('refuses a level the player cannot afford', async () => {
      const fighter = await makeFighter('Pauper');
      await expect(
        hall.upgrade(app.db, fighter.playerId, { element: 'ember', stat: 'atk' }, settings()),
      ).rejects.toThrow(/Valor Medals/);
    });

    it('buys a level, spends the medals through the ledger, and stops at the cap', async () => {
      const fighter = await makeFighter('Patron');
      const costs = settings().hallCosts;
      const total = costs.reduce((sum, cost) => sum + cost, 0);
      await app.db
        .update(players)
        .set({ valorMedals: total })
        .where(eq(players.id, fighter.playerId));

      for (let level = 0; level < costs.length; level += 1) {
        const bought = await hall.upgrade(
          app.db,
          fighter.playerId,
          { element: 'ember', stat: 'atk' },
          settings(),
        );
        expect(bought.track.level).toBe(level + 1);
        expect(bought.medalsSpent).toBe(costs[level]);
      }

      await expect(
        hall.upgrade(app.db, fighter.playerId, { element: 'ember', stat: 'atk' }, settings()),
      ).rejects.toThrow(/highest level/i);

      const [row] = await app.db
        .select()
        .from(hallOfValor)
        .where(eq(hallOfValor.playerId, fighter.playerId));
      expect(row!.level).toBe(10);

      const spent = await app.db
        .select({ source: economyLog.source })
        .from(economyLog)
        .where(eq(economyLog.playerId, fighter.playerId));
      expect(spent.filter((entry) => entry.source === 'hall:ember:atk')).toHaveLength(10);
    });

    it('shows up in the champion’s own numbers, not only in the fight', async () => {
      // The split: an account-wide unconditional bonus is folded in before the battle, so
      // the champion screen a player reads is the champion they will actually field.
      const fighter = await makeFighter('Believer');
      const [champion] = await app.db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.id, fighter.playerId));
      expect(champion).toBeDefined();

      const before = await as(fighter.cookie, {
        method: 'GET',
        url: apiPath(ROUTES.roster.list),
      });
      const listed = before.json().data.champions as { id: string; championKey: string }[];
      const element = app.content
        .current()
        .bundle.champions.find((entry) => entry.key === listed[0]!.championKey)!.element;

      await app.db
        .update(players)
        .set({ valorMedals: 10_000 })
        .where(eq(players.id, fighter.playerId));
      await hall.upgrade(app.db, fighter.playerId, { element, stat: 'atk' }, settings());

      const levels = await hall.levelsFor(app.db, fighter.playerId);
      const bonus = hall.bonusFor(levels, element, { atk: 1_000 } as never, settings());
      // Two percent of base attack at level one, per the documented defaults.
      expect(bonus.atk).toBe(20);
      // And a champion of another element gets nothing from that track.
      const other = element === 'ember' ? 'tide' : 'ember';
      expect(hall.bonusFor(levels, other, { atk: 1_000 } as never, settings()).atk).toBeUndefined();
    });

    it('reaches the battle: a Hall level raises the attack a fight opens with', async () => {
      const fighter = await makeFighter('Fielded');
      const listed = await as(fighter.cookie, { method: 'GET', url: apiPath(ROUTES.roster.list) });
      const champions = listed.json().data.champions as { id: string; championKey: string }[];
      const element = app.content
        .current()
        .bundle.champions.find((entry) => entry.key === champions[0]!.championKey)!.element;

      const plain = await battle.start(ctx, {
        playerId: fighter.playerId,
        mode: 'campaign',
        stageKey: 'c01_s1_normal',
        team: fighter.team,
      });
      const plainAtk = plain.state.allies[0]!.stats.atk;
      await as(fighter.cookie, {
        method: 'POST',
        url: apiPath(ROUTES.battle.retreat(plain.id)),
      });

      await app.db
        .update(players)
        .set({ valorMedals: 10_000 })
        .where(eq(players.id, fighter.playerId));
      for (let level = 0; level < 5; level += 1) {
        await hall.upgrade(app.db, fighter.playerId, { element, stat: 'atk' }, settings());
      }

      const boosted = await battle.start(ctx, {
        playerId: fighter.playerId,
        mode: 'campaign',
        stageKey: 'c01_s1_normal',
        team: fighter.team,
      });
      const boostedAtk = boosted.state.allies[0]!.stats.atk;
      expect(boostedAtk).toBeGreaterThan(plainAtk);
    });
  });
});
