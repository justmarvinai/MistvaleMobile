import { randomInt } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import {
  ROUTES,
  apiSuccess,
  routePattern,
  ascendRequestSchema,
  awakenRequestSchema,
  buyVaultSlotsRequestSchema,
  championFlagsRequestSchema,
  equipGearRequestSchema,
  levelUpRequestSchema,
  lockGearRequestSchema,
  rankUpRequestSchema,
  releaseChampionsRequestSchema,
  dismantleGearRequestSchema,
  reforgeGearRequestSchema,
  sellGearRequestSchema,
  skillUpgradeRequestSchema,
  upgradeGearRequestSchema,
  upgradeManyRequestSchema,
  applyLoadoutRequestSchema,
  renameLoadoutRequestSchema,
  saveLoadoutRequestSchema,
  type Rarity,
} from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import * as champions from '../roster/champions';
import { accountBonusFor, accountBonusesFor } from '../roster/account';
import * as progression from '../roster/progression';
import { itemQuantities } from '../rewards/service';
import * as gear from './service';
import * as loadouts from './loadouts';
import { idParam, uuidQuery } from '../../lib/params';

/**
 * Relics and champion progression.
 *
 * Thin, like the battle routes: the rules live in the services so the Depths and the
 * Arena can reuse them. Every mutating endpoint returns the champion or relic it changed,
 * fully assembled, because the client re-reads rather than patching its own copy — the
 * "server is truth" rule, applied to the management screens.
 */

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  /**
   * The parts of a champion context that cost nothing to build.
   *
   * Most of this file only wants the relic tables or the progression curves, neither of
   * which knows anything about an account — so those stay synchronous and free. Anything
   * that *assembles* a champion needs `championCtx` below, and the split is deliberate:
   * a shared, request-lifetime context carrying one player's collection bonus is exactly
   * how the next request through the same route gets the wrong stats.
   */
  const bare = (): { gear: gear.GearContext; progression: progression.ProgressionConfig } => {
    const bundle = app.content.current().bundle;
    return {
      gear: gear.gearContextFrom(bundle),
      progression: progression.progressionConfigFrom(bundle.config),
    };
  };

  /** The full context, including what this account's collection is worth (C10b). */
  const championCtx = async (playerId: string): Promise<champions.ChampionContext> =>
    champions.championContextFrom(
      app.content,
      await accountBonusesFor(app.db, app.content, playerId),
    );

  /** A relic upgrade seed comes from the OS, never from a battle's replayable stream. */
  const upgradeSeed = (): number => randomInt(0, 2 ** 31 - 1);

  const rarityOf = (championKey: string): Rarity | undefined =>
    app.content.current().bundle.champions.find((entry) => entry.key === championKey)?.rarity;

  /**
   * The published definition behind a champion somebody owns.
   *
   * Three ladders need it now — the star ceiling, the ascension gate and the awakening
   * gate all come off the rarity — so the lookup that used to live inside `ascend` is a
   * helper. A copy can outlive the content that defined it, and every one of those ladders
   * would otherwise be deciding what to do about a champion it cannot describe.
   */
  const championDef = async (playerId: string, championId: string) => {
    const owned = await champions.loadOwned(app.db, playerId, championId);
    const def = app.content
      .current()
      .bundle.champions.find((entry) => entry.key === owned.championKey);
    if (!def) throw AppError.notFound('That champion is no longer published.');
    return def;
  };

  app.addHook('preHandler', app.requireAuth);

  // ── Inventory ────────────────────────────────────────────────────────────
  app.get(ROUTES.inventory.items, async (request, reply) => {
    const playerId = requirePlayer(request);
    const held = await itemQuantities(app.db, playerId);
    const items = [...held].map(([itemKey, quantity]) => ({ itemKey, quantity }));
    return reply.send(apiSuccess({ items }, app.content.rev));
  });

  app.get(ROUTES.gear.list, async (request, reply) => {
    const playerId = requirePlayer(request);
    const ctx = bare().gear;
    // The vault comes with the list rather than from a second call: the screen that shows
    // relics is the screen that shows how many more will fit, and one round trip on a
    // one-core box is worth more than the tidiness of two endpoints.
    const [list, vault] = await Promise.all([
      gear.listGear(app.db, playerId, ctx),
      gear.vaultState(app.db, playerId, ctx),
    ]);
    return reply.send(apiSuccess({ gear: list, vault }, app.content.rev));
  });

  app.get(ROUTES.gear.vault, async (request, reply) => {
    const playerId = requirePlayer(request);
    const vault = await gear.vaultState(app.db, playerId, bare().gear);
    return reply.send(apiSuccess({ vault }, app.content.rev));
  });

  app.post(ROUTES.gear.buyVaultSlots, async (request, reply) => {
    const playerId = requirePlayer(request);
    const body = buyVaultSlotsRequestSchema.parse(request.body ?? {});
    const vault = await gear.buyVaultSlots(app.db, playerId, body.actionId, bare().gear);
    return reply.send(apiSuccess({ vault }, app.content.rev));
  });

  // ── Champions ────────────────────────────────────────────────────────────
  app.get(routePattern(ROUTES.roster.detail), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const detail = await champions.loadDetail(app.db, playerId, id, await championCtx(playerId));
    return reply.send(apiSuccess({ champion: detail }, app.content.rev));
  });

  app.post(routePattern(ROUTES.roster.levelUp), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const body = levelUpRequestSchema.parse(request.body);

    const result = await progression.levelUpWithFood(
      app.db,
      playerId,
      id,
      body.foodIds,
      body.brews,
      bare().progression,
      app.content,
    );
    const detail = await champions.loadDetail(app.db, playerId, id, await championCtx(playerId));
    request.log.info(
      { playerId, championId: id, fed: result.consumed.length, xp: result.xpGained },
      'champion levelled',
    );
    return reply.send(
      apiSuccess(
        {
          champion: detail,
          consumed: result.consumed,
          silver: await silverOf(playerId),
          levelsGained: result.levelsGained,
        },
        app.content.rev,
      ),
    );
  });

  app.post(routePattern(ROUTES.roster.rankUp), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const body = rankUpRequestSchema.parse(request.body);

    const rankDef = await championDef(playerId, id);
    const result = await progression.rankUp(
      app.db,
      playerId,
      id,
      rankDef,
      body.foodIds,
      bare().progression,
      app.content,
    );
    const detail = await champions.loadDetail(app.db, playerId, id, await championCtx(playerId));
    request.log.info(
      { playerId, championId: id, rank: result.champion.rank },
      'champion ranked up',
    );
    return reply.send(
      apiSuccess(
        {
          champion: detail,
          consumed: result.consumed,
          silver: await silverOf(playerId),
          levelsGained: 0,
        },
        app.content.rev,
      ),
    );
  });

  app.post(routePattern(ROUTES.roster.ascend), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    ascendRequestSchema.parse(request.body);

    const def = await championDef(playerId, id);
    await progression.ascend(app.db, playerId, id, def, bare().progression, app.content);
    const detail = await champions.loadDetail(app.db, playerId, id, await championCtx(playerId));
    request.log.info({ playerId, championId: id }, 'champion ascended');
    return reply.send(
      apiSuccess(
        { champion: detail, consumed: [], silver: await silverOf(playerId), levelsGained: 0 },
        app.content.rev,
      ),
    );
  });

  app.post(routePattern(ROUTES.roster.awaken), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    awakenRequestSchema.parse(request.body);

    const def = await championDef(playerId, id);
    await progression.awaken(app.db, playerId, id, def, bare().progression, app.content);
    const detail = await champions.loadDetail(app.db, playerId, id, await championCtx(playerId));
    request.log.info(
      { playerId, championId: id, awakening: detail.champion.awakening },
      'champion awakened',
    );
    return reply.send(
      apiSuccess(
        { champion: detail, consumed: [], silver: await silverOf(playerId), levelsGained: 0 },
        app.content.rev,
      ),
    );
  });

  app.post(routePattern(ROUTES.roster.skillUpgrade), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const body = skillUpgradeRequestSchema.parse(request.body);

    const owned = await champions.loadOwned(app.db, playerId, id);
    const def = app.content
      .current()
      .bundle.champions.find((entry) => entry.key === owned.championKey);
    if (!def) throw AppError.notFound('That champion is no longer published.');

    const result = await progression.upgradeSkill(
      app.db,
      playerId,
      id,
      body.skillKey,
      body.source,
      def,
      bare().progression,
    );
    const detail = await champions.loadDetail(app.db, playerId, id, await championCtx(playerId));
    return reply.send(
      apiSuccess(
        {
          champion: detail,
          consumed: result.consumed,
          silver: await silverOf(playerId),
          levelsGained: 0,
        },
        app.content.rev,
      ),
    );
  });

  app.post(routePattern(ROUTES.roster.flags), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const body = championFlagsRequestSchema.parse(request.body);

    await progression.setFlags(app.db, playerId, id, body);
    const detail = await champions.loadDetail(app.db, playerId, id, await championCtx(playerId));
    return reply.send(apiSuccess({ champion: detail }, app.content.rev));
  });

  app.post(ROUTES.roster.release, async (request, reply) => {
    const playerId = requirePlayer(request);
    const body = releaseChampionsRequestSchema.parse(request.body);

    const result = await progression.release(
      app.db,
      playerId,
      body.ids,
      rarityOf,
      bare().progression,
    );
    request.log.info({ playerId, count: result.released.length }, 'champions released');
    return reply.send(apiSuccess(result, app.content.rev));
  });

  // ── Relics ───────────────────────────────────────────────────────────────
  app.post(routePattern(ROUTES.gear.equip), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const body = equipGearRequestSchema.parse(request.body);

    const ctx = await championCtx(playerId);
    await gear.equip(app.db, playerId, id, body.championId, ctx.gear, app.content);
    const detail = await champions.loadDetail(
      app.db,
      playerId,
      body.championId,
      await championCtx(playerId),
    );
    return reply.send(apiSuccess({ champion: detail }, app.content.rev));
  });

  app.post(routePattern(ROUTES.gear.unequip), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);

    const row = await gear.unequip(app.db, playerId, id, bare().gear);
    return reply.send(apiSuccess({ gear: gear.toDto(row, bare().gear) }, app.content.rev));
  });

  app.post(routePattern(ROUTES.gear.lock), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const body = lockGearRequestSchema.parse(request.body);

    const row = await gear.setLocked(app.db, playerId, id, body.locked);
    return reply.send(apiSuccess({ gear: gear.toDto(row, bare().gear) }, app.content.rev));
  });

  app.post(routePattern(ROUTES.gear.upgrade), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const body = upgradeGearRequestSchema.parse(request.body);

    const ctx = await championCtx(playerId);
    const result = await gear.upgrade(
      app.db,
      playerId,
      id,
      body.times,
      ctx.gear,
      upgradeSeed(),
      app.content,
    );
    return reply.send(
      apiSuccess(
        {
          gear: gear.toDto(result.gear, ctx.gear),
          attempts: result.attempts,
          silverSpent: result.silverSpent,
          silver: result.silver,
        },
        app.content.rev,
      ),
    );
  });

  /**
   * Forges several relics toward a level in one run.
   *
   * The vault's second job is picking the piece worth upgrading out of a hundred, and this
   * is the action that job ends in. Nothing about the forge's rules changes — same cost
   * curve, same chance per level, same substat roll every four levels — and the count is
   * capped by config so a hundred-relic run cannot be posted.
   */
  app.post(ROUTES.gear.upgradeMany, async (request, reply) => {
    const playerId = requirePlayer(request);
    const body = upgradeManyRequestSchema.parse(request.body);
    const cap = gear.maxBulkForge(app.content.current().bundle.config);
    if (body.ids.length > cap) {
      throw new AppError('VALIDATION', `A forge run takes at most ${cap} relics.`);
    }

    const ctx = await championCtx(playerId);
    const result = await gear.upgradeMany(
      app.db,
      playerId,
      body.ids,
      body.toLevel,
      ctx.gear,
      upgradeSeed(),
      app.content,
    );
    request.log.info(
      { playerId, relics: result.entries.length, spent: result.silverSpent },
      'relics forged in bulk',
    );
    return reply.send(apiSuccess(result, app.content.rev));
  });

  // ── Loadouts ─────────────────────────────────────────────────────────────

  app.get(ROUTES.loadouts.list, async (request, reply) => {
    const playerId = requirePlayer(request);
    return reply.send(
      apiSuccess({ loadouts: await loadouts.list(app.db, playerId) }, app.content.rev),
    );
  });

  app.post(ROUTES.loadouts.save, async (request, reply) => {
    const playerId = requirePlayer(request);
    const body = saveLoadoutRequestSchema.parse(request.body);
    const loadout = await loadouts.save(app.db, playerId, app.content, body.name, body.championId);
    return reply.send(apiSuccess({ loadout }, app.content.rev));
  });

  app.patch(routePattern(ROUTES.loadouts.byId), async (request, reply) => {
    const playerId = requirePlayer(request);
    const body = renameLoadoutRequestSchema.parse(request.body);
    const loadout = await loadouts.rename(app.db, playerId, idParam(request), body.name);
    return reply.send(apiSuccess({ loadout }, app.content.rev));
  });

  app.delete(routePattern(ROUTES.loadouts.byId), async (request, reply) => {
    const playerId = requirePlayer(request);
    await loadouts.remove(app.db, playerId, idParam(request));
    return reply.send(apiSuccess({ ok: true }, app.content.rev));
  });

  app.post(routePattern(ROUTES.loadouts.apply), async (request, reply) => {
    const playerId = requirePlayer(request);
    const body = applyLoadoutRequestSchema.parse(request.body);
    const ctx = await championCtx(playerId);
    const result = await loadouts.apply(
      app.db,
      playerId,
      app.content,
      idParam(request),
      body.championId,
      ctx.gear,
    );
    // The whole vault comes back rather than the pieces that moved: a loadout can touch
    // nine relics on two champions, and a screen re-deriving that from a list of ids is a
    // second implementation of the plan it just asked the server to make.
    const [list, vault] = await Promise.all([
      gear.listGear(app.db, playerId, ctx.gear),
      gear.vaultState(app.db, playerId, ctx.gear),
    ]);
    return reply.send(apiSuccess({ plan: result.plan, gear: list, vault }, app.content.rev));
  });

  app.post(ROUTES.gear.sell, async (request, reply) => {
    const playerId = requirePlayer(request);
    const body = sellGearRequestSchema.parse(request.body);

    const result = await gear.sell(app.db, playerId, body.ids, bare().gear);
    request.log.info({ playerId, count: result.sold.length, paid: result.paid }, 'relics sold');
    return reply.send(apiSuccess(result, app.content.rev));
  });

  /**
   * Grinds relics down for Reliquary Dust.
   *
   * The other half of the vault's ceiling: a player who has to get rid of relics chooses
   * here whether the overflow becomes silver or the currency that fixes what they kept.
   * Same refusals as a sell, because it is the same decision made differently.
   */
  app.post(ROUTES.gear.dismantle, async (request, reply) => {
    const playerId = requirePlayer(request);
    const body = dismantleGearRequestSchema.parse(request.body);

    const result = await gear.dismantle(app.db, playerId, body.ids, bare().gear);
    request.log.info(
      { playerId, count: result.removed.length, dust: result.dust },
      'relics dismantled',
    );
    return reply.send(apiSuccess(result, app.content.rev));
  });

  /**
   * What reforging this relic would cost, and what each of its lines could become.
   *
   * A read, and the reason the mutation can stay a single tap: the pool every line is
   * gambling against is published before anything is spent, the same way the Mistgate
   * publishes its rates. `blockedReason` is computed by the same function the mutation
   * refuses with, so the button's sentence and the server's are one sentence.
   */
  app.get(routePattern(ROUTES.gear.reforge), async (request, reply) => {
    const playerId = requirePlayer(request);
    const quote = await gear.reforgeQuote(app.db, playerId, idParam(request), bare().gear);
    return reply.send(apiSuccess(quote, app.content.rev));
  });

  app.post(routePattern(ROUTES.gear.reforge), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const body = reforgeGearRequestSchema.parse(request.body);

    const result = await gear.reforge(
      app.db,
      playerId,
      id,
      {
        substatIndex: body.substatIndex,
        expectStat: body.expectStat,
        expectPercent: body.expectPercent,
      },
      bare().gear,
      upgradeSeed(),
      app.content,
    );
    request.log.info(
      { playerId, gearId: id, from: result.before.stat, to: result.after.stat },
      'relic reforged',
    );
    return reply.send(apiSuccess(result, app.content.rev));
  });

  /**
   * What equipping this relic would do.
   *
   * Computed by assembling the champion twice — once as it stands and once with the swap
   * applied — rather than by adding the relic's lines up, because a set bonus can appear
   * or vanish and a percentage resolves against the champion's base. The client shows the
   * difference; it never derives it.
   */
  app.get(routePattern(ROUTES.gear.preview), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const championId = uuidQuery(request, 'championId');

    const ctx = await championCtx(playerId);
    const [candidate] = await gear
      .listGear(app.db, playerId, ctx.gear)
      .then((all) => all.filter((piece) => piece.id === id));
    if (!candidate) throw AppError.notFound('No such relic.');

    const before = await champions.loadDetail(app.db, playerId, championId, ctx);
    const worn = before.gear.filter((piece) => piece.slot !== candidate.slot);
    const replaces = before.gear.find((piece) => piece.slot === candidate.slot) ?? null;

    const owned = await champions.loadOwned(app.db, playerId, championId);
    const base = champions.baseStatsFor(owned, ctx);
    // The same mastery contribution the champion screen uses, or the preview would
    // promise a stat line the detail view then contradicts.
    const assembled = gear.assembleChampion(
      base,
      [...worn, candidate].map(toRow),
      ctx.gear,
      champions.masteryContribution(owned, base, ctx),
      // The collection's contribution too, or the preview promises a total the champion
      // sheet then contradicts by exactly the account bonus.
      accountBonusFor(ctx.account, owned.championKey, rarityOf(owned.championKey) ?? 'common'),
    );

    return reply.send(
      apiSuccess(
        {
          preview: {
            championId,
            before: before.stats,
            after: {
              base,
              gear: assembled.gear,
              mastery: assembled.mastery,
              account: assembled.account,
              total: assembled.total,
              setBonuses: assembled.setBonuses,
              power: assembled.power,
            },
            replaces,
          },
        },
        app.content.rev,
      ),
    );
  });

  /** The wallet, read after a spend so the client never has to subtract. */
  async function silverOf(playerId: string): Promise<number> {
    const { players } = await import('../../db/schema/index');
    const { eq } = await import('drizzle-orm');
    const [row] = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));
    return row?.silver ?? 0;
  }
};

/**
 * A relic DTO back into the row shape the assembler reads.
 *
 * Only the fields the maths uses are needed, which is why this is a narrowing rather than
 * a round trip through the database.
 */
function toRow(piece: Awaited<ReturnType<typeof gear.listGear>>[number]) {
  return {
    id: piece.id,
    setKey: piece.setKey,
    slot: piece.slot,
    rank: piece.rank,
    rarity: piece.rarity,
    level: piece.level,
    mainStat: piece.main,
    substats: piece.substats,
  } as Parameters<typeof gear.assembleChampion>[1][number];
}
