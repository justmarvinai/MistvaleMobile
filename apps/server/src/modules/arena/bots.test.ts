import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { createRng } from '@mistvale/engine';
import {
  ARENA_BANDS,
  DEFAULT_BOT_BANDS,
  DEFAULT_BOT_EPITHETS,
  DEFAULT_BOT_GIVEN_NAMES,
  ROUTES,
  apiPath,
  bandOf,
  profileNameSchema,
  tierForRating,
  type ArenaBand,
} from '@mistvale/shared';
import {
  accounts,
  arenaState,
  contentEntries,
  contentRevisions,
  economyLog,
  gearInstances,
  playerChampions,
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
import * as arena from './service';
import { botConfigFrom, census, pickName, refreshLadder, seedLadder, yieldTopTen } from './bots';
import type { ArenaContext } from './ladder';

/**
 * The bot ladder.
 *
 * What has to hold is not that a bot is convincing — that is a design question — but that
 * it is *ordinary*: a row in `players` like any other, fieldable by the engine, findable
 * by matchmaking, and completely absent from the economy. The last one is the reason this
 * suite exists at all: a bot that touched `economy_log` would quietly corrupt every
 * faucet-and-sink number the balance work depends on (ECONOMY_BALANCE §12).
 *
 * The bands are shrunk to seven bots for the suite. Sixty is the shipped default and is
 * asserted against the seed; building sixty rosters per test would be a minute of relic
 * inserts to learn nothing the seven do not already say.
 */

const dbUp = await isDatabaseAvailable();

/** Seven bots rather than sixty, in the same shape: weighted to the bottom. */
const TEST_BANDS: Record<ArenaBand, unknown> = {
  bronze: { ...DEFAULT_BOT_BANDS.bronze, count: 3, teamSize: 2, gearSlots: 3 },
  silver: { ...DEFAULT_BOT_BANDS.silver, count: 2, teamSize: 2, gearSlots: 3 },
  gold: { ...DEFAULT_BOT_BANDS.gold, count: 1, teamSize: 2, gearSlots: 3 },
  platinum: { ...DEFAULT_BOT_BANDS.platinum, count: 1, teamSize: 2, gearSlots: 3 },
};

async function seedContent(app: FastifyInstance): Promise<void> {
  const seeds = buildSeedContent();
  const set: ContentSet = new Map();
  for (const seed of seeds) {
    set.set(seed.contentType, new Map(seed.entities.map((entity) => [entity.key, entity.data])));
  }
  // The one deliberate divergence from the committed seed: smaller bands.
  const config = set.get('gameConfig');
  const bandEntry = config?.get('arena.botBands') as { value: unknown } | undefined;
  if (bandEntry) bandEntry.value = TEST_BANDS;

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
      note: 'bot fixture',
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

describe('bot recipes', () => {
  it('falls back to the documented bands on an empty config', () => {
    const settings = botConfigFrom({});
    expect(settings.bands.bronze.count).toBe(24);
    expect(settings.bands.platinum.count).toBe(4);
    expect(settings.givenNames.length).toBeGreaterThan(20);
  });

  it('ships sixty bots, weighted to the bottom of the ladder', () => {
    const total = ARENA_BANDS.reduce((sum, band) => sum + DEFAULT_BOT_BANDS[band].count, 0);
    expect(total).toBe(60);
    expect(DEFAULT_BOT_BANDS.bronze.count).toBeGreaterThan(DEFAULT_BOT_BANDS.platinum.count);
  });

  it('keeps a band’s default when an operator writes nonsense into it', () => {
    // A typo in one recipe must not delete a quarter of the ladder.
    const settings = botConfigFrom({
      'arena.botBands': { bronze: { count: 5 }, silver: DEFAULT_BOT_BANDS.silver },
    });
    expect(settings.bands.bronze.count).toBe(24);
    expect(settings.bands.silver.count).toBe(20);
  });

  it('takes a whole authored band', () => {
    const settings = botConfigFrom({
      'arena.botBands': { gold: { ...DEFAULT_BOT_BANDS.gold, count: 30 } },
    });
    expect(settings.bands.gold.count).toBe(30);
  });

  it('ignores an emptied name list rather than adopting it', () => {
    const settings = botConfigFrom({ 'arena.botGivenNames': [], 'arena.botEpithets': 'nope' });
    expect(settings.givenNames).toEqual(DEFAULT_BOT_GIVEN_NAMES);
    expect(settings.epithets).toEqual(DEFAULT_BOT_EPITHETS);
  });

  it('accepts an operator’s own names', () => {
    const settings = botConfigFrom({ 'arena.botGivenNames': ['Ash', '  Bram  ', 7, ''] });
    expect(settings.givenNames).toEqual(['Ash', 'Bram']);
  });
});

describe('bot names', () => {
  const pools = botConfigFrom({});

  it('produces names a player could have chosen', () => {
    const rng = createRng(12_345);
    for (let index = 0; index < 200; index += 1) {
      const name = pickName(rng, pools, new Set())!;
      expect(profileNameSchema.safeParse(name).success, name).toBe(true);
    }
  });

  it('every default combination fits a profile name', () => {
    for (const given of DEFAULT_BOT_GIVEN_NAMES) {
      for (const epithet of DEFAULT_BOT_EPITHETS) {
        const name = `${given} ${epithet}`;
        expect(profileNameSchema.safeParse(name).success, name).toBe(true);
      }
    }
  });

  it('never takes a name somebody is already using', () => {
    const rng = createRng(999);
    const taken = new Set<string>();
    for (let index = 0; index < 300; index += 1) {
      const name = pickName(rng, pools, taken)!;
      expect(taken.has(name.toLowerCase())).toBe(false);
      taken.add(name.toLowerCase());
    }
  });

  it('gives up rather than hanging when the pools are exhausted', () => {
    const tiny = { ...pools, givenNames: ['Ash'], epithets: ['Vale'] };
    expect(pickName(createRng(1), tiny, new Set(['ash vale']))).toBeNull();
  });
});

describe.skipIf(!dbUp)('the bot ladder', () => {
  let app: FastifyInstance;
  let ctx: ArenaContext;

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

  const wanted = () => {
    const settings = botConfigFrom(app.content.current().bundle.config);
    return ARENA_BANDS.reduce((sum, band) => sum + settings.bands[band].count, 0);
  };

  const botRows = () =>
    app.db
      .select({ id: players.id, profileName: players.profileName })
      .from(players)
      .where(eq(players.isBot, true));

  /** A real account, high enough to walk into the Arena. */
  async function makePlayer(): Promise<{ playerId: string; cookie: string }> {
    const registered = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('human'),
        profileName: uniqueProfileName('Human'),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode, registered.body).toBe(201);
    const cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    const playerId = registered.json().data.player.id as string;
    await app.db.update(players).set({ level: 20 }).where(eq(players.id, playerId));
    return { playerId, cookie };
  }

  describe('seeding', () => {
    it('fills every band to its configured strength', async () => {
      const report = await seedLadder(ctx);
      expect(report.created).toBe(wanted());
      expect(await botRows()).toHaveLength(wanted());

      const settings = botConfigFrom(app.content.current().bundle.config);
      const standing = await census(ctx);
      for (const band of standing.bands) {
        expect(band.present, band.band).toBe(settings.bands[band.band].count);
      }
      expect(standing.total).toBe(wanted());
      expect(standing.refreshedAt).not.toBeNull();
    });

    it('is idempotent — running it twice is running it once', async () => {
      await seedLadder(ctx);
      const again = await seedLadder(ctx);
      expect(again.created).toBe(0);
      expect(await botRows()).toHaveLength(wanted());
    });

    it('puts each bot in its own band’s rating window', async () => {
      await seedLadder(ctx);
      const settings = botConfigFrom(app.content.current().bundle.config);
      const rows = await app.db
        .select({ rating: arenaState.rating })
        .from(arenaState)
        .innerJoin(players, eq(players.id, arenaState.playerId))
        .where(eq(players.isBot, true));

      for (const row of rows) {
        const band = bandOf(tierForRating(row.rating));
        expect(row.rating).toBeGreaterThanOrEqual(settings.bands[band].ratingMin);
        expect(row.rating).toBeLessThanOrEqual(settings.bands[band].ratingMax);
      }
    });

    it('gives every bot a real roster in real relics, standing on defence', async () => {
      await seedLadder(ctx);
      const settings = botConfigFrom(app.content.current().bundle.config);

      for (const bot of await botRows()) {
        const [state] = await app.db
          .select({ defenceTeam: arenaState.defenceTeam, rating: arenaState.rating })
          .from(arenaState)
          .where(eq(arenaState.playerId, bot.id));
        const recipe = settings.bands[bandOf(tierForRating(state!.rating))];

        expect(state!.defenceTeam, bot.profileName).toHaveLength(recipe.teamSize);

        const champions = await app.db
          .select({ id: playerChampions.id, rank: playerChampions.rank })
          .from(playerChampions)
          .where(eq(playerChampions.playerId, bot.id));
        expect(champions).toHaveLength(recipe.teamSize);
        expect(champions.every((champion) => champion.rank === recipe.championRank)).toBe(true);

        const relics = await app.db
          .select({ equipped: gearInstances.equippedChampionId, level: gearInstances.level })
          .from(gearInstances)
          .where(eq(gearInstances.playerId, bot.id));
        expect(relics).toHaveLength(recipe.teamSize * recipe.gearSlots);
        // Worn, not stacked in a vault — an unequipped relic contributes nothing to a fight.
        expect(relics.every((relic) => relic.equipped !== null)).toBe(true);
        // Half-upgraded at a band's floor, fully upgraded at its top, and never bare —
        // a bot in unupgraded relics reads as broken rather than as easy.
        expect(
          relics.every(
            (relic) =>
              relic.level >= Math.round(recipe.gearLevel * 0.5) && relic.level <= recipe.gearLevel,
          ),
        ).toBe(true);
      }
    });

    it('builds a band as a ramp, so an offer’s rating predicts its difficulty', async () => {
      // Without this the +10 offer and the +21 offer are the same fight, and the stakes
      // the hub shows are a lie about difficulty rather than a guide.
      await seedLadder(ctx);

      const rows = await app.db
        .select({ rating: arenaState.rating, level: playerChampions.level })
        .from(arenaState)
        .innerJoin(players, eq(players.id, arenaState.playerId))
        .innerJoin(playerChampions, eq(playerChampions.playerId, arenaState.playerId))
        .where(eq(players.isBot, true));

      const bronze = rows.filter((row) => bandOf(tierForRating(row.rating)) === 'bronze');
      expect(bronze.length).toBeGreaterThan(1);

      const weakest = bronze.reduce((low, row) => (row.rating < low.rating ? row : low));
      const strongest = bronze.reduce((high, row) => (row.rating > high.rating ? row : high));
      expect(strongest.level).toBeGreaterThan(weakest.level);
    });

    it('never gives a bot the same champion twice', async () => {
      await seedLadder(ctx);
      for (const bot of await botRows()) {
        const rows = await app.db
          .select({ championKey: playerChampions.championKey })
          .from(playerChampions)
          .where(eq(playerChampions.playerId, bot.id));
        expect(new Set(rows.map((row) => row.championKey)).size).toBe(rows.length);
      }
    });

    it('leaves the economy untouched', async () => {
      // The rule the whole design rests on: a bot holds no balances and appears in no
      // economy report, so the faucet and sink numbers stay true (ECONOMY_BALANCE §12).
      await seedLadder(ctx);
      const rows = await app.db
        .select({ silver: players.silver, crystals: players.crystals, medals: players.valorMedals })
        .from(players)
        .where(eq(players.isBot, true));
      expect(rows.every((row) => row.silver === 0 && row.crystals === 0 && row.medals === 0)).toBe(
        true,
      );
      expect(await app.db.select({ id: economyLog.id }).from(economyLog)).toHaveLength(0);
    });

    it('makes accounts nobody can log into', async () => {
      await seedLadder(ctx);
      const [bot] = await app.db
        .select({ accountName: accounts.accountName })
        .from(accounts)
        .innerJoin(players, eq(players.accountId, accounts.id))
        .where(eq(players.isBot, true));

      const attempt = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: bot!.accountName, password: 'a-good-long-password' },
      });
      expect(attempt.statusCode).toBe(401);
    });

    it('keeps the entry-level opponents when a band is thinned', async () => {
      await seedLadder(ctx);
      const before = await botRows();

      const bronze = (
        await app.db
          .select({ playerId: arenaState.playerId, rating: arenaState.rating })
          .from(arenaState)
          .innerJoin(players, eq(players.id, arenaState.playerId))
          .where(eq(players.isBot, true))
          .orderBy(desc(arenaState.rating))
      ).filter((row) => bandOf(tierForRating(row.rating)) === 'bronze');
      expect(bronze).toHaveLength(3);

      // Thin Bronze to one, the way an operator would in the config editor.
      await publishBands(app, {
        ...TEST_BANDS,
        bronze: { ...DEFAULT_BOT_BANDS.bronze, count: 1, teamSize: 2, gearSlots: 3 },
      });
      const report = await seedLadder(ctx);

      expect(report.removed).toBe(2);
      expect(await botRows()).toHaveLength(before.length - 2);

      // The survivor is the *lowest*-rated of the three: the bottom of a band is where a
      // new account arrives, so that is the opponent worth keeping.
      const survivors = await app.db
        .select({ playerId: arenaState.playerId })
        .from(arenaState)
        .innerJoin(players, eq(players.id, arenaState.playerId))
        .where(eq(players.isBot, true));
      const ids = new Set(survivors.map((row) => row.playerId));
      expect(ids.has(bronze.at(-1)!.playerId)).toBe(true);
      expect(ids.has(bronze[0]!.playerId)).toBe(false);

      await publishBands(app, TEST_BANDS);
    });
  });

  describe('the nightly refresh', () => {
    it('rebuilds every roster and drifts the ratings without leaving the band', async () => {
      await seedLadder(ctx);
      const before = await app.db
        .select({
          playerId: arenaState.playerId,
          rating: arenaState.rating,
          defenceTeam: arenaState.defenceTeam,
        })
        .from(arenaState)
        .innerJoin(players, eq(players.id, arenaState.playerId))
        .where(eq(players.isBot, true));

      const report = await refreshLadder(ctx);
      expect(report.refreshed).toBe(wanted());
      expect(report.created).toBe(0);

      const settings = botConfigFrom(app.content.current().bundle.config);
      const after = await app.db
        .select({
          playerId: arenaState.playerId,
          rating: arenaState.rating,
          defenceTeam: arenaState.defenceTeam,
        })
        .from(arenaState)
        .innerJoin(players, eq(players.id, arenaState.playerId))
        .where(eq(players.isBot, true));

      expect(after).toHaveLength(before.length);
      for (const row of after) {
        const was = before.find((entry) => entry.playerId === row.playerId)!;
        // A rebuilt roster means new `player_champions` rows, so the defence ids all move.
        expect(row.defenceTeam).not.toEqual(was.defenceTeam);
        expect(row.defenceTeam.length).toBeGreaterThan(0);

        const band = settings.bands[bandOf(tierForRating(row.rating))];
        expect(row.rating).toBeGreaterThanOrEqual(band.ratingMin);
        expect(row.rating).toBeLessThanOrEqual(band.ratingMax);
        // Five per cent, per ECONOMY §12 — a drift, not a reshuffle.
        expect(Math.abs(row.rating - was.rating)).toBeLessThanOrEqual(
          Math.ceil(was.rating * 0.05) + 1,
        );
      }
    });

    it('does not leave a bot holding an ever-growing roster', async () => {
      await seedLadder(ctx);
      await refreshLadder(ctx);
      await refreshLadder(ctx);

      const settings = botConfigFrom(app.content.current().bundle.config);
      for (const bot of await botRows()) {
        const [state] = await app.db
          .select({ rating: arenaState.rating })
          .from(arenaState)
          .where(eq(arenaState.playerId, bot.id));
        const recipe = settings.bands[bandOf(tierForRating(state!.rating))];
        const champions = await app.db
          .select({ id: playerChampions.id })
          .from(playerChampions)
          .where(eq(playerChampions.playerId, bot.id));
        expect(champions).toHaveLength(recipe.teamSize);
      }
    });

    it('tops the ladder back up if bots have gone missing', async () => {
      await seedLadder(ctx);
      const [victim] = await botRows();
      await app.db.delete(players).where(eq(players.id, victim!.id));

      const report = await refreshLadder(ctx);
      expect(report.created).toBe(1);
      expect(await botRows()).toHaveLength(wanted());
    });
  });

  describe('the top-ten auto-yield', () => {
    it('moves bots below the humans in the top ten', async () => {
      await seedLadder(ctx);
      const human = await makePlayer();
      await arena.overview(ctx, human.playerId);
      await app.db
        .update(arenaState)
        .set({ rating: 2_500 })
        .where(eq(arenaState.playerId, human.playerId));

      const moved = await yieldTopTen(ctx);
      expect(moved).toBeGreaterThan(0);

      const top = await app.db
        .select({ rating: arenaState.rating, isBot: players.isBot })
        .from(arenaState)
        .innerJoin(players, eq(players.id, arenaState.playerId))
        .orderBy(desc(arenaState.rating))
        .limit(10);
      // The player is now first, and no bot outranks them.
      expect(top[0]!.isBot).toBe(false);
      expect(top.filter((row) => row.isBot && row.rating >= 2_500)).toHaveLength(0);
    });

    it('leaves the board alone when there is nobody to yield to', async () => {
      // A top ten with no people in it is the ladder working as intended at EA; pushing
      // every bot down would empty the board rather than fill it.
      await seedLadder(ctx);
      expect(await yieldTopTen(ctx)).toBe(0);
    });

    it('does not promote a bot that is already below the humans', async () => {
      await seedLadder(ctx);
      const human = await makePlayer();
      await arena.overview(ctx, human.playerId);
      await app.db
        .update(arenaState)
        .set({ rating: 9_000 })
        .where(eq(arenaState.playerId, human.playerId));

      const before = await app.db
        .select({ playerId: arenaState.playerId, rating: arenaState.rating })
        .from(arenaState)
        .innerJoin(players, eq(players.id, arenaState.playerId))
        .where(eq(players.isBot, true));

      expect(await yieldTopTen(ctx)).toBe(0);
      const after = await app.db
        .select({ playerId: arenaState.playerId, rating: arenaState.rating })
        .from(arenaState)
        .innerJoin(players, eq(players.id, arenaState.playerId))
        .where(eq(players.isBot, true));
      expect(after).toEqual(before);
    });
  });

  describe('as opponents', () => {
    it('fill a new player’s offer list on their first visit', async () => {
      await seedLadder(ctx);
      const human = await makePlayer();

      const state = await arena.overview(ctx, human.playerId);
      expect(state.offers.length).toBeGreaterThan(0);
      for (const offer of state.offers) {
        expect(offer.team.length).toBeGreaterThan(0);
        expect(offer.power).toBeGreaterThan(0);
        // No marker of any kind: the offer list cannot tell a bot from a person, which is
        // the owner's decision and the only reason the ladder reads as alive.
        expect(profileNameSchema.safeParse(offer.profileName).success).toBe(true);
      }
    });

    it('can be fought and settled like anybody else', async () => {
      await seedLadder(ctx);
      const human = await makePlayer();

      const offered = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.roster.starters),
        cookies: { mv_session: human.cookie },
      });
      const starters = offered.json().data.starters as { key: string }[];
      const granted = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.roster.chooseStarter),
        cookies: { mv_session: human.cookie },
        payload: { championKey: starters[0]!.key },
      });
      const team = (granted.json().data.champions as { id: string }[]).map((entry) => entry.id);

      const state = await arena.overview(ctx, human.playerId);
      const view = await arena.attack(ctx, {
        playerId: human.playerId,
        offerId: state.offers[0]!.offerId,
        team,
        actionId: 'bots-test-0001-idem',
      });
      const played = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(view.id)),
        cookies: { mv_session: human.cookie },
        payload: { actionId: `bot-fight-${view.id}`, auto: true },
      });
      expect(played.statusCode, played.body).toBe(200);

      const result = played.json().data.rewards.arena as { ratingDelta: number };
      expect(result.ratingDelta).not.toBe(0);
      // The bot's own rating moved too — it defended, whether or not anybody was home.
      const [defender] = await app.db
        .select({ rating: arenaState.rating })
        .from(arenaState)
        .where(eq(arenaState.playerId, view.stageKey));
      expect(defender!.rating).not.toBe(state.offers[0]!.rating);
    });
  });
});

/** Republishes the bot bands, the way the config editor would. */
async function publishBands(app: FastifyInstance, bands: Record<string, unknown>): Promise<void> {
  await app.db
    .update(contentEntries)
    .set({ data: { key: 'arena.botBands', value: bands, group: 'arena', label: '', help: '' } })
    .where(eq(contentEntries.key, 'arena.botBands'));
  await app.content.load();
}
