import { z } from 'zod';

/**
 * The mailbox, as the client reads it and the composer writes it.
 *
 * Mail is the game's apology, its gift, and its answer to "the reward that could not be
 * delivered" — so it is deliberately plain: a title, some words, and sometimes a payout to
 * take. Attachments are the same flat reward map every other payout uses, which is what
 * lets an operator hand over anything the game can already pay without a new mechanism.
 */

export const mailMessageSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  /** Empty when the message is only words. */
  attachments: z.record(z.string(), z.number()),
  /** `system`, or `admin:<account name>` — who a player can name when they ask about it. */
  sentBy: z.string(),
  sentAt: z.string(),
  read: z.boolean(),
  claimed: z.boolean(),
  /** ISO instant, or null when the message keeps indefinitely. */
  expiresAt: z.string().nullable(),
  /** Has something to take right now. */
  claimable: z.boolean(),
});
export type MailMessage = z.infer<typeof mailMessageSchema>;

export const mailViewSchema = z.object({
  messages: z.array(mailMessageSchema),
  /** Never opened. */
  unread: z.number().int(),
  /** Carrying attachments nobody has taken — what the top bar's pip counts. */
  claimable: z.number().int(),
});
export type MailView = z.infer<typeof mailViewSchema>;

export const mailClaimRequestSchema = z.object({
  actionId: z.string().min(8).max(64),
});
export type MailClaimRequest = z.infer<typeof mailClaimRequestSchema>;

export const mailClaimResultSchema = z.object({
  paid: z.record(z.string(), z.number()),
  levelsGained: z.number().int(),
  /** How many messages the claim emptied — one, or all of them. */
  claimedCount: z.number().int(),
  mail: mailViewSchema,
});
export type MailClaimResult = z.infer<typeof mailClaimResultSchema>;

// ── The composer (Admin) ────────────────────────────────────────────────────

export const MAIL_TARGETS = ['player', 'all'] as const;
export type MailTarget = (typeof MAIL_TARGETS)[number];

export const mailSendRequestSchema = z
  .object({
    /** `player` needs `playerId`; `all` reaches every human account, never a bot. */
    target: z.enum(MAIL_TARGETS),
    playerId: z.string().uuid().optional(),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(4000),
    attachments: z.record(z.string(), z.number()).default({}),
    /** Days until the message disappears, claimed or not. Zero means it keeps. */
    expiresInDays: z.number().int().min(0).max(365).default(30),
  })
  .refine((input) => input.target !== 'player' || Boolean(input.playerId), {
    message: 'Sending to one player needs that player.',
    path: ['playerId'],
  });
export type MailSendRequest = z.infer<typeof mailSendRequestSchema>;

export const mailBatchSchema = z.object({
  batchId: z.string(),
  title: z.string(),
  sentBy: z.string(),
  sentAt: z.string(),
  attachments: z.record(z.string(), z.number()),
  /** How many players it reached. */
  recipients: z.number().int(),
  /** How many have opened it, and how many have taken what it carried. */
  read: z.number().int(),
  claimed: z.number().int(),
  expiresAt: z.string().nullable(),
});
export type MailBatch = z.infer<typeof mailBatchSchema>;

export const mailSendResultSchema = z.object({
  batchId: z.string(),
  recipients: z.number().int(),
});
export type MailSendResult = z.infer<typeof mailSendResultSchema>;
