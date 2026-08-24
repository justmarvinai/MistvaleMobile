import { z } from 'zod';

/**
 * Expeditions — champions sent away, and unavailable while they are gone.
 *
 * The unavailability *is* the feature. Every other system in Mistvale asks about four
 * champions; this is the one that asks about the fifth and the sixth, because sending two
 * away for eight hours costs you two you cannot field. Owning eight good champions becomes
 * better than owning four, which is what a collection game should reward and what this one
 * did not.
 *
 * **Away means unavailable, not untouchable.** A champion on an expedition cannot be sent
 * into a battle, set as arena defence, fed away as food or released — but it can still be
 * levelled, ranked, ascended and re-geared. They are working, not gone, and blocking
 * investment would be friction with no design behind it.
 *
 * The reward is **deterministic**. A timer whose payout is a dice roll is a timer a player
 * cannot price, and pricing it is the whole decision — what varies is the party, through
 * *favours* the expedition asks for.
 */

export const expeditionFavourStateSchema = z.object({
  kind: z.enum(['faction', 'element', 'role', 'rarity']),
  value: z.string(),
  bonusPct: z.number(),
  /** Whether the party as sent (or as chosen) meets it. */
  met: z.boolean(),
});
export type ExpeditionFavourState = z.infer<typeof expeditionFavourStateSchema>;

/** A dispatch in flight, or one waiting to be collected. */
export const expeditionRunSchema = z.object({
  id: z.string(),
  expeditionKey: z.string(),
  championIds: z.array(z.string()),
  startedAt: z.string(),
  /** When it can be claimed. */
  readyAt: z.string(),
  /** True once the clock has passed `readyAt` — the server's answer, not the client's. */
  ready: z.boolean(),
  /** What claiming it will pay, favours already applied. Fixed at dispatch. */
  rewards: z.record(z.string(), z.number()),
  /** Which favours the party met, for the card to show why the yield is what it is. */
  favours: z.array(expeditionFavourStateSchema),
});
export type ExpeditionRun = z.infer<typeof expeditionRunSchema>;

/** One expedition as the screen offers it. */
export const expeditionOfferSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  hours: z.number().int(),
  partySize: z.number().int(),
  unlockLevel: z.number().int(),
  icon: z.string(),
  rewards: z.record(z.string(), z.number()),
  favours: z.array(
    z.object({
      kind: z.enum(['faction', 'element', 'role', 'rarity']),
      value: z.string(),
      bonusPct: z.number(),
    }),
  ),
  /** Why it cannot be sent right now, in the sentence the button shows. Null when it can. */
  blockedReason: z.string().nullable(),
});
export type ExpeditionOffer = z.infer<typeof expeditionOfferSchema>;

export const expeditionStateSchema = z.object({
  offers: z.array(expeditionOfferSchema),
  running: z.array(expeditionRunSchema),
  /** How many may run at once, and how many are in flight. */
  slots: z.number().int(),
  slotsUsed: z.number().int(),
  /** Champion ids that are away — every screen that fields a champion greys these. */
  awayChampionIds: z.array(z.string()),
});
export type ExpeditionState = z.infer<typeof expeditionStateSchema>;

export const NO_EXPEDITIONS: ExpeditionState = Object.freeze({
  offers: [],
  running: [],
  slots: 0,
  slotsUsed: 0,
  awayChampionIds: [],
});

// ── Requests ────────────────────────────────────────────────────────────────

export const dispatchExpeditionRequestSchema = z.object({
  championIds: z.array(z.string().uuid()).min(1).max(4),
  actionId: z.string().min(8).max(64),
});
export type DispatchExpeditionRequest = z.infer<typeof dispatchExpeditionRequestSchema>;

export const claimExpeditionRequestSchema = z.object({
  actionId: z.string().min(8).max(64),
});
export type ClaimExpeditionRequest = z.infer<typeof claimExpeditionRequestSchema>;

export const expeditionClaimResultSchema = z.object({
  /** What was actually paid, through the same ledger as everything else. */
  rewards: z.record(z.string(), z.number()),
  /** The champions that came home. */
  championIds: z.array(z.string()),
  state: expeditionStateSchema,
});
export type ExpeditionClaimResult = z.infer<typeof expeditionClaimResultSchema>;

// ── The arithmetic ──────────────────────────────────────────────────────────

/** What one champion offers a favour: the field it would be matched on. */
export interface FavourCandidate {
  factionKey: string;
  element: string;
  role: string;
  rarity: string;
}

/** Whether a party meets a favour — one matching member is enough. */
export function favourMet(
  favour: { kind: ExpeditionFavourState['kind']; value: string },
  party: readonly FavourCandidate[],
): boolean {
  return party.some((member) => {
    switch (favour.kind) {
      case 'faction':
        return member.factionKey === favour.value;
      case 'element':
        return member.element === favour.value;
      case 'role':
        return member.role === favour.value;
      default:
        return member.rarity === favour.value;
    }
  });
}

/**
 * What a party brings back.
 *
 * Favours are **added, then applied once** — three 20% favours are +60%, not ×1.2³. The
 * difference is small at these numbers and enormous at an operator's, and a multiplier
 * nobody can do in their head is a multiplier nobody can plan around.
 *
 * Rounded down per line and floored at one, so a favour can never *lose* a player a unit
 * of something and a tiny reward never rounds away to nothing.
 */
export function expeditionYield(
  base: Readonly<Record<string, number>>,
  favours: readonly ExpeditionFavourState[],
): Record<string, number> {
  const bonus = favours.reduce((sum, favour) => sum + (favour.met ? favour.bonusPct : 0), 0);
  const multiplier = 1 + bonus / 100;
  const paid: Record<string, number> = {};
  for (const [key, amount] of Object.entries(base)) {
    if (amount <= 0) continue;
    paid[key] = Math.max(1, Math.floor(amount * multiplier));
  }
  return paid;
}

/** How long is left, in whole minutes, or 0 once it is ready. */
export function minutesLeft(readyAt: string, now: Date): number {
  const ends = Date.parse(readyAt);
  if (!Number.isFinite(ends)) return 0;
  return Math.max(0, Math.ceil((ends - now.getTime()) / 60_000));
}
