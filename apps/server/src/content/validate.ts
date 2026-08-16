import {
  CONTENT_LOAD_ORDER,
  CONTENT_REGISTRY,
  EFFECT_COMPONENT_TYPES,
  STATUS_ENGINE_TYPES,
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
    const chapter = entity as { setKey?: string };
    if (chapter.setKey) {
      reference({ contentType: 'campaignChapter', key, path: 'setKey' }, 'gearSet', chapter.setKey);
    }
  }

  for (const [key, entity] of parsed.get('stage') ?? []) {
    const stage = entity as {
      mode: string;
      parentKey: string;
      waves: { enemyKey: string; slot: number }[][];
    };

    if (stage.mode === 'campaign') {
      reference(
        { contentType: 'stage', key, path: 'parentKey' },
        'campaignChapter',
        stage.parentKey,
      );
    }

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
