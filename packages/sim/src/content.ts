import type {
  CampaignChapterDef,
  ChampionDef,
  ContentBundle,
  DungeonDef,
  EnemyDef,
  GameConfigEntry,
  GearSetDef,
  GearSlotDef,
  GearStatDef,
  SkillDef,
  StageDef,
  StatusDef,
} from '@mistvale/shared';

/**
 * What a simulation needs to know about the game.
 *
 * A deliberately small slice of the content: the champions and enemies that fight, the
 * stages they fight on, the skills and statuses the engine resolves, the relic tables the
 * one gear-from-content fight reads, and the constants. Everything else in a bundle —
 * shops, quests, the tutorial script — cannot change the outcome of a battle and is not
 * carried.
 *
 * It is a *shape* rather than a loader, and that is the point. The CI gates fill it from
 * the committed seeds so they measure what a fresh install would get; the Admin sandbox
 * fills it from the live content cache, or from the drafts an operator is still editing,
 * so it measures what is about to be published. Both then call the same `simulateStage`,
 * which is what stops the sandbox and the gates from ever disagreeing about a number.
 */
export interface LoadedContent {
  champions: Map<string, ChampionDef>;
  enemies: Map<string, EnemyDef>;
  skills: SkillDef[];
  statuses: StatusDef[];
  stages: Map<string, StageDef>;
  chapters: Map<string, CampaignChapterDef>;
  dungeons: Map<string, DungeonDef>;
  /** The relic tables, for the one fight whose gear comes from content rather than a roll. */
  gearStats: GearStatDef[];
  gearSlots: GearSlotDef[];
  gearSets: GearSetDef[];
  config: Record<string, GameConfigEntry['value']>;
}

/**
 * A content bundle, as the simulator wants it.
 *
 * The bundle is already parsed and normalised — it is what the client is served and what
 * the server resolves every battle against — so this is an indexing pass and nothing more.
 * No validation, no defaults: a bundle that would not run a battle would not run one here
 * either, which is the honest answer for a sandbox whose whole job is to say what the real
 * thing would do.
 */
export function contentFromBundle(bundle: ContentBundle): LoadedContent {
  const byKey = <T extends { key: string }>(entries: readonly T[]): Map<string, T> =>
    new Map(entries.map((entry) => [entry.key, entry]));

  return {
    champions: byKey(bundle.champions),
    enemies: byKey(bundle.enemies),
    skills: [...bundle.skills],
    statuses: [...bundle.statuses],
    stages: byKey(bundle.stages),
    chapters: byKey(bundle.campaignChapters),
    dungeons: byKey(bundle.dungeons),
    gearStats: [...bundle.gearStats],
    gearSlots: [...bundle.gearSlots],
    gearSets: [...bundle.gearSets],
    config: { ...bundle.config },
  };
}
