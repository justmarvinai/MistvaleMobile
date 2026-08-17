import {
  CONTENT_LOAD_ORDER,
  CONTENT_REGISTRY,
  EFFECT_COMPONENT_TYPES,
  STATUS_ENGINE_TYPES,
  rewardItemKeys,
  type ContentIssue,
  type ContentType,
  type ContentValidationResult,
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
      rarity: string;
      isFood: boolean;
    };

    reference({ contentType: 'champion', key, path: 'factionKey' }, 'faction', champion.factionKey);
    reference({ contentType: 'champion', key, path: 'assetKey' }, 'asset', champion.assetKey);
    champion.skills.forEach((skillKey, index) => {
      reference({ contentType: 'champion', key, path: `skills.${index}` }, 'skill', skillKey);
    });

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

  // A tree needs enough nodes at each tier to satisfy the pick rules, or a player who
  // commits to it hits a wall the UI cannot explain.
  const masteryTierCounts = new Map<string, number>();
  for (const [, entity] of parsed.get('mastery') ?? []) {
    const node = entity as { tree: string; tier: number };
    const slot = `${node.tree}:${node.tier}`;
    masteryTierCounts.set(slot, (masteryTierCounts.get(slot) ?? 0) + 1);
  }
  if (masteryTierCounts.size > 0) {
    for (const tree of ['onslaught', 'bulwark', 'insight']) {
      for (let tier = 1; tier <= 6; tier += 1) {
        const held = masteryTierCounts.get(`${tree}:${tier}`) ?? 0;
        if (held > 0) continue;
        errors.push({
          severity: 'error',
          contentType: 'mastery',
          key: `${tree}_t${tier}`,
          message: `The ${tree} tree has no tier ${tier} mastery; a champion training it would hit a dead end.`,
        });
      }
    }
  }

  for (const [key, entity] of parsed.get('dungeon') ?? []) {
    const dungeon = entity as {
      kind: string;
      setKeys: string[];
      itemKeys: string[];
      bossEnemyKey?: string;
      openDays: number[];
    };

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
    };

    rewardMap({ contentType: 'stage', key, path: 'firstClearRewards' }, stage.firstClearRewards);

    if (stage.mode === 'campaign') {
      reference(
        { contentType: 'stage', key, path: 'parentKey' },
        'campaignChapter',
        stage.parentKey,
      );
    }

    // Every Depths mode hangs off a dungeon, so a floor whose keep was deleted would be a
    // stage nothing can reach — invisible on the hub, and still fightable by key.
    if (stage.mode === 'dungeon' || stage.mode === 'springs' || stage.mode === 'proving') {
      reference({ contentType: 'stage', key, path: 'parentKey' }, 'dungeon', stage.parentKey);
    }

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
