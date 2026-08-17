import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { and, eq } from 'drizzle-orm';
import {
  ROUTES,
  apiPath,
  eventWindowAt,
  type EventDef,
  type EventStanding,
  type EventsView,
  type GoalEvent,
} from '@mistvale/shared';
import { contentEntries, contentRevisions, playerEvents, players } from '../../db/schema/index';
import { buildSeedContent } from '../../db/seed/seeders';
import * as contentRepo from '../../content/repo';
import { validateAndNormalise, type ContentSet } from '../../content/validate';
import { gameDayFrom } from '../../lib/game-day';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../../test/harness';
import { track } from './progress';
import * as events from './events';

/**
 * Timed events.
 *
 * The schedule arithmetic is pinned pure next door (`content/schedule.test.ts`). What is
 * pinned here is everything that touches a player: that points only accrue while an event
 * is running, that a new occurrence starts the ladder over, that a finished ladder stays
 * collectable after the window shuts, and that a milestone pays once.
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
      note: 'events fixture',
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

describe.skipIf(!dbUp)('events', () => {
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
        accountName: uniqueAccountName('feast'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
    // Level 20: past every seeded event's unlock, so the gate is not what any of these
    // tests are measuring.
    await app.db.update(players).set({ level: 20 }).where(eq(players.id, playerId));
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const ctx = () => ({ db: app.db, content: app.content });
  const defOf = (key: string): EventDef =>
    app.content.current().bundle.events.find((entry) => entry.key === key)!;

  const report = (reports: readonly GoalEvent[], now: Date) =>
    app.db.transaction((tx) => track(tx, { content: app.content }, playerId, reports, { now }));

  const read = async (now?: Date): Promise<EventsView> => events.overview(ctx(), playerId, now);
  const standing = (view: EventsView, key: string): EventStanding | undefined =>
    view.events.find((entry) => entry.eventKey === key);

  /**
   * A moment when a given event is definitely running.
   *
   * Derived rather than hardcoded: the events are weekly in *game-days*, so "when is the
   * Delve on" depends on the operator's reset hour and timezone. Walking forward a day at
   * a time and asking the same function the server asks is the only way this test says
   * something true whatever those are set to.
   */
  function whileRunning(key: string, from = new Date('2026-03-16T12:00:00Z')): Date {
    const def = defOf(key);
    const config = app.content.current().bundle.config;
    for (let step = 0; step < 14; step += 1) {
      const at = new Date(from.getTime() + step * 24 * 60 * 60 * 1000);
      const day = gameDayFrom(config, at);
      if (eventWindowAt(def.schedule, day.date, day.weekday, at)) return at;
    }
    throw new Error(`${key} never runs in a fortnight — its schedule is wrong.`);
  }

  /** A moment when it is definitely *not* running. */
  function whileShut(key: string, from = new Date('2026-03-16T12:00:00Z')): Date {
    const def = defOf(key);
    const config = app.content.current().bundle.config;
    for (let step = 0; step < 14; step += 1) {
      const at = new Date(from.getTime() + step * 24 * 60 * 60 * 1000);
      const day = gameDayFrom(config, at);
      if (!eventWindowAt(def.schedule, day.date, day.weekday, at)) return at;
    }
    throw new Error(`${key} never stops — its schedule is wrong.`);
  }

  describe('scoring', () => {
    it('pays points at the rule’s rate while the event is running', async () => {
      const at = whileRunning('event_champion_training');
      await report([{ type: 'championLevelUp', amount: 12 }], at);

      const rule = defOf('event_champion_training').pointRules.find(
        (entry) => entry.type === 'championLevelUp',
      )!;
      expect(standing(await read(at), 'event_champion_training')?.points).toBe(12 * rule.points);
    });

    it('scores nothing at all while the event is shut', async () => {
      const at = whileShut('event_champion_training');
      await report([{ type: 'championLevelUp', amount: 50 }], at);

      const rows = await app.db
        .select()
        .from(playerEvents)
        .where(
          and(
            eq(playerEvents.playerId, playerId),
            eq(playerEvents.eventKey, 'event_champion_training'),
          ),
        );
      expect(rows).toHaveLength(0);
    });

    it('weights a rule by its filter, so a rarer sigil is worth more', async () => {
      const at = whileRunning('event_summon_surge');
      await report([{ type: 'summon', amount: 1, facts: { poolKey: 'faded' } }], at);
      await report([{ type: 'summon', amount: 1, facts: { poolKey: 'radiant' } }], at);

      const def = defOf('event_summon_surge');
      const faded = def.pointRules.find((r) => r.filters.poolKey === 'faded')!.points;
      const radiant = def.pointRules.find((r) => r.filters.poolKey === 'radiant')!.points;
      expect(standing(await read(at), 'event_summon_surge')?.points).toBe(faded + radiant);
      expect(radiant).toBeGreaterThan(faded * 100);
    });

    it('starts the ladder over on the next occurrence', async () => {
      const first = whileRunning('event_depths_delve');
      await report([{ type: 'dungeonClear', amount: 5 }], first);
      const scored = standing(await read(first), 'event_depths_delve')?.points ?? 0;
      expect(scored).toBeGreaterThan(0);

      // A week later is the same event and a different occurrence — a fresh score, and
      // last week's row still sitting there untouched.
      const next = new Date(first.getTime() + 7 * 24 * 60 * 60 * 1000);
      expect(standing(await read(next), 'event_depths_delve')?.points).toBe(0);

      const rows = await app.db
        .select()
        .from(playerEvents)
        .where(eq(playerEvents.playerId, playerId));
      expect(rows.filter((row) => row.eventKey === 'event_depths_delve')).toHaveLength(1);
      expect(rows[0]?.points).toBe(scored);
    });

    it('adds up across separate reports rather than replacing', async () => {
      const at = whileRunning('event_depths_delve');
      await report([{ type: 'dungeonClear', amount: 2 }], at);
      await report([{ type: 'dungeonClear', amount: 3 }], at);

      const rate = defOf('event_depths_delve').pointRules.find(
        (entry) => entry.type === 'dungeonClear',
      )!.points;
      expect(standing(await read(at), 'event_depths_delve')?.points).toBe(5 * rate);
    });
  });

  describe('the page', () => {
    it('shows what earns points and the whole ladder', async () => {
      const at = whileRunning('event_champion_training');
      const view = standing(await read(at), 'event_champion_training')!;

      expect(view.live).toBe(true);
      expect(view.rules.length).toBeGreaterThan(0);
      expect(view.rules.every((rule) => rule.label.length > 0)).toBe(true);
      expect(view.milestones).toHaveLength(defOf('event_champion_training').milestones.length);
      expect(view.milestones.every((rung) => !rung.reached)).toBe(true);
    });

    it('hides an event the account has not reached', async () => {
      // The Delve opens at level 10; a fresh account is level 1.
      await app.db.update(players).set({ level: 1 }).where(eq(players.id, playerId));
      const at = whileRunning('event_depths_delve');
      expect(standing(await read(at), 'event_depths_delve')).toBeUndefined();
    });
  });

  describe('claiming', () => {
    /** Scores past the first milestone of an event, and returns the moment used. */
    async function reachFirstRung(key: string, type: GoalEvent['type']): Promise<Date> {
      const at = whileRunning(key);
      const def = defOf(key);
      const rate = def.pointRules.find((entry) => entry.type === type)!.points;
      const needed = Math.ceil(def.milestones[0]!.points / rate);
      await report([{ type, amount: needed }], at);
      return at;
    }

    it('pays a reached milestone, once', async () => {
      const at = await reachFirstRung('event_champion_training', 'championLevelUp');
      const [before] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));

      const claimed = await events.claimMilestone(
        ctx(),
        playerId,
        'event_champion_training',
        0,
        'rung-0001',
        at,
      );
      const rung = defOf('event_champion_training').milestones[0]!;
      expect(claimed.paid.silver).toBe(rung.rewards.silver);

      const [after] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));
      expect(after!.silver - before!.silver).toBe(rung.rewards.silver);
      expect(standing(claimed.events, 'event_champion_training')?.milestones[0]?.claimed).toBe(
        true,
      );
    });

    it('refuses a second claim, and replays a retried one', async () => {
      const at = await reachFirstRung('event_champion_training', 'championLevelUp');
      await events.claimMilestone(ctx(), playerId, 'event_champion_training', 0, 'once-0001', at);
      const [paid] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));

      const retry = await events.claimMilestone(
        ctx(),
        playerId,
        'event_champion_training',
        0,
        'once-0001',
        at,
      );
      expect(retry.paid).toBeDefined();
      const [afterRetry] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));
      expect(afterRetry!.silver).toBe(paid!.silver);

      await expect(
        events.claimMilestone(ctx(), playerId, 'event_champion_training', 0, 'twice-0002', at),
      ).rejects.toThrow(/already claimed/i);
    });

    it('refuses a milestone the score has not reached, and says by how much', async () => {
      const at = whileRunning('event_champion_training');
      await report([{ type: 'championLevelUp', amount: 1 }], at);
      await expect(
        events.claimMilestone(ctx(), playerId, 'event_champion_training', 5, 'early-0001', at),
      ).rejects.toThrow(/points/i);
    });

    it('keeps a finished ladder collectable after the window shuts', async () => {
      const at = await reachFirstRung('event_depths_delve', 'dungeonClear');

      // The day after it ends: no longer scoring, still owed.
      const view = await read(new Date(at.getTime() + 3 * 24 * 60 * 60 * 1000));
      const after = standing(view, 'event_depths_delve');
      expect(after, 'the event vanished the moment it ended').toBeDefined();
      expect(after?.live).toBe(false);
      expect(after?.milestones[0]?.reached).toBe(true);

      const claimed = await events.claimMilestone(
        ctx(),
        playerId,
        'event_depths_delve',
        0,
        'late-0001',
        new Date(at.getTime() + 3 * 24 * 60 * 60 * 1000),
      );
      expect(Object.keys(claimed.paid).length).toBeGreaterThan(0);
    });

    it('says an event is over rather than pretending it never existed', async () => {
      // "Shut" is not the same as "gone": the Delve runs Fri–Sun and stays collectable for
      // three days after, so Monday is shut *and* still claimable. What this test needs is
      // a day past the grace too — found by asking the screen, which is the only thing
      // that knows about both windows at once.
      const start = whileRunning('event_depths_delve');
      let gone: Date | null = null;
      for (let step = 1; step <= 14 && !gone; step += 1) {
        const at = new Date(start.getTime() + step * 24 * 60 * 60 * 1000);
        if (!standing(await read(at), 'event_depths_delve')) gone = at;
      }
      expect(gone, 'the Delve is never out of sight — grace is longer than its gap').not.toBeNull();

      await expect(
        events.claimMilestone(ctx(), playerId, 'event_depths_delve', 0, 'gone-0001', gone!),
      ).rejects.toThrow(/over/i);
    });

    it('404s for an event nobody published', async () => {
      await expect(
        events.claimMilestone(ctx(), playerId, 'event_imaginary', 0, 'nope-0001'),
      ).rejects.toThrow(/no such event/i);
    });
  });

  describe('the API and the badge', () => {
    it('serves the screen and counts what is waiting', async () => {
      const response = await as({ method: 'GET', url: apiPath(ROUTES.events.state) });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.events.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const snapshot = await as({ method: 'GET', url: apiPath(ROUTES.player.self) });
      expect(snapshot.json().data.badges.events).toBe(0);
    });

    it('turns an anonymous caller away', async () => {
      const response = await app.inject({ method: 'GET', url: apiPath(ROUTES.events.state) });
      expect(response.statusCode).toBe(401);
    });
  });
});
