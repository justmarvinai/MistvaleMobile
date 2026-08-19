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
