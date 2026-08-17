import { z } from 'zod';
import { goalSchema } from './content/goals';
import { gearInstanceSchema } from './gear';

/**
 * The tutorial, as the client drives it.
 *
 * One step at a time, strictly in order, and always answered whole — the overlay needs the
 * screen it belongs on, the thing to point at, the words, and whether the player can move
 * on yet. Answering it in pieces would let the overlay render a line for one step against
 * the highlight of another.
 */

export const tutorialStandingSchema = z.object({
  /** 1-based. Zero before the first step is taken. */
  step: z.number().int(),
  /** How many steps the script holds, so the overlay can show progress honestly. */
  total: z.number().int(),
  screen: z.string(),
  highlight: z.string(),
  title: z.string(),
  body: z.string(),
  /** What the player must do, if anything. Absent on a beat they simply acknowledge. */
  goal: goalSchema.optional(),
  /** Progress towards that goal, and whether it is met. */
  progress: z.number().int(),
  /** The step can be completed right now. Always true for a beat. */
  ready: z.boolean(),
  rewards: z.record(z.string(), z.number()),
});
export type TutorialStanding = z.infer<typeof tutorialStandingSchema>;

export const tutorialViewSchema = z.object({
  /** The step in front of the player, or null once the script is done or skipped. */
  current: tutorialStandingSchema.nullable(),
  /** Walked to the end, or left deliberately. Either way the overlay stays away. */
  finished: z.boolean(),
  skipped: z.boolean(),
});
export type TutorialView = z.infer<typeof tutorialViewSchema>;

export const tutorialAdvanceRequestSchema = z.object({
  actionId: z.string().min(8).max(64),
});
export type TutorialAdvanceRequest = z.infer<typeof tutorialAdvanceRequestSchema>;

export const tutorialAdvanceResultSchema = z.object({
  /** What the step just completed paid, so the overlay can show it before moving on. */
  paid: z.record(z.string(), z.number()),
  /** Relics the next step opened with, already rolled. */
  relics: z.array(gearInstanceSchema),
  levelsGained: z.number().int(),
  tutorial: tutorialViewSchema,
});
export type TutorialAdvanceResult = z.infer<typeof tutorialAdvanceResultSchema>;
