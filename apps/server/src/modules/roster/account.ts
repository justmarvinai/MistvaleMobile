import { and, eq, sql } from 'drizzle-orm';
import {
  DEFAULT_IMPRINT_BONUS,
  DEFAULT_IMPRINT_COPIES,
  DEFAULT_STANDING_BONUS,
  DEFAULT_STANDING_CHAMPIONS,
  NO_STAT_BONUS,
  accountStatBonusSchema,
  addBonuses,
  bonusAt,
  imprintCopiesFor,
  isImprintCopies,
  ladderLevel,
  nextLadderAt,
  type AccountStatBonus,
  type ImprintCopies,
  type ImprintState,
  type Rarity,
  type StandingState,
} from '@mistvale/shared';
import { championImprints, playerChampions } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';

/**
 * Imprint and Standing — what a *collection* is worth, beyond the four champions fielded.
 *
 * Both resolve to percentages of a champion's base stats and are added to the same block,
 * so they cannot compound with one another and the order they are applied in cannot matter
 * (COMBAT_SYSTEM §1, the same rule relic percentages follow).
 *
 * The read is deliberately one query each and is done **once per assembly**, not once per
 * champion: a roster screen with thirty-seven champions on it must not be thirty-seven
 * round trips, and the arena's snapshot builder assembles a whole team at a time.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

// ── Content ─────────────────────────────────────────────────────────────────

export interface AccountBonusConfig {
  imprintCopies: ImprintCopies;
  imprintBonus: readonly AccountStatBonus[];
  standingChampions: readonly number[];
  standingBonus: readonly AccountStatBonus[];
}

export const DEFAULT_ACCOUNT_CONFIG: AccountBonusConfig = Object.freeze({
  imprintCopies: DEFAULT_IMPRINT_COPIES,
  imprintBonus: DEFAULT_IMPRINT_BONUS,
  standingChampions: DEFAULT_STANDING_CHAMPIONS,
  standingBonus: DEFAULT_STANDING_BONUS,
});

/**
 * Reads the two ladders out of published config.
 *
 * Defensive in the same posture as the gear economy: a malformed row falls back to its
 * default rather than throwing, because one bad edit in Admin should cost the retune and
 * not every stat block in the game. A bonus entry is parsed through the shared schema, so
 * an operator who authors `spdPct` gets it dropped rather than applied — the guardrail in
 * `standing.ts` is enforced here rather than merely documented.
 */
export function accountConfigFrom(config: Readonly<Record<string, unknown>>): AccountBonusConfig {
  const curve = (
    key: string,
    fallback: readonly AccountStatBonus[],
  ): readonly AccountStatBonus[] => {
    const raw = config[key];
    if (!Array.isArray(raw) || raw.length === 0) return fallback;
    const parsed: AccountStatBonus[] = [];
    for (const entry of raw) {
      const result = accountStatBonusSchema.safeParse(entry);
      if (!result.success) return fallback;
      parsed.push(result.data);
    }
    return Object.freeze(parsed);
  };

  const ladder = (key: string, fallback: readonly number[]): readonly number[] => {
    const raw = config[key];
    return Array.isArray(raw) &&
      raw.length > 0 &&
      raw.every((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry > 0)
      ? Object.freeze([...(raw as number[])])
      : fallback;
  };

  const copies = config['progression.imprintCopies'];
  return Object.freeze({
    imprintCopies: isImprintCopies(copies) ? copies : DEFAULT_IMPRINT_COPIES,
    imprintBonus: curve('progression.imprintBonus', DEFAULT_IMPRINT_BONUS),
    standingChampions: ladder('progression.standingChampions', DEFAULT_STANDING_CHAMPIONS),
    standingBonus: curve('progression.standingBonus', DEFAULT_STANDING_BONUS),
  });
}

// ── Recording a copy ────────────────────────────────────────────────────────

/**
 * Counts one more copy of a champion.
 *
 * Called from `grantChampion`, the single funnel every champion enters the roster through —
 * a pull, a starter, a mission, an event, the mail and an operator grant all land there, so
 * there is one place to be right rather than six.
 *
 * The upsert is `on conflict do update` against the unique index rather than a
 * read-then-write, so a ×10 that pulls the same champion twice cannot lose one of them.
 */
export async function recordCopy(
  tx: Executor,
  playerId: string,
  championKey: string,
): Promise<void> {
  await tx
    .insert(championImprints)
    .values({ playerId, championKey, copies: 1 })
    .onConflictDoUpdate({
      target: [championImprints.playerId, championImprints.championKey],
      set: { copies: sql`${championImprints.copies} + 1`, updatedAt: new Date() },
    });
}

// ── Reading it back ─────────────────────────────────────────────────────────

/**
 * Everything the two ladders contribute, for one account, in two queries.
 *
 * Held rather than re-read per champion, because every screen that shows a stat block shows
 * several at once. `imprintFor` then answers per champion off the map.
 */
export interface AccountBonuses {
  config: AccountBonusConfig;
  /** Copies obtained, by champion key. */
  copies: ReadonlyMap<string, number>;
  standing: StandingState;
}

export const NO_ACCOUNT_BONUSES: AccountBonuses = Object.freeze({
  config: DEFAULT_ACCOUNT_CONFIG,
  copies: new Map<string, number>(),
  standing: Object.freeze({
    champions: 0,
    tier: 0,
    nextAt: DEFAULT_STANDING_CHAMPIONS[0] ?? null,
    bonus: NO_STAT_BONUS,
  }),
});

export async function accountBonusesFor(
  db: Executor,
  content: ContentCache,
  playerId: string,
): Promise<AccountBonuses> {
  const bundle = content.current().bundle;
  const config = accountConfigFrom(bundle.config);

  const imprintRows = await db
    .select({ championKey: championImprints.championKey, copies: championImprints.copies })
    .from(championImprints)
    .where(eq(championImprints.playerId, playerId));

  // Standing counts what is **held**, not what has been seen, so letting a champion go is a
  // real cost — which is what makes "is this Bracken Puck worth more as food" a decision.
  // Food is left out of both sides: it exists to be spent, and counting it would make the
  // correct play lower a number the screen is telling a player to raise.
  const foodKeys = new Set(
    bundle.champions.filter((champion) => champion.isFood).map((champion) => champion.key),
  );
  const heldRows = await db
    .selectDistinct({ championKey: playerChampions.championKey })
    .from(playerChampions)
    .where(eq(playerChampions.playerId, playerId));
  const held = heldRows.filter((row) => !foodKeys.has(row.championKey)).length;

  const tier = ladderLevel(held, config.standingChampions);
  return {
    config,
    copies: new Map(imprintRows.map((row) => [row.championKey, row.copies])),
    standing: {
      champions: held,
      tier,
      nextAt: nextLadderAt(held, config.standingChampions),
      bonus: bonusAt(tier, config.standingBonus),
    },
  };
}

/** One champion's imprint, off an already-read account. */
export function imprintFor(
  bonuses: AccountBonuses,
  championKey: string,
  rarity: Rarity,
): ImprintState {
  const copies = bonuses.copies.get(championKey) ?? 0;
  const ladder = imprintCopiesFor(bonuses.config.imprintCopies, rarity);
  const level = ladderLevel(copies, ladder);
  return {
    championKey,
    copies,
    level,
    nextAt: nextLadderAt(copies, ladder),
    bonus: bonusAt(level, bonuses.config.imprintBonus),
  };
}

/** What imprint and standing together add to one champion, as percentages of its base. */
export function accountBonusFor(
  bonuses: AccountBonuses,
  championKey: string,
  rarity: Rarity,
): AccountStatBonus {
  return addBonuses(imprintFor(bonuses, championKey, rarity).bonus, bonuses.standing.bonus);
}

/** How many copies of one champion an account has obtained. For the champion sheet. */
export async function copiesOf(
  db: Executor,
  playerId: string,
  championKey: string,
): Promise<number> {
  const [row] = await db
    .select({ copies: championImprints.copies })
    .from(championImprints)
    .where(
      and(eq(championImprints.playerId, playerId), eq(championImprints.championKey, championKey)),
    );
  return row?.copies ?? 0;
}
