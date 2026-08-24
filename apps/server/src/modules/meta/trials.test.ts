import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { ROUTES, apiPath, type TrialsOverview } from '@mistvale/shared';
import { contentEntries, contentRevisions, players, stageProgress } from '../../db/schema/index';
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

/**
 * Trials, against a real database and the real seed.
 *
 * The three claims worth proving are the ones the mode is: a trial is fought with nobody
 * (an account with an empty roster can open one), the par bonus is paid **once** and to the
 * run that earned it, and the chain is enforced server-side rather than only greyed out.
 *
 * The *balance* half — that the par is beatable and that Auto cannot beat it — is not here
 * and should not be: it is measured by `pnpm sim`, which fights the real stage with the real
 * engine. This file is about the plumbing around that fight.
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
      note: 'trial fixture',
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

describe.skipIf(!dbUp)('trials', () => {
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
        accountName: uniqueAccountName('solver'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
    // Trials open at level 9. Every test below is about what happens once they have.
    await app.db.update(players).set({ level: 20 }).where(eq(players.id, playerId));
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const overview = async (): Promise<TrialsOverview> => {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.trials.overview) });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data.trials as TrialsOverview;
  };

  /** The first trial in publish order — the only one open to a fresh account. */
  const firstTrial = (): string => {
    const stage = app.content
      .current()
      .bundle.stages.filter((entry) => entry.mode === 'trial')
      .sort((a, b) => a.sortOrder - b.sortOrder)[0];
    expect(stage, 'the seed publishes at least one trial').toBeDefined();
    return stage!.key;
  };

  /**
   * Records a clear at `turns`, exactly as a won fight would.
   *
   * Goes through the battle module's own path rather than writing `stage_progress` by hand,
   * because what is being tested is the arithmetic in `recordClear` — a hand-written row
   * would prove the test could write a row.
   */
  async function clearAt(stageKey: string, turns: number) {
    const stage = app.content.current().bundle.stages.find((entry) => entry.key === stageKey)!;
    const progress = await import('../progress/service');
    return app.db.transaction((tx) =>
      progress.recordClear(tx, playerId, stage, app.content, turns, 3),
    );
  }

  it('publishes trials, and every one carries a par and a team', async () => {
    const view = await overview();
    expect(view.total).toBeGreaterThan(0);
    expect(view.beaten).toBe(0);
    for (const trial of view.trials) {
      expect(trial.parTurns).toBeGreaterThan(0);
      expect(trial.team.length).toBeGreaterThan(0);
      expect(trial.hint.length).toBeGreaterThan(0);
      expect(trial.bestTurns).toBeNull();
      expect(trial.cleared).toBe(false);
      expect(trial.beaten).toBe(false);
    }
  });

  it('is shut before the account reaches the level it opens at', async () => {
    await app.db.update(players).set({ level: 5 }).where(eq(players.id, playerId));
    const view = await overview();
    expect(view.total).toBe(0);
    expect(view.trials).toEqual([]);
  });

  it('offers only the first one until it is cleared', async () => {
    const view = await overview();
    const [first, second] = view.trials;
    expect(first!.blockedReason).toBeNull();
    expect(second!.blockedReason).not.toBeNull();

    await clearAt(first!.key, first!.parTurns + 5);

    const after = await overview();
    expect(after.trials[1]!.blockedReason, 'clearing one opens the next').toBeNull();
  });

  it('pays the par bonus once, to the run that first came in under it', async () => {
    const key = firstTrial();
    const stage = app.content.current().bundle.stages.find((entry) => entry.key === key)!;
    const par = stage.trial!.parTurns;

    const slow = await clearAt(key, par + 4);
    expect(slow.beatPar, 'over par pays nothing').toBe(false);
    expect(slow.bonus).toEqual({});

    const fast = await clearAt(key, par - 1);
    expect(fast.beatPar, 'the first run inside par pays').toBe(true);
    expect(fast.bonus).toEqual(stage.trial!.parRewards);

    const again = await clearAt(key, par - 2);
    expect(again.beatPar, 'and it never pays twice').toBe(false);
    expect(again.bonus).toEqual({});
  });

  it('pays on the first clear when that clear is already inside par', async () => {
    const key = firstTrial();
    const stage = app.content.current().bundle.stages.find((entry) => entry.key === key)!;
    const first = await clearAt(key, stage.trial!.parTurns);
    expect(first.beatPar, 'at par counts as inside it').toBe(true);
    expect(first.firstClear).toBe(true);
  });

  it('reports the best turn count and marks the trial beaten', async () => {
    const key = firstTrial();
    const stage = app.content.current().bundle.stages.find((entry) => entry.key === key)!;
    const par = stage.trial!.parTurns;

    await clearAt(key, par + 6);
    let view = await overview();
    expect(view.trials[0]!.cleared).toBe(true);
    expect(view.trials[0]!.beaten).toBe(false);
    expect(view.trials[0]!.bestTurns).toBe(par + 6);
    expect(view.beaten).toBe(0);

    await clearAt(key, par - 3);
    view = await overview();
    expect(view.trials[0]!.beaten).toBe(true);
    expect(view.trials[0]!.bestTurns).toBe(par - 3);
    expect(view.beaten).toBe(1);
  });

  it('records the clear against the trial mode, so it never counts as campaign progress', async () => {
    const key = firstTrial();
    await clearAt(key, 9);
    const [row] = await app.db
      .select({ mode: stageProgress.mode })
      .from(stageProgress)
      .where(and(eq(stageProgress.playerId, playerId), eq(stageProgress.stageKey, key)));
    expect(row?.mode).toBe('trial');
  });

  it('refuses to farm a trial in a batch', async () => {
    // A team has to be sent for the request to be well-formed at all — the refusal being
    // tested is the mode's, not the schema's, so one champion is granted to get past it.
    const defs = app.content.current().bundle.champions.filter((champion) => !champion.isFood);
    const roster = await import('../roster/service');
    const owned = await app.db.transaction((tx) =>
      roster.grantChampion(tx, playerId, defs[0]!.key, {}, defs),
    );

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.multi),
      payload: {
        mode: 'trial',
        stageKey: firstTrial(),
        team: [owned.id],
        runs: 5,
        actionId: 'trial-batch-1',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/solved once/i);
  });

  it('opens the fight with no champions at all, and spends no energy doing it', async () => {
    const key = firstTrial();
    const before = await app.db
      .select({ energy: players.energy })
      .from(players)
      .where(eq(players.id, playerId));

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.start),
      payload: { mode: 'trial', stageKey: key, team: [], actionId: 'trial-open-1' },
    });
    expect(response.statusCode, response.body).toBe(200);

    const battle = response.json().data;
    expect(battle.state.allies.length, 'the stage brought its own team').toBe(4);
    expect(battle.stageKey).toBe(key);

    // Nothing was spent: a trial costs attempts, and an attempt is free. Compared against
    // what the bar held a moment ago rather than a constant, because energy regenerates from
    // the clock and a hard number would be a test about the regeneration curve.
    const [after] = await app.db
      .select({ energy: players.energy })
      .from(players)
      .where(eq(players.id, playerId));
    expect(after?.energy).toBe(before[0]?.energy);
  });

  it('gives every account the same fight, so a par is about play rather than luck', async () => {
    const key = firstTrial();
    const open = async (actionId: string) => {
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'trial', stageKey: key, team: [], actionId },
      });
      expect(response.statusCode, response.body).toBe(200);
      return response.json().data;
    };

    const first = await open('same-fight-1');
    await as({ method: 'POST', url: apiPath(ROUTES.battle.retreat(first.id)), payload: {} });
    const second = await open('same-fight-2');

    expect(second.state.seed, 'the seed is the stage, not the roll').toBe(first.state.seed);
    expect(second.state.rngState).toEqual(first.state.rngState);
    expect(second.state.allies.map((unit: { stats: unknown }) => unit.stats)).toEqual(
      first.state.allies.map((unit: { stats: unknown }) => unit.stats),
    );
  });
});
