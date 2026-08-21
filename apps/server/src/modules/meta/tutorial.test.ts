import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath, type TutorialStepDef, type TutorialView } from '@mistvale/shared';
import {
  contentEntries,
  contentRevisions,
  gearInstances,
  playerItems,
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
import { resetAccount } from '../../admin/players';
import { track } from './progress';
import * as tutorial from './tutorial';

/**
 * The scripted tutorial.
 *
 * Two rules hold the whole thing up. **A step's completion condition is an ordinary goal**,
 * so the tutorial advances off the same fan-out quests do and nothing that reports activity
 * knows the tutorial exists — the tests below prove that by advancing steps with raw
 * `track` calls rather than with anything tutorial-shaped. And **a step is a position, not
 * a key**, so an operator who re-cuts the script does not strand everybody who was halfway
 * through it on a number that no longer exists.
 *
 * The rest is the consequences: rewards paid once, the next step's kit handed over before
 * it is asked for, a retried advance that replays rather than pays, and a skip that means
 * it.
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
      note: 'tutorial fixture',
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

// ── The view, with no database in the way ───────────────────────────────────

/**
 * These run wherever `pnpm test` runs, Postgres or not.
 *
 * "Ready" is the one thing the overlay's Continue button reads, and getting it wrong in
 * either direction is a script that either cannot be walked or can be clicked straight
 * through.
 */
describe('what the overlay is told', () => {
  const stepDef = (number: number, extra: Partial<TutorialStepDef> = {}): TutorialStepDef => ({
    key: `step_${number}`,
    sortOrder: number,
    step: number,
    screen: 'haven',
    highlight: '',
    title: `Step ${number}`,
    body: 'Words.',
    rewards: {},
    grantsBefore: {},
    grantsRelics: [],
    portrait: '',
    sound: '',
    active: true,
    ...extra,
  });

  const ctxOf = (steps: TutorialStepDef[]): Parameters<typeof tutorial.build>[0] =>
    ({ content: { current: () => ({ bundle: { tutorialSteps: steps } }) } }) as never;

  const state = (over: Partial<Parameters<typeof tutorial.build>[1]> = {}) => ({
    tutorialStep: 0,
    tutorialProgress: 0,
    tutorialSkipped: false,
    ...over,
  });

  it('opens on the first step, numbered from one', () => {
    const view = tutorial.build(ctxOf([stepDef(1), stepDef(2)]), state());
    expect(view.current?.step).toBe(1);
    expect(view.current?.total).toBe(2);
    expect(view.finished).toBe(false);
  });

  it('calls a beat ready the moment it opens', () => {
    const view = tutorial.build(ctxOf([stepDef(1)]), state());
    expect(view.current?.ready).toBe(true);
    expect(view.current?.goal).toBeUndefined();
  });

  it('holds a goal step until its target is met', () => {
    const steps = [stepDef(1, { goal: { type: 'battleWin', target: 3, filters: {} } })];
    expect(tutorial.build(ctxOf(steps), state({ tutorialProgress: 2 })).current?.ready).toBe(false);
    expect(tutorial.build(ctxOf(steps), state({ tutorialProgress: 3 })).current?.ready).toBe(true);
  });

  it('reports finished once the cursor is past the last step', () => {
    const view = tutorial.build(ctxOf([stepDef(1), stepDef(2)]), state({ tutorialStep: 2 }));
    expect(view.current).toBeNull();
    expect(view.finished).toBe(true);
    expect(view.skipped).toBe(false);
  });

  it('reports a skip as a skip, not as a finish', () => {
    const view = tutorial.build(
      ctxOf([stepDef(1), stepDef(2)]),
      state({ tutorialStep: 1, tutorialSkipped: true }),
    );
    expect(view.current).toBeNull();
    expect(view.skipped).toBe(true);
    expect(view.finished).toBe(false);
  });

  it('walks steps in numbered order however the definitions are listed', () => {
    const view = tutorial.build(
      ctxOf([stepDef(3), stepDef(1), stepDef(2)]),
      state({ tutorialStep: 1 }),
    );
    expect(view.current?.title).toBe('Step 2');
  });

  it('leaves a deactivated step out of the script entirely', () => {
    const ctx = ctxOf([stepDef(1), stepDef(2, { active: false }), stepDef(3)]);
    const view = tutorial.build(ctx, state({ tutorialStep: 1 }));
    expect(view.current?.total).toBe(2);
    expect(view.current?.title).toBe('Step 3');
  });

  it('finishes rather than crashing when the script is empty', () => {
    const view = tutorial.build(ctxOf([]), state());
    expect(view.current).toBeNull();
    expect(view.finished).toBe(true);
  });
});

// ── The script, against the real thing ──────────────────────────────────────

describe.skipIf(!dbUp)('the tutorial', () => {
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

  const ctx = () => ({ db: app.db, content: app.content });
  const script = (): TutorialStepDef[] => tutorial.script(app.content);
  const read = (): Promise<TutorialView> => tutorial.overview(ctx(), playerId);

  /** Reports activity the way the game does — through the one fan-out, in a transaction. */
  const report = (...events: Parameters<typeof track>[3][number][]) =>
    app.db.transaction((tx) => track(tx, { content: app.content }, playerId, events));

  const gearHeld = () =>
    app.db.select().from(gearInstances).where(eq(gearInstances.playerId, playerId));

  const itemsHeld = async (): Promise<Record<string, number>> => {
    const rows = await app.db.select().from(playerItems).where(eq(playerItems.playerId, playerId));
    return Object.fromEntries(rows.map((row) => [row.itemKey, row.quantity]));
  };

  /**
   * Completes the open step, satisfying its goal first if it has one.
   *
   * The goal is satisfied by reporting *exactly* what it asks for, filters and all, which
   * is also a standing check that every step in the seeded script is reachable by something
   * the game actually reports.
   */
  async function complete(actionId: string): Promise<tutorial.AdvanceResult> {
    const view = await read();
    const goal = view.current?.goal;
    if (goal) {
      await report({ type: goal.type, amount: goal.target, facts: goal.filters });
    }
    return tutorial.advance(ctx(), playerId, actionId);
  }

  /**
   * Advances until the open step is one that asks for something.
   *
   * By position rather than by number, so the tests below say what they mean — "a step
   * with a goal" — and keep meaning it when the script is re-cut.
   */
  async function walkToGoalStep(label: string): Promise<void> {
    for (let index = 0; index < script().length; index += 1) {
      if ((await read()).current?.goal) return;
      await complete(`${label}-${index}`);
    }
    throw new Error('the script has no goal steps');
  }

  // ── Where a new account starts ────────────────────────────────────────────

  it('puts a fresh account on step one of the seeded script', async () => {
    const view = await read();
    expect(view.current?.step).toBe(1);
    expect(view.current?.total).toBe(script().length);
    // The cold open: a fight before anything else, on the battle screen.
    expect(view.current?.screen).toBe('battle');
    expect(view.current?.goal?.type).toBe('stageClear');
    expect(view.finished).toBe(false);
    expect(view.skipped).toBe(false);
  });

  it('answers the same over HTTP as it does in-process', async () => {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.tutorial.state) });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.tutorial).toEqual(await read());
  });

  it('needs a session', async () => {
    const response = await app.inject({ method: 'GET', url: apiPath(ROUTES.tutorial.state) });
    expect(response.statusCode).toBe(401);
  });

  // ── Advancing ─────────────────────────────────────────────────────────────

  it('pays the step it completes and opens the next one', async () => {
    // Step one is the cold open and pays nothing; step two is the first that does.
    await complete('step-one');
    const second = script()[1]!;
    const before = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));

    const result = await complete('advance-two');

    expect(result.paid.silver).toBe(second.rewards.silver);
    expect(result.tutorial.current?.step).toBe(3);
    const after = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));
    expect(after[0]!.silver).toBe(before[0]!.silver + (second.rewards.silver ?? 0));
  });

  it('refuses a step whose goal is not met yet', async () => {
    await complete('step-one');
    await walkToGoalStep('to-goal');
    // The step is waiting on something nobody has reported.
    await expect(tutorial.advance(ctx(), playerId, 'too-early')).rejects.toThrow(/not finished/i);
  });

  it('hands over the next step’s kit before that step asks for it', async () => {
    // The summon step is the one with `grantsBefore`; walk to the step in front of it and
    // check the sigils land as *it* opens rather than when it is completed.
    const steps = script();
    const summonIndex = steps.findIndex((step) => Object.keys(step.grantsBefore).length > 0);
    expect(summonIndex).toBeGreaterThan(0);
    const granted = steps[summonIndex]!.grantsBefore;
    const [itemKey, amount] = Object.entries(granted).find(([key]) => key !== 'silver') ?? [];

    for (let index = 0; index < summonIndex - 1; index += 1) {
      await complete(`walk-${index}`);
    }
    expect(itemKey ? ((await itemsHeld())[itemKey] ?? 0) : 0).toBe(0);

    await complete(`walk-open-${summonIndex}`);
    expect((await read()).current?.step).toBe(summonIndex + 1);
    if (itemKey) expect((await itemsHeld())[itemKey]).toBe(amount);
  });

  it('hands over the relic the equip step needs, rather than hoping for a drop', async () => {
    const steps = script();
    const index = steps.findIndex((step) => step.grantsRelics.length > 0);
    expect(index).toBeGreaterThan(0);
    const wanted = steps[index]!.grantsRelics[0]!;

    for (let walked = 0; walked < index - 1; walked += 1) await complete(`pre-relic-${walked}`);
    expect(await gearHeld()).toHaveLength(0);

    const result = await complete(`relic-${index}`);

    expect(result.relics).toHaveLength(1);
    expect(result.relics[0]).toMatchObject({
      setKey: wanted.setKey,
      slot: wanted.slot,
      rank: wanted.rank,
      rarity: wanted.rarity,
      level: 0,
    });
    // Rolled, not fixed: the content names the kind of piece, the game decides the rest.
    expect(result.relics[0]!.substats.length).toBeGreaterThan(0);
    expect(await gearHeld()).toHaveLength(1);
    // And the step it opened is the one that asks for it to be worn.
    expect((await read()).current?.goal?.type).toBe('gearEquip');

    // A retried advance answers with the same piece rather than rolling a second one.
    const retried = await tutorial.advance(ctx(), playerId, `relic-${index}`);
    expect(retried.relics).toEqual(result.relics);
    expect(await gearHeld()).toHaveLength(1);
  });

  it('replays a retried advance instead of paying twice', async () => {
    await complete('step-one');
    const stepBefore = (await read()).current!.step;
    const once = await complete('same-action');
    const again = await tutorial.advance(ctx(), playerId, 'same-action');

    // The replay says exactly what the first answer said — including the next step's kit,
    // which the first advance also handed over — and does not move the cursor again.
    expect(again.paid).toEqual(once.paid);
    expect(again.tutorial.current?.step).toBe(stepBefore + 1);
    const [row] = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));
    // Paid exactly once, however many times the phone retried.
    expect(row!.silver).toBe(once.paid.silver);
  });

  it('adds the two payouts rather than letting one hide the other', async () => {
    // Walk to a step whose next one grants silver as well: the completed step's silver and
    // the opening step's silver are the same key, and a spread would report only the second.
    const steps = script();
    const index = steps.findIndex(
      (step, at) => at > 0 && step.grantsBefore.silver && steps[at - 1]?.rewards.silver,
    );
    expect(index).toBeGreaterThan(0);
    for (let walked = 0; walked < index - 1; walked += 1) await complete(`pre-${walked}`);

    const before = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));
    const result = await complete(`sum-${index}`);
    const after = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));

    const expected =
      (steps[index - 1]!.rewards.silver ?? 0) + (steps[index]!.grantsBefore.silver ?? 0);
    expect(result.paid.silver).toBe(expected);
    expect(after[0]!.silver - before[0]!.silver).toBe(expected);
  });

  // ── The subscriber ────────────────────────────────────────────────────────

  it('advances the open step from the same fan-out everything else reports to', async () => {
    await complete('step-one');
    await walkToGoalStep('to-goal');
    const goal = (await read()).current!.goal!;

    await report({ type: goal.type, amount: 1, facts: goal.filters });

    const view = await read();
    expect(view.current?.progress).toBe(1);
    expect(view.current?.ready).toBe(goal.target <= 1);
  });

  it('ignores a report the open step is not asking for', async () => {
    await complete('step-one');
    await walkToGoalStep('to-goal');
    await report({ type: 'gearUpgrade', amount: 5 });
    expect((await read()).current?.progress).toBe(0);
  });

  it('never counts progress past the target', async () => {
    await complete('step-one');
    await walkToGoalStep('to-goal');
    const goal = (await read()).current!.goal!;
    await report({ type: goal.type, amount: goal.target * 10, facts: goal.filters });
    expect((await read()).current?.progress).toBe(goal.target);
  });

  it('starts each new step at zero', async () => {
    await complete('one');
    await complete('two');
    expect((await read()).current?.progress).toBe(0);
  });

  it('completes the starter step from the starter choice itself', async () => {
    // Walk to the step that asks for a champion, whichever number it is.
    for (let index = 0; script()[index]?.goal?.type !== 'championObtained'; index += 1) {
      await complete(`to-starter-${index}`);
    }
    const starters = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
    expect(starters.statusCode).toBe(200);
    const championKey = starters.json().data.starters[0].key as string;

    const chosen = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.chooseStarter),
      payload: { championKey },
    });
    expect(chosen.statusCode).toBe(200);

    // Nothing in the roster module knows the tutorial exists; it reported a champion
    // obtained, and the step that was listening moved.
    const view = await read();
    expect(view.current?.ready).toBe(true);
    expect(view.current?.goal?.type).toBe('championObtained');
  });

  // ── Leaving, and the end ──────────────────────────────────────────────────

  it('stops for good once skipped, and pays nothing for it', async () => {
    const before = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));

    const view = await tutorial.skip(ctx(), playerId);
    expect(view.current).toBeNull();
    expect(view.skipped).toBe(true);

    const after = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));
    expect(after[0]!.silver).toBe(before[0]!.silver);

    await expect(tutorial.advance(ctx(), playerId, 'after-skip')).rejects.toThrow(/over/i);
  });

  it('leaves a skipped player alone when activity is reported', async () => {
    await tutorial.skip(ctx(), playerId);
    await report({ type: 'battleWin', facts: { mode: 'campaign' } });
    const [row] = await app.db
      .select({ progress: players.tutorialProgress })
      .from(players)
      .where(eq(players.id, playerId));
    expect(row!.progress).toBe(0);
  });

  it('comes back to step one after an operator resets the account', async () => {
    await complete('before-reset-one');
    await tutorial.skip(ctx(), playerId);

    await resetAccount(app.db, playerId);

    // The whole tutorial, not just the cursor: an account that came back still marked
    // skipped would be a fresh player the script refuses to greet.
    const view = await read();
    expect(view.current?.step).toBe(1);
    expect(view.current?.progress).toBe(0);
    expect(view.skipped).toBe(false);
    expect(view.finished).toBe(false);
    // And it is walkable again from the top, cold open included.
    await expect(complete('after-reset')).resolves.toBeDefined();
  });

  it('skips idempotently over HTTP', async () => {
    const first = await as({ method: 'POST', url: apiPath(ROUTES.tutorial.skip) });
    const second = await as({ method: 'POST', url: apiPath(ROUTES.tutorial.skip) });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.tutorial.skipped).toBe(true);
  });

  it('walks the whole seeded script to the end', async () => {
    const steps = script();
    for (let index = 0; index < steps.length; index += 1) {
      const view = await read();
      expect(view.current?.step, `stalled at step ${index + 1}`).toBe(index + 1);
      await complete(`full-walk-${index}`);
    }

    const view = await read();
    expect(view.current).toBeNull();
    expect(view.finished).toBe(true);
    expect(view.skipped).toBe(false);
    await expect(tutorial.advance(ctx(), playerId, 'past-the-end')).rejects.toThrow(/finished/i);
  });

  it('leaves a finished player alone when activity is reported', async () => {
    for (let index = 0; index < script().length; index += 1) await complete(`done-${index}`);
    await report({ type: 'battleWin', facts: { mode: 'campaign' } });
    expect((await read()).finished).toBe(true);
  });
});
