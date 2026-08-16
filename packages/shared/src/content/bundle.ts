import { z } from 'zod';
import type {
  AssetDef,
  CampaignChapterDef,
  ChampionDef,
  EnemyDef,
  FactionDef,
  GameConfigEntry,
  GearSetDef,
  GearSlotDef,
  ItemDef,
  SkillDef,
  StageDef,
  StatusDef,
} from './entities';

/**
 * The content bundle the client renders from.
 *
 * Fetched once per content revision and cached; every response carries `rev`, so when a
 * publish bumps it the client knows to re-fetch (docs/ARCHITECTURE.md §4.4). Content is
 * for *display* — names, icons, descriptions, kit text. All outcomes are still computed
 * server-side; nothing here lets the client decide anything.
 */
export interface ContentBundle {
  rev: number;
  publishedAt: string | null;
  factions: FactionDef[];
  statuses: StatusDef[];
  skills: SkillDef[];
  assets: AssetDef[];
  champions: ChampionDef[];
  enemies: EnemyDef[];
  gearSets: GearSetDef[];
  gearSlots: GearSlotDef[];
  items: ItemDef[];
  campaignChapters: CampaignChapterDef[];
  stages: StageDef[];
  /** Flattened to a plain map — the client only ever reads values. */
  config: Record<string, GameConfigEntry['value']>;
}

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

export interface ContentValidationResult {
  ok: boolean;
  errors: ContentIssue[];
  warnings: ContentIssue[];
  /** Draft rows examined, for the "12 changes checked" line in Admin. */
  checked: number;
}

/** One entity's difference between the live and draft states. */
export interface ContentDiffEntry {
  contentType: string;
  key: string;
  change: 'added' | 'modified' | 'removed';
  /** Field-level changes for `modified`, so the diff view need not re-derive them. */
  fields: { path: string; before: unknown; after: unknown }[];
  /**
   * Set when a change deserves a second look before going live — summon rates, a stat
   * nerf on a champion players already own, a price rise.
   */
  risk?: 'rates' | 'balance' | 'economy';
}

export interface ContentDiff {
  rev: number;
  entries: ContentDiffEntry[];
  totals: { added: number; modified: number; removed: number };
}

export interface ContentRevisionSummary {
  rev: number;
  publishedAt: string;
  publishedBy: string;
  note: string;
  summary: { added: number; modified: number; removed: number };
}
