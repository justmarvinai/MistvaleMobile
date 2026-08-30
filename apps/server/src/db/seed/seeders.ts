import { CONTENT_LOAD_ORDER, CONTENT_REGISTRY, type ContentType } from '@mistvale/shared';
import { CAMPAIGN_CHAPTERS, CAMPAIGN_STAGES } from './data/campaign';
import { DEPTHS_STAGES, DUNGEONS } from './data/depths';
import { DEPTHS_ENEMIES, DEPTHS_SKILLS } from './data/depths-enemies';
import { MASTERIES } from './data/masteries';
import { QUESTS } from './data/quests';
import { MISSIONS } from './data/missions';
import { EVENTS } from './data/events';
import { VALE_PASSES } from './data/vale-pass';
import { LOGIN_TRACKS } from './data/login';
import { NEWS_POSTS } from './data/news';
import { SOUND_CUES } from './data/sounds';
import { EXPEDITIONS } from './data/expeditions';
import { DEEP_RUNS } from './data/deeprun';
import { TITAN_DUNGEONS, TITAN_ENEMIES, TITAN_SKILLS, TITAN_STAGES } from './data/titan';
import { TRIAL_ENEMIES, TRIAL_SKILLS, TRIAL_STAGES } from './data/trials';
import { WORLD_BOSS_DUNGEONS, WORLD_BOSS_ENEMIES, WORLD_BOSS_STAGES } from './data/worldboss';
import { SPIRE_DUNGEONS, SPIRE_STAGES } from './data/spire';
import { TUTORIAL_STAGES, TUTORIAL_STEPS } from './data/tutorial';
import { GAME_CONFIG, ITEMS } from './data/config';
import { GEAR_STATS } from './data/gear-stats';
import { ENEMIES, ENEMY_SKILLS } from './data/enemies';
import { EXTENDED_CHAMPIONS, EXTENDED_SKILLS } from './data/extended-champions';
import { SHOWCASE_CHAMPIONS, SHOWCASE_SKILLS } from './data/showcase-champions';
import { SHOPS } from './data/shops';
import { STATUSES } from './data/statuses';
import { SUMMON_POOLS } from './data/summon-pools';
import { ASSETS, FACTIONS, GEAR_SETS, GEAR_SLOTS } from './data/world';

/**
 * The committed content set.
 *
 * Seeds are code-reviewable data, not a database dump: they are the starting point a
 * fresh install gets, and the reference the Admin Suite edits away from. Once deployed,
 * the database is the source of truth — re-seeding never overwrites live content unless
 * explicitly forced (docs/DATA_MODEL.md §5).
 */

export interface SeedContent {
  contentType: ContentType;
  entities: { key: string; data: unknown }[];
}

/** Everything P1 ships, in dependency order. */
export function buildSeedContent(): SeedContent[] {
  const byType: Record<ContentType, { key: string; data: unknown }[]> = {
    faction: FACTIONS.map((data) => ({ key: data.key, data })),
    status: STATUSES.map((data) => ({ key: data.key, data })),
    asset: ASSETS.map((data) => ({ key: data.key, data })),
    skill: [
      ...SHOWCASE_SKILLS,
      ...EXTENDED_SKILLS,
      ...ENEMY_SKILLS,
      ...DEPTHS_SKILLS,
      ...TITAN_SKILLS,
      ...TRIAL_SKILLS,
    ].map((data) => ({
      key: data.key,
      data,
    })),
    // The showcase seven have final art (CONTENT_PLAN §1); the rest of the roster and
    // the food units are art-pending and share the placeholder model (§1b).
    champion: [...SHOWCASE_CHAMPIONS, ...EXTENDED_CHAMPIONS].map((data) => ({
      key: data.key,
      data,
    })),
    enemy: [
      ...ENEMIES,
      ...DEPTHS_ENEMIES,
      ...TITAN_ENEMIES,
      ...TRIAL_ENEMIES,
      ...WORLD_BOSS_ENEMIES,
    ].map((data) => ({
      key: data.key,
      data,
    })),
    gearSet: GEAR_SETS.map((data) => ({ key: data.key, data })),
    gearSlot: GEAR_SLOTS.map((data) => ({ key: data.key, data })),
    gearStat: GEAR_STATS.map((data) => ({ key: data.key, data })),
    item: ITEMS.map((data) => ({ key: data.key, data })),
    expedition: EXPEDITIONS.map((data) => ({ key: data.key, data })),
    deepRun: DEEP_RUNS.map((data) => ({ key: data.key, data })),
    campaignChapter: CAMPAIGN_CHAPTERS.map((data) => ({ key: data.key, data })),
    dungeon: [...DUNGEONS, ...TITAN_DUNGEONS, ...WORLD_BOSS_DUNGEONS, ...SPIRE_DUNGEONS].map(
      (data) => ({
        key: data.key,
        data,
      }),
    ),
    stage: [
      ...CAMPAIGN_STAGES,
      ...DEPTHS_STAGES,
      ...TUTORIAL_STAGES,
      ...TITAN_STAGES,
      ...TRIAL_STAGES,
      ...WORLD_BOSS_STAGES,
      ...SPIRE_STAGES,
    ].map((data) => ({
      key: data.key,
      data,
    })),
    summonPool: SUMMON_POOLS.map((data) => ({ key: data.key, data })),
    shop: SHOPS.map((data) => ({ key: data.key, data })),
    mastery: MASTERIES.map((data) => ({ key: data.key, data })),
    quest: QUESTS.map((data) => ({ key: data.key, data })),
    mission: MISSIONS.map((data) => ({ key: data.key, data })),
    event: EVENTS.map((data) => ({ key: data.key, data })),
    valePass: VALE_PASSES.map((data) => ({ key: data.key, data })),
    loginTrack: LOGIN_TRACKS.map((data) => ({ key: data.key, data })),
    newsPost: NEWS_POSTS.map((data) => ({ key: data.key, data })),
    tutorialStep: TUTORIAL_STEPS.map((data) => ({ key: data.key, data })),
    soundCue: SOUND_CUES.map((data) => ({ key: data.key, data })),
    gameConfig: GAME_CONFIG.map((data) => ({ key: data.key, data })),
  };

  return CONTENT_LOAD_ORDER.map((contentType) => ({
    contentType,
    entities: byType[contentType],
  }));
}

/**
 * Parses every seed entity against its schema.
 *
 * Runs before anything is written, so a malformed seed fails loudly at load time rather
 * than producing content that only breaks later at publish.
 */
export function parseSeedContent(seeds: SeedContent[]): {
  ok: boolean;
  problems: string[];
  total: number;
} {
  const problems: string[] = [];
  let total = 0;

  for (const seed of seeds) {
    const seen = new Set<string>();

    for (const entity of seed.entities) {
      total += 1;

      if (seen.has(entity.key)) {
        problems.push(`${seed.contentType}/${entity.key}: duplicate key in seed data`);
        continue;
      }
      seen.add(entity.key);

      const result = CONTENT_REGISTRY[seed.contentType].schema.safeParse(entity.data);
      if (!result.success) {
        for (const issue of result.error.issues) {
          problems.push(
            `${seed.contentType}/${entity.key}: ${issue.path.join('.') || '(root)'} — ${issue.message}`,
          );
        }
      }
    }
  }

  return { ok: problems.length === 0, problems, total };
}
