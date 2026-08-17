import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import {
  buildRules,
  buildTeam,
  championScalingFrom,
  combatConfigFrom,
  createBattle,
  createRng,
  deriveStats,
} from '@mistvale/engine';
import {
  bandOf,
  tierForRating,
  type ArenaLeaderboard,
  type ArenaOffer,
  type ArenaState,
  type ArenaTeamMember,
  type ArenaTier,
} from '@mistvale/shared';
import { arenaState, battleSessions, players } from '../../db/schema/index';
import type { ArenaOfferRow, ArenaStateRow } from '../../db/schema/arena';
import { AppError } from '../../lib/errors';
import { gameDayFrom } from '../../lib/game-day';
import * as battle from '../battle/service';
import * as gear from '../gear/service';
import * as mastery from '../mastery/service';
import * as rewards from '../rewards/service';
import * as roster from '../roster/service';
import * as hall from './hall';
import {
  assertUnlocked,
  config,
  ensureState,
  nextMonday,
  type ArenaContext,
  type Executor as Tx,
} from './ladder';
import { arenaConfigFrom, computeTokens, medalsForWin, ratingChange } from './rating';

/**
 * The Arena.
 *
 * Asynchronous by construction: an attack is fought against a *snapshot* of somebody
 * else's defence team, assembled at the moment the attack begins from whatever champions
 * and relics they left on it. The defender is never online, never consulted, and never
 * has to be — which is the only way a ladder works at EA scale (GAME_DESIGN §9.3).
 *
 * The fight itself is an ordinary engine battle in `arena` mode, played through the same
 * `/battles/:id/action` endpoint as everything else. What is different is only what it
 * costs (a token, not energy) and what it pays (rating and medals, not silver and relics),
 * and both of those are settled here rather than in the battle module.
 */

export type { ArenaContext };
export { assertUnlocked };

/** A champion as the arena shows it — enough to size up an opponent at a glance. */
async function teamMembers(
  db: Tx,
  ctx: ArenaContext,
  championIds: readonly string[],
  ownerId: string,
): Promise<ArenaTeamMember[]> {
  if (championIds.length === 0) return [];

  const snapshot = ctx.content.current();
  const champions = new Map(snapshot.bundle.champions.map((entry) => [entry.key, entry]));
  const scaling = championScalingFrom(snapshot.bundle.config);
  const gearContext = gear.gearContextFrom(snapshot.bundle);
  const masteryNodes = mastery.nodesFrom(ctx.content);
  const settings = arenaConfigFrom(snapshot.bundle.config);

  const owned = await roster.findOwned(db, ownerId, championIds);
  const equipped = await gear.gearByChampion(
    db,
    owned.map((member) => member.id),
  );
  const hallLevels = await hall.levelsFor(db, ownerId);

  return owned.flatMap((member) => {
    const def = champions.get(member.championKey);
    if (!def) return [];
    const base = deriveStats(def.baseStats, member, scaling);
    const learned = mastery.resolveMasteries(member.masteries ?? [], masteryNodes);
    const masteryStats = mastery.applyMasteryStats(base, learned);
    const assembled = gear.assembleChampion(base, equipped.get(member.id) ?? [], gearContext, {
      flat: masteryStats,
      setBonusAmplifyPct: learned.setBonusAmplifyPct,
    });
    // Power shown to an attacker includes the Hall, because it is part of what they will
    // actually be fighting — an opponent who looks weaker than they hit would be a lie.
    const hallBonus = hall.bonusFor(hallLevels, def.element, base, settings);
    const power =
      assembled.power +
      Math.round(((hallBonus.hp ?? 0) + (hallBonus.atk ?? 0) * 8 + (hallBonus.def ?? 0) * 6) / 10);

    return [
      {
        championKey: member.championKey,
        level: member.level,
        rank: member.rank,
        ascension: member.ascension,
        power,
      },
    ];
  });
}

// ── Matchmaking ─────────────────────────────────────────────────────────────

/**
 * Rolls a fresh set of opponents.
 *
 * Candidates are drawn from a rating band around the player and narrowed to accounts that
 * have actually set a defence team — an empty defence is not an opponent, it is a walkover
 * nobody learns anything from. The band widens if it comes up short, because a thin ladder
 * with nobody to fight is the failure this whole system exists to prevent.
 */
export async function rollOffers(
  tx: Tx,
  ctx: ArenaContext,
  playerId: string,
  rating: number,
): Promise<ArenaOfferRow[]> {
  const settings = config(ctx);
  const rng = createRng(randomSeed());

  const found = new Map<string, { playerId: string; rating: number }>();
  for (const spread of [150, 400, 1_000, 100_000]) {
    const rows = await tx
      .select({ playerId: arenaState.playerId, rating: arenaState.rating })
      .from(arenaState)
      .where(
        and(
          ne(arenaState.playerId, playerId),
          gte(arenaState.rating, Math.max(0, rating - spread)),
          lte(arenaState.rating, rating + spread),
          sql`jsonb_array_length(${arenaState.defenceTeam}) > 0`,
        ),
      )
      .limit(settings.offerCount * 6);

    for (const row of rows) found.set(row.playerId, row);
    if (found.size >= settings.offerCount) break;
  }

  // Shuffled rather than sorted: a list that always leads with the weakest opponent turns
  // the choice into a formality.
  const candidates = [...found.values()];
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swap = rng.int(0, index);
    [candidates[index], candidates[swap]] = [candidates[swap]!, candidates[index]!];
  }

  return candidates.slice(0, settings.offerCount).map((candidate) => ({
    offerId: randomUUID(),
    defenderId: candidate.playerId,
    rating: candidate.rating,
  }));
}

/**
 * Turns stored offers into what the hub shows, with each one's stakes worked out.
 *
 * A query per offer, and deliberately so: the loop is bounded by `arena.offerCount` — five
 * by default — rather than by how much data exists, so it cannot degrade as the ladder
 * grows. Five indexed reads sit far inside the 100 ms p95 the box is budgeted for
 * (ARCHITECTURE §9). If an operator ever raises the offer count into double figures, this
 * is the first thing to batch.
 */
async function describeOffers(
  tx: Tx,
  ctx: ArenaContext,
  rows: readonly ArenaOfferRow[],
  rating: number,
): Promise<ArenaOffer[]> {
  if (rows.length === 0) return [];
  const settings = config(ctx);

  const offers: ArenaOffer[] = [];
  for (const row of rows) {
    const [defender] = await tx
      .select({
        profileName: players.profileName,
        level: players.level,
        rating: arenaState.rating,
        defenceTeam: arenaState.defenceTeam,
      })
      .from(arenaState)
      .innerJoin(players, eq(players.id, arenaState.playerId))
      .where(eq(arenaState.playerId, row.defenderId));
    if (!defender) continue;

    const team = await teamMembers(tx, ctx, defender.defenceTeam, row.defenderId);
    if (team.length === 0) continue;

    const win = ratingChange(rating, defender.rating, true, settings);
    const loss = ratingChange(rating, defender.rating, false, settings);

    offers.push({
      offerId: row.offerId,
      profileName: String(defender.profileName),
      level: defender.level,
      rating: defender.rating,
      tier: tierForRating(defender.rating, settings.thresholds),
      power: team.reduce((total, member) => total + member.power, 0),
      team,
      ratingGain: win.attacker,
      ratingLoss: loss.attacker,
    });
  }
  return offers;
}

/**
 * Everything the hub renders, in one read.
 *
 * Offers are rolled here when there are none, so a player's first visit already has
 * somebody to fight rather than an empty list and a refresh button.
 */
export async function overview(ctx: ArenaContext, playerId: string): Promise<ArenaState> {
  const settings = config(ctx);
  const now = new Date();

  return ctx.db.transaction(async (tx) => {
    const [player] = await tx
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, playerId));
    if (!player) throw AppError.notFound('No such player.');
    assertUnlocked(player.level, ctx);

    let row = await ensureState(tx, playerId, ctx);
    if (row.offers.length === 0) {
      const offers = await rollOffers(tx, ctx, playerId, row.rating);
      await tx
        .update(arenaState)
        .set({ offers, offersRefreshedAt: now, updatedAt: now })
        .where(eq(arenaState.playerId, playerId));
      row = { ...row, offers };
    }

    const tokens = computeTokens(
      { value: row.tokens, updatedAt: row.tokensUpdatedAt },
      settings,
      now,
    );
    const tier = tierForRating(row.rating, settings.thresholds);

    return {
      rating: row.rating,
      tier,
      weeklyHigh: row.weeklyHigh,
      tokens: {
        value: tokens.value,
        cap: tokens.cap,
        regenSeconds: tokens.regenSeconds,
        nextTickAt: tokens.nextTickAt?.toISOString() ?? null,
        fullAt: tokens.fullAt?.toISOString() ?? null,
      },
      defence: row.defenceTeam,
      defenceTeam: await teamMembers(tx, ctx, row.defenceTeam, playerId),
      offers: await describeOffers(tx, ctx, row.offers, row.rating),
      // A pending chest shows what is waiting; otherwise, what this week is currently
      // worth — so the panel reads "your Gold chest is ready" or "you are on course for
      // Gold", never a number that turns out to mean something else on Monday.
      weeklyChest: chestView(row, ctx, now),
      medalsPerWin: medalsForWin(tier, settings),
      refreshCost: freeRefreshesLeft(row, ctx, now) > 0 ? 0 : settings.refreshCrystals,
    };
  });
}

/**
 * The weekly chest panel.
 *
 * `claimable` is whether a sealed chest is actually waiting — the Monday reset puts one
 * there — rather than whether the calendar has turned over. A player who has not fought
 * since the reset has nothing to collect, and a button that says otherwise is a lie the
 * server would have to refuse a moment later.
 */
function chestView(row: ArenaStateRow, ctx: ArenaContext, now: Date): ArenaState['weeklyChest'] {
  const settings = config(ctx);
  const pending = row.pendingChestWeek !== null && row.lastWeeklyClaim !== row.pendingChestWeek;
  return {
    tier: tierForRating(pending ? row.pendingChestHigh : row.weeklyHigh, settings.thresholds),
    claimable: pending,
    resetsAt: nextMonday(ctx, now).toISOString(),
  };
}

/** Free refreshes still available today. Rolls over with every other daily allowance. */
function freeRefreshesLeft(row: ArenaStateRow, ctx: ArenaContext, now: Date): number {
  const settings = config(ctx);
  const today = gameDayFrom(ctx.content.current().bundle.config, now).date;
  if (row.refreshDay !== today) return settings.freeRefreshesPerDay;
  return Math.max(0, settings.freeRefreshesPerDay - row.refreshesUsed);
}

/**
 * Rolls a new opponent list.
 *
 * The first few a day are free; after that it costs crystals, which is what stops a player
 * re-rolling until the ladder hands them a walkover.
 */
export async function refreshOffers(ctx: ArenaContext, playerId: string): Promise<ArenaState> {
  const now = new Date();
  const settings = config(ctx);
  const today = gameDayFrom(ctx.content.current().bundle.config, now).date;

  await ctx.db.transaction(async (tx) => {
    const [player] = await tx
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');
    assertUnlocked(player.level, ctx);

    const row = await ensureState(tx, playerId, ctx);
    const free = freeRefreshesLeft(row, ctx, now);
    if (free <= 0) {
      await rewards.spend(tx, playerId, { crystals: settings.refreshCrystals }, 'arena:refresh');
    }

    const offers = await rollOffers(tx, ctx, playerId, row.rating);
    await tx
      .update(arenaState)
      .set({
        offers,
        offersRefreshedAt: now,
        refreshDay: today,
        refreshesUsed: row.refreshDay === today ? row.refreshesUsed + 1 : 1,
        updatedAt: now,
      })
      .where(eq(arenaState.playerId, playerId));
  });

  return overview(ctx, playerId);
}

/**
 * Sets the team that defends while the player is away.
 *
 * Champions are checked for ownership but nothing else: a defence may overlap with an
 * attack team, because a player has one roster and forcing two disjoint teams would make
 * the Arena a roster-size gate rather than a team-building one.
 */
export async function setDefence(
  ctx: ArenaContext,
  playerId: string,
  team: readonly string[],
): Promise<ArenaState> {
  if (new Set(team).size !== team.length) {
    throw new AppError('VALIDATION', 'A champion cannot take two slots.');
  }

  await ctx.db.transaction(async (tx) => {
    const [player] = await tx
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, playerId));
    if (!player) throw AppError.notFound('No such player.');
    assertUnlocked(player.level, ctx);

    await ensureState(tx, playerId, ctx);
    const owned = await roster.findOwned(tx, playerId, team);
    if (owned.length !== team.length) {
      throw new AppError('VALIDATION', 'That team includes a champion you do not own.');
    }

    await tx
      .update(arenaState)
      .set({ defenceTeam: [...team], updatedAt: new Date() })
      .where(eq(arenaState.playerId, playerId));
  });

  return overview(ctx, playerId);
}

// ── Fighting ────────────────────────────────────────────────────────────────

export interface AttackOptions {
  playerId: string;
  offerId: string;
  team: string[];
}

/**
 * Opens an arena battle.
 *
 * Spends the token and creates the session in one transaction, then the player fights it
 * through the ordinary battle endpoints. The defence is assembled *now*, from the
 * defender's current champions and relics — a snapshot in the sense that matters: the
 * fight cannot change under the attacker's feet, and the defender never has to be present.
 */
export async function attack(
  ctx: ArenaContext,
  options: AttackOptions,
): Promise<battle.BattleView> {
  const snapshot = ctx.content.current();
  const settings = arenaConfigFrom(snapshot.bundle.config);
  const combat = combatConfigFrom(snapshot.bundle.config);
  const scaling = championScalingFrom(snapshot.bundle.config);
  const champions = new Map(snapshot.bundle.champions.map((entry) => [entry.key, entry]));

  if (new Set(options.team).size !== options.team.length) {
    throw new AppError('VALIDATION', 'A champion cannot take two slots.');
  }
  if (options.team.length === 0 || options.team.length > 4) {
    throw new AppError('VALIDATION', 'A team is one to four champions.');
  }

  return ctx.db.transaction(async (tx) => {
    const [player] = await tx
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, options.playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');
    assertUnlocked(player.level, ctx);

    const [existing] = await tx
      .select({ id: battleSessions.id })
      .from(battleSessions)
      .where(
        and(eq(battleSessions.playerId, options.playerId), eq(battleSessions.status, 'active')),
      );
    if (existing) {
      throw new AppError('ALREADY_EXISTS', 'You are already in a battle. Finish or retreat first.');
    }

    const row = await ensureState(tx, options.playerId, ctx);
    const offer = row.offers.find((entry) => entry.offerId === options.offerId);
    if (!offer) {
      // Offers are replaced wholesale on every refresh, so a stale id means the list moved
      // on rather than that anything went wrong.
      throw AppError.notFound('That opponent is no longer on offer.');
    }

    const now = new Date();
    const tokens = computeTokens(
      { value: row.tokens, updatedAt: row.tokensUpdatedAt },
      settings,
      now,
    );
    if (tokens.value < 1) {
      throw new AppError('COOLDOWN', 'No attack tokens left. They come back one an hour.');
    }

    // Both sides, each with its own Hall of Valor.
    const attackers = await roster.findOwned(tx, options.playerId, options.team);
    if (attackers.length !== options.team.length) {
      throw new AppError('VALIDATION', 'That team includes a champion you do not own.');
    }

    const [defenderRow] = await tx
      .select({ defenceTeam: arenaState.defenceTeam })
      .from(arenaState)
      .where(eq(arenaState.playerId, offer.defenderId));
    const defenders = await roster.findOwned(tx, offer.defenderId, defenderRow?.defenceTeam ?? []);
    if (defenders.length === 0) {
      throw new AppError('CONTENT_STALE', 'That opponent has taken their defence down.');
    }

    const battleCtx: battle.BattleContext = { db: ctx.db, content: ctx.content };
    const allyEntries = await battle.assembleEntries(
      tx,
      battleCtx,
      attackers,
      champions,
      scaling,
      options.playerId,
    );
    const enemyEntries = await battle.assembleEntries(
      tx,
      battleCtx,
      defenders,
      champions,
      scaling,
      offer.defenderId,
    );

    const seed = randomSeed();
    const rules = buildRules('arena', snapshot.bundle.skills, snapshot.bundle.statuses);
    const opened = createBattle(
      {
        seed,
        mode: 'arena',
        allies: buildTeam(allyEntries, scaling, 'arena'),
        // A defence team is a wave of champions rather than of enemies, which is exactly
        // what `buildTeam` produces — the engine has never cared which side a unit is on.
        waves: [buildTeam(enemyEntries, scaling, 'arena').map(intoEnemySlot)],
      },
      rules,
      combat,
    );

    await tx
      .update(arenaState)
      .set({ tokens: tokens.value - 1, tokensUpdatedAt: now, updatedAt: now })
      .where(eq(arenaState.playerId, options.playerId));

    const [session] = await tx
      .insert(battleSessions)
      .values({
        playerId: options.playerId,
        mode: 'arena',
        // In Arena the stage key is the opponent, which is what the schema has always said.
        stageKey: offer.defenderId,
        contentRev: snapshot.rev,
        teamIds: attackers.map((member) => member.id),
        seed,
        state: opened.state,
        events: opened.events,
        energySpent: 0,
      })
      .returning({ id: battleSessions.id });
    if (!session) throw AppError.internal('Could not start that battle.');

    return {
      id: session.id,
      mode: 'arena',
      stageKey: offer.defenderId,
      status: 'active',
      outcome: null,
      state: opened.state,
      events: opened.events,
      rewards: null,
    };
  });
}

// ── The ladder ──────────────────────────────────────────────────────────────

/** The top of the ladder, plus the reading player's own neighbourhood. */
export async function leaderboard(
  ctx: ArenaContext,
  playerId: string,
  topCount = 25,
): Promise<ArenaLeaderboard> {
  const settings = config(ctx);

  const rows = await ctx.db
    .select({
      playerId: arenaState.playerId,
      rating: arenaState.rating,
      profileName: players.profileName,
      level: players.level,
    })
    .from(arenaState)
    .innerJoin(players, eq(players.id, arenaState.playerId))
    .orderBy(desc(arenaState.rating), players.id)
    .limit(500);

  const ranked = rows.map((row, index) => ({
    position: index + 1,
    profileName: String(row.profileName),
    rating: row.rating,
    tier: tierForRating(row.rating, settings.thresholds),
    level: row.level,
    isSelf: row.playerId === playerId,
  }));

  const ownIndex = ranked.findIndex((entry) => entry.isSelf);
  const around =
    ownIndex >= topCount
      ? ranked.slice(Math.max(0, ownIndex - 2), Math.min(ranked.length, ownIndex + 3))
      : [];

  return {
    top: ranked.slice(0, topCount),
    around,
    ownPosition: ownIndex >= 0 ? ownIndex + 1 : null,
  };
}

// ── The weekly chest ────────────────────────────────────────────────────────

/**
 * Pays the chest the Monday reset sealed.
 *
 * Against the *best* rating held during that week rather than the rating now: falling out
 * of Gold on Sunday evening must not cost a week of Gold, or the last day of every week
 * becomes a day nobody dares to play.
 *
 * The claim is recorded against the sealed week's own key, not against today's, so the
 * chest can be collected at any point before the next reset and never twice.
 */
export async function claimWeekly(
  ctx: ArenaContext,
  playerId: string,
): Promise<{ tier: ArenaTier; rewards: Record<string, number> }> {
  const settings = config(ctx);
  const now = new Date();
  const chests = ctx.content.current().bundle.config['arena.weeklyChest'];

  return ctx.db.transaction(async (tx) => {
    const row = await ensureState(tx, playerId, ctx);
    const week = row.pendingChestWeek;
    if (!week) {
      throw new AppError('VALIDATION', 'No chest is waiting. The next one seals on Monday.');
    }
    if (row.lastWeeklyClaim === week) {
      throw new AppError('ALREADY_EXISTS', 'That chest has already been claimed.');
    }

    const tier = tierForRating(row.pendingChestHigh, settings.thresholds);
    const table = (chests ?? {}) as Record<string, Record<string, number>>;
    const bundle = table[bandOf(tier)] ?? {};

    await rewards.grant(tx, playerId, bundle, `arena:weekly:${bandOf(tier)}`);
    await tx
      .update(arenaState)
      .set({ lastWeeklyClaim: week, updatedAt: now })
      .where(eq(arenaState.playerId, playerId));

    return { tier, rewards: bundle };
  });
}

/** A unit built for the ally side, moved onto the enemy side of the field. */
function intoEnemySlot<T extends { ref: { side: string } }>(unit: T): T {
  return { ...unit, ref: { ...unit.ref, side: 'enemy' } };
}

function randomSeed(): number {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return bytes[0]! >>> 0;
}
