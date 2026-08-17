import { randomUUID } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import {
  rewardItemKeys,
  type MailBatch,
  type MailSendRequest,
  type MailSendResult,
} from '@mistvale/shared';
import { mailbox, players } from '../db/schema/index';
import type { Database } from '../db/client';
import type { ContentCache } from '../content/cache';
import { AppError } from '../lib/errors';

/**
 * The mail composer.
 *
 * Sending fans out to a row per recipient inside one transaction: either everybody gets it
 * or nobody does, which matters because the alternative — a partial send an operator has to
 * finish by hand — has no good ending. The player count at EA makes the fan-out cheap, and
 * it is what turns "who has claimed the compensation" into a `count(*)` on one table.
 *
 * **Bots never receive mail.** They hold no balances and nobody reads their inbox, so a row
 * per bot would be sixty rows of noise in every send-to-all and sixty denominators wrong in
 * the claim stats.
 */

export interface AdminMailContext {
  db: Database;
  content: ContentCache;
}

/**
 * Validates the attachments before anything is written.
 *
 * A reward map naming an item that does not exist would pay nothing — the same silent hole
 * publish validation closes for content. Here it has to be caught at send time, because
 * there is no publish step between an operator typing it and a thousand players opening it.
 */
function assertPayable(ctx: AdminMailContext, attachments: Record<string, number>): void {
  const items = new Set(ctx.content.current().bundle.items.map((item) => item.key));
  const unknown = rewardItemKeys(attachments).filter((key) => !items.has(key));
  if (unknown.length > 0) {
    throw new AppError(
      'VALIDATION',
      `No such item: ${unknown.join(', ')}. Attachments have to name something that exists, or the mail pays nothing.`,
    );
  }
  for (const [key, amount] of Object.entries(attachments)) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError('VALIDATION', `The amount for ${key} has to be a positive number.`);
    }
  }
}

export async function send(
  ctx: AdminMailContext,
  input: MailSendRequest,
  sentBy: string,
  now = new Date(),
): Promise<MailSendResult> {
  assertPayable(ctx, input.attachments);

  const batchId = randomUUID();
  const expiresAt =
    input.expiresInDays > 0
      ? new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  return ctx.db.transaction(async (tx) => {
    const recipients =
      input.target === 'player'
        ? await tx.select({ id: players.id }).from(players).where(eq(players.id, input.playerId!))
        : await tx.select({ id: players.id }).from(players).where(eq(players.isBot, false));

    if (recipients.length === 0) {
      throw AppError.notFound(
        input.target === 'player' ? 'No such player.' : 'There is nobody to send to.',
      );
    }

    await tx.insert(mailbox).values(
      recipients.map((player) => ({
        playerId: player.id,
        title: input.title,
        body: input.body,
        attachments: input.attachments,
        sentBy,
        batchId,
        expiresAt,
      })),
    );

    return { batchId, recipients: recipients.length };
  });
}

/**
 * The send log, one row per batch.
 *
 * Grouped rather than listed because the question after a compensation mail is "did they
 * take it", and a thousand rows cannot answer that. Ungrouped rows — anything the game
 * itself raised — are excluded: they have no batch and no operator waiting on their stats.
 */
export async function batches(ctx: AdminMailContext, limit = 50): Promise<MailBatch[]> {
  const rows = await ctx.db
    .select({
      batchId: mailbox.batchId,
      title: sql<string>`min(${mailbox.title})`,
      sentBy: sql<string>`min(${mailbox.sentBy})`,
      sentAt: sql<Date>`min(${mailbox.createdAt})`,
      attachments: sql<Record<string, number>>`(array_agg(${mailbox.attachments}))[1]`,
      expiresAt: sql<Date | null>`min(${mailbox.expiresAt})`,
      recipients: sql<number>`count(*)::int`,
      read: sql<number>`count(${mailbox.readAt})::int`,
      claimed: sql<number>`count(${mailbox.claimedAt})::int`,
    })
    .from(mailbox)
    .where(sql`${mailbox.batchId} is not null`)
    .groupBy(mailbox.batchId)
    .orderBy(desc(sql`min(${mailbox.createdAt})`))
    .limit(limit);

  return rows.map((row) => ({
    batchId: row.batchId ?? '',
    title: row.title,
    sentBy: row.sentBy,
    sentAt: new Date(row.sentAt).toISOString(),
    attachments: row.attachments ?? {},
    recipients: row.recipients,
    read: row.read,
    claimed: row.claimed,
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
  }));
}
