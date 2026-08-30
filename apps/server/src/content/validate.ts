import {
  CONTENT_LOAD_ORDER,
  CONTENT_REGISTRY,
  EFFECT_COMPONENT_TYPES,
  ELEMENTS,
  MASTERY_MAX_TIER,
  MASTERY_MIN_TIER,
  MASTERY_PICKS_BY_TIER,
  MASTERY_TOTAL_PICKS,
  MASTERY_TREES,
  RANK_RANGE_BY_RARITY,
  RARITIES,
  ROLES,
  STATUS_ENGINE_TYPES,
  isValidBaseRank,
  rewardItemKeys,
  deepRunProblems,
  restrictionSupply,
  spireRuleProblems,
  titanRuleProblems,
  WARD_MIN_SUPPLY,
  worldBossRuleProblems,
  type ContentIssue,
  type ContentType,
  REWARD_SCALARS,
  isRewardScalar,
  type ContentValidationResult,
  type Rarity,
  type DeepRunDef,
  type SpireRules,
  type TeamRestriction,
  type TitanRules,
  type WorldBossRules,
} from '@mistvale/shared';

/**
 * Content validation — the gate between an editor's draft and a live game.
 *
 * Three layers, in order:
 *  1. **Shape** — each entity parses against its Zod schema.
 *  2. **References** — every key an entity points at exists (champion → skills, stage →
 *     enemies, and so on). This is what stops a publish producing a champion whose
 *     third skill silently does nothing.
 *  3. **Engine registry** — every status maps to a behaviour the engine implements, and
 *     every skill component is a type the engine can interpret. Content cannot invent
 *     mechanics that no code backs.
 *
 * Warnings never block a publish; errors always do.
 */

export type ContentSet = Map<ContentType, Map<string, unknown>>;

/** A validation pass, plus the parsed entities it produced along the way. */
export interface ContentValidationPass {
  result: ContentValidationResult;
  /**
   * Every entity after parsing, with schema defaults materialised.
   *
   * This — not the raw input — is what gets persisted. Authors (and the Admin forms)
   * may legitimately omit any field that has a default; if the raw shape were stored,
   * content written by hand and content written through Admin would disagree about
   * whether, say, a damage component carries an explicit `hits`, and the engine would
   * have to defend against both. Normalising once, here, keeps the database in one
   * shape no matter which door the content came through.
   */
  normalised: ContentSet;
}

/** Validates a content set and returns the parsed entities for persistence. */
export function validateAndNormalise(content: ContentSet): ContentValidationPass {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];
  let checked = 0;

  // ── 1. Shape ──────────────────────────────────────────────────────────────
  const parsed: ContentSet = new Map();

  for (const contentType of CONTENT_LOAD_ORDER) {
    const entities = content.get(contentType) ?? new Map<string, unknown>();
    const parsedEntities = new Map<string, unknown>();

    for (const [key, raw] of entities) {
      checked += 1;
      const result = CONTENT_REGISTRY[contentType].schema.safeParse(raw);

      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            severity: 'error',
            contentType,
            key,
            path: issue.path.join('.') || undefined,
            message: issue.message,
          });
        }
        continue;
      }

      const entity = result.data as { key?: string };
      if (entity.key !== undefined && entity.key !== key) {
        errors.push({
          severity: 'error',
          contentType,
          key,
          path: 'key',
          message: `Stored under "${key}" but declares key "${entity.key}".`,
        });
      }

      parsedEntities.set(key, result.data);
    }

    parsed.set(contentType, parsedEntities);
  }

  const has = (contentType: ContentType, key: string): boolean =>
    parsed.get(contentType)?.has(key) ?? false;

  const reference = (
    from: { contentType: ContentType; key: string; path: string },
    target: ContentType,
    targetKey: string,
  ): void => {
    if (has(target, targetKey)) return;
    errors.push({
      severity: 'error',
      contentType: from.contentType,
      key: from.key,
      path: from.path,
      message: `References ${CONTENT_REGISTRY[target].label.toLowerCase()} "${targetKey}", which does not exist.`,
    });
  };

  /**
   * Every non-currency key in a reward map has to be an item that exists.
   *
   * A reward map is a flat `{silver: 5000, sigil_gleaming: 1}`, which is exactly what makes
   * it pleasant to author and exactly what makes a typo invisible: `sigil_gleeming` is a
   * perfectly good key, and the payout would hand over nothing. Checking it here turns a
   * silent hole in a player's reward into a red line in the publish diff.
   */
  const rewardMap = (
    from: { contentType: ContentType; key: string; path: string },
    rewards: Readonly<Record<string, number>> | undefined,
  ): void => {
    for (const itemKey of rewardItemKeys(rewards ?? {})) {
      reference({ ...from, path: `${from.path}.${itemKey}` }, 'item', itemKey);
    }
  };

  // ── 2 & 3. References and engine registry ─────────────────────────────────
  for (const [key, entity] of parsed.get('status') ?? []) {
    const status = entity as { engineType: string };
    if (!STATUS_ENGINE_TYPES.includes(status.engineType as never)) {
      errors.push({
        severity: 'error',
        contentType: 'status',
        key,
        path: 'engineType',
        message: `"${status.engineType}" is not a behaviour the engine implements.`,
      });
    }
  }

  for (const [key, entity] of parsed.get('skill') ?? []) {
    const skill = entity as {
      components: { type: string; status?: string }[];
      slot: string;
      cooldown: number;
    };

    skill.components.forEach((component, index) => {
      if (!EFFECT_COMPONENT_TYPES.includes(component.type as never)) {
        errors.push({
          severity: 'error',
          contentType: 'skill',
          key,
          path: `components.${index}.type`,
          message: `"${component.type}" is not an effect the engine implements.`,
        });
      }
      if (component.type === 'applyStatus' && component.status) {
        reference(
          { contentType: 'skill', key, path: `components.${index}.status` },
          'status',
          component.status,
        );
      }
    });

    // A1s are the skill Provoke and counterattacks fall back to; a cooldown there
    // would leave a unit with no legal action.
    if (skill.slot === 'a1' && skill.cooldown > 0) {
      errors.push({
        severity: 'error',
        contentType: 'skill',
        key,
        path: 'cooldown',
        message: 'A1 skills must have no cooldown.',
      });
    }
    if (skill.slot !== 'a1' && skill.slot !== 'passive' && skill.cooldown === 0) {
      warnings.push({
        severity: 'warning',
        contentType: 'skill',
        key,
        path: 'cooldown',
        message: 'An active skill with no cooldown can be used every turn.',
      });
    }
  }

  for (const [key, entity] of parsed.get('champion') ?? []) {
    const champion = entity as {
      factionKey: string;
      skills: string[];
      assetKey: string;
      rarity: Rarity;
      isFood: boolean;
      baseRank?: number;
    };

    reference({ contentType: 'champion', key, path: 'factionKey' }, 'faction', champion.factionKey);
    reference({ contentType: 'champion', key, path: 'assetKey' }, 'asset', champion.assetKey);
    champion.skills.forEach((skillKey, index) => {
      reference({ contentType: 'champion', key, path: `skills.${index}` }, 'skill', skillKey);
    });

    // The star a champion starts at decides where its track ends, so a value outside the
    // rarity's range is not a taste question — it would strand the champion between two
    // ladders. An error rather than a warning, and named with the range so an operator can
    // fix it without reading the code.
    if (champion.baseRank !== undefined && !isValidBaseRank(champion.rarity, champion.baseRank)) {
      const { base } = RANK_RANGE_BY_RARITY[champion.rarity];
      const allowed = base.min === base.max ? `★${base.min}` : `★${base.min} or ★${base.max}`;
      errors.push({
        severity: 'error',
        contentType: 'champion',
        key,
        path: 'baseRank',
        message: `A ${champion.rarity} champion starts at ${allowed}; this one says ★${champion.baseRank}.`,
      });
    }

    // Kit depth by rarity is a design rule (docs/CONTENT_PLAN_EA01.md §1b); a Legendary
    // with two skills is almost certainly an unfinished draft rather than an intent.
    const expected: Record<string, number> = {
      common: 1,
      uncommon: 2,
      rare: 3,
      epic: 3,
      legendary: 4,
    };
    const minimum = expected[champion.rarity] ?? 1;
    if (!champion.isFood && champion.skills.length < minimum) {
      warnings.push({
        severity: 'warning',
        contentType: 'champion',
        key,
        path: 'skills',
        message: `${champion.rarity} champions usually have at least ${minimum} skills; this one has ${champion.skills.length}.`,
      });
    }
  }

  for (const [key, entity] of parsed.get('enemy') ?? []) {
    const enemy = entity as {
      skills: string[];
      assetKey: string;
      bossMechanics?: { addSummon?: { unitKey: string } };
    };
    reference({ contentType: 'enemy', key, path: 'assetKey' }, 'asset', enemy.assetKey);
    enemy.skills.forEach((skillKey, index) => {
      reference({ contentType: 'enemy', key, path: `skills.${index}` }, 'skill', skillKey);
    });
    const summon = enemy.bossMechanics?.addSummon;
    if (summon) {
      reference(
        { contentType: 'enemy', key, path: 'bossMechanics.addSummon.unitKey' },
        'enemy',
        summon.unitKey,
      );
    }
  }

  for (const [key, entity] of parsed.get('campaignChapter') ?? []) {
    const chapter = entity as {
      setKey?: string;
      starRewards?: { stars: number; rewards: Record<string, number> }[];
    };
    if (chapter.setKey) {
      reference({ contentType: 'campaignChapter', key, path: 'setKey' }, 'gearSet', chapter.setKey);
    }
    (chapter.starRewards ?? []).forEach((tier, index) => {
      rewardMap(
        { contentType: 'campaignChapter', key, path: `starRewards.${index}.rewards` },
        tier.rewards,
      );
    });
  }

  /**
   * Goals that name content have to resolve, for the same reason rewards do.
   *
   * "Clear fifteen floors of Wyrm's Hollow" quietly becomes uncompletable the day the keep
   * is renamed, and a goal nobody can finish is worse than one nobody was offered. Shared
   * between quests and missions because they are the same DSL, and a check that covered
   * only one of them would be a check that misses the eighty-step chain.
   */
  const goalReferences = (
    contentType: ContentType,
    key: string,
    goals: readonly { filters: Record<string, string | number> }[],
  ): void => {
    const FILTER_TARGETS: Readonly<Record<string, ContentType>> = {
      stageKey: 'stage',
      dungeonKey: 'dungeon',
      chapterKey: 'campaignChapter',
    };
    goals.forEach((goal, index) => {
      for (const [filter, target] of Object.entries(FILTER_TARGETS)) {
        const value = goal.filters[filter];
        if (typeof value === 'string') {
          reference({ contentType, key, path: `goals.${index}.filters.${filter}` }, target, value);
        }
      }
    });
  };

  for (const [key, entity] of parsed.get('quest') ?? []) {
    const quest = entity as {
      rewards?: Record<string, number>;
      goals: { type: string; filters: Record<string, string | number> }[];
    };
    rewardMap({ contentType: 'quest', key, path: 'rewards' }, quest.rewards);
    goalReferences('quest', key, quest.goals);
  }

  const missionArcs = new Map<number, Set<number>>();
  for (const [key, entity] of parsed.get('mission') ?? []) {
    const mission = entity as {
      arc: number;
      step: number;
      rewards?: Record<string, number>;
      grants?: { champions?: string[] };
      goals: { type: string; filters: Record<string, string | number> }[];
    };
    rewardMap({ contentType: 'mission', key, path: 'rewards' }, mission.rewards);
    goalReferences('mission', key, mission.goals);

    // The finale hands over a champion who cannot be summoned, so a dangling key here is
    // the difference between an eighty-step chain paying its promised prize and paying
    // nothing at all.
    (mission.grants?.champions ?? []).forEach((championKey, index) => {
      reference(
        { contentType: 'mission', key, path: `grants.champions.${index}` },
        'champion',
        championKey,
      );
    });

    const steps = missionArcs.get(mission.arc) ?? new Set<number>();
    if (steps.has(mission.step)) {
      errors.push({
        severity: 'error',
        contentType: 'mission',
        key,
        path: 'step',
        message: `Arc ${mission.arc} already has a step ${mission.step}.`,
      });
    }
    steps.add(mission.step);
    missionArcs.set(mission.arc, steps);
  }

  // An arc nobody can reach is a chain that stops. Arcs open in order, so a gap in the
  // numbering strands every arc past it — silently, and only for players who get that far.
  if (missionArcs.size > 0) {
    const highest = Math.max(...missionArcs.keys());
    for (let arc = 1; arc <= highest; arc += 1) {
      if (missionArcs.has(arc)) continue;
      errors.push({
        severity: 'error',
        contentType: 'mission',
        key: `arc ${arc}`,
        path: 'arc',
        message: `No missions in arc ${arc}, so arcs ${arc + 1}–${highest} can never open.`,
      });
    }
  }

  for (const [key, entity] of parsed.get('event') ?? []) {
    const event = entity as {
      schedule: { kind: string; startsAt?: string; endsAt?: string };
      pointRules: { filters: Record<string, string | number> }[];
      milestones: { points: number; rewards?: Record<string, number> }[];
    };

    // Point rules are goals in everything but name, so they resolve the same way.
    goalReferences('event', key, event.pointRules);
    event.milestones.forEach((rung, index) => {
      rewardMap({ contentType: 'event', key, path: `milestones.${index}.rewards` }, rung.rewards);
    });

    // A ladder out of order would let a player claim rung 5 before rung 2, and the screen
    // would draw a bar that goes backwards.
    for (let index = 1; index < event.milestones.length; index += 1) {
      if ((event.milestones[index]?.points ?? 0) > (event.milestones[index - 1]?.points ?? 0)) {
        continue;
      }
      errors.push({
        severity: 'error',
        contentType: 'event',
        key,
        path: `milestones.${index}.points`,
        message: 'Milestones must climb — each one needs more points than the one before it.',
      });
    }

    // A one-off that ends before it starts is a scheduling typo the operator will not see
    // until nobody can score on it, because it simply never appears.
    if (event.schedule.kind === 'window') {
      const startsAt = Date.parse(event.schedule.startsAt ?? '');
      const endsAt = Date.parse(event.schedule.endsAt ?? '');
      if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
        errors.push({
          severity: 'error',
          contentType: 'event',
          key,
          path: 'schedule',
          message: 'Start and end must both be timestamps.',
        });
      } else if (endsAt <= startsAt) {
        errors.push({
          severity: 'error',
          contentType: 'event',
          key,
          path: 'schedule.endsAt',
          message: 'An event cannot end before it starts.',
        });
      }
    }
  }

  // A track's *live* one is whichever of its kind is active, so two active calendars is a
  // coin toss over which one a player walks. Counted before the per-track pass so the
  // message can name the other one.
  const activeTracks = new Map<string, string[]>();
  for (const [key, entity] of parsed.get('loginTrack') ?? []) {
    const track = entity as { track: string; active: boolean };
    if (!track.active) continue;
    activeTracks.set(track.track, [...(activeTracks.get(track.track) ?? []), key]);
  }

  for (const [key, entity] of parsed.get('loginTrack') ?? []) {
    const track = entity as {
      track: string;
      active: boolean;
      days: {
        day: number;
        rewards?: Record<string, number>;
        grants: {
          champions: string[];
          choices: string[];
          relics: { setKey: string; slot: string; rank: number; rarity: string }[];
        };
      }[];
    };

    const siblings = (activeTracks.get(track.track) ?? []).filter((other) => other !== key);
    if (track.active && siblings.length > 0) {
      errors.push({
        severity: 'error',
        contentType: 'loginTrack',
        key,
        path: 'active',
        message: `Two ${track.track} tracks are active at once (also ${siblings.join(', ')}). Deactivate one — a player can only walk a single track of each kind.`,
      });
    }

    // Days are positional: the Nth claim pays the day numbered N. A gap or a duplicate
    // means some claim pays nothing at all, which is invisible until it happens.
    const seen = new Set<number>();
    track.days.forEach((entry, index) => {
      if (seen.has(entry.day)) {
        errors.push({
          severity: 'error',
          contentType: 'loginTrack',
          key,
          path: `days.${index}.day`,
          message: `Day ${entry.day} appears twice.`,
        });
      }
      seen.add(entry.day);

      rewardMap({ contentType: 'loginTrack', key, path: `days.${index}.rewards` }, entry.rewards);

      for (const championKey of entry.grants.champions) {
        reference(
          { contentType: 'loginTrack', key, path: `days.${index}.grants.champions` },
          'champion',
          championKey,
        );
      }
      for (const championKey of entry.grants.choices) {
        reference(
          { contentType: 'loginTrack', key, path: `days.${index}.grants.choices` },
          'champion',
          championKey,
        );
      }
      // A single choice is not a choice, and the claim would refuse anything else anyway.
      if (entry.grants.choices.length === 1) {
        errors.push({
          severity: 'warning',
          contentType: 'loginTrack',
          key,
          path: `days.${index}.grants.choices`,
          message:
            'A selector with one option is a grant wearing a dialog. Add options, or move it to `champions`.',
        });
      }
      entry.grants.relics.forEach((relic, relicIndex) => {
        reference(
          {
            contentType: 'loginTrack',
            key,
            path: `days.${index}.grants.relics.${relicIndex}.setKey`,
          },
          'gearSet',
          relic.setKey,
        );
      });
    });

    for (let expected = 1; expected <= track.days.length; expected += 1) {
      if (seen.has(expected)) continue;
      errors.push({
        severity: 'error',
        contentType: 'loginTrack',
        key,
        path: 'days',
        message: `Day ${expected} is missing — days must run 1–${track.days.length} with no gaps, because the Nth claim pays the day numbered N.`,
      });
    }
  }

  for (const [key, entity] of parsed.get('newsPost') ?? []) {
    const post = entity as { startsAt?: string; endsAt?: string };
    // Same trap the events have: a post whose window is nonsense simply never appears, and
    // an operator finds out by nobody mentioning the announcement.
    for (const [field, value] of [
      ['startsAt', post.startsAt],
      ['endsAt', post.endsAt],
    ] as const) {
      if (value && !Number.isFinite(Date.parse(value))) {
        errors.push({
          severity: 'error',
          contentType: 'newsPost',
          key,
          path: field,
          message: `“${value}” is not a timestamp.`,
        });
      }
    }
    if (post.startsAt && post.endsAt) {
      const starts = Date.parse(post.startsAt);
      const ends = Date.parse(post.endsAt);
      if (Number.isFinite(starts) && Number.isFinite(ends) && ends <= starts) {
        errors.push({
          severity: 'error',
          contentType: 'newsPost',
          key,
          path: 'endsAt',
          message: 'A post cannot close before it opens.',
        });
      }
    }
  }

  {
    const steps = [...(parsed.get('tutorialStep') ?? [])].map(
      ([key, entity]) =>
        [
          key,
          entity as {
            step: number;
            rewards?: Record<string, number>;
            grantsBefore?: Record<string, number>;
            grantsRelics?: { setKey: string }[];
            goal?: { type: string; filters: Record<string, string | number> };
          },
        ] as const,
    );

    const seen = new Set<number>();
    for (const [key, step] of steps) {
      if (seen.has(step.step)) {
        errors.push({
          severity: 'error',
          contentType: 'tutorialStep',
          key,
          path: 'step',
          message: `Step ${step.step} appears twice.`,
        });
      }
      seen.add(step.step);

      rewardMap({ contentType: 'tutorialStep', key, path: 'rewards' }, step.rewards);
      rewardMap({ contentType: 'tutorialStep', key, path: 'grantsBefore' }, step.grantsBefore);
      (step.grantsRelics ?? []).forEach((relic, index) => {
        reference(
          { contentType: 'tutorialStep', key, path: `grantsRelics.${index}.setKey` },
          'gearSet',
          relic.setKey,
        );
      });
      if (step.goal) goalReferences('tutorialStep', key, [step.goal]);
    }

    // The script is walked positionally, so a gap is a step nobody can ever reach.
    for (let expected = 1; expected <= steps.length; expected += 1) {
      if (seen.has(expected)) continue;
      errors.push({
        severity: 'error',
        contentType: 'tutorialStep',
        key: 'tutorial',
        path: 'step',
        message: `Step ${expected} is missing — the script must run 1–${steps.length} with no gaps.`,
      });
    }
  }

  // ── Masteries ─────────────────────────────────────────────────────────────
  //
  // Two rules, and the second is the one an operator cannot see. A tree with a missing
  // tier is a dead end, which is obvious once stated; but a tree can hold a node at every
  // tier and still **strand every build in the game**, because the budget is fifteen picks
  // with a hard allowance per tier and a champion may open at most two trees. If no pair of
  // trees can supply `MASTERY_PICKS_BY_TIER[tier]` nodes at some tier, nobody can ever
  // finish a build — a permanent, silent shortfall that publishes cleanly, looks right in
  // the editor, and shows up as a board that simply stops letting you spend.
  //
  // It is the Mistspire ward's rule in another costume (C11): validate the content against
  // the *rules that consume it*, not against itself.
  //
  // The tree list and the tier range are read from shared rather than written out here.
  // They were literals until A4, which meant a fourth tree added to `MASTERY_TREES` would
  // have escaped this check entirely — the same class of silence as a field nothing reads.
  const masteryTierCounts = new Map<string, number>();
  for (const [, entity] of parsed.get('mastery') ?? []) {
    const node = entity as { tree: string; tier: number };
    const slot = `${node.tree}:${node.tier}`;
    masteryTierCounts.set(slot, (masteryTierCounts.get(slot) ?? 0) + 1);
  }
  const nodesAt = (tree: string, tier: number): number =>
    masteryTierCounts.get(`${tree}:${tier}`) ?? 0;

  if (masteryTierCounts.size > 0) {
    for (const tree of MASTERY_TREES) {
      for (let tier = MASTERY_MIN_TIER; tier <= MASTERY_MAX_TIER; tier += 1) {
        if (nodesAt(tree, tier) > 0) continue;
        errors.push({
          severity: 'error',
          contentType: 'mastery',
          key: `${tree}_t${tier}`,
          message: `The ${tree} tree has no tier ${tier} mastery; a champion training it would hit a dead end.`,
        });
      }
    }

    // Does *some* pair of trees let a champion spend all fifteen picks? A player chooses
    // the pair, so one workable pair is the honest minimum — requiring every pair to work
    // would refuse content that is merely specialised, and requiring a single tree to work
    // would refuse the seed as it stands, which fills tier 5 only across two trees.
    const pairs: [string, string][] = [];
    for (let a = 0; a < MASTERY_TREES.length; a += 1) {
      for (let b = a + 1; b < MASTERY_TREES.length; b += 1) {
        pairs.push([MASTERY_TREES[a]!, MASTERY_TREES[b]!]);
      }
    }
    const shortfallOf = (pair: [string, string]): { tier: number; held: number } | null => {
      for (let tier = MASTERY_MIN_TIER; tier <= MASTERY_MAX_TIER; tier += 1) {
        const allowed = MASTERY_PICKS_BY_TIER[tier] ?? 0;
        const held = nodesAt(pair[0], tier) + nodesAt(pair[1], tier);
        if (held < allowed) return { tier, held };
      }
      return null;
    };
    const workable = pairs.filter((pair) => shortfallOf(pair) === null);
    if (pairs.length > 0 && workable.length === 0) {
      const worst = shortfallOf(pairs[0]!);
      errors.push({
        severity: 'error',
        contentType: 'mastery',
        key: 'mastery_build',
        message:
          `No pair of trees can fill a ${MASTERY_TOTAL_PICKS}-pick build: every pair runs out ` +
          `at tier ${worst?.tier ?? MASTERY_MIN_TIER}, which allows ` +
          `${MASTERY_PICKS_BY_TIER[worst?.tier ?? MASTERY_MIN_TIER] ?? 0} picks against ` +
          `${worst?.held ?? 0} published node${worst?.held === 1 ? '' : 's'}. Every champion in ` +
          `the game would stop short of a full board with nothing on screen to say why.`,
      });
    }
  }

  // ── Deep Runs ─────────────────────────────────────────────────────────────
  //
  // A descent is content all the way down: the rooms, the boons, the depth ladder. What
  // publish has to protect is the thing a schema cannot see — a floor with fewer rooms in
  // band than there are doors is a descent that *stalls*, and it stalls for the player who
  // is already on floor seven rather than for the operator who published it.
  for (const [key, entity] of parsed.get('deepRun') ?? []) {
    const def = entity as DeepRunDef;
    for (const problem of deepRunProblems(def)) {
      errors.push({
        severity: 'error',
        contentType: 'deepRun',
        key,
        path: 'rooms',
        message: problem,
      });
    }
    def.rooms.forEach((room, index) => {
      room.waves.forEach((wave, waveIndex) => {
        wave.forEach((unit, slot) => {
          reference(
            {
              contentType: 'deepRun',
              key,
              path: `rooms.${index}.waves.${waveIndex}.${slot}`,
            },
            'enemy',
            unit.enemyKey,
          );
        });
      });
      rewardMap({ contentType: 'deepRun', key, path: `rooms.${index}.rewards` }, room.rewards);
    });
    def.depthTiers.forEach((tier, index) => {
      rewardMap({ contentType: 'deepRun', key, path: `depthTiers.${index}.rewards` }, tier.rewards);
    });
  }

  const titanStagesByKeep = new Map<string, number>();
  const worldBossStagesByKeep = new Map<string, number>();
  const spireFloorsByKeep = new Map<string, Set<number>>();
  for (const [, entity] of parsed.get('stage') ?? []) {
    const stage = entity as { mode: string; parentKey: string; number: number };
    if (stage.mode === 'titan') {
      titanStagesByKeep.set(stage.parentKey, (titanStagesByKeep.get(stage.parentKey) ?? 0) + 1);
    }
    if (stage.mode === 'worldBoss') {
      worldBossStagesByKeep.set(
        stage.parentKey,
        (worldBossStagesByKeep.get(stage.parentKey) ?? 0) + 1,
      );
    }
    if (stage.mode === 'spire') {
      let floors = spireFloorsByKeep.get(stage.parentKey);
      if (!floors) {
        floors = new Set<number>();
        spireFloorsByKeep.set(stage.parentKey, floors);
      }
      floors.add(stage.number);
    }
  }

  // Every champion in the game, in the shape a ward is judged against. Built once, because
  // the supply check below runs per warded floor and the roster is read the same way each
  // time. Food is carried rather than filtered here so `restrictionSupply` owns that rule.
  const allChampions = [...(parsed.get('champion') ?? [])].map(([championKey, entity]) => {
    const champion = entity as {
      name: string;
      factionKey: string;
      element: string;
      role: string;
      rarity: string;
      isFood?: boolean;
    };
    return {
      key: championKey,
      name: champion.name,
      factionKey: champion.factionKey,
      element: champion.element,
      role: champion.role,
      rarity: champion.rarity as Rarity,
      isFood: champion.isFood ?? false,
    };
  });

  for (const [key, entity] of parsed.get('dungeon') ?? []) {
    const dungeon = entity as {
      kind: string;
      setKeys: string[];
      itemKeys: string[];
      bossEnemyKey?: string;
      openDays: number[];
      titan?: TitanRules;
      worldBoss?: WorldBossRules;
      spire?: SpireRules;
      floors: number;
    };

    // A Titan is the one dungeon kind whose rules are the mode. Without them there is no
    // cap, no keys and no ladder — a run could never end and could never pay — so this is
    // refused at publish rather than discovered by the first player to press the button.
    if (dungeon.kind === 'titan') {
      if (!dungeon.titan) {
        errors.push({
          severity: 'error',
          contentType: 'dungeon',
          key,
          path: 'titan',
          message: 'A Titan needs its rules: a turn cap, its keys a day, and a damage ladder.',
        });
      } else {
        for (const problem of titanRuleProblems(dungeon.titan)) {
          errors.push({
            severity: 'error',
            contentType: 'dungeon',
            key,
            path: 'titan.tiers',
            message: problem,
          });
        }
      }

      // Exactly one stage, because a Titan is one fight. Two would make "the Titan run"
      // ambiguous everywhere it is looked up; none makes the keep unfightable.
      const stages = titanStagesByKeep.get(key) ?? 0;
      if (stages !== 1) {
        errors.push({
          severity: 'error',
          contentType: 'dungeon',
          key,
          path: 'titan',
          message:
            stages === 0
              ? 'A Titan needs exactly one `titan` stage to be fought on, and has none.'
              : `A Titan is one fight; this keep has ${stages} titan stages.`,
        });
      }
    } else if (dungeon.titan) {
      errors.push({
        severity: 'error',
        contentType: 'dungeon',
        key,
        path: 'titan',
        message: `Titan rules belong to a titan keep; this one is ${dungeon.kind}. They would be read by nothing.`,
      });
    }

    // A world boss is the Titan's rule applied to a shared pool, and it is refused on the
    // same terms: without the block there is no schedule to wake on, no pool to empty and
    // no ladder to pay, so the whole mode is missing rather than merely mis-tuned.
    if (dungeon.kind === 'worldBoss') {
      if (!dungeon.worldBoss) {
        errors.push({
          severity: 'error',
          contentType: 'dungeon',
          key,
          path: 'worldBoss',
          message:
            'A world boss needs its rules: when it wakes, how much health the vale has to get through, and what contributing pays.',
        });
      } else {
        for (const problem of worldBossRuleProblems(dungeon.worldBoss)) {
          errors.push({
            severity: 'error',
            contentType: 'dungeon',
            key,
            path: 'worldBoss.tiers',
            message: problem,
          });
        }
        rewardMap(
          { contentType: 'dungeon', key, path: 'worldBoss.fellingRewards' },
          dungeon.worldBoss.fellingRewards,
        );
        dungeon.worldBoss.tiers.forEach((tier, index) => {
          rewardMap(
            { contentType: 'dungeon', key, path: `worldBoss.tiers.${index}.rewards` },
            tier.rewards,
          );
        });
      }

      const stages = worldBossStagesByKeep.get(key) ?? 0;
      if (stages !== 1) {
        errors.push({
          severity: 'error',
          contentType: 'dungeon',
          key,
          path: 'worldBoss',
          message:
            stages === 0
              ? 'A world boss needs exactly one `worldBoss` stage to be struck on, and has none.'
              : `A world boss is one fight; this keep has ${stages} worldBoss stages.`,
        });
      }
    } else if (dungeon.worldBoss) {
      errors.push({
        severity: 'error',
        contentType: 'dungeon',
        key,
        path: 'worldBoss',
        message: `World boss rules belong to a worldBoss keep; this one is ${dungeon.kind}. They would be read by nothing.`,
      });
    }

    // The Mistspire, on the same terms as the other two: without the block there are no
    // keys to spend and no landings to pay, so the tower is a stack of stages rather than
    // a mode. Its own extra rule is that the floors have to be *contiguous from one* —
    // a climb is walked in order, so a gap at floor 7 is a tower nobody can finish.
    if (dungeon.kind === 'spire') {
      if (!dungeon.spire) {
        errors.push({
          severity: 'error',
          contentType: 'dungeon',
          key,
          path: 'spire',
          message:
            'A spire needs its rules: its keys a day, how often a keeper stands in the way, and the landings a climb pays at.',
        });
      } else {
        for (const problem of spireRuleProblems(dungeon.spire, dungeon.floors)) {
          errors.push({
            severity: 'error',
            contentType: 'dungeon',
            key,
            path: 'spire.landings',
            message: problem,
          });
        }
        dungeon.spire.landings.forEach((landing, index) => {
          rewardMap(
            { contentType: 'dungeon', key, path: `spire.landings.${index}.rewards` },
            landing.rewards,
          );
        });
      }

      const floors = spireFloorsByKeep.get(key) ?? new Set<number>();
      const missing: number[] = [];
      for (let floor = 1; floor <= dungeon.floors; floor += 1) {
        if (!floors.has(floor)) missing.push(floor);
      }
      if (missing.length > 0) {
        errors.push({
          severity: 'error',
          contentType: 'dungeon',
          key,
          path: 'floors',
          message: `A climb is walked in order, so every floor needs a stage. Missing: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? `, and ${missing.length - 8} more` : ''}.`,
        });
      }
    } else if (dungeon.spire) {
      errors.push({
        severity: 'error',
        contentType: 'dungeon',
        key,
        path: 'spire',
        message: `Spire rules belong to a spire; this one is ${dungeon.kind}. They would be read by nothing.`,
      });
    }

    dungeon.setKeys.forEach((setKey, index) => {
      reference({ contentType: 'dungeon', key, path: `setKeys.${index}` }, 'gearSet', setKey);
    });
    dungeon.itemKeys.forEach((itemKey, index) => {
      reference({ contentType: 'dungeon', key, path: `itemKeys.${index}` }, 'item', itemKey);
    });
    if (dungeon.bossEnemyKey) {
      reference(
        { contentType: 'dungeon', key, path: 'bossEnemyKey' },
        'enemy',
        dungeon.bossEnemyKey,
      );
    }

    // A rotation that names the same day twice is not wrong so much as confused, and it
    // would make the hub's "next open" line say something silly.
    if (new Set(dungeon.openDays).size !== dungeon.openDays.length) {
      errors.push({
        severity: 'error',
        contentType: 'dungeon',
        key,
        path: 'openDays',
        message: 'A rotation day is listed twice.',
      });
    }
  }

  for (const [key, entity] of parsed.get('stage') ?? []) {
    const stage = entity as {
      mode: string;
      parentKey: string;
      waves: { enemyKey: string; slot: number }[][];
      rewards: { drops?: { items?: { itemKey: string }[]; gearSetKeys?: string[] } };
      firstClearRewards?: Record<string, number>;
      presetTeam?: { championKey: string; relics?: { setKey: string }[] }[];
      trial?: { parTurns: number; parRewards?: Record<string, number> };
      teamRestriction?: TeamRestriction;
    };

    rewardMap({ contentType: 'stage', key, path: 'firstClearRewards' }, stage.firstClearRewards);
    rewardMap({ contentType: 'stage', key, path: 'trial.parRewards' }, stage.trial?.parRewards);

    if (stage.mode === 'campaign') {
      reference(
        { contentType: 'stage', key, path: 'parentKey' },
        'campaignChapter',
        stage.parentKey,
      );
    }

    // Every Depths mode hangs off a dungeon, so a floor whose keep was deleted would be a
    // stage nothing can reach — invisible on the hub, and still fightable by key.
    if (
      stage.mode === 'dungeon' ||
      stage.mode === 'springs' ||
      stage.mode === 'proving' ||
      stage.mode === 'titan'
    ) {
      reference({ contentType: 'stage', key, path: 'parentKey' }, 'dungeon', stage.parentKey);
    }

    // A Titan is fought in one wave against one thing. Waves would mean a "boss" you clear
    // your way to, which is a dungeon floor; a second enemy would mean damage split across
    // targets, and the ladder is about damage done to the Titan.
    if (stage.mode === 'titan') {
      const units = stage.waves.flat();
      if (stage.waves.length !== 1 || units.length !== 1) {
        errors.push({
          severity: 'error',
          contentType: 'stage',
          key,
          path: 'waves',
          message: 'A Titan run is one wave against one Titan, and nothing else.',
        });
      }
    }

    // A borrowed team belongs to the cold open and to a trial, and nowhere else. On any
    // other stage it would be a roster the player never chose, silently replacing the one
    // they did — so it is refused here rather than ignored at runtime, where nobody would
    // see it.
    const presetTeam = stage.presetTeam ?? [];
    const borrows = stage.mode === 'tutorial' || stage.mode === 'trial';
    if (borrows) {
      if (presetTeam.length === 0) {
        errors.push({
          severity: 'error',
          contentType: 'stage',
          key,
          path: 'presetTeam',
          message: `A ${stage.mode} stage is fought with the team it carries, and this one carries nobody.`,
        });
      }
    } else if (presetTeam.length > 0) {
      errors.push({
        severity: 'error',
        contentType: 'stage',
        key,
        path: 'presetTeam',
        message: `Only a tutorial or trial stage brings its own team; this one is ${stage.mode}. The player's team is the only team here.`,
      });
    }

    // A par is what makes a trial a trial, and it is meaningless anywhere else — a campaign
    // stage carrying one would publish a bonus nothing pays.
    if (stage.mode === 'trial') {
      if (!stage.trial) {
        errors.push({
          severity: 'error',
          contentType: 'stage',
          key,
          path: 'trial',
          message: 'A trial needs a par to beat. Without one there is nothing to solve.',
        });
      }
    } else if (stage.trial) {
      errors.push({
        severity: 'error',
        contentType: 'stage',
        key,
        path: 'trial',
        message: `Only a trial stage carries a par; this one is ${stage.mode}.`,
      });
    }

    // A ward is the Mistspire's whole mechanic, and the one piece of content in the game
    // that can be **authored into an impossibility that looks fine in the editor**: a floor
    // warded to a faction with three champions in it is a floor no account can ever field a
    // team for, and nothing about the entity says so. This is the check that catches it, and
    // it is the reason a ward is validated against the roster rather than against itself.
    //
    // Mistvale's own numbers are why it is not hypothetical: 37 champions over eight
    // factions, and three of those factions hold two or three champions each.
    if (stage.teamRestriction) {
      if (stage.mode !== 'spire') {
        errors.push({
          severity: 'error',
          contentType: 'stage',
          key,
          path: 'teamRestriction',
          message: `Only a spire floor is warded; this one is ${stage.mode}. A stage that quietly locked out half a roster would be a difficulty spike with no explanation on it.`,
        });
      }
      // A faction ward names published content, so it is a reference; the other three name
      // enum values the schema cannot check because `value` is one field serving four kinds.
      const ward = stage.teamRestriction;
      const vocabulary: Record<string, readonly string[]> = {
        element: ELEMENTS,
        role: ROLES,
        minRarity: RARITIES,
      };
      const allowed = vocabulary[ward.kind];
      if (ward.kind === 'faction') {
        reference(
          { contentType: 'stage', key, path: 'teamRestriction.value' },
          'faction',
          ward.value,
        );
      } else if (allowed && !allowed.includes(ward.value)) {
        errors.push({
          severity: 'error',
          contentType: 'stage',
          key,
          path: 'teamRestriction.value',
          message: `"${ward.value}" is not ${ward.kind === 'minRarity' ? 'a rarity' : `a ${ward.kind}`}. Expected one of: ${allowed.join(', ')}.`,
        });
      }

      const supply = restrictionSupply(ward, allChampions);
      if (supply < WARD_MIN_SUPPLY) {
        errors.push({
          severity: 'error',
          contentType: 'stage',
          key,
          path: 'teamRestriction',
          message: `This floor wards to "${ward.value}", which ${supply === 0 ? 'no champion' : `only ${supply} champion${supply === 1 ? '' : 's'}`} in the game satisfies. A team of ${WARD_MIN_SUPPLY} could never be fielded for it.`,
        });
      }
    }

    presetTeam.forEach((member, index) => {
      reference(
        { contentType: 'stage', key, path: `presetTeam.${index}.championKey` },
        'champion',
        member.championKey,
      );
      (member.relics ?? []).forEach((relic, relicIndex) => {
        reference(
          { contentType: 'stage', key, path: `presetTeam.${index}.relics.${relicIndex}.setKey` },
          'gearSet',
          relic.setKey,
        );
      });
    });

    (stage.rewards.drops?.gearSetKeys ?? []).forEach((setKey, index) => {
      reference(
        { contentType: 'stage', key, path: `rewards.drops.gearSetKeys.${index}` },
        'gearSet',
        setKey,
      );
    });

    stage.waves.forEach((wave, waveIndex) => {
      const slots = new Set<number>();
      wave.forEach((unit, unitIndex) => {
        reference(
          { contentType: 'stage', key, path: `waves.${waveIndex}.${unitIndex}.enemyKey` },
          'enemy',
          unit.enemyKey,
        );
        if (slots.has(unit.slot)) {
          errors.push({
            severity: 'error',
            contentType: 'stage',
            key,
            path: `waves.${waveIndex}.${unitIndex}.slot`,
            message: `Two enemies occupy slot ${unit.slot} in wave ${waveIndex + 1}.`,
          });
        }
        slots.add(unit.slot);
      });
    });

    // A drop naming an item that no longer exists would be a silent hole in the reward
    // table: the fight pays out and the player simply never receives the thing.
    (stage.rewards.drops?.items ?? []).forEach((drop, index) => {
      reference(
        { contentType: 'stage', key, path: `rewards.drops.items.${index}.itemKey` },
        'item',
        drop.itemKey,
      );
    });
  }

  for (const [key, entity] of parsed.get('summonPool') ?? []) {
    const pool = entity as {
      sigilKey: string;
      rates: Record<string, number>;
      entries: { championKey: string }[];
      tenPullFloor?: string;
    };

    reference({ contentType: 'summonPool', key, path: 'sigilKey' }, 'item', pool.sigilKey);

    // The advertised odds are a promise. A table that does not sum to one would make the
    // Odds & Mercy panel a lie, so it cannot reach players at all.
    const total = Object.values(pool.rates).reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 1) > 1e-6) {
      errors.push({
        severity: 'error',
        contentType: 'summonPool',
        key,
        path: 'rates',
        message: `Rarity rates sum to ${total.toFixed(4)}; they must sum to exactly 1.`,
      });
    }

    const championRarity = new Map<string, string>();
    for (const [championKey, champion] of parsed.get('champion') ?? []) {
      championRarity.set(championKey, (champion as { rarity: string }).rarity);
    }

    const covered = new Set<string>();
    pool.entries.forEach((poolEntry, index) => {
      reference(
        { contentType: 'summonPool', key, path: `entries.${index}.championKey` },
        'champion',
        poolEntry.championKey,
      );
      const rarity = championRarity.get(poolEntry.championKey);
      if (rarity) covered.add(rarity);
    });

    // A rarity the pool advertises but cannot deliver would silently fall through to a
    // lower one — the player would see a rate they can never actually hit.
    for (const [rarity, rate] of Object.entries(pool.rates)) {
      if (rate > 0 && !covered.has(rarity)) {
        errors.push({
          severity: 'error',
          contentType: 'summonPool',
          key,
          path: 'rates',
          message: `Advertises a ${rarity} rate of ${rate} but contains no ${rarity} champion.`,
        });
      }
    }

    if (pool.tenPullFloor && !covered.has(pool.tenPullFloor)) {
      errors.push({
        severity: 'error',
        contentType: 'summonPool',
        key,
        path: 'tenPullFloor',
        message: `Guarantees a ${pool.tenPullFloor} but contains none.`,
      });
    }
  }

  for (const [key, entity] of parsed.get('shop') ?? []) {
    const shop = entity as {
      baseSlots: number;
      crystalSlots: number;
      offers: {
        key: string;
        kind: string;
        refKey: string;
        gear?: { rankMin: number; rankMax: number; setKeys: string[] };
      }[];
    };

    const offerKeys = new Set<string>();
    shop.offers.forEach((offer, index) => {
      const path = `offers.${index}`;
      if (offerKeys.has(offer.key)) {
        errors.push({
          severity: 'error',
          contentType: 'shop',
          key,
          path: `${path}.key`,
          message: `Two offers share the key "${offer.key}"; purchase limits are tracked by it.`,
        });
      }
      offerKeys.add(offer.key);

      if (offer.kind === 'item') {
        reference({ contentType: 'shop', key, path: `${path}.refKey` }, 'item', offer.refKey);
      }
      if (offer.kind === 'champion') {
        reference({ contentType: 'shop', key, path: `${path}.refKey` }, 'champion', offer.refKey);
      }
      // A currency offer pays a *scalar* — silver, crystals, valor medals, energy, hours of
      // XP boost — and there is no content entity to point at, so the reference check that
      // guards the other kinds cannot help. Refused by name instead, because the failure it
      // prevents is the worst kind a shop can have: an offer that takes the payment and
      // grants nothing, with the player's crystals already gone.
      if (offer.kind === 'currency' && !isRewardScalar(offer.refKey)) {
        errors.push({
          severity: 'error',
          contentType: 'shop',
          key,
          path: `${path}.refKey`,
          message: `"${offer.refKey}" is not something a currency offer can pay. Use one of: ${REWARD_SCALARS.join(', ')}.`,
        });
      }
      if (offer.kind === 'gear') {
        if (!offer.gear) {
          errors.push({
            severity: 'error',
            contentType: 'shop',
            key,
            path: `${path}.gear`,
            message: 'A relic offer needs a rank and rarity band to roll from.',
          });
        } else {
          if (offer.gear.rankMin > offer.gear.rankMax) {
            errors.push({
              severity: 'error',
              contentType: 'shop',
              key,
              path: `${path}.gear.rankMin`,
              message: `Minimum rank ${offer.gear.rankMin} is above the maximum ${offer.gear.rankMax}.`,
            });
          }
          for (const setKey of offer.gear.setKeys) {
            reference(
              { contentType: 'shop', key, path: `${path}.gear.setKeys` },
              'gearSet',
              setKey,
            );
          }
        }
      }
    });

    // Every slot has to be fillable, or a player stares at an empty shelf.
    if (shop.offers.length < shop.baseSlots) {
      warnings.push({
        severity: 'warning',
        contentType: 'shop',
        key,
        path: 'offers',
        message: `${shop.offers.length} offers cannot fill ${shop.baseSlots} slots without repeating.`,
      });
    }
  }

  // A relic stat nothing can roll is dead content: no slot lists it as a main and it is
  // barred from substats, so it can never appear on a piece.
  const mainStatsBySlot = new Set<string>();
  for (const [, entity] of parsed.get('gearSlot') ?? []) {
    for (const stat of (entity as { allowedMainStats: string[] }).allowedMainStats) {
      mainStatsBySlot.add(stat);
    }
  }
  for (const [key, entity] of parsed.get('gearStat') ?? []) {
    const def = entity as { stat: string; canBeMain: boolean; canBeSub: boolean };
    if (!def.canBeSub && !(def.canBeMain && mainStatsBySlot.has(def.stat))) {
      warnings.push({
        severity: 'warning',
        contentType: 'gearStat',
        key,
        message: 'No slot can roll this as a main stat and it is barred from substats.',
      });
    }
  }

  // Nothing may reference a champion that is not summonable and not obtainable
  // elsewhere — a silent dead end for collectors.
  const summonableChampions = [...(parsed.get('champion') ?? [])].filter(
    ([, entity]) => (entity as { summonable: boolean; isFood: boolean }).summonable,
  );
  if (summonableChampions.length === 0 && (parsed.get('champion')?.size ?? 0) > 0) {
    warnings.push({
      severity: 'warning',
      contentType: 'champion',
      key: '*',
      message: 'No champion is summonable, so the Mistgate would have an empty pool.',
    });
  }

  return {
    result: { ok: errors.length === 0, errors, warnings, checked },
    normalised: parsed,
  };
}

/**
 * Validates a content set.
 *
 * The serialisable half of {@link validateAndNormalise}, for callers that only want to
 * know whether the content is sound — the validate endpoint, and publish's pre-flight.
 */
export function validateContentSet(content: ContentSet): ContentValidationResult {
  return validateAndNormalise(content).result;
}
