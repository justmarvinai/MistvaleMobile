import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath, type Depths, type StageStanding } from '@mistvale/shared';
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
import { gameDay } from '../../lib/game-day';
import { gateFor, nextOpenDay, openToday, rotationLabel } from './service';

/**
 * The Depths.
 *
 * Two rules are new here and everything else is inherited: a dungeon has a level, and the
 * springs keep a week. Both are checked twice over — once as arithmetic, and once through
 * the API, because the whole point of computing them in one place is that the hub and the
 * battle route cannot disagree.
 */

const dbUp = await isDatabaseAvailable();

/** A dungeon def straight from the seeds, for the pure-rule tests. */
const dungeonSeed = (key: string) => {
  const seeds = buildSeedContent();
  const entry = seeds
    .find((seed) => seed.contentType === 'dungeon')!
    .entities.find((candidate) => candidate.key === key)!;
  return entry.data as {
    key: string;
    openDays: number[];
    unlockLevel: number;
    name: string;
    floors: number;
  };
};

describe('the rotation', () => {
  const mist = dungeonSeed('spring_mist');
  const verdant = dungeonSeed('spring_verdant');
  const pure = dungeonSeed('spring_pure');

  it('reads the game-day off the reset hour, not off midnight', () => {
    // Half past two in Berlin is still the previous game-day when reset is at 04:00.
    const beforeReset = gameDay(new Date('2026-08-16T00:30:00Z'), 'Europe/Berlin', 4);
    const afterReset = gameDay(new Date('2026-08-16T06:30:00Z'), 'Europe/Berlin', 4);
    expect(beforeReset.date).toBe('2026-08-15');
    expect(afterReset.date).toBe('2026-08-16');
    expect(beforeReset.weekday).toBe(6); // Saturday
    expect(afterReset.weekday).toBe(0); // Sunday
  });

  it('falls back to UTC rather than throwing on a nonsense timezone', () => {
    const day = gameDay(new Date('2026-08-16T12:00:00Z'), 'Nowhere/Fictional', 4);
    expect(day.date).toBe('2026-08-16');
  });

  it('opens the Mist Spring on Sunday and nothing else', () => {
    expect(openToday(mist as never, { weekday: 0, inGrace: false })).toBe(true);
    for (let day = 1; day <= 6; day += 1) {
      expect(openToday(mist as never, { weekday: day, inGrace: false })).toBe(false);
    }
  });

  it('keeps the Pure Spring open every day', () => {
    for (let day = 0; day <= 6; day += 1) {
      expect(openToday(pure as never, { weekday: day, inGrace: false })).toBe(true);
    }
  });

  it('ignores the rotation entirely during a new account’s grace period', () => {
    expect(openToday(mist as never, { weekday: 3, inGrace: true })).toBe(true);
  });

  it('names the next day a shut spring opens', () => {
    expect(nextOpenDay(verdant as never, { weekday: 2, inGrace: false })).toBe('Thursday');
    expect(nextOpenDay(verdant as never, { weekday: 5, inGrace: false })).toBe('Monday');
    expect(nextOpenDay(pure as never, { weekday: 5, inGrace: false })).toBeNull();
  });

  it('writes a rotation out the way a player would say it', () => {
    expect(rotationLabel(verdant as never)).toBe('Monday & Thursday');
    expect(rotationLabel(mist as never)).toBe('Sunday only');
    expect(rotationLabel(pure as never)).toBe('Every day');
  });

  it('reports the level before the day, because that is the more useful refusal', () => {
    const tooLow = gateFor(mist as never, 1, { weekday: 3, inGrace: false });
    expect(tooLow.open).toBe(false);
    expect(tooLow.reason).toMatch(/level 10/);

    // High enough to be here, but it is a Wednesday.
    const wrongDay = gateFor(mist as never, 20, { weekday: 3, inGrace: false });
    expect(wrongDay.open).toBe(false);
    expect(wrongDay.reason).toMatch(/opens Sunday/);
  });
});

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
      note: 'depths fixture',
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

describe.skipIf(!dbUp)('the Depths API', () => {
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
        accountName: uniqueAccountName('delver'),
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

  async function readDepths(): Promise<Depths> {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.depths.overview) });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data.depths as Depths;
  }

  const standingFor = (depths: Depths, key: string) =>
    depths.dungeons.find((entry) => entry.dungeonKey === key)!;

  /** Ages the account past its grace period, so the rotation applies. */
  async function endGrace(): Promise<void> {
    const long = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await app.db.update(players).set({ createdAt: long }).where(eq(players.id, playerId));
  }

  async function setLevel(level: number): Promise<void> {
    await app.db.update(players).set({ level }).where(eq(players.id, playerId));
  }

  it('lists every published dungeon', async () => {
    const depths = await readDepths();
    expect(depths.dungeons).toHaveLength(10);
    expect(standingFor(depths, 'wyrms_hollow')).toBeDefined();
    expect(standingFor(depths, 'proving_grounds')).toBeDefined();
  });

  it('opens every spring while the grace period runs, whatever the day', async () => {
    // The grace waives the *rotation*, not the level: a spring is still a level-10 door.
    await setLevel(10);
    const depths = await readDepths();
    expect(depths.graceUntil).not.toBeNull();
    for (const key of ['spring_pure', 'spring_mist', 'spring_ember', 'spring_tide']) {
      expect(standingFor(depths, key).open, key).toBe(true);
    }
  });

  it('shuts the springs the rotation excludes once the grace period is over', async () => {
    await setLevel(10);
    await endGrace();
    const depths = await readDepths();
    expect(depths.graceUntil).toBeNull();

    // Exactly the springs whose rotation names today, plus the Pure Spring.
    const springs = ['spring_verdant', 'spring_ember', 'spring_tide', 'spring_mist'];
    const open = springs.filter((key) => standingFor(depths, key).open);
    expect(open.length).toBeLessThanOrEqual(1);
    expect(standingFor(depths, 'spring_pure').open).toBe(true);
  });

  it('tells a player which day a shut spring opens', async () => {
    await setLevel(10);
    await endGrace();
    const depths = await readDepths();
    const shut = depths.dungeons.find(
      (entry) => entry.dungeonKey.startsWith('spring_') && !entry.open,
    );
    expect(shut).toBeDefined();
    expect(shut!.lockedReason).toMatch(/opens \w+day/i);
    expect(shut!.nextOpenDay).toMatch(/day$/i);
  });

  it('keeps the relic keeps shut below their account level', async () => {
    const shut = standingFor(await readDepths(), 'wyrms_hollow');
    expect(shut.open).toBe(false);
    expect(shut.lockedReason).toMatch(/level 12/);

    await setLevel(12);
    expect(standingFor(await readDepths(), 'wyrms_hollow').open).toBe(true);
  });

  it('reports how deep the player has been', async () => {
    await setLevel(12);
    const floors = ['wyrms_hollow_f01', 'wyrms_hollow_f02', 'wyrms_hollow_f03'];
    for (const [index, stageKey] of floors.entries()) {
      await app.db.insert(stageProgress).values({
        playerId,
        stageKey,
        parentKey: 'wyrms_hollow',
        mode: 'dungeon',
        stars: 3,
        clears: index + 1,
        bestTurns: 9,
        firstClearedAt: new Date(),
        lastClearedAt: new Date(),
      });
    }

    const standing = standingFor(await readDepths(), 'wyrms_hollow');
    expect(standing.highestFloor).toBe(3);
    expect(standing.clears).toBe(6);
  });

  describe('the gate the maps and the battle route share', () => {
    async function progressFor(stageKey: string): Promise<StageStanding> {
      const response = await as({ method: 'GET', url: apiPath(ROUTES.progress.stages) });
      const stages = response.json().data.progress.stages as StageStanding[];
      return stages.find((entry) => entry.stageKey === stageKey)!;
    }

    async function chooseStarter(): Promise<string> {
      const offered = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
      const starters = offered.json().data.starters as { key: string }[];
      const granted = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.chooseStarter),
        payload: { championKey: starters[0]!.key },
      });
      return (granted.json().data.champions as { id: string }[])[0]!.id;
    }

    it('greys out a floor the battle route would refuse for level', async () => {
      const championId = await chooseStarter();
      const floor = await progressFor('wyrms_hollow_f01');
      expect(floor.open).toBe(false);
      expect(floor.lockedReason).toMatch(/level 12/);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'dungeon', stageKey: 'wyrms_hollow_f01', team: [championId] },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('LOCKED_CONTENT');
    });

    it('greys out a spring the battle route would refuse for the day', async () => {
      const championId = await chooseStarter();
      await setLevel(20);
      await endGrace();

      const depths = await readDepths();
      const shut = depths.dungeons.find(
        (entry) => entry.dungeonKey.startsWith('spring_') && !entry.open,
      )!;
      const floorKey = `${shut.dungeonKey}_f01`;

      const floor = await progressFor(floorKey);
      expect(floor.open).toBe(false);
      expect(floor.lockedReason).toMatch(/closed today/i);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'springs', stageKey: floorKey, team: [championId] },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('LOCKED_CONTENT');
    });

    it('lets a levelled warden into an open keep and pays a relic for it', async () => {
      const championId = await chooseStarter();
      await setLevel(20);
      await app.db.update(players).set({ energy: 60 }).where(eq(players.id, playerId));

      const started = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'dungeon', stageKey: 'wyrms_hollow_f01', team: [championId] },
      });
      expect(started.statusCode, started.body).toBe(200);

      const battleId = started.json().data.id as string;
      const resolved = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: `depths-${Math.random().toString(36).slice(2, 12)}`, auto: true },
      });
      expect(resolved.statusCode, resolved.body).toBe(200);

      const view = resolved.json().data;
      if (view.outcome === 'victory') {
        // A keep run always pays a relic, and it is one of that keep's own sets — the
        // whole reason to farm a specific dungeon rather than any dungeon.
        expect(view.rewards.gear.length).toBe(1);
        expect(['swiftwind', 'pathfinder', 'stormcoil', 'reaver']).toContain(
          view.rewards.gear[0].setKey,
        );
      }
    });
  });
});
