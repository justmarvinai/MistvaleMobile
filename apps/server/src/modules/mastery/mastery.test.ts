import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  MASTERY_TOTAL_PICKS,
  ROUTES,
  apiPath,
  canTakeMastery,
  tallyMasteries,
  type ChampionDetail,
  type MasteryDef,
} from '@mistvale/shared';
import { contentEntries, contentRevisions, playerChampions, players } from '../../db/schema/index';
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
import { resolveMasteries } from './service';

/**
 * Masteries.
 *
 * The build rules are pure and get tested as arithmetic; the spending is transactional and
 * gets tested through the API. The third thing worth pinning is the *split* — which effects
 * become stats before the fight and which ride into it — because getting that wrong is how
 * the champion screen starts lying about what a champion is.
 */

const dbUp = await isDatabaseAvailable();

/** The seeded nodes, indexed. */
function seededNodes(): Map<string, MasteryDef> {
  const seeds = buildSeedContent();
  const entries = seeds.find((seed) => seed.contentType === 'mastery')?.entities ?? [];
  return new Map(entries.map((entry) => [entry.key, entry.data as MasteryDef]));
}

describe('the build rules', () => {
  const nodes = seededNodes();
  const node = (key: string): MasteryDef => nodes.get(key)!;

  it('ships sixteen nodes in each of three trees', () => {
    expect(nodes.size).toBe(48);
    for (const tree of ['onslaught', 'bulwark', 'insight']) {
      const own = [...nodes.values()].filter((entry) => entry.tree === tree);
      expect(own, tree).toHaveLength(16);
      // Three each at tiers 1–4, two at 5 and two capstones — the shape §6 authors.
      expect(own.filter((entry) => entry.tier === 1)).toHaveLength(3);
      expect(own.filter((entry) => entry.tier === 5)).toHaveLength(2);
      expect(own.filter((entry) => entry.tier === 6)).toHaveLength(2);
    }
  });

  it('opens a tier only once enough has been learned below it', () => {
    // Nothing learned: only tier 1 is reachable.
    expect(canTakeMastery(node('onslaught_blade_oath'), [], nodes).ok).toBe(true);
    const gated = canTakeMastery(node('onslaught_shieldcracker'), [], nodes);
    expect(gated.ok).toBe(false);
    expect(gated.reason).toMatch(/lower tiers/);

    // Two tier-1 picks open tier 2.
    const two = ['onslaught_blade_oath', 'onslaught_keen_eye'];
    expect(canTakeMastery(node('onslaught_shieldcracker'), two, nodes).ok).toBe(true);
  });

  it('lets a build split across two trees keep climbing', () => {
    // The case a per-tree gate would have made impossible: one Tier-1 pick in each of two
    // trees, and no way back to Tier 1 because its allowance is spent. Both trees must
    // still open at Tier 2, or the champion is stranded at 2 of 15 forever.
    const split = ['onslaught_blade_oath', 'bulwark_ironhide'];
    expect(canTakeMastery(node('onslaught_shieldcracker'), split, nodes).ok).toBe(true);
    expect(canTakeMastery(node('bulwark_menders_gift'), split, nodes).ok).toBe(true);
  });

  it('refuses a third tree', () => {
    const twoTrees = ['onslaught_blade_oath', 'bulwark_ironhide'];
    const third = canTakeMastery(node('insight_sharpened_senses'), twoTrees, nodes);
    expect(third.ok).toBe(false);
    expect(third.reason).toMatch(/only train two trees/i);

    // The two already open stay open at the next tier up.
    expect(canTakeMastery(node('onslaught_shieldcracker'), twoTrees, nodes).ok).toBe(true);
  });

  it('caps picks per tier across both trees, not per tree', () => {
    // Two tier-1 picks is the whole allowance, wherever they came from.
    const spent = ['onslaught_blade_oath', 'bulwark_ironhide'];
    const third = canTakeMastery(node('onslaught_keen_eye'), spent, nodes);
    expect(third.ok).toBe(false);
    expect(third.reason).toMatch(/only 2 tier 1/i);
  });

  it('allows exactly one capstone', () => {
    // A full ladder down Onslaught, ending at the capstone.
    const build = [
      'onslaught_blade_oath',
      'onslaught_keen_eye',
      'onslaught_shieldcracker',
      'onslaught_bloodrush',
      'onslaught_momentum',
      'onslaught_fell_the_great',
      'onslaught_opportunist',
      'onslaught_grim_cycle',
      'onslaught_methodical',
      'onslaught_bounty_shield',
      'onslaught_duelists_focus',
      'onslaught_executioner',
      'onslaught_fury_brand',
      'onslaught_deathmark',
    ];
    for (let index = 0; index < build.length; index += 1) {
      const check = canTakeMastery(node(build[index]!), build.slice(0, index), nodes);
      expect(check.ok, `${build[index]}: ${check.reason}`).toBe(true);
    }

    const second = canTakeMastery(node('onslaught_flawless_edge'), build, nodes);
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/only one capstone/i);
  });

  it('counts fifteen picks in a full build', () => {
    expect(MASTERY_TOTAL_PICKS).toBe(15);
  });

  it('tallies by tier and by tree', () => {
    const tally = tallyMasteries(['onslaught_blade_oath', 'bulwark_ironhide'], nodes);
    expect(tally.byTier[1]).toBe(2);
    expect(tally.byTree.onslaught).toBe(1);
    expect(tally.byTree.bulwark).toBe(1);
    expect(tally.byTree.insight).toBe(0);
  });
});

describe('resolving a build', () => {
  const nodes = seededNodes();

  it('settles unconditional stats before the fight and sends the rest into it', () => {
    const resolved = resolveMasteries(
      [
        'onslaught_blade_oath', // +75 ATK, flat and unconditional
        'bulwark_stonefoot', // +10% HP, unconditional
        'bulwark_rooted', // +15% DEF, but only while unbuffed
        'onslaught_deathmark', // pure proc
        'insight_sustained_ward', // amplifies set bonuses during assembly
      ],
      nodes,
    );

    expect(resolved.bonuses.atk).toBe(75);
    expect(resolved.percentages.hp).toBe(10);
    expect(resolved.setBonusAmplifyPct).toBe(15);

    // Rooted is conditional, so it stays for the engine rather than becoming a number.
    const types = resolved.battleEffects.map((effect) => effect.type);
    expect(types).toContain('stat');
    expect(types).toContain('bonusDamageMaxHp');
    expect(types).not.toContain('setBonusAmplify');
  });

  it('ignores a node content has since removed rather than throwing', () => {
    const resolved = resolveMasteries(['onslaught_blade_oath', 'a_node_that_left'], nodes);
    expect(resolved.bonuses.atk).toBe(75);
    expect(resolved.battleEffects).toHaveLength(0);
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
      note: 'mastery fixture',
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

describe.skipIf(!dbUp)('training a champion', () => {
  let app: FastifyInstance;
  let cookie: string;
  let playerId: string;
  let championId: string;

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
        accountName: uniqueAccountName('trainer'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;

    const offered = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
    const starters = offered.json().data.starters as { key: string }[];
    const granted = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.chooseStarter),
      payload: { championKey: starters[0]!.key },
    });
    championId = (granted.json().data.champions as { id: string }[])[0]!.id;
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const actionId = () => `mastery-${Math.random().toString(36).slice(2, 12)}`;

  async function setLevel(level: number): Promise<void> {
    await app.db.update(players).set({ level }).where(eq(players.id, playerId));
  }

  async function giveEmblems(quantities: Record<string, number>): Promise<void> {
    await app.inject({
      method: 'GET',
      url: apiPath(ROUTES.inventory.items),
      cookies: { mv_session: cookie },
    });
    const { grantItems } = await import('../rewards/service');
    await app.db.transaction(async (tx) => {
      await grantItems(tx, playerId, quantities, 'test:emblems');
    });
  }

  async function learn(nodeKey: string) {
    return as({
      method: 'POST',
      url: apiPath(ROUTES.roster.masteries(championId)),
      payload: { nodeKey, actionId: actionId() },
    });
  }

  async function detail(): Promise<ChampionDetail> {
    const response = await as({
      method: 'GET',
      url: apiPath(ROUTES.roster.detail(championId)),
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data.champion as ChampionDetail;
  }

  it('keeps the trainer shut below the account level', async () => {
    const shut = await detail();
    expect(shut.masteries.unlocked).toBe(false);
    expect(shut.masteries.lockedReason).toMatch(/level 14/);

    const refused = await learn('onslaught_blade_oath');
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('LOCKED_CONTENT');
  });

  it('refuses a node the emblems will not cover, and takes nothing', async () => {
    await setLevel(14);
    const refused = await learn('onslaught_blade_oath');
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('INSUFFICIENT_FUNDS');
    expect((await detail()).masteries.chosen).toEqual([]);
  });

  it('learns a node, spends its emblems, and shows the stat straight away', async () => {
    await setLevel(14);
    await giveEmblems({ emblem_bronze: 40 });

    const before = await detail();
    const response = await learn('onslaught_blade_oath');
    expect(response.statusCode, response.body).toBe(200);

    const after = response.json().data.champion as ChampionDetail;
    expect(after.masteries.chosen).toEqual(['onslaught_blade_oath']);
    // +75 ATK, on the champion screen, in its own column.
    expect(after.stats.mastery.atk).toBe(75);
    expect(after.stats.total.atk).toBe(before.stats.total.atk + 75);

    const items = await as({ method: 'GET', url: apiPath(ROUTES.inventory.items) });
    const bronze = (items.json().data.items as { itemKey: string; quantity: number }[]).find(
      (entry) => entry.itemKey === 'emblem_bronze',
    );
    expect(bronze?.quantity).toBe(20);
  });

  it('refuses a node the build rules do not allow', async () => {
    await setLevel(14);
    await giveEmblems({ emblem_bronze: 200 });

    const gated = await learn('onslaught_shieldcracker');
    expect(gated.statusCode).toBe(400);
    expect(gated.json().error.message).toMatch(/lower tiers/);

    // And nothing was charged for the refusal.
    const items = await as({ method: 'GET', url: apiPath(ROUTES.inventory.items) });
    const bronze = (items.json().data.items as { itemKey: string; quantity: number }[]).find(
      (entry) => entry.itemKey === 'emblem_bronze',
    );
    expect(bronze?.quantity).toBe(200);
  });

  it('closes the third tree once two are open', async () => {
    await setLevel(14);
    await giveEmblems({ emblem_bronze: 200 });

    expect((await learn('onslaught_blade_oath')).statusCode).toBe(200);
    expect((await learn('bulwark_ironhide')).statusCode).toBe(200);

    const third = await learn('insight_sharpened_senses');
    expect(third.statusCode).toBe(400);
    expect(third.json().error.message).toMatch(/only train two trees/i);
  });

  it('forgets everything free the first time and for crystals after', async () => {
    await setLevel(14);
    await giveEmblems({ emblem_bronze: 200 });
    await learn('onslaught_blade_oath');

    const first = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.masteryReset(championId)),
      payload: { actionId: actionId() },
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().data.crystalsSpent).toBe(0);
    expect((first.json().data.champion as ChampionDetail).masteries.chosen).toEqual([]);
    // The stat goes with it.
    expect((first.json().data.champion as ChampionDetail).stats.mastery.atk).toBe(0);

    // The second reset is priced, and the player cannot afford it.
    await learn('onslaught_blade_oath');
    const second = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.masteryReset(championId)),
      payload: { actionId: actionId() },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('INSUFFICIENT_FUNDS');

    // Paid for, it goes through.
    await app.db.update(players).set({ crystals: 500 }).where(eq(players.id, playerId));
    const paid = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.masteryReset(championId)),
      payload: { actionId: actionId() },
    });
    expect(paid.statusCode, paid.body).toBe(200);
    expect(paid.json().data.crystalsSpent).toBe(150);
  });

  it('carries a learned build into the champion that actually fights', async () => {
    await setLevel(14);
    await giveEmblems({ emblem_bronze: 200 });

    /** Starts a fight and reports the attack the engine gave the champion. */
    const fieldedAtk = async (): Promise<number> => {
      await app.db.update(players).set({ energy: 60 }).where(eq(players.id, playerId));
      const started = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: {
          mode: 'campaign',
          stageKey: 'c01_s1_normal',
          team: [championId],
          actionId: 'start-masterytes-001',
        },
      });
      expect(started.statusCode, started.body).toBe(200);
      const battleId = started.json().data.id as string;
      const atk = (started.json().data.state.allies[0] as { stats: { atk: number } }).stats.atk;
      await as({ method: 'POST', url: apiPath(ROUTES.battle.retreat(battleId)) });
      return atk;
    };

    const before = await fieldedAtk();
    await learn('onslaught_blade_oath');

    const [row] = await app.db
      .select({ masteries: playerChampions.masteries })
      .from(playerChampions)
      .where(eq(playerChampions.id, championId));
    expect(row!.masteries).toEqual(['onslaught_blade_oath']);

    // The whole promise of the split: what the screen added is what the engine fights with.
    // Compared battle-to-battle rather than against the champion screen, because the leader
    // aura applies in a fight and deliberately does not show on the roster.
    const after = await fieldedAtk();
    expect(after).toBeGreaterThan(before);
    expect((await detail()).stats.mastery.atk).toBe(75);
  });
});
