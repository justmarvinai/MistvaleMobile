import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { createRng, type Rng } from '@mistvale/engine';
import {
  ARENA_BANDS,
  DEFAULT_BOT_BANDS,
  DEFAULT_BOT_EPITHETS,
  DEFAULT_BOT_GIVEN_NAMES,
  GEAR_SLOTS,
  arenaBotBandSchema,
  bandOf,
  tierForRating,
  type ArenaBand,
  type ArenaBotBand,
  type ArenaBotCensus,
  type ChampionDef,
} from '@mistvale/shared';
import {
  accounts,
  arenaState,
  gearInstances,
  playerChampions,
  players,
} from '../../db/schema/index';
import type { Database } from '../../db/client';
import { hashPassword } from '../../lib/password';
import { AppError } from '../../lib/errors';
import * as gear from '../gear/service';
import * as roster from '../roster/service';
import { config, type ArenaContext, type Executor } from './ladder';

/**
 * The bots that keep the ladder from being empty.
 *
 * At EA there may be four real players, and an Arena whose offer list is empty is not a
 * feature that needs more players — it is a feature nobody will ever come back to. So the
 * ladder is seeded: sixty accounts spread across the four bands, holding real champions in
 * real relics, defending with teams the engine fights exactly as it fights a person's.
 *
 * Three rules shape everything here:
 *
 *  - **A bot is a player.** `players.is_bot` is a flag, not a separate table. Matchmaking,
 *    the leaderboard, the battle engine and the settle path need no special case, which is
 *    the only way this stays maintainable (docs/DATA_MODEL.md).
 *  - **A bot is economically inert.** It holds no silver, no crystals and no medals, and
 *    nothing it does writes to `economy_log`. Nothing here calls `RewardService`, and that
 *    is deliberate rather than incidental — a bot in the economy reports would make every
 *    faucet/sink number a lie (ECONOMY_BALANCE §12).
 *  - **A bot is synthesised, never authored.** Its champions, relics and rating come from
 *    live content and a band recipe in `game_config`, so sixty opponents cost zero rows of
 *    hand-maintained content and re-tune themselves the moment the game does.
 */

export interface BotConfig {
  bands: Readonly<Record<ArenaBand, ArenaBotBand>>;
  givenNames: readonly string[];
  epithets: readonly string[];
}

/** Reads the bot recipes out of a published config map, with the documented defaults. */
export function botConfigFrom(config: Readonly<Record<string, unknown>>): BotConfig {
  const bands = { ...DEFAULT_BOT_BANDS } as Record<ArenaBand, ArenaBotBand>;
  const authored = config['arena.botBands'];
  if (authored && typeof authored === 'object' && !Array.isArray(authored)) {
    for (const band of ARENA_BANDS) {
      const parsed = arenaBotBandSchema.safeParse((authored as Record<string, unknown>)[band]);
      // Merged over the defaults, and a band that fails to parse keeps its default rather
      // than emptying: a typo in one recipe must not delete a quarter of the ladder.
      if (parsed.success) bands[band] = parsed.data;
    }
  }

  return {
    bands,
    givenNames: names(config, 'arena.botGivenNames', DEFAULT_BOT_GIVEN_NAMES),
    epithets: names(config, 'arena.botEpithets', DEFAULT_BOT_EPITHETS),
  };
}

function names(
  config: Readonly<Record<string, unknown>>,
  key: string,
  fallback: readonly string[],
): readonly string[] {
  const value = config[key];
  if (!Array.isArray(value)) return fallback;
  const usable = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
  );
  return usable.length > 0 ? usable.map((entry) => entry.trim()) : fallback;
}

// ── Naming ──────────────────────────────────────────────────────────────────

/**
 * A name nobody is using yet.
 *
 * Two pools multiplied rather than one list, so the ladder can be refreshed indefinitely
 * without repeating itself. `taken` is the set of names already spoken for — profile names
 * are unique across the whole game, and a bot must never collide with a person's.
 */
export function pickName(rng: Rng, pools: BotConfig, taken: ReadonlySet<string>): string | null {
  const combinations = pools.givenNames.length * pools.epithets.length;
  // Bounded rather than exhaustive: with a pool this large the odds of missing a free name
  // in four times the count of attempts are negligible, and an unbounded loop against a
  // nearly-full pool would be a hang rather than a failure.
  for (let attempt = 0; attempt < Math.min(4 * combinations, 4_000); attempt += 1) {
    const name = `${rng.pick(pools.givenNames)} ${rng.pick(pools.epithets)}`;
    if (name.length <= 16 && !taken.has(name.toLowerCase())) return name;
  }
  return null;
}

/** Every profile name in use, lower-cased — the uniqueness index is case-insensitive. */
async function takenNames(db: Executor): Promise<Set<string>> {
  const rows = await db.select({ profileName: players.profileName }).from(players);
  return new Set(rows.map((row) => row.profileName.toLowerCase()));
}

// ── Building one ────────────────────────────────────────────────────────────

/**
 * The champions a bot may field.
 *
 * Summonable non-food only: an exclusive handed out by a mission has not been earned by a
 * bot, and seeing one on a defence team would tell a player it was never really exclusive.
 */
function fieldable(ctx: ArenaContext): ChampionDef[] {
  return ctx.content
    .current()
    .bundle.champions.filter((champion) => !champion.isFood && champion.summonable);
}

/**
 * Builds a bot's roster and stands it on the defence.
 *
 * Wipes whatever was there first, because this runs nightly as well as at seeding: a
 * refresh replaces the team rather than adding to it, or a bot would accumulate a roster
 * of hundreds over a season.
 */
async function buildRoster(
  tx: Executor,
  ctx: ArenaContext,
  playerId: string,
  band: ArenaBotBand,
  rng: Rng,
): Promise<string[]> {
  await tx.delete(gearInstances).where(eq(gearInstances.playerId, playerId));
  await tx.delete(playerChampions).where(eq(playerChampions.playerId, playerId));

  const pool = fieldable(ctx);
  if (pool.length === 0) {
    throw new AppError('CONTENT_STALE', 'No champions are published for the arena to build from.');
  }
  const gearContext = gear.gearContextFrom(ctx.content.current().bundle);
  const setKeys = [...gearContext.tables.sets.keys()];

  // Drawn without replacement, so a bot never fields the same champion twice — the same
  // rule a player's team obeys.
  const shuffled = [...pool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = rng.int(0, index);
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }

  const team: string[] = [];
  const kit: gear.GearGrant[] = [];
  for (const champion of shuffled.slice(0, Math.min(band.teamSize, shuffled.length))) {
    const member = await roster.grantChampion(tx, playerId, champion.key, {
      level: rng.int(band.championLevelMin, band.championLevelMax),
      rank: band.championRank,
      ascension: band.ascension,
    });
    team.push(member.id);

    if (setKeys.length === 0) continue;
    // Two sets rather than nine: the first four slots carry one set so its bonus actually
    // lands, which is how a person gears a champion and therefore how a bot must look.
    const primary = rng.pick(setKeys);
    const secondary = rng.pick(setKeys);
    for (const [index, slot] of GEAR_SLOTS.slice(0, band.gearSlots).entries()) {
      kit.push({
        setKey: index < 4 ? primary : secondary,
        slot,
        rank: band.gearRank,
        rarity: band.gearRarity,
        level: band.gearLevel,
        equippedChampionId: member.id,
        source: 'arena:bot',
      });
    }
  }

  // One statement for the whole kit: nine slots across four champions is thirty-six
  // relics, and sixty bots a night is why this is a batch rather than a loop.
  await gear.createGearBatch(tx, playerId, kit, rng, gearContext);

  return team;
}

/** Spreads `count` ratings evenly across a band, so no rung of the ladder is empty. */
function ratingsFor(band: ArenaBotBand, rng: Rng): number[] {
  const low = Math.min(band.ratingMin, band.ratingMax);
  const high = Math.max(band.ratingMin, band.ratingMax);
  const span = high - low;

  return Array.from({ length: band.count }, (_, index) => {
    const even = low + Math.round((span * (index + 0.5)) / Math.max(1, band.count));
    // A little scatter, so a re-seeded ladder is not visibly a arithmetic sequence.
    const jitter = span === 0 ? 0 : rng.int(-Math.round(span / 40), Math.round(span / 40));
    return Math.min(high, Math.max(low, even + jitter));
  });
}

/**
 * A password hash no login can ever satisfy.
 *
 * Thirty-two bytes of CSPRNG, hashed once and the plaintext discarded — so a bot account
 * verifies exactly like a real one and there is no plaintext anywhere, including here.
 * Hashed once per seeding run rather than once per bot because argon2id is deliberately
 * fifty milliseconds and sixty of those is three seconds of a single-core box spent
 * protecting a secret nobody has.
 */
export async function unusablePasswordHash(): Promise<string> {
  return hashPassword(randomBytes(32).toString('base64'));
}

/**
 * Creates one bot, whole: account, player, roster, relics and a standing defence.
 *
 * The account exists because `players.account_id` is not nullable, and making it nullable
 * to save sixty rows would put a null check on every join in the game.
 */
export async function createBot(
  tx: Executor,
  ctx: ArenaContext,
  band: ArenaBand,
  rating: number,
  rng: Rng,
  taken: Set<string>,
  passwordHash: string,
): Promise<string> {
  const settings = botConfigFrom(ctx.content.current().bundle.config);
  const recipe = settings.bands[band];

  const profileName = pickName(rng, settings, taken);
  if (!profileName) {
    throw new AppError('VALIDATION', 'The bot name pools are exhausted; add more names.');
  }
  taken.add(profileName.toLowerCase());

  const [account] = await tx
    .insert(accounts)
    .values({
      accountName: `bot_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
      passwordHash,
    })
    .returning({ id: accounts.id });
  if (!account) throw AppError.internal('Could not create a bot account.');

  const [player] = await tx
    .insert(players)
    .values({
      accountId: account.id,
      profileName,
      level: rng.int(recipe.levelMin, recipe.levelMax),
      isBot: true,
      // Economically inert: no wallet, no energy, nothing that could appear in a report.
      energy: 0,
      silver: 0,
      crystals: 0,
      valorMedals: 0,
    })
    .returning({ id: players.id });
  if (!player) throw AppError.internal('Could not create a bot player.');

  const team = await buildRoster(tx, ctx, player.id, recipe, rng);

  await tx.insert(arenaState).values({
    playerId: player.id,
    rating,
    tier: tierForRating(rating, config(ctx).thresholds),
    weeklyHigh: rating,
    tokens: 0,
    defenceTeam: team,
  });

  return player.id;
}

// ── The ladder ──────────────────────────────────────────────────────────────

export interface LadderReport {
  created: number;
  refreshed: number;
  removed: number;
  byBand: Record<ArenaBand, number>;
}

/**
 * Brings the ladder up to strength.
 *
 * Idempotent: it counts what each band holds and creates only the difference, so running
 * it twice is running it once. That matters because it is called both from the seed script
 * and from the nightly job, and neither should have to know whether the other has run.
 *
 * A band that is *over* strength sheds from its top rather than at random: an operator who
 * lowers a count keeps the entry-level opponents, because the bottom of a band is where a
 * new account arrives and the top is where it has already found somebody to fight.
 */
export async function seedLadder(ctx: ArenaContext): Promise<LadderReport> {
  const settings = botConfigFrom(ctx.content.current().bundle.config);
  const report: LadderReport = {
    created: 0,
    refreshed: 0,
    removed: 0,
    byBand: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
  };

  // Claimed as we go, so overlapping rating windows count a bot for the lower band only.
  const claimed = new Set<string>();

  for (const band of ARENA_BANDS) {
    const recipe = settings.bands[band];
    const held = (await botsIn(ctx.db, recipe)).filter((row) => !claimed.has(row.playerId));
    for (const row of held) claimed.add(row.playerId);
    report.byBand[band] = held.length;

    if (held.length > recipe.count) {
      const surplus = held.slice(recipe.count).map((row) => row.playerId);
      await removeBots(ctx, surplus);
      report.removed += surplus.length;
      report.byBand[band] = recipe.count;
      continue;
    }

    const wanted = ratingsFor(recipe, createRng(randomSeed())).slice(held.length);
    if (wanted.length === 0) continue;

    const passwordHash = await unusablePasswordHash();
    for (const rating of wanted) {
      // One transaction per bot rather than one for the batch: creating sixty bots builds
      // sixty rosters and hundreds of relics, and holding that open would lock the players
      // table for the whole run on a box with one core.
      await ctx.db.transaction(async (tx) => {
        const taken = await takenNames(tx);
        await createBot(tx, ctx, band, rating, createRng(randomSeed()), taken, passwordHash);
      });
      report.created += 1;
      report.byBand[band] += 1;
    }
  }

  return report;
}

/**
 * The nightly refresh.
 *
 * Every bot's roster and relics are rebuilt from current content, and its rating drifts by
 * up to five per cent inside its band. Both halves matter: a ladder whose teams never
 * change becomes a solved puzzle by the second week, and a ladder whose ratings never move
 * looks like what it is. Tops the ladder back up afterwards, so a band that lost bots to a
 * content change refills the same night.
 */
export async function refreshLadder(ctx: ArenaContext): Promise<LadderReport> {
  const settings = botConfigFrom(ctx.content.current().bundle.config);
  const thresholds = config(ctx).thresholds;
  const seen = new Set<string>();
  let refreshed = 0;

  for (const band of ARENA_BANDS) {
    const recipe = settings.bands[band];
    for (const bot of await botsIn(ctx.db, recipe)) {
      if (seen.has(bot.playerId)) continue;
      seen.add(bot.playerId);
      const rng = createRng(randomSeed());
      const low = Math.min(recipe.ratingMin, recipe.ratingMax);
      const high = Math.max(recipe.ratingMin, recipe.ratingMax);
      const drift = Math.round((bot.rating * rng.int(-5, 5)) / 100);
      const rating = Math.min(high, Math.max(low, bot.rating + drift));

      await ctx.db.transaction(async (tx) => {
        const team = await buildRoster(tx, ctx, bot.playerId, recipe, rng);
        await tx
          .update(arenaState)
          .set({
            rating,
            tier: tierForRating(rating, thresholds),
            weeklyHigh: Math.max(bot.weeklyHigh, rating),
            defenceTeam: team,
            updatedAt: new Date(),
          })
          .where(eq(arenaState.playerId, bot.playerId));
      });
      refreshed += 1;
    }
  }

  const topped = await seedLadder(ctx);
  return { ...topped, refreshed };
}

/**
 * Moves bots out of the top ten.
 *
 * The owner's fairness rule (GAME_DESIGN §13): the visible top of the ladder belongs to
 * people. Run at the weekly reset, before the chests are worked out, so what a player sees
 * on Monday morning is the standing they were actually paid against.
 *
 * A displaced bot is set one point below the lowest human in the top ten rather than
 * dropped to its band floor — it keeps its place in the queue, it simply stops holding a
 * chair somebody real should be sitting in.
 */
export async function yieldTopTen(ctx: ArenaContext, topCount = 10): Promise<number> {
  const rows = await ctx.db
    .select({
      playerId: arenaState.playerId,
      rating: arenaState.rating,
      isBot: players.isBot,
    })
    .from(arenaState)
    .innerJoin(players, eq(players.id, arenaState.playerId))
    .orderBy(desc(arenaState.rating), asc(players.id))
    .limit(topCount);

  const bots = rows.filter((row) => row.isBot);
  const humans = rows.filter((row) => !row.isBot);
  // Nothing to yield to: a top ten with no people in it is the ladder working as intended
  // at EA, and pushing every bot down would empty the board rather than fill it.
  if (bots.length === 0 || humans.length === 0) return 0;

  const floor = Math.min(...humans.map((row) => row.rating));
  const thresholds = config(ctx).thresholds;

  let moved = 0;
  for (const [index, bot] of bots.entries()) {
    const rating = Math.max(0, floor - 1 - index);
    if (rating >= bot.rating) continue;
    await ctx.db
      .update(arenaState)
      .set({ rating, tier: tierForRating(rating, thresholds), updatedAt: new Date() })
      .where(eq(arenaState.playerId, bot.playerId));
    moved += 1;
  }
  return moved;
}

/** What the Admin bot manager reports: what each band should hold, and what it does. */
export async function census(ctx: ArenaContext): Promise<ArenaBotCensus> {
  const settings = botConfigFrom(ctx.content.current().bundle.config);

  const rows = await ctx.db
    .select({ rating: arenaState.rating, updatedAt: arenaState.updatedAt })
    .from(arenaState)
    .innerJoin(players, eq(players.id, arenaState.playerId))
    .where(eq(players.isBot, true));

  const thresholds = config(ctx).thresholds;
  const bands = ARENA_BANDS.map((band) => {
    const recipe = settings.bands[band];
    return {
      band,
      wanted: recipe.count,
      // Counted by where each bot actually stands rather than by the window it was made
      // in, so a band that has drifted reads as it looks on the leaderboard.
      present: rows.filter((row) => bandOf(tierForRating(row.rating, thresholds)) === band).length,
      ratingMin: recipe.ratingMin,
      ratingMax: recipe.ratingMax,
    };
  });

  const refreshedAt = rows.reduce<Date | null>(
    (latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest),
    null,
  );

  return { bands, total: rows.length, refreshedAt: refreshedAt?.toISOString() ?? null };
}

/**
 * Deletes bots outright, accounts and all.
 *
 * A retired bot is removed rather than flagged, because everything it owned — champions,
 * relics, its arena record, the fights it was in — cascades from the account row, and a
 * tombstone would only be a row every future query has to remember to exclude.
 */
export async function removeBots(ctx: ArenaContext, playerIds: readonly string[]): Promise<number> {
  if (playerIds.length === 0) return 0;

  return ctx.db.transaction(async (tx) => {
    const rows = await tx
      .select({ accountId: players.accountId })
      .from(players)
      .where(and(inArray(players.id, [...playerIds]), eq(players.isBot, true)));
    if (rows.length === 0) return 0;

    await tx.delete(accounts).where(
      inArray(
        accounts.id,
        rows.map((row) => row.accountId),
      ),
    );
    return rows.length;
  });
}

/**
 * The bots currently sitting in a band's rating window, weakest first.
 *
 * A band *is* its rating window — there is no stored band on a bot, because a rating is
 * the only thing that decides where anybody stands and a second copy of it could disagree.
 * Overlapping windows would therefore count a bot twice; `seedLadder` walks the bands in
 * ladder order and claims each bot for the first window that contains it.
 */
async function botsIn(
  db: Database,
  recipe: ArenaBotBand,
): Promise<{ playerId: string; rating: number; weeklyHigh: number }[]> {
  const low = Math.min(recipe.ratingMin, recipe.ratingMax);
  const high = Math.max(recipe.ratingMin, recipe.ratingMax);

  return db
    .select({
      playerId: arenaState.playerId,
      rating: arenaState.rating,
      weeklyHigh: arenaState.weeklyHigh,
    })
    .from(arenaState)
    .innerJoin(players, eq(players.id, arenaState.playerId))
    .where(and(eq(players.isBot, true), gte(arenaState.rating, low), lte(arenaState.rating, high)))
    .orderBy(asc(arenaState.rating), asc(arenaState.playerId));
}

function randomSeed(): number {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return bytes[0]! >>> 0;
}
