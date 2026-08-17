import { and, count, desc, eq, gt, inArray } from 'drizzle-orm';
import { championScalingFrom, deriveStats } from '@mistvale/engine';
import {
  DIFFICULTIES,
  tierForRating,
  type Difficulty,
  type PublicProfile,
  type ShowcaseChampion,
} from '@mistvale/shared';
import { arenaState, playerChampions, players, stageProgress } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';

import * as gear from '../gear/service';
import * as mastery from '../mastery/service';
import { arenaConfigFrom } from '../arena/rating';

/**
 * The public profile card.
 *
 * One player looking at another: who they are, how far they have come, and the champions
 * they chose to be known by. What is *not* here is the point of the module — no wallet, no
 * account name, no inventory, and nothing that says whether the card belongs to a bot.
 *
 * The card is assembled from the same readers the owner's own screens use rather than from
 * a denormalised summary, because a summary would be one more thing to keep true. It is
 * read rarely (a click from the ladder) and never in a hot path, so honest is worth more
 * here than fast.
 */

export interface ProfileContext {
  db: Database;
  content: ContentCache;
}

/** How many champions a card may show. */
export const SHOWCASE_MAX = 4;

/**
 * The card, as anybody may see it.
 *
 * Every account has one, including a bot's: refusing would be a marker, and the owner's
 * decision is that the ladder carries none (GAME_DESIGN §9.3).
 */
export async function card(ctx: ProfileContext, playerId: string): Promise<PublicProfile> {
  const [player] = await ctx.db
    .select({
      id: players.id,
      profileName: players.profileName,
      title: players.title,
      level: players.level,
      showcase: players.showcase,
      createdAt: players.createdAt,
    })
    .from(players)
    .where(eq(players.id, playerId));
  if (!player) throw AppError.notFound('No such warden.');

  const [standing] = await ctx.db
    .select({ rating: arenaState.rating })
    .from(arenaState)
    .where(eq(arenaState.playerId, playerId));

  const [owned, progress, showcase] = await Promise.all([
    ctx.db
      .select({ championKey: playerChampions.championKey })
      .from(playerChampions)
      .where(eq(playerChampions.playerId, playerId)),
    ctx.db
      .select({
        stageKey: stageProgress.stageKey,
        stars: stageProgress.stars,
        clears: stageProgress.clears,
      })
      .from(stageProgress)
      .where(and(eq(stageProgress.playerId, playerId), eq(stageProgress.mode, 'campaign'))),
    showcaseFor(ctx, playerId, player.showcase),
  ]);

  const bundle = ctx.content.current().bundle;
  // Food units are excluded from both halves of the collection count: "12 of 37" should
  // mean champions somebody would field, not Broodlings fed to one.
  const collectable = new Set(bundle.champions.filter((def) => !def.isFood).map((def) => def.key));
  const championsOwned = new Set(
    owned.map((row) => row.championKey).filter((key) => collectable.has(key)),
  ).size;

  return {
    playerId: player.id,
    profileName: String(player.profileName),
    title: player.title,
    level: player.level,
    arena: standing
      ? {
          rating: standing.rating,
          tier: tierForRating(standing.rating, arenaConfigFrom(bundle.config).thresholds),
          position: await ladderPosition(ctx, standing.rating),
        }
      : null,
    championsOwned,
    championsTotal: collectable.size,
    furthestStage: furthestStage(ctx, progress),
    stars: progress.reduce((total, row) => total + row.stars, 0),
    showcase,
    joinedAt: player.createdAt.toISOString(),
  };
}

/**
 * Where a rating sits on the live ladder.
 *
 * Counted rather than ranked: "how many are above me" is one index scan, where a window
 * function over the whole table would be a sort nobody asked for.
 */
async function ladderPosition(ctx: ProfileContext, rating: number): Promise<number | null> {
  const [above] = await ctx.db
    .select({ ahead: count() })
    .from(arenaState)
    .where(gt(arenaState.rating, rating));
  return (above?.ahead ?? 0) + 1;
}

/** "7-4 Hard" — the furthest a player has actually cleared, phrased the way they say it. */
function furthestStage(
  ctx: ProfileContext,
  progress: { stageKey: string; clears: number }[],
): string | null {
  const bundle = ctx.content.current().bundle;
  const stages = new Map(bundle.stages.map((def) => [def.key, def]));
  const chapters = new Map(bundle.campaignChapters.map((def) => [def.key, def]));
  const rank = (difficulty: Difficulty): number => DIFFICULTIES.indexOf(difficulty);

  let best: { chapter: number; number: number; difficulty: Difficulty } | null = null;
  for (const row of progress) {
    if (row.clears <= 0) continue;
    const stage = stages.get(row.stageKey);
    if (!stage) continue;
    const chapter = chapters.get(stage.parentKey);
    if (!chapter) continue;

    const here = { chapter: chapter.number, number: stage.number, difficulty: stage.difficulty };
    // Difficulty outranks depth: Brutal 1-1 is further than Normal 12-7, because it is the
    // wall that gates everything after it.
    if (
      !best ||
      rank(here.difficulty) > rank(best.difficulty) ||
      (rank(here.difficulty) === rank(best.difficulty) &&
        (here.chapter > best.chapter ||
          (here.chapter === best.chapter && here.number > best.number)))
    ) {
      best = here;
    }
  }

  if (!best) return null;
  const label = best.difficulty === 'normal' ? '' : ` ${title(best.difficulty)}`;
  return `${best.chapter}-${best.number}${label}`;
}

function title(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/**
 * The four on the card.
 *
 * A player who has never chosen gets their strongest instead — a blank card teaches
 * nothing, and "these are mine" is worth more than an empty row with a hint under it.
 * A chosen champion that has since been released simply drops out rather than leaving a
 * hole, which is also what stops a stale id from ever reaching the client.
 */
async function showcaseFor(
  ctx: ProfileContext,
  playerId: string,
  chosen: readonly string[],
): Promise<ShowcaseChampion[]> {
  const rows =
    chosen.length > 0
      ? await ctx.db
          .select()
          .from(playerChampions)
          .where(
            and(eq(playerChampions.playerId, playerId), inArray(playerChampions.id, [...chosen])),
          )
      : await ctx.db
          .select()
          .from(playerChampions)
          .where(eq(playerChampions.playerId, playerId))
          .orderBy(desc(playerChampions.rank), desc(playerChampions.level))
          .limit(SHOWCASE_MAX);

  const snapshot = ctx.content.current();
  const champions = new Map(snapshot.bundle.champions.map((def) => [def.key, def]));
  const scaling = championScalingFrom(snapshot.bundle.config);
  const gearContext = gear.gearContextFrom(snapshot.bundle);
  const nodes = mastery.nodesFrom(ctx.content);
  const equipped = await gear.gearByChampion(
    ctx.db,
    rows.map((row) => row.id),
  );

  const built = rows.flatMap<ShowcaseChampion>((row) => {
    const def = champions.get(row.championKey);
    // Food is never showcased: it is a resource, and a card led by a Broodling would be
    // the game misunderstanding its own player.
    if (!def || def.isFood) return [];

    const base = deriveStats(def.baseStats, row, scaling);
    const learned = mastery.resolveMasteries(row.masteries ?? [], nodes);
    const assembled = gear.assembleChampion(base, equipped.get(row.id) ?? [], gearContext, {
      flat: mastery.applyMasteryStats(base, learned),
      setBonusAmplifyPct: learned.setBonusAmplifyPct,
    });

    return [
      {
        id: row.id,
        championKey: row.championKey,
        name: def.name,
        rarity: def.rarity,
        element: def.element,
        role: def.role,
        level: row.level,
        rank: row.rank,
        ascension: row.ascension,
        power: assembled.power,
        assetKey: def.assetKey,
      },
    ];
  });

  // The owner's order is the order they chose; a fallback is strongest first.
  if (chosen.length === 0) return built.sort((a, b) => b.power - a.power);
  const order = new Map([...chosen].map((id, index) => [id, index]));
  return built.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Sets the champions the card shows. An empty list hands the choice back to the game. */
export async function setShowcase(
  ctx: ProfileContext,
  playerId: string,
  championIds: readonly string[],
): Promise<PublicProfile> {
  const unique = [...new Set(championIds)];
  if (unique.length !== championIds.length) {
    throw new AppError('VALIDATION', 'A champion can only be shown once.');
  }

  if (unique.length > 0) {
    const owned = await ctx.db
      .select({ id: playerChampions.id })
      .from(playerChampions)
      .where(and(eq(playerChampions.playerId, playerId), inArray(playerChampions.id, unique)));
    if (owned.length !== unique.length) {
      throw new AppError('VALIDATION', 'You can only show champions you own.');
    }
  }

  await ctx.db
    .update(players)
    .set({ showcase: unique, updatedAt: new Date() })
    .where(eq(players.id, playerId));

  return card(ctx, playerId);
}
