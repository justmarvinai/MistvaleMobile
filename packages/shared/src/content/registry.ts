import type { z } from 'zod';
import {
  assetDefSchema,
  campaignChapterDefSchema,
  championDefSchema,
  dungeonDefSchema,
  enemyDefSchema,
  factionDefSchema,
  gameConfigEntrySchema,
  gearSetDefSchema,
  gearSlotDefSchema,
  gearStatDefSchema,
  itemDefSchema,
  shopDefSchema,
  skillDefSchema,
  questDefSchema,
  summonPoolDefSchema,
  stageDefSchema,
  statusDefSchema,
} from './entities';
import { masteryDefSchema } from './masteries';

/**
 * The content type registry.
 *
 * One entry per editable content family. Everything generic — the Admin CRUD routes,
 * validation, the publish diff, export/import, the client bundle — iterates this list
 * instead of hard-coding types, so adding a content family is one entry plus a table.
 */

export const CONTENT_TYPES = [
  'faction',
  'status',
  'skill',
  'asset',
  'champion',
  'enemy',
  'gearSet',
  'gearSlot',
  'gearStat',
  'item',
  'campaignChapter',
  'dungeon',
  'stage',
  'summonPool',
  'shop',
  'mastery',
  'quest',
  'gameConfig',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export interface ContentTypeMeta {
  /** Plural label for Admin navigation. */
  label: string;
  /** URL segment under `/admin/api/content/…`. */
  path: string;
  schema: z.ZodTypeAny;
  /**
   * Types this one points at. Publish checks every reference resolves, so a champion
   * can never go live naming a skill that does not exist.
   */
  references: readonly ContentType[];
  /** Included in the client bundle. Some types are server-only. */
  inBundle: boolean;
}

export const CONTENT_REGISTRY: Readonly<Record<ContentType, ContentTypeMeta>> = Object.freeze({
  faction: {
    label: 'Factions',
    path: 'factions',
    schema: factionDefSchema,
    references: [],
    inBundle: true,
  },
  status: {
    label: 'Status effects',
    path: 'statuses',
    schema: statusDefSchema,
    references: [],
    inBundle: true,
  },
  skill: {
    label: 'Skills',
    path: 'skills',
    schema: skillDefSchema,
    references: ['status'],
    inBundle: true,
  },
  asset: {
    label: 'Assets',
    path: 'assets',
    schema: assetDefSchema,
    references: [],
    inBundle: true,
  },
  champion: {
    label: 'Champions',
    path: 'champions',
    schema: championDefSchema,
    references: ['faction', 'skill', 'asset'],
    inBundle: true,
  },
  enemy: {
    label: 'Enemies',
    path: 'enemies',
    schema: enemyDefSchema,
    references: ['skill', 'asset'],
    inBundle: true,
  },
  gearSet: {
    label: 'Relic sets',
    path: 'gear-sets',
    schema: gearSetDefSchema,
    references: [],
    inBundle: true,
  },
  gearSlot: {
    label: 'Relic slots',
    path: 'gear-slots',
    schema: gearSlotDefSchema,
    references: [],
    inBundle: true,
  },
  gearStat: {
    label: 'Relic stats',
    path: 'gear-stats',
    schema: gearStatDefSchema,
    references: [],
    inBundle: true,
  },
  item: { label: 'Items', path: 'items', schema: itemDefSchema, references: [], inBundle: true },
  campaignChapter: {
    label: 'Campaign chapters',
    path: 'chapters',
    schema: campaignChapterDefSchema,
    references: ['gearSet'],
    inBundle: true,
  },
  dungeon: {
    label: 'Dungeons',
    path: 'dungeons',
    schema: dungeonDefSchema,
    references: ['gearSet', 'item', 'enemy'],
    inBundle: true,
  },
  stage: {
    label: 'Stages',
    path: 'stages',
    schema: stageDefSchema,
    references: ['campaignChapter', 'dungeon', 'enemy', 'gearSet'],
    inBundle: true,
  },
  summonPool: {
    label: 'Summon pools',
    path: 'summon-pools',
    schema: summonPoolDefSchema,
    references: ['item', 'champion'],
    inBundle: true,
  },
  shop: {
    label: 'Shops',
    path: 'shops',
    schema: shopDefSchema,
    references: ['item', 'gearSet', 'champion'],
    inBundle: true,
  },
  mastery: {
    label: 'Masteries',
    path: 'masteries',
    schema: masteryDefSchema,
    references: [],
    inBundle: true,
  },
  quest: {
    label: 'Quests',
    path: 'quests',
    schema: questDefSchema,
    references: [],
    inBundle: true,
  },
  gameConfig: {
    label: 'Game config',
    path: 'config',
    schema: gameConfigEntrySchema,
    references: [],
    inBundle: true,
  },
});

/** Load order for seeding and validation: referenced types come first. */
export const CONTENT_LOAD_ORDER: readonly ContentType[] = [
  'faction',
  'status',
  'asset',
  'skill',
  'champion',
  'enemy',
  'gearSet',
  'gearSlot',
  'gearStat',
  'item',
  'campaignChapter',
  'dungeon',
  'stage',
  'summonPool',
  'shop',
  'mastery',
  'quest',
  'gameConfig',
];

export function contentTypeByPath(path: string): ContentType | undefined {
  return CONTENT_TYPES.find((type) => CONTENT_REGISTRY[type].path === path);
}
