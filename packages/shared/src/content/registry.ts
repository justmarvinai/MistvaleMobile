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
  eventDefSchema,
  missionDefSchema,
  loginTrackDefSchema,
  newsPostDefSchema,
  questDefSchema,
  summonPoolDefSchema,
  stageDefSchema,
  soundCueDefSchema,
  expeditionDefSchema,
  tutorialStepDefSchema,
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
  'mission',
  'event',
  'loginTrack',
  'newsPost',
  'tutorialStep',
  'soundCue',
  'expedition',
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
  mission: {
    label: 'Missions',
    path: 'missions',
    schema: missionDefSchema,
    // The finale hands over a champion, so a mission can point at one.
    references: ['champion'],
    inBundle: true,
  },
  event: {
    label: 'Events',
    path: 'events',
    schema: eventDefSchema,
    references: [],
    inBundle: true,
  },
  loginTrack: {
    label: 'Login tracks',
    path: 'login-tracks',
    schema: loginTrackDefSchema,
    // Day 30 hands over a champion the player picks, and the welcome track's last day
    // hands over a relic set.
    references: ['champion', 'gearSet'],
    inBundle: true,
  },
  newsPost: {
    label: 'News',
    path: 'news',
    schema: newsPostDefSchema,
    references: [],
    inBundle: true,
  },
  tutorialStep: {
    label: 'Tutorial',
    path: 'tutorial',
    schema: tutorialStepDefSchema,
    references: [],
    inBundle: true,
  },
  soundCue: {
    label: 'Sounds',
    path: 'sounds',
    // A cue may name an `asset` to play, but the reference is deliberately not declared:
    // a cue that falls back to its synth voice is complete on its own, and publish must
    // not refuse a script that points at a pack nobody has uploaded yet.
    schema: soundCueDefSchema,
    references: [],
    inBundle: true,
  },
  expedition: {
    label: 'Expeditions',
    path: 'expeditions',
    schema: expeditionDefSchema,
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
  'mission',
  'event',
  'loginTrack',
  'newsPost',
  'tutorialStep',
  'soundCue',
  'expedition',
  'gameConfig',
];

export function contentTypeByPath(path: string): ContentType | undefined {
  return CONTENT_TYPES.find((type) => CONTENT_REGISTRY[type].path === path);
}
