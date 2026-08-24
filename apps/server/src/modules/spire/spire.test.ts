import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import {
  ROUTES,
  apiPath,
  championMeets,
  restrictionSupply,
  spireAnchor,
  spireClosesOn,
  teamRestrictionFailure,
  WARD_MIN_SUPPLY,
  type SpireOverview,
  type TeamRestriction,
} from '@mistvale/shared';
import {
  contentEntries,
  contentRevisions,
  playerSpireClimbs,
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
import * as spire from './service';

/**
 * The Mistspire.
 *
 * Two halves, and the pure one carries most of the weight because most of the tower's rules
 * are pure: whether a champion meets a ward, whether a team does, how many champions in the
 * game could ever satisfy one, and which month a climb belongs to.
 *
 * Against the database, what is worth proving is the part that is *not* an ordinary stage:
 * that a climb is walked in order, that the key comes off on a clear rather than an attempt,
 * that the month is the reset, and that a landing pays once.
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
      note: 'spire fixture',
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

// ── The pure rules ──────────────────────────────────────────────────────────

describe('a ward', () => {
  const tide: TeamRestriction = { kind: 'element', value: 'tide' };
  const support: TeamRestriction = { kind: 'role', value: 'support' };
  const rareUp: TeamRestriction = { kind: 'minRarity', value: 'rare' };

  const champion = (over: Partial<Parameters<typeof championMeets>[1]> = {}) => ({
    key: 'k',
    name: 'Someone',
    factionKey: 'wayfarers',
    element: 'tide',
    role: 'support',
    rarity: 'rare' as const,
    ...over,
  });

  it('reads an element, a role and a faction exactly', () => {
    expect(championMeets(tide, champion())).toBe(true);
    expect(championMeets(tide, champion({ element: 'ember' }))).toBe(false);
    expect(championMeets(support, champion())).toBe(true);
    expect(championMeets(support, champion({ role: 'attack' }))).toBe(false);
    expect(championMeets({ kind: 'faction', value: 'wayfarers' }, champion())).toBe(true);
    expect(championMeets({ kind: 'faction', value: 'emberclan' }, champion())).toBe(false);
  });

  it('treats minRarity as a floor rather than a match', () => {
    // The whole reason it is a floor: "Rare or better" must never ask a player to *un*-invest.
    expect(championMeets(rareUp, champion({ rarity: 'rare' }))).toBe(true);
    expect(championMeets(rareUp, champion({ rarity: 'epic' }))).toBe(true);
    expect(championMeets(rareUp, champion({ rarity: 'legendary' }))).toBe(true);
    expect(championMeets(rareUp, champion({ rarity: 'uncommon' }))).toBe(false);
    expect(championMeets(rareUp, champion({ rarity: 'common' }))).toBe(false);
  });

  it('refuses a rarity it does not recognise rather than letting everybody through', () => {
    expect(championMeets({ kind: 'minRarity', value: 'mythic' }, champion())).toBe(false);
  });

  it('names the champions that fail, not the rule', () => {
    const team = [
      champion({ key: 'a', name: 'Anuria' }),
      champion({ key: 'b', name: 'Kaelen', element: 'ember' }),
      champion({ key: 'c', name: 'Vorr', element: 'ember' }),
      champion({ key: 'd', name: 'Sela' }),
    ];
    const failure = teamRestrictionFailure(tide, team, 'Tide champions');
    expect(failure).toContain('Kaelen and Vorr');
    expect(failure).toContain('Tide champions');
    // Anuria and Sela qualify and must not be blamed for it.
    expect(failure).not.toContain('Anuria');
  });

  it('says nothing at all when the whole team qualifies', () => {
    expect(teamRestrictionFailure(tide, [champion(), champion()], 'Tide champions')).toBeNull();
  });

  it('uses the singular for one offender', () => {
    const failure = teamRestrictionFailure(
      tide,
      [champion(), champion({ name: 'Kaelen', element: 'ember' })],
      'Tide champions',
    );
    expect(failure).toContain('Kaelen does not qualify');
  });
});

describe('a climb', () => {
  it('belongs to the calendar month of its game-day', () => {
    expect(spireAnchor('2026-08-24')).toBe('2026-08');
    expect(spireAnchor('2026-08-31')).toBe('2026-08');
    expect(spireAnchor('2026-09-01')).toBe('2026-09');
  });

  it('closes on the last day of that month, leap years included', () => {
    expect(spireClosesOn('2026-08')).toBe('2026-08-31');
    expect(spireClosesOn('2026-09')).toBe('2026-09-30');
    expect(spireClosesOn('2026-02')).toBe('2026-02-28');
    expect(spireClosesOn('2028-02')).toBe('2028-02-29');
  });
});

// ── The rule that could not have been reasoned out ───────────────────────────

describe('ward supply, against the shipped roster', () => {
  const roster = buildSeedContent()
    .find((seed) => seed.contentType === 'champion')!
    .entities.map(({ data }) => {
      const champion = data as Record<string, unknown>;
      return {
        key: champion.key as string,
        name: champion.name as string,
        factionKey: champion.factionKey as string,
        element: champion.element as string,
        role: champion.role as string,
        rarity: champion.rarity as 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary',
        isFood: champion.isFood === true,
      };
    });

  it('finds three factions that could never field a legal team', () => {
    // This is the finding the rule exists for, and it is about Mistvale's own roster rather
    // than a hypothetical: a floor warded to the Drowned Choir would publish cleanly, look
    // correct in the editor, and be unclearable by every account forever.
    const thin = ['drowned_choir', 'runebound', 'thornweald'] as const;
    for (const factionKey of thin) {
      const supply = restrictionSupply({ kind: 'faction', value: factionKey }, roster);
      expect(supply, `${factionKey} has ${supply}`).toBeLessThan(WARD_MIN_SUPPLY);
    }
  });

  it('finds every element, every role and the large factions climbable', () => {
    for (const value of ['ember', 'tide', 'verdant', 'mist']) {
      expect(restrictionSupply({ kind: 'element', value }, roster)).toBeGreaterThanOrEqual(
        WARD_MIN_SUPPLY,
      );
    }
    for (const value of ['attack', 'defense', 'hp', 'support']) {
      expect(restrictionSupply({ kind: 'role', value }, roster)).toBeGreaterThanOrEqual(
        WARD_MIN_SUPPLY,
      );
    }
    expect(
      restrictionSupply({ kind: 'faction', value: 'hollowborn' }, roster),
    ).toBeGreaterThanOrEqual(WARD_MIN_SUPPLY);
  });

  it('counts food out, since food cannot be fielded', () => {
    const withFood = restrictionSupply({ kind: 'minRarity', value: 'common' }, roster);
    const everything = roster.length;
    expect(withFood).toBeLessThan(everything);
  });

  it('refuses every ward the shipped tower authors — none of them', () => {
    const stages = buildSeedContent().find((seed) => seed.contentType === 'stage')!.entities;
    const wards = stages
      .map(({ data }) => (data as { teamRestriction?: TeamRestriction }).teamRestriction)
      .filter((ward): ward is TeamRestriction => ward !== undefined);
    expect(wards.length).toBeGreaterThan(0);
    for (const ward of wards) {
      expect(restrictionSupply(ward, roster), `${ward.kind}=${ward.value}`).toBeGreaterThanOrEqual(
        WARD_MIN_SUPPLY,
      );
    }
  });
});

// ── Against a real database ─────────────────────────────────────────────────

describe.skipIf(!dbUp)('the Mistspire', () => {
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
        accountName: uniqueAccountName('climber'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
    await app.db.update(players).set({ level: 30 }).where(eq(players.id, playerId));
  });

  const read = async (): Promise<SpireOverview> => {
    const response = await app.inject({
      method: 'GET',
      url: apiPath(ROUTES.spire.state),
      cookies: { mv_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    return response.json().data.spire as SpireOverview;
  };

  it('shows the tower, its wards and a fresh climb', async () => {
    const view = await read();
    expect(view.spires).toHaveLength(1);
    const tower = view.spires[0]!;
    expect(tower.open).toBe(true);
    expect(tower.highestFloor).toBe(0);
    expect(tower.floors).toHaveLength(30);
    // Floor one is where a fresh climb stands, and nothing behind it is cleared.
    expect(tower.floors[0]!.current).toBe(true);
    expect(tower.floors.every((floor) => !floor.cleared)).toBe(true);
    // The wards reach the screen as sentences rather than as keys.
    const warded = tower.floors.filter((floor) => floor.ward !== null);
    expect(warded.length).toBeGreaterThan(0);
    expect(warded[0]!.ward!.label).toMatch(/champions|or better/);
    // The keepers are marked, so the screen can draw them differently.
    expect(tower.floors.filter((floor) => floor.boss).map((floor) => floor.floor)).toEqual([
      10, 20, 30,
    ]);
  });

  it('says which month the climb belongs to and when it closes', async () => {
    const view = await read();
    const tower = view.spires[0]!;
    expect(tower.anchor).toBe(spireAnchor(view.today));
    expect(tower.closesOn).toBe(spireClosesOn(tower.anchor));
  });

  it('is shut to an account below its level, and says so', async () => {
    await app.db.update(players).set({ level: 5 }).where(eq(players.id, playerId));
    const tower = (await read()).spires[0]!;
    expect(tower.open).toBe(false);
    expect(tower.lockedReason).toContain('level');
  });

  it('refuses a floor that is not the next one up', async () => {
    const context = await spire.contextFor(app.db, playerId);
    const keep = spire.keeps(app.content)[0]!;
    await expect(
      spire.assertFloorOpen(app.db, app.content, context, keep, keep.stages[4]!, new Date()),
    ).rejects.toThrow(/climbed in order|first floor/i);
    // …and allows the one that is.
    await expect(
      spire.assertFloorOpen(app.db, app.content, context, keep, keep.stages[0]!, new Date()),
    ).resolves.toBeUndefined();
  });

  it('refuses a floor already behind the climb, so the tower cannot be farmed', async () => {
    const keep = spire.keeps(app.content)[0]!;
    const now = new Date();
    const context = await spire.contextFor(app.db, playerId);
    await app.db.transaction(async (tx) => {
      await spire.settleClear(tx, app.content, context, keep, keep.stages[0]!, now);
    });
    const after = await spire.contextFor(app.db, playerId);
    await expect(
      spire.assertFloorOpen(app.db, app.content, after, keep, keep.stages[0]!, now),
    ).rejects.toThrow(/already behind you/i);
  });

  it('spends the key on the clear, not on the attempt', async () => {
    const keep = spire.keeps(app.content)[0]!;
    const now = new Date();

    // Opening a floor spends nothing: the whole bargain of the mode is that a warded floor
    // can be attacked all evening with a different four each time and cost nothing.
    const before = await spire.contextFor(app.db, playerId);
    await spire.assertFloorOpen(app.db, app.content, before, keep, keep.stages[0]!, now);
    expect((await read()).spires[0]!.keysLeft).toBe(keep.rules.keysPerDay);

    const climb = await app.db.transaction((tx) =>
      spire.settleClear(tx, app.content, before, keep, keep.stages[0]!, now),
    );
    expect(climb.advanced).toBe(true);
    expect(climb.highestFloor).toBe(1);
    expect(climb.keysLeft).toBe(keep.rules.keysPerDay - 1);
    expect((await read()).spires[0]!.keysLeft).toBe(keep.rules.keysPerDay - 1);
  });

  it('runs out of keys, and says a failed floor cost nothing', async () => {
    const keep = spire.keeps(app.content)[0]!;
    const now = new Date();
    for (let floor = 0; floor < keep.rules.keysPerDay; floor += 1) {
      const context = await spire.contextFor(app.db, playerId);
      await app.db.transaction((tx) =>
        spire.settleClear(tx, app.content, context, keep, keep.stages[floor]!, now),
      );
    }
    const spent = await spire.contextFor(app.db, playerId);
    expect((await read()).spires[0]!.keysLeft).toBe(0);
    await expect(
      spire.assertFloorOpen(
        app.db,
        app.content,
        spent,
        keep,
        keep.stages[keep.rules.keysPerDay]!,
        now,
      ),
    ).rejects.toThrow(/No keys left today/);
  });

  it('starts again next month, and remembers how high the last climb got', async () => {
    const keep = spire.keeps(app.content)[0]!;
    const context = await spire.contextFor(app.db, playerId);
    await app.db.transaction((tx) =>
      spire.settleClear(tx, app.content, context, keep, keep.stages[0]!, new Date()),
    );

    // Reaching into the row's anchor is how a month is made to pass without waiting for
    // one, and it is exactly what the calendar does to the row on the first of the month.
    const today = (await read()).today;
    await app.db
      .update(playerSpireClimbs)
      .set({ anchor: spireAnchor('2020-01-01') })
      .where(eq(playerSpireClimbs.playerId, playerId));

    const view = await read();
    const tower = view.spires[0]!;
    expect(tower.anchor).toBe(spireAnchor(today));
    // The climb is back at the bottom…
    expect(tower.highestFloor).toBe(0);
    expect(tower.floors[0]!.current).toBe(true);
    // …and the record survives it, because it is bragging rather than gating.
    expect(tower.bestEverFloor).toBe(1);
  });

  it('pays a landing once, and refuses one the climb has not reached', async () => {
    const keep = spire.keeps(app.content)[0]!;
    const landing = keep.rules.landings[0]!;
    const now = new Date();

    // Not yet reached.
    let context = await spire.contextFor(app.db, playerId);
    await expect(
      app.db.transaction((tx) =>
        spire.claimLanding(tx, app.content, context, keep.dungeon.key, landing.key, now),
      ),
    ).rejects.toThrow(/floor/i);

    for (let floor = 0; floor < landing.floor; floor += 1) {
      context = await spire.contextFor(app.db, playerId);
      await app.db.transaction((tx) =>
        spire.settleClear(tx, app.content, context, keep, keep.stages[floor]!, now),
      );
    }

    context = await spire.contextFor(app.db, playerId);
    const claim = await app.db.transaction((tx) =>
      spire.claimLanding(tx, app.content, context, keep.dungeon.key, landing.key, now),
    );
    expect(claim.rewards).toEqual(landing.rewards);

    // And exactly once.
    await expect(
      app.db.transaction((tx) =>
        spire.claimLanding(tx, app.content, context, keep.dungeon.key, landing.key, now),
      ),
    ).rejects.toThrow(/already been collected/i);
  });

  it('pays through the route, and answers with the whole tower again', async () => {
    const keep = spire.keeps(app.content)[0]!;
    const landing = keep.rules.landings[0]!;
    const now = new Date();
    for (let floor = 0; floor < landing.floor; floor += 1) {
      const context = await spire.contextFor(app.db, playerId);
      await app.db.transaction((tx) =>
        spire.settleClear(tx, app.content, context, keep, keep.stages[floor]!, now),
      );
    }

    const before = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));

    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.spire.claim(keep.dungeon.key)),
      cookies: { mv_session: cookie },
      payload: { landingKey: landing.key, actionId: 'spire-landing-test-0001' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json().data as { rewards: Record<string, number>; spire: SpireOverview };
    expect(body.rewards.silver).toBe(landing.rewards.silver);
    // The whole view comes back, so the screen is never one claim out of date.
    expect(body.spire.spires[0]!.landings[0]!.claimed).toBe(true);

    const after = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));
    expect(after[0]!.silver).toBe(before[0]!.silver + (landing.rewards.silver ?? 0));
  });

  it('refuses a team that does not meet a floor’s ward, and names who failed', async () => {
    const keep = spire.keeps(app.content)[0]!;
    const warded = keep.stages.find((stage) => stage.teamRestriction !== undefined)!;
    const ward = warded.teamRestriction!;

    const champions = app.content.current().bundle.champions;
    const good = champions.filter(
      (def) =>
        !def.isFood &&
        championMeets(ward, {
          key: def.key,
          name: def.name,
          factionKey: def.factionKey,
          element: def.element,
          role: def.role,
          rarity: def.rarity,
        }),
    );
    const bad = champions.find(
      (def) =>
        !def.isFood &&
        !championMeets(ward, {
          key: def.key,
          name: def.name,
          factionKey: def.factionKey,
          element: def.element,
          role: def.role,
          rarity: def.rarity,
        }),
    )!;

    const shape = (def: (typeof champions)[number]) => ({
      key: def.key,
      name: def.name,
      factionKey: def.factionKey,
      element: def.element,
      role: def.role,
      rarity: def.rarity,
    });

    // A legal team passes silently.
    expect(() =>
      spire.assertTeamMeetsWard(app.content, warded, good.slice(0, 4).map(shape)),
    ).not.toThrow();

    // One wrong champion is enough, and the refusal names them.
    expect(() =>
      spire.assertTeamMeetsWard(app.content, warded, [...good.slice(0, 3).map(shape), shape(bad)]),
    ).toThrow(new RegExp(bad.name));
  });

  it('leaves an unwarded floor open to anybody', async () => {
    const keep = spire.keeps(app.content)[0]!;
    const plain = keep.stages.find((stage) => stage.teamRestriction === undefined)!;
    const anybody = app.content
      .current()
      .bundle.champions.filter((def) => !def.isFood)
      .slice(0, 4)
      .map((def) => ({
        key: def.key,
        name: def.name,
        factionKey: def.factionKey,
        element: def.element,
        role: def.role,
        rarity: def.rarity,
      }));
    expect(() => spire.assertTeamMeetsWard(app.content, plain, anybody)).not.toThrow();
  });

  it('never walks a climb backwards, even if two settlements race', async () => {
    const keep = spire.keeps(app.content)[0]!;
    const now = new Date();
    let context = await spire.contextFor(app.db, playerId);
    await app.db.transaction((tx) =>
      spire.settleClear(tx, app.content, context, keep, keep.stages[0]!, now),
    );
    context = await spire.contextFor(app.db, playerId);
    await app.db.transaction((tx) =>
      spire.settleClear(tx, app.content, context, keep, keep.stages[1]!, now),
    );

    // A stale settlement for floor 1 arriving after floor 2 must not undo it.
    const stale = await spire.contextFor(app.db, playerId);
    const replay = await app.db.transaction((tx) =>
      spire.settleClear(tx, app.content, stale, keep, keep.stages[0]!, now),
    );
    expect(replay.advanced).toBe(false);
    expect(replay.highestFloor).toBe(2);

    const [row] = await app.db
      .select()
      .from(playerSpireClimbs)
      .where(
        and(
          eq(playerSpireClimbs.playerId, playerId),
          eq(playerSpireClimbs.dungeonKey, keep.dungeon.key),
        ),
      );
    expect(row!.highestFloor).toBe(2);
    // …and did not spend a third key for a floor it did not climb.
    expect(row!.clears).toBe(2);
  });

  it('keeps the tower off the Depths hub', async () => {
    const response = await app.inject({
      method: 'GET',
      url: apiPath(ROUTES.depths.overview),
      cookies: { mv_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const keeps = response.json().data.depths.dungeons as { dungeonKey: string }[];
    // A tower has thirty floors and a boss at the top, which is exactly what a keep looks
    // like — so the hub would have offered a descent its own key rules refuse.
    expect(keeps.some((keep) => keep.dungeonKey.startsWith('spire_'))).toBe(false);
  });
});
