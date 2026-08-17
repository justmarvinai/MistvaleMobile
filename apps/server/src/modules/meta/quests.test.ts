import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { and, eq } from 'drizzle-orm';
import {
  ROUTES,
  apiPath,
  type GoalEvent,
  type QuestChest,
  type QuestStanding,
  type QuestsView,
} from '@mistvale/shared';
import {
  contentEntries,
  contentRevisions,
  economyLog,
  playerItems,
  playerQuests,
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
import { track } from './progress';
import { awardFirstWin, nextResetAt, questConfigFrom } from './quests';

/**
 * Claiming: the checklist, its chest, and the day's first win.
 *
 * The fan-out is tested next door (`progress.test.ts`); what is pinned here is everything
 * that happens *after* a quest finishes — that it pays once, that a retried claim does not
 * pay twice, that the chest needs the whole list and not merely most of it, and that the
 * bonus which lands without a button lands exactly once a day.
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
      note: 'quests fixture',
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

describe.skipIf(!dbUp)('quests', () => {
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
    // The checklist opens at account level 4; everything below is about what happens
    // after that, so lift every account past the gate unless a test says otherwise.
    await setLevel(20);
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const setLevel = (level: number) =>
    app.db.update(players).set({ level }).where(eq(players.id, playerId));

  const report = (events: readonly GoalEvent[]) =>
    app.db.transaction((tx) => track(tx, { content: app.content }, playerId, events));

  async function read(): Promise<QuestsView> {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.quests.state) });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data.quests as QuestsView;
  }

  const questIn = (view: QuestsView, key: string): QuestStanding =>
    view.quests.find((quest) => quest.questKey === key)!;

  const chestIn = (view: QuestsView, period: string): QuestChest | undefined =>
    view.chests.find((chest) => chest.period === period);

  const claim = (key: string, actionId: string) =>
    as({
      method: 'POST',
      url: apiPath(ROUTES.quests.claim(key)),
      payload: { actionId },
    });

  const claimChest = (period: string, actionId: string) =>
    as({
      method: 'POST',
      url: apiPath(ROUTES.quests.claimChest),
      payload: { period, actionId },
    });

  /** Wallet and stacks, for asserting a payout landed. */
  async function holdings(): Promise<{
    silver: number;
    crystals: number;
    items: Map<string, number>;
  }> {
    const [wallet] = await app.db
      .select({ silver: players.silver, crystals: players.crystals })
      .from(players)
      .where(eq(players.id, playerId));
    const rows = await app.db.select().from(playerItems).where(eq(playerItems.playerId, playerId));
    return {
      silver: wallet!.silver,
      crystals: wallet!.crystals,
      items: new Map(rows.map((row) => [row.itemKey, row.quantity])),
    };
  }

  /** Finishes a quest outright, whatever its goals ask for. */
  async function finish(questKey: string): Promise<void> {
    const def = app.content.current().bundle.quests.find((entry) => entry.key === questKey)!;
    await report(
      def.goals.map((goal) => ({
        type: goal.type,
        amount: goal.target,
        facts: goal.filters,
      })),
    );
  }

  describe('reading', () => {
    it('shows every quest the account has reached, with its progress', async () => {
      await report([{ type: 'battleWin', facts: { mode: 'campaign' } }]);
      const view = await read();

      const daily = questIn(view, 'daily_campaign_wins');
      expect(daily.goals[0]?.progress).toBe(1);
      expect(daily.goals[0]?.complete).toBe(false);
      expect(daily.complete).toBe(false);
      expect(daily.claimed).toBe(false);
      // The reward map is echoed so a claim's payout is the server's word, not a sum the
      // client worked out from a content bundle that might be a revision behind.
      expect(daily.rewards.silver).toBeGreaterThan(0);
    });

    it('answers with the boundaries the screen counts down to', async () => {
      const view = await read();
      expect(view.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(view.dailyResetAt).getTime()).toBeGreaterThan(Date.now());
      // A Monday and a first — the anchors the weekly and monthly tabs are grouped by.
      expect(new Date(`${view.weekAnchor}T00:00:00Z`).getUTCDay()).toBe(1);
      expect(view.monthAnchor.endsWith('-01')).toBe(true);
    });

    it('holds the whole screen shut below the unlock level', async () => {
      await setLevel(1);
      const view = await read();
      // Progress still accrues below the gate — a first day is not thrown away — but
      // nothing is claimable and the badge stays quiet.
      expect(view.claimable).toBe(0);

      await finish('daily_campaign_wins');
      const response = await claim('daily_campaign_wins', 'too-early-0001');
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('LOCKED_CONTENT');
    });
  });

  describe('claiming a quest', () => {
    it('pays exactly what the definition says, once', async () => {
      const before = await holdings();
      await finish('daily_campaign_wins');
      expect(questIn(await read(), 'daily_campaign_wins').complete).toBe(true);

      const response = await claim('daily_campaign_wins', 'claim-0001');
      expect(response.statusCode, response.body).toBe(200);
      const def = app.content
        .current()
        .bundle.quests.find((entry) => entry.key === 'daily_campaign_wins')!;
      expect(response.json().data.paid.silver).toBe(def.rewards.silver);

      const after = await holdings();
      expect(after.silver - before.silver).toBe(def.rewards.silver);
      expect(questIn(response.json().data.quests, 'daily_campaign_wins').claimed).toBe(true);
    });

    it('pays a reward that is an item, not only a currency', async () => {
      // The bug this guards: a reward map folded into a currency bundle silently drops
      // every item key, so content that pays a sigil validates, publishes and pays air.
      await finish('daily_energy');
      const response = await claim('daily_energy', 'items-0001');
      expect(response.statusCode, response.body).toBe(200);

      const def = app.content.current().bundle.quests.find((e) => e.key === 'daily_energy')!;
      const [itemKey, amount] = Object.entries(def.rewards)[0]!;
      expect(response.json().data.paid[itemKey]).toBe(amount);
      expect((await holdings()).items.get(itemKey)).toBe(amount);
    });

    it('refuses a quest that is not finished', async () => {
      await report([{ type: 'battleWin', facts: { mode: 'campaign' } }]);
      const response = await claim('daily_campaign_wins', 'too-soon-0001');
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION');
    });

    it('refuses a second claim, and replays a retried one', async () => {
      await finish('daily_campaign_wins');
      const first = await claim('daily_campaign_wins', 'once-0001');
      expect(first.statusCode).toBe(200);
      const paid = (await holdings()).silver;

      // Same action id: a dropped response on a phone, retried. Answers as before and
      // pays nothing again.
      const retry = await claim('daily_campaign_wins', 'once-0001');
      expect(retry.statusCode, retry.body).toBe(200);
      expect(retry.json().data.paid).toEqual(first.json().data.paid);
      expect((await holdings()).silver).toBe(paid);

      // A different action id on a claimed quest is a second click, and is refused.
      const second = await claim('daily_campaign_wins', 'twice-0002');
      expect(second.statusCode).toBe(409);
      expect((await holdings()).silver).toBe(paid);
    });

    it('stops a claimed quest from advancing any further', async () => {
      await finish('daily_campaign_wins');
      await claim('daily_campaign_wins', 'frozen-0001');
      await report([{ type: 'battleWin', facts: { mode: 'campaign' } }]);

      const [row] = await app.db
        .select()
        .from(playerQuests)
        .where(
          and(
            eq(playerQuests.playerId, playerId),
            eq(playerQuests.questKey, 'daily_campaign_wins'),
          ),
        );
      const def = app.content.current().bundle.quests.find((e) => e.key === 'daily_campaign_wins')!;
      expect(row?.progress[0]).toBe(def.goals[0]?.target);
    });

    it('writes the claim to the ledger under its own source', async () => {
      await finish('daily_campaign_wins');
      await claim('daily_campaign_wins', 'ledger-0001');
      const rows = await app.db.select().from(economyLog).where(eq(economyLog.playerId, playerId));
      expect(rows.filter((row) => row.source === 'quest:daily_campaign_wins')).toHaveLength(1);
    });
  });

  describe('the completion chest', () => {
    /** Claims every daily that counts towards the chest. */
    async function claimAllDailies(): Promise<void> {
      const dailies = app.content
        .current()
        .bundle.quests.filter((def) => def.period === 'daily' && def.countsTowardChest);
      for (const def of dailies) {
        await finish(def.key);
        const response = await claim(def.key, `chest-run-${def.key}`);
        expect(response.statusCode, `${def.key}: ${response.body}`).toBe(200);
      }
    }

    it('counts claimed quests, not merely finished ones', async () => {
      const def = app.content
        .current()
        .bundle.quests.find((entry) => entry.period === 'daily' && entry.countsTowardChest)!;
      await finish(def.key);

      const view = await read();
      const chest = chestIn(view, 'daily')!;
      // Finished is not collected: the chest is the reward for finishing the *list*, and
      // a list you have not collected is a list you have not finished.
      expect(chest.claimedQuests).toBe(0);
      expect(chest.required).toBeGreaterThan(1);
      expect(chest.claimable).toBe(false);
    });

    it('refuses until every counting quest is claimed', async () => {
      const response = await claimChest('daily', 'early-chest-0001');
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toMatch(/claim all/i);
    });

    it('pays the chest once the list is done, and reports the day as finished', async () => {
      const before = await holdings();
      await claimAllDailies();

      const ready = chestIn(await read(), 'daily')!;
      expect(ready.claimedQuests).toBe(ready.required);
      expect(ready.claimable).toBe(true);

      const response = await claimChest('daily', 'chest-0001');
      expect(response.statusCode, response.body).toBe(200);
      const chestRewards = questConfigFrom(app.content.current().bundle.config).chests.daily!;
      expect(response.json().data.paid.crystals).toBe(chestRewards.crystals);

      const after = await holdings();
      expect(after.crystals - before.crystals).toBeGreaterThanOrEqual(chestRewards.crystals ?? 0);
      expect(chestIn(response.json().data.quests, 'daily')!.claimed).toBe(true);

      // The chest is what "claimed a full day" means, so it — not the last quest — is what
      // the weekly and monthly count. Both advance from the one claim.
      const [weekly] = await app.db
        .select()
        .from(playerQuests)
        .where(
          and(eq(playerQuests.playerId, playerId), eq(playerQuests.questKey, 'weekly_dailies')),
        );
      expect(weekly?.progress[0]).toBe(1);
    });

    it('refuses a second chest, and replays a retried one', async () => {
      await claimAllDailies();
      const first = await claimChest('daily', 'chest-once-0001');
      expect(first.statusCode).toBe(200);
      const crystals = (await holdings()).crystals;

      const retry = await claimChest('daily', 'chest-once-0001');
      expect(retry.statusCode, retry.body).toBe(200);
      expect((await holdings()).crystals).toBe(crystals);

      const second = await claimChest('daily', 'chest-twice-0002');
      expect(second.statusCode).toBe(409);
      expect((await holdings()).crystals).toBe(crystals);
    });

    it('offers no chest for a period the config does not pay one for', async () => {
      // The weekly and monthly lists are their own reward at EA; a period absent from the
      // config has no chest at all rather than an empty meter nobody can fill.
      const view = await read();
      expect(chestIn(view, 'weekly')).toBeUndefined();
      const response = await claimChest('weekly', 'no-such-chest-0001');
      expect(response.statusCode).toBe(404);
    });
  });

  describe('every daily is reachable', () => {
    /**
     * The test this suite was missing, and the reason it shipped broken.
     *
     * Everything above fabricates events and reports them straight to the fan-out, which
     * proves the fan-out works and proves nothing at all about whether the *game* ever
     * sends them. Four of the eight dailies asked for events no module emitted, so they
     * could never complete — and the chest that needs all eight could never be opened.
     *
     * A checklist is a promise that the game will notice. This is the assertion that keeps
     * it: every goal type the shipped quests ask for must be one some module reports.
     */
    it('asks only for events some module actually reports', () => {
      // Kept by hand on purpose. Adding a goal type to a quest without wiring a `track`
      // call should fail here loudly, rather than in a player's empty progress bar.
      const REPORTED = new Set([
        // battle/service.ts
        'battleWin',
        'stageClear',
        'bossKill',
        'dungeonClear',
        'useEnergy',
        'chapterStars',
        // arena/ladder.ts
        'arenaBattle',
        'arenaWin',
        'arenaTier',
        // summon/service.ts
        'summon',
        'championObtained',
        // roster/progression.ts
        'championLevelUp',
        'championRankUp',
        'championAscend',
        // gear/service.ts
        'gearUpgrade',
        'gearLevel',
        // shop/service.ts
        'shopPurchase',
        // mastery/service.ts
        'masteryLearn',
        // meta/progress.ts appends it to every report
        'accountLevel',
        // meta/quests.ts, on the daily chest
        'claimAllDailies',
      ]);

      const asked = new Set(
        app.content.current().bundle.quests.flatMap((def) => def.goals.map((goal) => goal.type)),
      );
      const orphaned = [...asked].filter((type) => !REPORTED.has(type));
      expect(orphaned, `no module reports: ${orphaned.join(', ')}`).toEqual([]);
    });

    it('completes a daily off the real summon endpoint', async () => {
      // Not a fabricated event: an actual pull, through the actual route.
      const def = app.content.current().bundle.quests.find((e) => e.key === 'daily_summon')!;
      const pool = app.content.current().bundle.summonPools[0]!;
      await app.db
        .insert(playerItems)
        .values({ playerId, itemKey: pool.sigilKey, quantity: 50 })
        .onConflictDoUpdate({
          target: [playerItems.playerId, playerItems.itemKey],
          set: { quantity: 50 },
        });

      const target = def.goals[0]!.target;
      for (let index = 0; index < target; index += 1) {
        const response = await as({
          method: 'POST',
          url: apiPath(ROUTES.summon.pull(pool.key)),
          payload: { count: 1, actionId: `real-pull-${index}` },
        });
        expect(response.statusCode, response.body).toBe(200);
      }

      expect(questIn(await read(), 'daily_summon').complete).toBe(true);
      const claimed = await claim('daily_summon', 'real-summon-0001');
      expect(claimed.statusCode, claimed.body).toBe(200);
    });

    it('completes a daily off the real Bazaar endpoint', async () => {
      // Rich in both currencies before reading the stock: the Bazaar's window is rolled
      // from a fresh seed every time, so which slots appear — and what they cost — differs
      // per run. A test that assumed the first slot was affordable would pass most days.
      await app.db
        .update(players)
        .set({ silver: 5_000_000, crystals: 100_000 })
        .where(eq(players.id, playerId));

      const stock = await as({ method: 'GET', url: apiPath(ROUTES.shop.stock('bazaar')) });
      expect(stock.statusCode, stock.body).toBe(200);
      const slots = stock.json().data.stock.slots as {
        index: number;
        purchased: boolean;
        slotLocked: boolean;
        unavailableReason: string | null;
      }[];

      const buyable = slots.find(
        (slot) => !slot.purchased && !slot.slotLocked && slot.unavailableReason === null,
      );
      expect(buyable, 'the Bazaar offered nothing buyable').toBeDefined();

      const bought = await as({
        method: 'POST',
        url: apiPath(ROUTES.shop.buy('bazaar')),
        payload: { slotIndex: buyable!.index, actionId: 'real-buy-0001' },
      });
      expect(bought.statusCode, bought.body).toBe(200);

      expect(questIn(await read(), 'daily_bazaar').complete).toBe(true);
    });
  });

  describe('the day’s first win', () => {
    it('pays once per mode per day', async () => {
      const bonus = questConfigFrom(app.content.current().bundle.config).firstWins.campaign!;
      const before = await holdings();

      const paid = await app.db.transaction((tx) =>
        awardFirstWin(tx, { content: app.content }, playerId, 'campaign'),
      );
      expect(paid.silver).toBe(bonus.silver);
      expect((await holdings()).silver - before.silver).toBe(bonus.silver ?? 0);

      // The second win of the day pays nothing, and says so by paying nothing rather than
      // by failing — the battle that produced it is still a perfectly good battle.
      const again = await app.db.transaction((tx) =>
        awardFirstWin(tx, { content: app.content }, playerId, 'campaign'),
      );
      expect(again).toEqual({});
      expect((await holdings()).silver - before.silver).toBe(bonus.silver ?? 0);
    });

    it('is per mode, not per day overall', async () => {
      await app.db.transaction((tx) =>
        awardFirstWin(tx, { content: app.content }, playerId, 'campaign'),
      );
      const arena = await app.db.transaction((tx) =>
        awardFirstWin(tx, { content: app.content }, playerId, 'arena'),
      );
      expect(arena.valorMedals).toBeGreaterThan(0);
    });

    it('pays nothing for a mode the config leaves out', async () => {
      // Practice is free and pays nothing by design; a first-win bonus on it would make
      // the sandbox the cheapest silver in the game.
      const paid = await app.db.transaction((tx) =>
        awardFirstWin(tx, { content: app.content }, playerId, 'practice'),
      );
      expect(paid).toEqual({});
    });

    it('shows on the screen as taken once it has been', async () => {
      expect((await read()).firstWins.find((win) => win.mode === 'campaign')?.claimed).toBe(false);
      await app.db.transaction((tx) =>
        awardFirstWin(tx, { content: app.content }, playerId, 'campaign'),
      );
      expect((await read()).firstWins.find((win) => win.mode === 'campaign')?.claimed).toBe(true);
    });

    it('says why a mode is out of reach rather than hiding it', async () => {
      await setLevel(4);
      const arena = (await read()).firstWins.find((win) => win.mode === 'arena');
      expect(arena?.lockedReason).toMatch(/level 8/);
    });
  });

  describe('the dock badge', () => {
    it('counts what is waiting, and drops as it is collected', async () => {
      const snapshot = async () => {
        const response = await as({ method: 'GET', url: apiPath(ROUTES.player.self) });
        return response.json().data.badges.quests as number;
      };

      expect(await snapshot()).toBe(0);
      await finish('daily_campaign_wins');
      expect(await snapshot()).toBe(1);

      await finish('daily_energy');
      expect(await snapshot()).toBe(2);

      await claim('daily_campaign_wins', 'badge-0001');
      expect(await snapshot()).toBe(1);
    });
  });

  describe('the reset countdown', () => {
    it('lands on the configured hour, in the configured timezone', () => {
      const config = app.content.current().bundle.config;
      const from = new Date('2026-03-16T12:00:00Z');
      const reset = nextResetAt(config, from);

      expect(reset.getTime()).toBeGreaterThan(from.getTime());
      // Inside a day of now: whatever hour the operator picked, the next one is not far.
      expect(reset.getTime() - from.getTime()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);

      const hour = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hourCycle: 'h23',
        timeZone: String(config['ops.dailyResetTimezone']),
      }).format(reset);
      expect(Number(hour)).toBe(config['ops.dailyResetHour']);
    });
  });
});
