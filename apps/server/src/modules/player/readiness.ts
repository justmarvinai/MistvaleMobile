import { eq, sql } from 'drizzle-orm';
import {
  UNLOCK_LEVELS,
  titanCounter,
  type Holdings,
  type Meter,
  type Readiness,
  NO_READINESS,
} from '@mistvale/shared';
import { arenaState, playerChampions, playerFollows } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { countersFor, remaining } from '../../lib/daily-counters';
import { arenaConfigFrom, computeTokens } from '../arena/rating';
import * as depths from '../depths/service';
import * as gear from '../gear/service';
import * as summon from '../summon/service';
import * as titan from '../titan/service';

/**
 * What is waiting, gathered onto the snapshot the shell already re-fetches.
 *
 * Three numbers a player wants before they decide anything, and each one lived somewhere
 * the Haven could not see it. Computed here rather than fetched by a card, for the same
 * reason the dock pips are: the server computes, the client displays, and nothing polls
 * (UI_UX §1.3). A card built from three lazy stores would show an empty Haven to anybody
 * who had not yet opened the Arena — which is everybody, on the screen they land on.
 *
 * **Everything is null or empty below its unlock**, so the card draws what a player has
 * rather than a row of zeroes about things they have never seen. And the cost is one
 * indexed row: the keys come off the player row the request already holds, and the springs
 * are pure arithmetic over content and the clock.
 */
export async function readinessFor(
  db: Database,
  content: ContentCache,
  player: {
    id: string;
    level: number;
    createdAt: Date;
    dailyCounters: Record<string, number>;
    dailyCountersDay: string | null;
  },
  now: Date,
): Promise<Readiness> {
  const bundle = content.current().bundle;
  const readiness: Readiness = { ...NO_READINESS };

  if (player.level >= UNLOCK_LEVELS.arena) {
    const [standing] = await db
      .select({ tokens: arenaState.tokens, updatedAt: arenaState.tokensUpdatedAt })
      .from(arenaState)
      .where(eq(arenaState.playerId, player.id));
    const config = arenaConfigFrom(bundle.config);
    // An account that has never fought reads as a full bar rather than as nothing: the
    // tokens exist from the moment the Arena opens, and the row is written on first use.
    const tokens = standing
      ? computeTokens({ value: standing.tokens, updatedAt: standing.updatedAt }, config, now)
      : { value: config.tokenCap, cap: config.tokenCap };
    readiness.arenaTokens = { value: tokens.value, cap: tokens.cap };
  }

  if (player.level >= UNLOCK_LEVELS.titan) {
    const counters = countersFor(player, bundle.config, now);
    // Across every published Titan, because the card is about *whether to go down* rather
    // than about which keep — and there is one today.
    let left = 0;
    let cap = 0;
    for (const keep of titan.keeps(content)) {
      if (player.level < keep.dungeon.unlockLevel) continue;
      left += remaining(counters, titanCounter(keep.dungeon.key), keep.rules.keysPerDay);
      cap += keep.rules.keysPerDay;
    }
    if (cap > 0) readiness.titanKeys = { value: left, cap };
  }

  if (player.level >= UNLOCK_LEVELS.springs) {
    const context = depths.contextFor(player, bundle.config, now);
    readiness.springsInGrace = context.rotation.inGrace;
    readiness.openSprings = bundle.dungeons
      .filter(
        (dungeon) =>
          dungeon.kind === 'springs' &&
          player.level >= dungeon.unlockLevel &&
          depths.openToday(dungeon, context.rotation),
      )
      .map((dungeon) => dungeon.key);
  }

  readiness.holdings = await holdingsFor(db, content, player);

  return readiness;
}

/**
 * What the account holds, for the hubs' cards (C45): the roster's size, the vault's fill,
 * how much of the Chronicle has been met and how many wardens are kept. Four counts over
 * indexed rows, and the Chronicle's is the same read the Chronicle screen makes — a second
 * definition of "met" here would be the one that drifted.
 *
 * Null below each feature's unlock, as the rest of readiness is: a shrouded card says
 * when it opens, not how empty it is.
 */
async function holdingsFor(
  db: Database,
  content: ContentCache,
  player: { id: string; level: number },
): Promise<Holdings> {
  const bundle = content.current().bundle;

  const [roster] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(playerChampions)
    .where(eq(playerChampions.playerId, player.id));

  const vault = await gear.vaultState(db, player.id, gear.gearContextFrom(bundle));

  let chronicle: Meter | null = null;
  if (player.level >= UNLOCK_LEVELS.chronicle) {
    const book = await summon.chronicle(db, player.id, content);
    const collectable = new Set(
      bundle.champions.filter((champion) => !champion.isFood).map((champion) => champion.key),
    );
    chronicle = {
      value: book.entries.filter((entry) => entry.seen && collectable.has(entry.championKey))
        .length,
      cap: book.total,
    };
  }

  let wardens: number | null = null;
  if (player.level >= UNLOCK_LEVELS.wardens) {
    const [kept] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(playerFollows)
      .where(eq(playerFollows.followerId, player.id));
    wardens = kept?.count ?? 0;
  }

  return {
    champions: roster?.count ?? 0,
    vault: { value: vault.used, cap: vault.capacity },
    chronicle,
    wardens,
  };
}
