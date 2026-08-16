import { z } from 'zod';
import {
  assetDefSchema,
  campaignChapterDefSchema,
  championDefSchema,
  enemyDefSchema,
  factionDefSchema,
  gameConfigEntrySchema,
  gearSetDefSchema,
  gearSlotDefSchema,
  gearStatDefSchema,
  itemDefSchema,
  shopDefSchema,
  skillDefSchema,
  stageDefSchema,
  statusDefSchema,
} from './entities';

/**
 * The content bundle the client renders from.
 *
 * Fetched once per content revision and cached; every response carries `rev`, so when a
 * publish bumps it the client knows to re-fetch (docs/ARCHITECTURE.md §4.4). Content is
 * for *display* — names, icons, descriptions, kit text. All outcomes are still computed
 * server-side; nothing here lets the client decide anything.
 *
 * Defined as a schema rather than an interface because it is also a published contract:
 * the OpenAPI artifact the Admin Suite generates its types from is derived from this,
 * so the shape cannot drift away from what the server actually serves.
 */
export const contentBundleSchema = z.object({
  rev: z.number().int(),
  publishedAt: z.string().nullable(),
  factions: z.array(factionDefSchema),
  statuses: z.array(statusDefSchema),
  skills: z.array(skillDefSchema),
  assets: z.array(assetDefSchema),
  champions: z.array(championDefSchema),
  enemies: z.array(enemyDefSchema),
  gearSets: z.array(gearSetDefSchema),
  gearSlots: z.array(gearSlotDefSchema),
  gearStats: z.array(gearStatDefSchema),
  items: z.array(itemDefSchema),
  campaignChapters: z.array(campaignChapterDefSchema),
  stages: z.array(stageDefSchema),
  shops: z.array(shopDefSchema),
  /** Flattened to a plain map — the client only ever reads values. */
  config: z.record(z.string(), gameConfigEntrySchema.shape.value),
});
export type ContentBundle = z.infer<typeof contentBundleSchema>;

/** Publish/validation problem, shared by the Admin UI and the server. */
export const contentIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  contentType: z.string(),
  key: z.string(),
  /** Dotted path inside the entity, when the problem is field-level. */
  path: z.string().optional(),
  message: z.string(),
});
export type ContentIssue = z.infer<typeof contentIssueSchema>;

export const contentValidationResultSchema = z.object({
  ok: z.boolean(),
  errors: z.array(contentIssueSchema),
  warnings: z.array(contentIssueSchema),
  /** Draft rows examined, for the "12 changes checked" line in Admin. */
  checked: z.number().int(),
});
export type ContentValidationResult = z.infer<typeof contentValidationResultSchema>;

/** How many entities a publish adds, changes and removes. */
export const contentTotalsSchema = z.object({
  added: z.number().int(),
  modified: z.number().int(),
  removed: z.number().int(),
});

/** One entity's difference between the live and draft states. */
export const contentDiffEntrySchema = z.object({
  contentType: z.string(),
  key: z.string(),
  change: z.enum(['added', 'modified', 'removed']),
  /** Field-level changes for `modified`, so the diff view need not re-derive them. */
  fields: z.array(z.object({ path: z.string(), before: z.unknown(), after: z.unknown() })),
  /**
   * Set when a change deserves a second look before going live — summon rates, a stat
   * nerf on a champion players already own, a price rise.
   */
  risk: z.enum(['rates', 'balance', 'economy']).optional(),
});
export type ContentDiffEntry = z.infer<typeof contentDiffEntrySchema>;

export const contentDiffSchema = z.object({
  rev: z.number().int(),
  entries: z.array(contentDiffEntrySchema),
  totals: contentTotalsSchema,
});
export type ContentDiff = z.infer<typeof contentDiffSchema>;

export const contentRevisionSummarySchema = z.object({
  rev: z.number().int(),
  publishedAt: z.string(),
  publishedBy: z.string(),
  note: z.string(),
  summary: contentTotalsSchema,
});
export type ContentRevisionSummary = z.infer<typeof contentRevisionSummarySchema>;
