import { describe, expect, it } from 'vitest';
import type { SkillDef, StatusDef } from '@mistvale/shared';
import { choosable, skillTip, statusTip, targetLine } from './combatTips';

const targeting = (over: Partial<SkillDef['targeting']> = {}): SkillDef['targeting'] => ({
  side: 'enemy',
  mode: 'single',
  ...over,
});

const aSkill = (over: Partial<SkillDef> = {}): SkillDef =>
  ({
    key: 'strike',
    name: 'Cinder Strike',
    description: 'Attacks one enemy. Burns on a critical hit.',
    slot: 'a1',
    cooldown: 0,
    targeting: targeting(),
    ...over,
  }) as SkillDef;

describe('what a skill says', () => {
  it('names who it lands on, for every targeting mode', () => {
    expect(targetLine(targeting({ mode: 'all' }))).toBe('All enemies');
    expect(targetLine(targeting({ mode: 'all', side: 'ally' }))).toBe('All allies');
    expect(targetLine(targeting({ mode: 'single' }))).toBe('One enemy');
    expect(targetLine(targeting({ mode: 'single', side: 'ally' }))).toBe('One ally');
    expect(targetLine(targeting({ mode: 'lowestHp', side: 'ally' }))).toBe('Lowest-health ally');
    expect(targetLine(targeting({ mode: 'random', count: 3 }))).toBe('3 random enemies');
    expect(targetLine(targeting({ mode: 'self', side: 'self' }))).toBe('Self');
  });

  it('knows when the player gets to choose', () => {
    // The whole point of the target picker: only a single-target skill leaves a decision.
    expect(choosable(targeting({ mode: 'single' }))).toBe(true);
    expect(choosable(targeting({ mode: 'all' }))).toBe(false);
    expect(choosable(targeting({ mode: 'lowestHp' }))).toBe(false);
    expect(choosable(targeting({ mode: 'self', side: 'self' }))).toBe(false);
  });

  it('says a free skill is free rather than saying nothing', () => {
    const tip = skillTip(aSkill({ cooldown: 0 }));
    const cooldown = tip.stats?.find((line) => line.label === 'Cooldown');
    expect(cooldown?.value).toBe('None');
    expect(cooldown?.tone).toBe('good');
  });

  it('answers "when can I use this again", not just "how long is the cooldown"', () => {
    const tip = skillTip(aSkill({ slot: 'a3', cooldown: 4 }), 2);
    expect(tip.stats?.find((line) => line.label === 'Cooldown')?.value).toBe('4 turns');
    expect(tip.stats?.find((line) => line.label === 'Ready in')?.value).toBe('2 turns');
    expect(tip.requires?.[0]).toContain('2 more turns');
  });

  it('carries the skill own words as the flavour', () => {
    expect(skillTip(aSkill()).flavor).toContain('Burns on a critical hit');
  });
});

describe('what a status says', () => {
  const def = { key: 'atk_up', name: 'Might', description: 'Attack up 25%.' } as StatusDef;

  it('says whether it helps or hurts, and for how long', () => {
    const tip = statusTip({ key: 'atk_up', turns: 2, stacks: 1, kind: 'buff' }, def);
    expect(tip.title).toBe('Might');
    expect(tip.subtitle).toBe('Buff');
    expect(tip.stats?.[0]).toMatchObject({ label: 'Turns left', value: 2, tone: 'good' });
    expect(tip.flavor).toBe('Attack up 25%.');
  });

  it('marks a debuff as one', () => {
    const tip = statusTip({ key: 'poison', turns: 3, stacks: 1, kind: 'debuff' }, def);
    expect(tip.subtitle).toBe('Debuff');
    expect(tip.stats?.[0]?.tone).toBe('bad');
  });

  it('shows stacks only when something is actually stacked', () => {
    const one = statusTip({ key: 'poison', turns: 3, stacks: 1, kind: 'debuff' }, def);
    const many = statusTip({ key: 'poison', turns: 3, stacks: 4, kind: 'debuff' }, def);
    expect(one.stats?.some((line) => line.label === 'Stacks')).toBe(false);
    expect(many.stats?.find((line) => line.label === 'Stacks')?.value).toBe(4);
  });

  it('survives content that has been unpublished under a running fight', () => {
    const tip = statusTip({ key: 'gone', turns: 1, stacks: 1, kind: 'buff' }, undefined);
    expect(tip.title).toBe('gone');
    expect(tip.flavor).toBeUndefined();
  });
});
