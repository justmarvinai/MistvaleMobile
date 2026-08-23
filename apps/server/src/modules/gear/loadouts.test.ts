import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { createRng } from '@mistvale/engine';
import { ROUTES, apiPath, type GearInstance, type GearSlot, type Loadout } from '@mistvale/shared';
import {
  contentEntries,
  contentRevisions,
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
import * as gear from './service';

/**
 * Saved relic sets, and forging a pile of relics at once.
 *
 * The planning is pure and tested on its own in `@mistvale/shared`; what is proven here is
 * everything that needs a database — that the writes land in an order the partial unique
 * index survives, that a full vault refuses an apply *before* half of it has happened, and
 * that a bulk forge stops on an empty purse rather than throwing away what it managed.
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
      note: 'loadouts fixture',
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

describe.skipIf(!dbUp)('relic loadouts', () => {
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
        accountName: uniqueAccountName('smith'),
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

  const actionId = (label: string): string => `${label}-${Math.random().toString(36).slice(2, 12)}`;

  /** Two champions to move a set between, both ascended enough for every slot. */
  async function twoChampions(): Promise<[string, string]> {
    const offered = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
    const starters = offered.json().data.starters as { key: string }[];
    const granted = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.chooseStarter),
      payload: { championKey: starters[0]!.key },
    });
    expect(granted.statusCode, granted.body).toBe(200);
    const first = (granted.json().data.champions as { id: string }[])[0]!.id;

    const [second] = await app.db
      .insert(playerChampions)
      .values({ playerId, championKey: starters[1]!.key, level: 1, rank: 5, ascension: 6 })
      .returning({ id: playerChampions.id });
    await app.db
      .update(playerChampions)
      .set({ ascension: 6, rank: 5 })
      .where(eq(playerChampions.id, first));
    return [first, second!.id];
  }

  async function giveGear(slot: GearSlot, seed = 1234): Promise<GearInstance> {
    const context = gear.gearContextFrom(app.content.current().bundle);
    const row = await gear.createGear(
      app.db,
      playerId,
      { setKey: 'ironroot', slot, rank: 5, rarity: 'epic', source: 'test' },
      createRng(seed),
      context,
    );
    return gear.toDto(row, context);
  }

  async function equip(gearId: string, championId: string): Promise<void> {
    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.equip(gearId)),
      payload: { championId },
    });
    expect(response.statusCode, response.body).toBe(200);
  }

  async function save(name: string, championId: string): Promise<Loadout> {
    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.loadouts.save),
      payload: { name, championId },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data.loadout as Loadout;
  }

  async function wornBy(championId: string): Promise<GearSlot[]> {
    const rows = await app.db
      .select({ slot: gearInstances.slot })
      .from(gearInstances)
      .where(eq(gearInstances.equippedChampionId, championId));
    return rows.map((row) => row.slot as GearSlot).sort();
  }

  it('captures what a champion is wearing and moves it to another', async () => {
    const [hero, other] = await twoChampions();
    const weapon = await giveGear('weapon');
    const helm = await giveGear('helm', 99);
    await equip(weapon.id, hero);
    await equip(helm.id, hero);

    const loadout = await save('Speed set', hero);
    expect(loadout.gearIds).toHaveLength(2);
    expect(loadout.fromChampionId).toBe(hero);

    const applied = await as({
      method: 'POST',
      url: apiPath(ROUTES.loadouts.apply(loadout.id)),
      payload: { championId: other, actionId: actionId('apply') },
    });
    expect(applied.statusCode, applied.body).toBe(200);

    expect(await wornBy(other)).toEqual(['helm', 'weapon']);
    expect(await wornBy(hero)).toEqual([]);
  });

  it('is a no-op applied twice, rather than stripping what it just put on', async () => {
    // The bug the pure planner caught: a relic already on the target is "skipped", and a
    // removal list built from "everything not being equipped" would take it back off.
    const [hero] = await twoChampions();
    const weapon = await giveGear('weapon');
    await equip(weapon.id, hero);
    const loadout = await save('Mine', hero);

    const again = await as({
      method: 'POST',
      url: apiPath(ROUTES.loadouts.apply(loadout.id)),
      payload: { championId: hero, actionId: actionId('again') },
    });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.message).toMatch(/already on this champion/i);
    expect(await wornBy(hero)).toEqual(['weapon']);
  });

  it('leaves alone a slot the loadout does not cover', async () => {
    const [hero, other] = await twoChampions();
    const weapon = await giveGear('weapon');
    const boots = await giveGear('boots', 7);
    await equip(weapon.id, hero);
    await equip(boots.id, other);

    const loadout = await save('Weapon only', hero);
    const applied = await as({
      method: 'POST',
      url: apiPath(ROUTES.loadouts.apply(loadout.id)),
      payload: { championId: other, actionId: actionId('partial') },
    });
    expect(applied.statusCode, applied.body).toBe(200);
    // The boots stay on: a loadout that names no boots is not an instruction to remove them.
    expect(await wornBy(other)).toEqual(['boots', 'weapon']);
  });

  it('skips a relic that has been sold, and still applies the rest', async () => {
    const [hero, other] = await twoChampions();
    const weapon = await giveGear('weapon');
    const helm = await giveGear('helm', 42);
    await equip(weapon.id, hero);
    await equip(helm.id, hero);
    const loadout = await save('Half gone', hero);

    // Take the helm off and sell it — months later, this is the ordinary state of a
    // loadout, and refusing the whole apply would make loadouts rot.
    await as({ method: 'POST', url: apiPath(ROUTES.gear.unequip(helm.id)) });
    const sold = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.sell),
      payload: { ids: [helm.id], actionId: actionId('sell') },
    });
    expect(sold.statusCode, sold.body).toBe(200);

    const applied = await as({
      method: 'POST',
      url: apiPath(ROUTES.loadouts.apply(loadout.id)),
      payload: { championId: other, actionId: actionId('rest') },
    });
    expect(applied.statusCode, applied.body).toBe(200);
    const plan = applied.json().data.plan as { skipped: { reason: string }[] };
    expect(plan.skipped.map((entry) => entry.reason)).toEqual(['missing']);
    expect(await wornBy(other)).toEqual(['weapon']);
  });

  it('refuses an apply the vault has no room for, before anything moves', async () => {
    const [hero, other] = await twoChampions();
    // A relic on each champion: applying hero's set to `other` frees nothing and loosens
    // `other`'s piece, so the vault needs one slot.
    const heroWeapon = await giveGear('weapon');
    const otherWeapon = await giveGear('weapon', 5);
    await equip(heroWeapon.id, hero);
    await equip(otherWeapon.id, other);
    const loadout = await save('Full vault', hero);

    // Fill the vault to the brim with loose relics.
    const vault = await as({ method: 'GET', url: apiPath(ROUTES.gear.vault) });
    const capacity = vault.json().data.vault.capacity as number;
    for (let i = 0; i < capacity; i += 1) await giveGear('boots', 1000 + i);

    const applied = await as({
      method: 'POST',
      url: apiPath(ROUTES.loadouts.apply(loadout.id)),
      payload: { championId: other, actionId: actionId('full') },
    });
    expect(applied.statusCode).toBe(400);
    expect(applied.json().error.message).toMatch(/vault has room for/i);
    // And nothing moved — the refusal is before the writes, not halfway through them.
    expect(await wornBy(hero)).toEqual(['weapon']);
    expect(await wornBy(other)).toEqual(['weapon']);
  });

  it('refuses to save a champion wearing nothing', async () => {
    const [hero] = await twoChampions();
    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.loadouts.save),
      payload: { name: 'Empty', championId: hero },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/wearing nothing/i);
  });

  it('replaces a loadout saved over the same name rather than refusing', async () => {
    const [hero] = await twoChampions();
    const weapon = await giveGear('weapon');
    await equip(weapon.id, hero);
    const first = await save('Set', hero);

    const helm = await giveGear('helm', 3);
    await equip(helm.id, hero);
    const second = await save('Set', hero);

    expect(second.id).toBe(first.id);
    expect(second.gearIds).toHaveLength(2);
    const listed = await as({ method: 'GET', url: apiPath(ROUTES.loadouts.list) });
    expect(listed.json().data.loadouts as Loadout[]).toHaveLength(1);
  });

  it('renames and forgets one', async () => {
    const [hero] = await twoChampions();
    await equip((await giveGear('weapon')).id, hero);
    const loadout = await save('Old name', hero);

    const renamed = await as({
      method: 'PATCH',
      url: apiPath(ROUTES.loadouts.byId(loadout.id)),
      payload: { name: 'New name' },
    });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect((renamed.json().data.loadout as Loadout).name).toBe('New name');

    const gone = await as({ method: 'DELETE', url: apiPath(ROUTES.loadouts.byId(loadout.id)) });
    expect(gone.statusCode, gone.body).toBe(200);
    const listed = await as({ method: 'GET', url: apiPath(ROUTES.loadouts.list) });
    expect(listed.json().data.loadouts).toHaveLength(0);
  });

  it('does not hand one account another account’s loadout', async () => {
    const [hero] = await twoChampions();
    await equip((await giveGear('weapon')).id, hero);
    const loadout = await save('Mine', hero);

    const other = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('thief'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    const theirs = extractSessionCookie(other.headers['set-cookie']) as string;
    const peek = await app.inject({
      method: 'DELETE',
      url: apiPath(ROUTES.loadouts.byId(loadout.id)),
      cookies: { mv_session: theirs },
    });
    expect(peek.statusCode).toBe(404);
  });
});

describe.skipIf(!dbUp)('forging in bulk', () => {
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
        accountName: uniqueAccountName('forger'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const actionId = (label: string): string => `${label}-${Math.random().toString(36).slice(2, 12)}`;

  async function giveGear(seed: number): Promise<GearInstance> {
    const context = gear.gearContextFrom(app.content.current().bundle);
    const row = await gear.createGear(
      app.db,
      playerId,
      { setKey: 'ironroot', slot: 'weapon', rank: 5, rarity: 'epic', source: 'test' },
      createRng(seed),
      context,
    );
    return gear.toDto(row, context);
  }

  async function setSilver(amount: number): Promise<void> {
    await app.db.update(players).set({ silver: amount }).where(eq(players.id, playerId));
  }

  it('takes a pile of relics toward a level in one run', async () => {
    const pieces = await Promise.all([giveGear(1), giveGear(2), giveGear(3)]);
    await setSilver(5_000_000);

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.upgradeMany),
      payload: {
        ids: pieces.map((piece) => piece.id),
        toLevel: 4,
        actionId: actionId('bulk'),
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    const result = response.json().data as {
      entries: { gearId: string; toLevel: number; attempts: number }[];
      silverSpent: number;
      stoppedBecause: string | null;
    };
    expect(result.entries).toHaveLength(3);
    expect(result.stoppedBecause).toBeNull();
    for (const entry of result.entries) {
      // Every attempt is the forge's own roll, so a failure is possible — what is
      // guaranteed is that the run kept going until each reached the level asked for.
      expect(entry.toLevel).toBe(4);
      expect(entry.attempts).toBeGreaterThanOrEqual(4);
    }
    expect(result.silverSpent).toBeGreaterThan(0);
  });

  it('stops when the silver runs out, and keeps what it managed', async () => {
    const pieces = await Promise.all([giveGear(11), giveGear(12), giveGear(13)]);
    // Enough for a couple of the cheapest attempts and nowhere near the whole run.
    await setSilver(pieces[0]!.upgradeCost * 3);

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.upgradeMany),
      payload: {
        ids: pieces.map((piece) => piece.id),
        toLevel: 12,
        actionId: actionId('broke'),
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    const result = response.json().data as {
      silver: number;
      silverSpent: number;
      stoppedBecause: string | null;
    };
    expect(result.stoppedBecause).toMatch(/out of silver/i);
    expect(result.silver).toBeGreaterThanOrEqual(0);
    // Spent what it had rather than rolling the whole run back — the attempts happened.
    expect(result.silverSpent).toBeGreaterThan(0);
  });

  it('refuses a run with no silver at all rather than reporting a run of nothing', async () => {
    const piece = await giveGear(21);
    await setSilver(0);
    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.upgradeMany),
      payload: { ids: [piece.id], toLevel: 4, actionId: actionId('penniless') },
    });
    // 409 rather than 400: `INSUFFICIENT_FUNDS` is a conflict with the wallet's state
    // rather than a malformed request, and the whole error table maps it that way.
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toMatch(/not enough silver/i);
  });

  it('refuses a relic that is not yours', async () => {
    const piece = await giveGear(31);
    const other = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('nicker'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    const theirs = extractSessionCookie(other.headers['set-cookie']) as string;
    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.gear.upgradeMany),
      cookies: { mv_session: theirs },
      payload: { ids: [piece.id], toLevel: 4, actionId: actionId('theft') },
    });
    expect(response.statusCode).toBe(404);
  });
});
