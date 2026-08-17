import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath, type LoginTrackDef, type LoginView } from '@mistvale/shared';
import {
  contentEntries,
  contentRevisions,
  gearInstances,
  loginClaims,
  playerChampions,
  players,
} from '../../db/schema/index';
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
import * as login from './login';

/**
 * The login calendar and the welcome track.
 *
 * The rule this file exists to defend is "**the Nth claim pays day N**" — a track that
 * advances on the calendar date rather than on claims would look identical for the first
 * week and then quietly punish anybody who took a Tuesday off. Everything else here is the
 * consequences of that rule: a cycle that wraps, a welcome track that does not, one claim
 * per day, and a selector that cannot be talked out of a champion.
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
      note: 'login fixture',
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The cycle arithmetic, with no database in the way.
 *
 * These run even where Postgres does not, which matters: an off-by-one at the wrap is
 * invisible for twenty-nine days and then hands somebody day 31 of a thirty-day track.
 */
describe('a track’s standing', () => {
  const trackOf = (kind: 'calendar' | 'welcome', dayCount: number): LoginTrackDef => ({
    key: `test_${kind}`,
    sortOrder: 0,
    name: 'Test track',
    description: '',
    track: kind,
    days: Array.from({ length: dayCount }, (_, index) => ({
      day: index + 1,
      rewards: { silver: 100 },
      grants: { champions: [], choices: [], relics: [] },
    })),
    active: true,
  });

  const claims = (count: number, lastOn = '2026-05-01'): Parameters<typeof login.standingOf>[1] =>
    Array.from({ length: count }, (_, index) => ({
      id: `claim-${index}`,
      playerId: 'player',
      track: 'calendar',
      day: index + 1,
      claimedOn: index === count - 1 ? lastOn : `2026-04-${String(index + 1).padStart(2, '0')}`,
      claimActionId: null,
      createdAt: new Date(),
    }));

  it('starts everybody on day one of cycle one', () => {
    const standing = login.standingOf(trackOf('calendar', 30), [], '2026-05-04');
    expect(standing.cycle).toBe(1);
    expect(standing.days.find((day) => day.next)?.day).toBe(1);
    expect(standing.claimable).toBe(true);
  });

  it('rolls into the next cycle exactly at the wrap, not one before or after', () => {
    const track = trackOf('calendar', 30);
    expect(login.standingOf(track, claims(29), '2026-05-04').cycle).toBe(1);
    expect(login.standingOf(track, claims(30), '2026-05-04').cycle).toBe(2);
    expect(login.standingOf(track, claims(31), '2026-05-04').cycle).toBe(2);
    expect(login.standingOf(track, claims(60), '2026-05-04').cycle).toBe(3);
  });

  it('shows nothing claimed on a fresh cycle', () => {
    const standing = login.standingOf(trackOf('calendar', 30), claims(30), '2026-05-04');
    expect(standing.days.filter((day) => day.claimed)).toHaveLength(0);
    expect(standing.days.find((day) => day.next)?.day).toBe(1);
  });

  it('finishes a welcome track and never wraps it', () => {
    const track = trackOf('welcome', 7);
    expect(login.standingOf(track, claims(6), '2026-05-04').finished).toBe(false);
    const done = login.standingOf(track, claims(7), '2026-05-04');
    expect(done.finished).toBe(true);
    expect(done.claimable).toBe(false);
    expect(done.days.every((day) => day.claimed)).toBe(true);
    expect(done.days.find((day) => day.next)).toBeUndefined();
  });

  it('spends the day once it has been taken, without moving the marker', () => {
    const standing = login.standingOf(
      trackOf('calendar', 30),
      claims(3, '2026-05-04'),
      '2026-05-04',
    );
    expect(standing.claimedToday).toBe(true);
    expect(standing.claimable).toBe(false);
    expect(standing.days.find((day) => day.next)).toBeUndefined();
    // The three behind it stay marked, so the screen still shows where the player is.
    expect(standing.days.filter((day) => day.claimed).map((day) => day.day)).toEqual([1, 2, 3]);
  });

  it('handles a one-day track, which wraps on every claim', () => {
    const track = trackOf('calendar', 1);
    expect(login.standingOf(track, claims(1), '2026-05-04').cycle).toBe(2);
    expect(login.standingOf(track, [], '2026-05-04').days.find((day) => day.next)?.day).toBe(1);
  });

  it('walks days in numbered order however the definition lists them', () => {
    const track = trackOf('calendar', 5);
    const shuffled: LoginTrackDef = { ...track, days: [...track.days].reverse() };
    const standing = login.standingOf(shuffled, claims(2), '2026-05-04');
    expect(standing.days.map((day) => day.day)).toEqual([1, 2, 3, 4, 5]);
    expect(standing.days.find((day) => day.next)?.day).toBe(3);
  });
});

describe.skipIf(!dbUp)('the login calendar', () => {
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
        accountName: uniqueAccountName('lamp'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
    // Level 5 is past the calendar's gate, and there is room for the day-30 champion beside
    // the starter's food — neither the gate nor a roster cap is what these tests measure.
    await app.db
      .update(players)
      .set({ level: 5, rosterCapacity: 60 })
      .where(eq(players.id, playerId));
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const ctx = () => ({ db: app.db, content: app.content });
  const trackDef = (kind: 'calendar' | 'welcome'): LoginTrackDef =>
    app.content.current().bundle.loginTracks.find((def) => def.track === kind && def.active)!;

  const read = (now?: Date): Promise<LoginView> => login.overview(ctx(), playerId, now);

  /** Noon on a fixed day, plus n days — far enough from any reset hour to be unambiguous. */
  const at = (dayOffset: number): Date =>
    new Date(Date.parse('2026-05-04T12:00:00Z') + dayOffset * DAY_MS);

  /**
   * Walks a track forward by claiming once a day for n days.
   *
   * A selector day is answered with its first option — the walk is scaffolding for tests
   * about *other* days, and refusing to pick would only ever stop it dead.
   */
  async function walk(kind: 'calendar' | 'welcome', days: number, from = 0): Promise<void> {
    const defDays = [...trackDef(kind).days].sort((a, b) => a.day - b.day);
    for (let step = 0; step < days; step += 1) {
      const day = defDays[step % defDays.length];
      await login.claim(
        ctx(),
        playerId,
        kind,
        `walk-${kind}-${from + step}`,
        day?.grants.choices[0],
        at(from + step),
      );
    }
  }

  // ── What the screen says ──────────────────────────────────────────────────

  it('offers both tracks to a fresh account, with day one waiting on each', async () => {
    const view = await read(at(0));

    expect(view.calendar?.days).toHaveLength(30);
    expect(view.welcome?.days).toHaveLength(7);
    expect(view.calendar?.days.find((day) => day.next)?.day).toBe(1);
    expect(view.welcome?.days.find((day) => day.next)?.day).toBe(1);
    // Two tracks with something waiting — the dock pip counts tracks, not tiles.
    expect(view.claimable).toBe(2);
    expect(view.today).toBe(gameDayFrom(app.content.current().bundle.config, at(0)).date);
  });

  it('answers with the server’s game-day rather than the caller’s clock', async () => {
    const config = app.content.current().bundle.config;
    const view = await read(at(3));
    expect(view.today).toBe(gameDayFrom(config, at(3)).date);
  });

  // ── The rule ──────────────────────────────────────────────────────────────

  it('pays day N on the Nth claim, not on the Nth of the month', async () => {
    await login.claim(ctx(), playerId, 'calendar', 'a-0001', undefined, at(0));
    // Three days pass with the game unopened. The next claim is still day 2.
    const second = await login.claim(ctx(), playerId, 'calendar', 'a-0002', undefined, at(4));

    expect(second.day).toBe(2);
    const view = await read(at(4));
    expect(view.calendar?.claimsMade).toBe(2);
    expect(view.calendar?.days.find((day) => day.next)).toBeUndefined(); // spent for today
  });

  it('pays exactly what the day promises', async () => {
    const def = trackDef('calendar');
    const first = def.days.find((day) => day.day === 1)!;
    const result = await login.claim(ctx(), playerId, 'calendar', 'b-0001', undefined, at(0));

    expect(result.day).toBe(1);
    for (const [key, amount] of Object.entries(first.rewards)) {
      expect(result.paid[key], key).toBe(amount);
    }
  });

  it('refuses a second claim on the same day, and replays a retried one', async () => {
    await login.claim(ctx(), playerId, 'calendar', 'c-0001', undefined, at(0));

    // The same action id: the network dropped the answer, not the claim.
    const replay = await login.claim(ctx(), playerId, 'calendar', 'c-0001', undefined, at(0));
    expect(replay.day).toBe(1);

    await expect(
      login.claim(ctx(), playerId, 'calendar', 'c-0002', undefined, at(0)),
    ).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });

    const rows = await app.db.select().from(loginClaims).where(eq(loginClaims.playerId, playerId));
    expect(rows).toHaveLength(1);
  });

  it('keeps the two tracks independent on the same day', async () => {
    await login.claim(ctx(), playerId, 'calendar', 'd-0001', undefined, at(0));
    const welcome = await login.claim(ctx(), playerId, 'welcome', 'd-0002', undefined, at(0));

    expect(welcome.day).toBe(1);
    const view = await read(at(0));
    expect(view.calendar?.claimedToday).toBe(true);
    expect(view.welcome?.claimedToday).toBe(true);
    expect(view.claimable).toBe(0);
  });

  // ── Cycles ────────────────────────────────────────────────────────────────

  it('wraps the calendar to day 1 of a second cycle after thirty claims', async () => {
    await walk('calendar', 30);

    const view = await read(at(30));
    expect(view.calendar?.claimsMade).toBe(30);
    expect(view.calendar?.cycle).toBe(2);
    // A fresh cycle shows nothing claimed — that is what makes it a calendar rather than
    // a one-way ladder.
    expect(view.calendar?.days.every((day) => !day.claimed)).toBe(true);
    expect(view.calendar?.days.find((day) => day.next)?.day).toBe(1);

    const wrapped = await login.claim(ctx(), playerId, 'calendar', 'e-0031', undefined, at(30));
    expect(wrapped.day).toBe(1);
  });

  it('marks the days behind the next one as claimed, and nothing ahead of it', async () => {
    await walk('calendar', 5);

    const view = await read(at(5));
    const days = view.calendar!.days;
    expect(days.filter((day) => day.claimed).map((day) => day.day)).toEqual([1, 2, 3, 4, 5]);
    expect(days.find((day) => day.next)?.day).toBe(6);
    expect(days.filter((day) => day.claimed || day.next)).toHaveLength(6);
  });

  // ── The welcome track ─────────────────────────────────────────────────────

  it('finishes the welcome track for good, and takes it off the screen', async () => {
    await walk('welcome', 7);

    const view = await read(at(7));
    expect(view.welcome).toBeNull();
    // The calendar is untouched by any of it.
    expect(view.calendar?.claimsMade).toBe(0);

    await expect(
      login.claim(ctx(), playerId, 'welcome', 'f-0008', undefined, at(7)),
    ).rejects.toMatchObject({ code: 'LOCKED_CONTENT' });
  });

  it('hands over the welcome track’s relics on its last day', async () => {
    const def = trackDef('welcome');
    const last = def.days.at(-1)!;
    expect(
      last.grants.relics.length,
      'the welcome track should end in a relic set',
    ).toBeGreaterThan(0);

    await walk('welcome', 6);
    const result = await login.claim(ctx(), playerId, 'welcome', 'g-0007', undefined, at(6));

    expect(result.relics).toHaveLength(last.grants.relics.length);
    expect(result.relics.map((relic) => relic.setKey).sort()).toEqual(
      last.grants.relics.map((relic) => relic.setKey).sort(),
    );

    const owned = await app.db
      .select()
      .from(gearInstances)
      .where(eq(gearInstances.playerId, playerId));
    expect(owned.filter((row) => row.source.startsWith('login:welcome'))).toHaveLength(
      last.grants.relics.length,
    );
  });

  // ── The selector ──────────────────────────────────────────────────────────

  it('will not pay a selector day without a pick, or with one it does not offer', async () => {
    const def = trackDef('calendar');
    const selector = def.days.find((day) => day.grants.choices.length > 0)!;
    await walk('calendar', selector.day - 1);

    await expect(
      login.claim(ctx(), playerId, 'calendar', 'h-0001', undefined, at(selector.day - 1)),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    await expect(
      login.claim(ctx(), playerId, 'calendar', 'h-0002', 'anuria', at(selector.day - 1)),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    // Refused claims leave the track exactly where it was.
    const view = await read(at(selector.day - 1));
    expect(view.calendar?.claimsMade).toBe(selector.day - 1);
  });

  it('hands over the champion the player picked', async () => {
    const def = trackDef('calendar');
    const selector = def.days.find((day) => day.grants.choices.length > 0)!;
    const wanted = selector.grants.choices[1]!;
    await walk('calendar', selector.day - 1);

    const result = await login.claim(
      ctx(),
      playerId,
      'calendar',
      'i-0001',
      wanted,
      at(selector.day - 1),
    );

    expect(result.champions).toEqual([wanted]);
    const roster = await app.db
      .select()
      .from(playerChampions)
      .where(eq(playerChampions.playerId, playerId));
    expect(roster.some((row) => row.championKey === wanted)).toBe(true);
  });

  it('refuses a choice on a day that is not a selector', async () => {
    await expect(
      login.claim(ctx(), playerId, 'calendar', 'j-0001', 'darius', at(0)),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  // ── Through the API ───────────────────────────────────────────────────────

  it('answers the screen and takes a claim over HTTP', async () => {
    const state = await as({ method: 'GET', url: apiPath(ROUTES.login.state) });
    expect(state.statusCode).toBe(200);
    expect(state.json().data.login.calendar.days).toHaveLength(30);

    const claimed = await as({
      method: 'POST',
      url: apiPath(ROUTES.login.claim),
      payload: { track: 'calendar', actionId: 'http-claim-0001' },
    });
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json().data.day).toBe(1);
    expect(claimed.json().data.login.calendar.claimedToday).toBe(true);
  });

  it('turns an anonymous caller away from both endpoints', async () => {
    const state = await app.inject({ method: 'GET', url: apiPath(ROUTES.login.state) });
    const claim = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.login.claim),
      payload: { track: 'calendar', actionId: 'anon-claim-0001' },
    });
    expect([state.statusCode, claim.statusCode]).toEqual([401, 401]);
  });

  it('counts tracks waiting, for the dock pip', async () => {
    expect(await login.claimableCount(ctx(), playerId, 5, at(0))).toBe(2);
    await login.claim(ctx(), playerId, 'welcome', 'k-0001', undefined, at(0));
    expect(await login.claimableCount(ctx(), playerId, 5, at(0))).toBe(1);
    await login.claim(ctx(), playerId, 'calendar', 'k-0002', undefined, at(0));
    expect(await login.claimableCount(ctx(), playerId, 5, at(0))).toBe(0);
    // Tomorrow both are waiting again.
    expect(await login.claimableCount(ctx(), playerId, 5, at(1))).toBe(2);
  });

  // ── The gate ──────────────────────────────────────────────────────────────

  it('shows a level-1 account what is coming, and lets it take none of it', async () => {
    await app.db.update(players).set({ level: 1 }).where(eq(players.id, playerId));

    const view = await read(at(0));
    // The tracks are still described — a locked screen that is simply empty teaches
    // nothing about why to come back.
    expect(view.calendar?.days).toHaveLength(30);
    expect(view.unlocked).toBe(false);
    expect(view.unlockLevel).toBe(2);
    // No pip on a door that will not open.
    expect(view.claimable).toBe(0);
    expect(await login.claimableCount(ctx(), playerId, 1, at(0))).toBe(0);

    await expect(
      login.claim(ctx(), playerId, 'calendar', 'gate-0001', undefined, at(0)),
    ).rejects.toMatchObject({ code: 'LOCKED_CONTENT' });
  });

  it('loses a locked-out player nothing: the first claim is still day one', async () => {
    await app.db.update(players).set({ level: 1 }).where(eq(players.id, playerId));
    await expect(
      login.claim(ctx(), playerId, 'calendar', 'gate-0002', undefined, at(0)),
    ).rejects.toMatchObject({ code: 'LOCKED_CONTENT' });

    // Three days later, at level 2, the track has not moved on without them.
    await app.db.update(players).set({ level: 2 }).where(eq(players.id, playerId));
    const first = await login.claim(ctx(), playerId, 'calendar', 'gate-0003', undefined, at(3));
    expect(first.day).toBe(1);
    expect(first.login.unlocked).toBe(true);
  });
});
