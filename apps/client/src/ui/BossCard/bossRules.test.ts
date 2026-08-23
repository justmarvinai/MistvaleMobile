import { describe, expect, it } from 'vitest';
import { bossRules, stageBoss, type BossMechanics } from './bossRules';

describe('bossRules', () => {
  it('says nothing about a fight with no rules', () => {
    expect(bossRules(undefined)).toEqual([]);
    expect(bossRules({} as BossMechanics)).toEqual([]);
  });

  it('turns each flag into a sentence about what to do', () => {
    const rules = bossRules({
      almightyImmunity: true,
      tmReductionImmune: true,
      enrage: { afterTurn: 20, dmgPctPerTurn: 8 },
    } as BossMechanics);
    expect(rules).toHaveLength(3);
    for (const rule of rules) {
      expect(rule.label).toBeTruthy();
      expect(rule.detail).toBeTruthy();
      expect(rule.glyph).toBeTruthy();
    }
  });

  it('puts the enrage numbers in the words, because the clock is the mechanic', () => {
    const [rule] = bossRules({ enrage: { afterTurn: 15, dmgPctPerTurn: 12 } } as BossMechanics);
    expect(rule?.label).toContain('15');
    expect(rule?.detail).toContain('12%');
  });

  it('leaves out what is not set — an unhurried boss is not every boss', () => {
    const rules = bossRules({ almightyImmunity: true, tmReductionImmune: false } as BossMechanics);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.label).toBe('Unbreakable');
  });

  it('states the hit shield, which is the one mechanic that picks the team', () => {
    // Everything else on a boss card changes how a champion is *geared*; a hit counter
    // changes *which champions belong on the team*, and it is the whole puzzle of the
    // Titan. It was carried in content from P6 and said by nothing until C9.
    const [rule] = bossRules({ hitShield: { hits: 5, punishTmPct: 40 } } as BossMechanics);
    expect(rule?.label).toContain('5');
    expect(rule?.detail).toMatch(/multi-hit/i);
    expect(rule?.detail).toContain('40%');
  });

  it('states the retaliation, and whether damage-over-time sets it off', () => {
    const [chips] = bossRules({
      thresholdRetaliation: { perHpPct: 10, skipIfDot: true },
    } as BossMechanics);
    expect(chips?.detail).toMatch(/poison and burns do not/i);

    const [always] = bossRules({
      thresholdRetaliation: { perHpPct: 10, skipIfDot: false },
    } as BossMechanics);
    expect(always?.detail).toMatch(/however the damage arrived/i);
  });

  it('states the adds and how many of them there can be', () => {
    const [rule] = bossRules({
      addSummon: { unitKey: 'brood', perTurn: 2, cap: 6 },
    } as BossMechanics);
    expect(rule?.detail).toContain('2');
    expect(rule?.detail).toContain('6');
  });

  it('has a sentence for every mechanic content can carry', () => {
    // The guard that makes this file's own promise true: a mechanic added to the schema
    // and left unsaid here is silence on a screen, which is the exact failure the card was
    // written to fix. Counted rather than named, so a seventh mechanic fails here.
    const everything = bossRules({
      almightyImmunity: true,
      tmReductionImmune: true,
      hitShield: { hits: 5, punishTmPct: 40 },
      thresholdRetaliation: { perHpPct: 10, skipIfDot: true },
      addSummon: { unitKey: 'brood', perTurn: 2, cap: 6 },
      enrage: { afterTurn: 30, dmgPctPerTurn: 5 },
    } as BossMechanics);
    expect(everything).toHaveLength(6);
    expect(new Set(everything.map((rule) => rule.label)).size).toBe(6);
  });
});

describe('stageBoss', () => {
  const enemies = [
    { key: 'mook', isBoss: false },
    { key: 'warlord', isBoss: true, bossMechanics: { almightyImmunity: true } },
  ] as never as Parameters<typeof stageBoss>[1];

  it('finds the boss standing in the last wave', () => {
    const stage = { waves: [[{ enemyKey: 'mook' }], [{ enemyKey: 'warlord' }]] };
    expect(stageBoss(stage, enemies)?.key).toBe('warlord');
  });

  it('finds it beside company, rather than taking whoever is first', () => {
    const stage = { waves: [[{ enemyKey: 'mook' }, { enemyKey: 'warlord' }]] };
    expect(stageBoss(stage, enemies)?.key).toBe('warlord');
  });

  it('says nothing about the 252 stages that end on ordinary enemies', () => {
    expect(stageBoss({ waves: [[{ enemyKey: 'mook' }]] }, enemies)).toBeUndefined();
    expect(stageBoss({ waves: [] }, enemies)).toBeUndefined();
    expect(stageBoss({ waves: [[{ enemyKey: 'warlord' }]] }, undefined)).toBeUndefined();
  });
});
