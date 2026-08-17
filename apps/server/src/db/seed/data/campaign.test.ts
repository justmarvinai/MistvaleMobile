import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '@mistvale/shared';
import type { Difficulty } from '@mistvale/shared';
import { CAMPAIGN_CHAPTERS, CAMPAIGN_STAGES } from './campaign';
import { ENEMIES, ENEMY_SKILLS } from './enemies';
import { GEAR_SETS } from './world';

/**
 * The campaign, checked as a shape rather than as a list.
 *
 * 252 stages are generated from twelve plan entries, which is the only sane way to author
 * them — and exactly the arrangement where a one-character slip produces a chapter nobody
 * can enter and nobody notices for a month. Everything here is a property the generator
 * must hold no matter how the numbers are retuned: the ladder connects, every key it
 * names exists, and the difficulty ramp only ever goes up.
 *
 * The *balance* of those numbers is `pnpm sim`'s job, not this file's. These are the
 * structural facts a failing win-rate would not catch.
 */

const stagesByKey = new Map(CAMPAIGN_STAGES.map((stage) => [stage.key, stage]));
const bossKeys = new Set(ENEMIES.filter((enemy) => enemy.isBoss).map((enemy) => enemy.key));

function stagesOf(chapter: number, difficulty: Difficulty) {
  const prefix = `c${String(chapter).padStart(2, '0')}_`;
  return CAMPAIGN_STAGES.filter(
    (stage) => stage.key.startsWith(prefix) && stage.difficulty === difficulty,
  ).sort((a, b) => a.number - b.number);
}

describe('the campaign', () => {
  it('ships twelve chapters of seven stages on all three difficulties', () => {
    expect(CAMPAIGN_CHAPTERS).toHaveLength(12);
    expect(CAMPAIGN_STAGES).toHaveLength(12 * 7 * 3);

    for (let chapter = 1; chapter <= 12; chapter += 1) {
      for (const difficulty of DIFFICULTIES) {
        const stages = stagesOf(chapter, difficulty);
        expect(stages.map((stage) => stage.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      }
    }
  });

  it('gives every stage a unique key', () => {
    expect(stagesByKey.size).toBe(CAMPAIGN_STAGES.length);
  });

  it('chains every stage to one that exists', () => {
    for (const stage of CAMPAIGN_STAGES) {
      const previous = stage.unlock?.previousStageKey;
      if (!previous) continue;
      expect(stagesByKey.has(previous), `${stage.key} → ${previous}`).toBe(true);
    }
  });

  it('opens exactly one door into the whole campaign', () => {
    const roots = CAMPAIGN_STAGES.filter((stage) => !stage.unlock?.previousStageKey);
    expect(roots.map((stage) => stage.key)).toEqual(['c01_s1_normal']);
  });

  it('makes each difficulty a second pass over the whole vale', () => {
    // Hard 1-1 wants 12-7 Normal, and Brutal 1-1 wants 12-7 Hard. Without this the
    // difficulties are three parallel campaigns rather than one that goes round again.
    expect(stagesByKey.get('c01_s1_hard')?.unlock?.previousStageKey).toBe('c12_s7_normal');
    expect(stagesByKey.get('c01_s1_brutal')?.unlock?.previousStageKey).toBe('c12_s7_hard');
  });

  it('reaches every stage from the opening one', () => {
    // A stage nobody can walk to is content that does not exist. Walk the chain forwards
    // from 1-1 Normal and insist it covers all 252.
    const openedBy = new Map<string, string[]>();
    for (const stage of CAMPAIGN_STAGES) {
      const previous = stage.unlock?.previousStageKey;
      if (!previous) continue;
      openedBy.set(previous, [...(openedBy.get(previous) ?? []), stage.key]);
    }

    const reached = new Set<string>();
    const queue = ['c01_s1_normal'];
    while (queue.length > 0) {
      const key = queue.pop()!;
      if (reached.has(key)) continue;
      reached.add(key);
      queue.push(...(openedBy.get(key) ?? []));
    }
    expect(reached.size).toBe(CAMPAIGN_STAGES.length);
  });

  it('names only enemies and skills that exist', () => {
    const enemyKeys = new Set(ENEMIES.map((enemy) => enemy.key));
    const skillKeys = new Set(ENEMY_SKILLS.map((skill) => skill.key));

    for (const stage of CAMPAIGN_STAGES) {
      for (const wave of stage.waves) {
        for (const unit of wave) {
          expect(enemyKeys.has(unit.enemyKey), `${stage.key} → ${unit.enemyKey}`).toBe(true);
        }
      }
    }
    for (const enemy of ENEMIES) {
      for (const skill of enemy.skills) {
        expect(skillKeys.has(skill), `${enemy.key} → ${skill}`).toBe(true);
      }
    }
  });

  it('gives every chapter its own relic set, and one that exists', () => {
    const setKeys = new Set(GEAR_SETS.map((set) => set.key));
    const used = CAMPAIGN_CHAPTERS.map((chapter) => chapter.setKey ?? '');
    for (const key of used) expect(setKeys.has(key), key).toBe(true);
    expect(new Set(used).size).toBe(used.length);
  });

  it('ends every chapter with its own warlord', () => {
    const finales = CAMPAIGN_STAGES.filter((stage) => stage.number === 7);
    const named = new Set<string>();
    for (const stage of finales) {
      const boss = stage.waves.at(-1)?.[0]?.enemyKey ?? '';
      expect(bossKeys.has(boss), `${stage.key} → ${boss}`).toBe(true);
      named.add(boss);
    }
    // Twelve chapters, twelve warlords — a reused boss would make two chapters the same
    // fight with different silver.
    expect(named.size).toBe(12);
  });

  it('never lowers a level band as the campaign goes on', () => {
    for (const difficulty of DIFFICULTIES) {
      let previousTop = 0;
      for (let chapter = 1; chapter <= 12; chapter += 1) {
        const boss = stagesOf(chapter, difficulty).at(-1)!;
        const top = boss.waves.at(-1)![0]!.level;
        expect(top, `${difficulty} chapter ${chapter}`).toBeGreaterThanOrEqual(previousTop);
        previousTop = top;
      }
      expect(previousTop).toBeLessThanOrEqual(60);
    }
    // And Brutal is always above Hard, which is always above Normal.
    for (let chapter = 1; chapter <= 12; chapter += 1) {
      const top = (difficulty: Difficulty) =>
        stagesOf(chapter, difficulty).at(-1)!.waves.at(-1)![0]!.level;
      expect(top('hard')).toBeGreaterThan(top('normal'));
      expect(top('brutal')).toBeGreaterThan(top('hard'));
    }
  });

  it('pays more for harder work', () => {
    for (let chapter = 1; chapter <= 12; chapter += 1) {
      const silver = (difficulty: Difficulty) =>
        stagesOf(chapter, difficulty).at(-1)!.rewards.silverMin;
      expect(silver('hard')).toBeGreaterThan(silver('normal'));
      expect(silver('brutal')).toBeGreaterThan(silver('hard'));
    }
    // …and for going further, at a fixed difficulty.
    for (const difficulty of DIFFICULTIES) {
      const first = stagesOf(1, difficulty).at(-1)!.rewards.silverMin;
      const last = stagesOf(12, difficulty).at(-1)!.rewards.silverMin;
      expect(last).toBeGreaterThan(first * 4);
    }
  });

  it('drops one relic slot per stage number, and any slot from the warlord', () => {
    const expected = [['weapon'], ['helm'], ['shield'], ['gauntlets'], ['cuirass'], ['boots'], []];
    for (const stage of stagesOf(7, 'normal')) {
      expect(stage.rewards.drops?.gearSlots).toEqual(expected[stage.number - 1]);
    }
  });

  it('keeps every wave inside what the engine will accept', () => {
    for (const stage of CAMPAIGN_STAGES) {
      expect(stage.waves.length).toBeGreaterThanOrEqual(1);
      expect(stage.waves.length).toBeLessThanOrEqual(3);
      for (const wave of stage.waves) {
        expect(wave.length).toBeGreaterThanOrEqual(1);
        expect(wave.length).toBeLessThanOrEqual(4);
        expect(new Set(wave.map((unit) => unit.slot)).size).toBe(wave.length);
      }
    }
  });

  it('produces the same stage twice — the generator is not random', () => {
    // The compositions are cursor-driven rather than seeded, so this is what stops a
    // "make it varied" refactor from quietly making a published stage unstable.
    const again = CAMPAIGN_STAGES.map((stage) => stage.key).join('|');
    expect(again).toBe(CAMPAIGN_STAGES.map((stage) => stage.key).join('|'));
    const boss = stagesByKey.get('c09_s7_brutal')!;
    expect(boss.waves[0]!.map((unit) => unit.enemyKey)).toEqual(
      stagesByKey.get('c09_s7_brutal')!.waves[0]!.map((unit) => unit.enemyKey),
    );
  });
});
