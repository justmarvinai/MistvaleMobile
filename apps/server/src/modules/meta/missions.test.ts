import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { and, eq } from 'drizzle-orm';
import {
  ROUTES,
  apiPath,
  type GoalEvent,
  type MissionStanding,
  type MissionsView,
} from '@mistvale/shared';
import {
  contentEntries,
  contentRevisions,
  playerChampions,
  playerMissions,
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

/**
 * The Valewarden's Path.
 *
 * The chain's whole promise is that it *notices*: progress accrues on every step whatever
 * arc it lives in, so a player who farms hard early finds later arcs already part-done.
 * What the arc gate controls is only what may be claimed. Both halves of that are pinned
 * here, along with the one claim that matters more than any other — the last step of
 * eighty, which hands over a champion the Mistgate will never roll.
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
      note: 'missions fixture',
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

describe.skipIf(!dbUp)('missions', () => {
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
        accountName: uniqueAccountName('path'),
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

  const report = (events: readonly GoalEvent[]) =>
    app.db.transaction((tx) => track(tx, { content: app.content }, playerId, events));

  async function read(): Promise<MissionsView> {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.missions.state) });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data.missions as MissionsView;
  }

  const stepIn = (view: MissionsView, key: string): MissionStanding =>
    view.arcs.flatMap((arc) => arc.missions).find((entry) => entry.missionKey === key)!;

  const claim = (key: string, actionId: string) =>
    as({ method: 'POST', url: apiPath(ROUTES.missions.claim(key)), payload: { actionId } });

  /** Finishes a mission outright, whatever its goals ask for. */
  async function finish(missionKey: string): Promise<void> {
    const def = app.content.current().bundle.missions.find((entry) => entry.key === missionKey)!;
    await report(
      def.goals.map((goal) => ({ type: goal.type, amount: goal.target, facts: goal.filters })),
    );
  }

  /** Claims every step of an arc, finishing each first. */
  async function walkArc(arc: number): Promise<void> {
    const steps = app.content.current().bundle.missions.filter((def) => def.arc === arc);
    for (const def of steps) {
      await finish(def.key);
      const response = await claim(def.key, `walk-${def.key}`);
      expect(response.statusCode, `${def.key}: ${response.body}`).toBe(200);
    }
  }

  describe('the shape of the Path', () => {
    it('lays out every arc, with only the first one open', async () => {
      const view = await read();
      expect(view.total).toBe(80);
      expect(view.arcs).toHaveLength(10);
      expect(view.arcs[0]?.open).toBe(true);
      expect(view.arcs[1]?.open).toBe(false);
      expect(view.currentArc).toBe(1);
      // The arcs ahead are named even while shut — the road you can see is the reason to
      // walk it.
      expect(view.arcs.at(-1)?.name).toBe('Court of the Coilmother');
    });

    it('opens the next arc only when this one is entirely claimed', async () => {
      await walkArc(1);
      const view = await read();
      expect(view.arcs[0]?.finished).toBe(true);
      expect(view.arcs[1]?.open).toBe(true);
      expect(view.arcs[2]?.open).toBe(false);
      expect(view.currentArc).toBe(2);
    });

    it('does not open an arc on completion alone — the steps have to be collected', async () => {
      const steps = app.content.current().bundle.missions.filter((def) => def.arc === 1);
      for (const def of steps) await finish(def.key);

      const view = await read();
      expect(view.arcs[0]?.missions.every((entry) => entry.complete)).toBe(true);
      expect(view.arcs[0]?.finished).toBe(false);
      expect(view.arcs[1]?.open).toBe(false);
    });
  });

  describe('progress', () => {
    it('accrues on every arc, not only the open one', async () => {
      // The property the whole design turns on: somebody who farms the Depths hard in arc
      // 4 must not restart arc 8's "clear one hundred floors" from zero.
      await report([{ type: 'dungeonClear', amount: 30, facts: { dungeonKey: 'wyrms_hollow' } }]);

      const view = await read();
      const laterArc = stepIn(view, 'm08_hundred_floors');
      expect(laterArc.goals[0]?.progress).toBe(30);
      expect(laterArc.claimed).toBe(false);
      // Visible, counted — and not claimable, because its arc is six behind.
      expect(laterArc.claimable).toBe(false);
    });

    it('refuses a claim in a shut arc, and says which arc is in the way', async () => {
      await finish('m08_hundred_floors');
      const response = await claim('m08_hundred_floors', 'too-far-0001');
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('LOCKED_CONTENT');
      expect(response.json().error.message).toMatch(/Awakening the Gate/);
    });

    it('refuses a claim on a step that is not finished', async () => {
      const response = await claim('m01_first_blood', 'unearned-0001');
      expect(response.statusCode).toBe(400);
    });
  });

  describe('claiming', () => {
    it('pays the step and marks it walked', async () => {
      await finish('m01_first_blood');
      const [before] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));

      const response = await claim('m01_first_blood', 'first-0001');
      expect(response.statusCode, response.body).toBe(200);

      const def = app.content.current().bundle.missions.find((e) => e.key === 'm01_first_blood')!;
      expect(response.json().data.paid.silver).toBe(def.rewards.silver);

      const [after] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));
      expect(after!.silver - before!.silver).toBe(def.rewards.silver);
      expect(stepIn(response.json().data.missions, 'm01_first_blood').claimed).toBe(true);
    });

    it('refuses a second claim, and replays a retried one', async () => {
      await finish('m01_first_blood');
      const first = await claim('m01_first_blood', 'once-0001');
      expect(first.statusCode).toBe(200);
      const [paid] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));

      const retry = await claim('m01_first_blood', 'once-0001');
      expect(retry.statusCode, retry.body).toBe(200);
      const [afterRetry] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));
      expect(afterRetry!.silver).toBe(paid!.silver);

      const second = await claim('m01_first_blood', 'twice-0002');
      expect(second.statusCode).toBe(409);
    });

    it('stops a claimed step from advancing any further', async () => {
      await finish('m01_five_stages');
      await claim('m01_five_stages', 'frozen-0001');
      await report([
        { type: 'stageClear', facts: { mode: 'campaign', stageKey: 'c01_s1_normal' } },
      ]);

      const [row] = await app.db
        .select()
        .from(playerMissions)
        .where(
          and(
            eq(playerMissions.playerId, playerId),
            eq(playerMissions.missionKey, 'm01_five_stages'),
          ),
        );
      const def = app.content.current().bundle.missions.find((e) => e.key === 'm01_five_stages')!;
      expect(row?.progress[0]).toBe(def.goals[0]?.target);
    });

    it('says when a claim closed the arc', async () => {
      const steps = app.content.current().bundle.missions.filter((def) => def.arc === 1);
      for (const def of steps) await finish(def.key);

      for (const [index, def] of steps.entries()) {
        const response = await claim(def.key, `arc-${def.key}`);
        const last = index === steps.length - 1;
        expect(response.json().data.arcCompleted, `${def.key}`).toBe(last);
      }
    });
  });

  describe('the end of the Path', () => {
    /** Walks every arc but the last, so arc 10 is open. */
    async function reachTheEnd(): Promise<void> {
      for (let arc = 1; arc <= 9; arc += 1) await walkArc(arc);
    }

    it('hands over a champion nobody can summon, and the title with her', async () => {
      await reachTheEnd();
      await finish('m10_the_voice');

      const view = await read();
      expect(stepIn(view, 'm10_the_voice').claimable).toBe(true);
      expect(stepIn(view, 'm10_the_voice').grantsChampions).toEqual(['aureleth']);

      const response = await claim('m10_the_voice', 'the-voice-0001');
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.champions).toEqual(['aureleth']);
      expect(response.json().data.title).toBe('Warden of the Reclamation');

      // She is on the roster, and she is unsummonable — the Path is the only way she
      // exists at all, which is what makes the eighty steps worth walking.
      const owned = await app.db
        .select()
        .from(playerChampions)
        .where(
          and(eq(playerChampions.playerId, playerId), eq(playerChampions.championKey, 'aureleth')),
        );
      expect(owned).toHaveLength(1);
      const def = app.content.current().bundle.champions.find((c) => c.key === 'aureleth')!;
      expect(def.summonable).toBe(false);

      const [player] = await app.db
        .select({ title: players.title })
        .from(players)
        .where(eq(players.id, playerId));
      expect(player!.title).toBe('Warden of the Reclamation');
    });

    it('shows the earned title on the Path and on the snapshot', async () => {
      await reachTheEnd();
      await finish('m10_the_voice');
      await claim('m10_the_voice', 'the-voice-0002');

      expect((await read()).title).toBe('Warden of the Reclamation');
      const snapshot = await as({ method: 'GET', url: apiPath(ROUTES.player.self) });
      expect(snapshot.json().data.title).toBe('Warden of the Reclamation');
    });
  });

  describe('the dock badge', () => {
    it('counts only what is claimable, not everything finished', async () => {
      const badge = async () => {
        const response = await as({ method: 'GET', url: apiPath(ROUTES.player.self) });
        return response.json().data.badges.missions as number;
      };

      expect(await badge()).toBe(0);

      // A step in a shut arc, finished. Real progress, and nothing to collect — so the
      // pip stays quiet rather than pointing at a button that would refuse.
      await finish('m08_hundred_floors');
      expect(await badge()).toBe(0);

      await finish('m01_first_blood');
      expect(await badge()).toBe(1);

      await claim('m01_first_blood', 'badge-0001');
      expect(await badge()).toBe(0);
    });
  });
});
