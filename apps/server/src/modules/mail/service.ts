import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import {
  rewardsAreEmpty,
  type MailMessage,
  type MailView,
  type NewsItem,
  type NewsView,
} from '@mistvale/shared';
import { mailbox } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import * as rewards from '../rewards/service';

/**
 * The mailbox, and the news feed beside it.
 *
 * Two features in one module because they are the same shape from the player's side —
 * something the operator wrote, shown when it is due — and because keeping them together
 * is what stops the second one growing its own half-copy of the first one's expiry
 * arithmetic. They share nothing else: mail is per-player rows with a payout, news is
 * broadcast content with a window.
 *
 * **Expiry is derived, never swept.** An expired message is one whose `expires_at` has
 * passed, which is a `where` clause rather than a job — so a server that was down for a
 * week comes back with exactly the right inbox. Actually deleting the rows is the daily
 * prune's business (P8i) and is only about disk, not about correctness.
 */

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface MailContext {
  db: Database;
  content: ContentCache;
}

/** Not expired: either it keeps, or its moment has not come. */
function unexpired(now: Date) {
  return or(isNull(mailbox.expiresAt), gt(mailbox.expiresAt, now));
}

function toMessage(row: typeof mailbox.$inferSelect): MailMessage {
  const claimed = row.claimedAt !== null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    attachments: row.attachments,
    sentBy: row.sentBy,
    sentAt: row.createdAt.toISOString(),
    read: row.readAt !== null,
    claimed,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    claimable: !claimed && !rewardsAreEmpty(row.attachments),
  };
}

/**
 * How many messages one read of the mailbox returns.
 *
 * A mailbox has no natural ceiling: mail without an expiry is never pruned (the daily pass
 * only removes rows whose `expires_at` has passed), and one operator batch-send adds a row
 * to every account at once. Reading all of it was a query whose cost grew for the life of
 * the account, on a screen a player opens most days and a box with one core.
 *
 * Newest first, which is the order the screen shows and the order anybody actually reads.
 * Generous enough that no real inbox reaches it — a hundred unexpiring messages is a year
 * of apologies — and the counts below are still counted over the whole mailbox, so a
 * capped list never makes the pip lie.
 */
const INBOX_LIMIT = 100;

async function inboxRows(
  tx: Executor | Database,
  playerId: string,
  now: Date,
): Promise<(typeof mailbox.$inferSelect)[]> {
  return tx
    .select()
    .from(mailbox)
    .where(and(eq(mailbox.playerId, playerId), unexpired(now)))
    .orderBy(desc(mailbox.createdAt))
    .limit(INBOX_LIMIT + 1);
}

/**
 * Unread and claimable across the *whole* mailbox, counted rather than hydrated.
 *
 * Two integers off an index, instead of every row's title, body and attachments pulled
 * into memory to be filtered — which is what the top bar's pip used to cost on every
 * player snapshot.
 */
async function counts(
  tx: Executor | Database,
  playerId: string,
  now: Date,
): Promise<{ unread: number; claimable: number }> {
  const [row] = await tx
    .select({
      unread: sql<number>`count(*) filter (where ${mailbox.readAt} is null)::int`,
      claimable: sql<number>`count(*) filter (
        where ${mailbox.claimedAt} is null and ${mailbox.attachments}::text <> '{}'
      )::int`,
    })
    .from(mailbox)
    .where(and(eq(mailbox.playerId, playerId), unexpired(now)));
  return { unread: row?.unread ?? 0, claimable: row?.claimable ?? 0 };
}

export async function overview(
  ctx: MailContext,
  playerId: string,
  now = new Date(),
): Promise<MailView> {
  const [rows, totals] = await Promise.all([
    inboxRows(ctx.db, playerId, now),
    counts(ctx.db, playerId, now),
  ]);
  // One row over the limit is fetched purely to answer "is there more?" without a second
  // count; it is never shown.
  const truncated = rows.length > INBOX_LIMIT;
  return {
    messages: rows.slice(0, INBOX_LIMIT).map(toMessage),
    truncated,
    unread: totals.unread,
    claimable: totals.claimable,
  };
}

/**
 * What the top bar's pip counts.
 *
 * Unread *plus* claimable rather than one or the other: a message with a gift in it that
 * has been opened and not emptied is still something waiting, and a plain message nobody
 * has read is too. Counted over the whole mailbox — a pip that stopped at a hundred would
 * be a pip that lies.
 */
export async function waitingCount(
  ctx: MailContext,
  playerId: string,
  now = new Date(),
): Promise<number> {
  const [row] = await ctx.db
    .select({
      waiting: sql<number>`count(*) filter (
        where ${mailbox.readAt} is null
           or (${mailbox.claimedAt} is null and ${mailbox.attachments}::text <> '{}')
      )::int`,
    })
    .from(mailbox)
    .where(and(eq(mailbox.playerId, playerId), unexpired(now)));
  return row?.waiting ?? 0;
}

// ── Reading and claiming ────────────────────────────────────────────────────

export async function markRead(
  ctx: MailContext,
  playerId: string,
  mailId: string,
  now = new Date(),
): Promise<MailView> {
  // Not an error to re-read: the client marks on open, and an open is not a mutation the
  // player asked for.
  await ctx.db
    .update(mailbox)
    .set({ readAt: now })
    .where(and(eq(mailbox.id, mailId), eq(mailbox.playerId, playerId), isNull(mailbox.readAt)));
  return overview(ctx, playerId, now);
}

export interface ClaimResult {
  paid: Record<string, number>;
  levelsGained: number;
  claimedCount: number;
  mail: MailView;
}

/** Empties one message. */
export async function claim(
  ctx: MailContext,
  playerId: string,
  mailId: string,
  actionId: string,
  now = new Date(),
): Promise<ClaimResult> {
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(mailbox)
      .where(and(eq(mailbox.id, mailId), eq(mailbox.playerId, playerId)))
      .for('update');
    if (!row) throw AppError.notFound('No such message.');

    if (row.claimActionId === actionId && row.claimedAt) {
      // A retried claim: answer as before, pay nothing again.
      return finish(tx, playerId, row.attachments, 0, 1, now);
    }
    if (row.claimedAt) throw new AppError('ALREADY_EXISTS', 'That is already collected.');
    if (rewardsAreEmpty(row.attachments)) {
      throw new AppError('VALIDATION', 'That message carries nothing to collect.');
    }
    if (row.expiresAt && row.expiresAt <= now) {
      throw new AppError('LOCKED_CONTENT', 'That message has expired.');
    }

    await tx
      .update(mailbox)
      .set({ claimedAt: now, readAt: row.readAt ?? now, claimActionId: actionId })
      .where(eq(mailbox.id, row.id));

    const paid = await rewards.payRewards(
      tx,
      playerId,
      row.attachments,
      `mail:${row.id}`,
      knownItem(ctx),
    );
    return finish(tx, playerId, paid.applied, paid.levelsGained, 1, now);
  });
}

/**
 * Empties every message that carries something.
 *
 * One transaction and one payout: twenty messages each paying silver separately would be
 * twenty rows in `economy_log` and twenty writes to the player, where the player's own
 * mental model is "collect all" as a single act.
 */
export async function claimAll(
  ctx: MailContext,
  playerId: string,
  actionId: string,
  now = new Date(),
): Promise<ClaimResult> {
  return ctx.db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(mailbox)
      .where(and(eq(mailbox.playerId, playerId), isNull(mailbox.claimedAt), unexpired(now)))
      .orderBy(desc(mailbox.createdAt))
      .for('update');

    const carrying = rows.filter((row) => !rewardsAreEmpty(row.attachments));
    if (carrying.length === 0) {
      // Already retried, or genuinely nothing there. Both answer with the inbox rather
      // than an error: "collect all" on an empty inbox is not a mistake.
      return finish(tx, playerId, {}, 0, 0, now);
    }

    const merged: Record<string, number> = {};
    for (const row of carrying) {
      for (const [key, amount] of Object.entries(row.attachments)) {
        merged[key] = (merged[key] ?? 0) + amount;
      }
    }

    await tx
      .update(mailbox)
      .set({ claimedAt: now, readAt: now, claimActionId: actionId })
      .where(
        and(
          eq(mailbox.playerId, playerId),
          isNull(mailbox.claimedAt),
          unexpired(now),
          sql`${mailbox.attachments} <> '{}'::jsonb`,
        ),
      );

    const paid = await rewards.payRewards(
      tx,
      playerId,
      merged,
      `mail:claim-all:${carrying.length}`,
      knownItem(ctx),
    );
    return finish(tx, playerId, paid.applied, paid.levelsGained, carrying.length, now);
  });
}

/** Throws a message away. Refused while it still carries something. */
export async function discard(
  ctx: MailContext,
  playerId: string,
  mailId: string,
  now = new Date(),
): Promise<MailView> {
  const [row] = await ctx.db
    .select()
    .from(mailbox)
    .where(and(eq(mailbox.id, mailId), eq(mailbox.playerId, playerId)));
  if (!row) throw AppError.notFound('No such message.');
  if (!row.claimedAt && !rewardsAreEmpty(row.attachments)) {
    throw new AppError('VALIDATION', 'Collect what it carries before throwing it away.');
  }

  await ctx.db.delete(mailbox).where(eq(mailbox.id, row.id));
  return overview(ctx, playerId, now);
}

async function finish(
  tx: Executor,
  playerId: string,
  paid: Record<string, number>,
  levelsGained: number,
  claimedCount: number,
  now: Date,
): Promise<ClaimResult> {
  // Read inside the caller's transaction rather than through `overview`, so what comes
  // back is the mailbox as this claim left it and not as a second connection found it.
  const [rows, totals] = await Promise.all([
    inboxRows(tx, playerId, now),
    counts(tx, playerId, now),
  ]);
  return {
    paid,
    levelsGained,
    claimedCount,
    mail: {
      messages: rows.slice(0, INBOX_LIMIT).map(toMessage),
      truncated: rows.length > INBOX_LIMIT,
      unread: totals.unread,
      claimable: totals.claimable,
    },
  };
}

/** Whether a reward's item key is still in the published catalogue. */
function knownItem(ctx: MailContext): (itemKey: string) => boolean {
  const items = new Set(ctx.content.current().bundle.items.map((item) => item.key));
  return (itemKey) => items.has(itemKey);
}

// ── News ────────────────────────────────────────────────────────────────────

/**
 * The posts whose window is open.
 *
 * Pinned first, then newest-first by the day it opened — an operator pinning the patch
 * note keeps it above the three announcements that followed it, which is the only ordering
 * rule a feed this small needs.
 */
export function news(ctx: MailContext, now = new Date()): NewsView {
  const posts = ctx.content
    .current()
    .bundle.newsPosts.filter((post) => post.active && isUp(post, now))
    .map<NewsItem>((post) => ({
      key: post.key,
      title: post.title,
      body: post.body,
      pinned: post.pinned,
      startsAt: post.startsAt || null,
      endsAt: post.endsAt || null,
    }))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.startsAt ?? '').localeCompare(a.startsAt ?? '');
    });

  return { posts };
}

/**
 * Whether a post's window covers now.
 *
 * An unparseable timestamp is treated as *shut* rather than open. A post is broadcast to
 * everybody, so the failure that shows a half-configured announcement to the whole game is
 * worse than the one that shows nothing and sends the operator back to the editor.
 */
function isUp(post: { startsAt: string; endsAt: string }, now: Date): boolean {
  const at = now.getTime();
  if (post.startsAt) {
    const starts = Date.parse(post.startsAt);
    if (!Number.isFinite(starts) || at < starts) return false;
  }
  if (post.endsAt) {
    const ends = Date.parse(post.endsAt);
    if (!Number.isFinite(ends) || at >= ends) return false;
  }
  return true;
}
