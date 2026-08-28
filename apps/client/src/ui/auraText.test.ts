import { describe, expect, it } from 'vitest';
import type { Aura } from '@mistvale/shared';
import { auraAmount, auraApplies, auraShort, auraText } from './auraText';

/**
 * The leader's aura, in words.
 *
 * Pure and tested here rather than walked in a browser for the usual reason: which aura an
 * account's champions carry is content, so a spec that waited for a faction-scoped one
 * would be waiting on the seed. What is worth pinning is that each of the schema's four
 * fields reaches the sentence, because each of them is a real decision a player makes and
 * a sentence that drops one is a sentence that lies by omission.
 */

const aura = (over: Partial<Aura> = {}): Aura => ({
  stat: 'hp',
  value: 25,
  scope: 'all',
  area: 'any',
  ...over,
});

describe('auraText', () => {
  it('reads as the sentence on the team screen', () => {
    expect(auraText(aura())).toBe('Increases ally HP by 25% in every battle.');
  });

  it('measures ACC and RES in points, not percent', () => {
    // The schema's own rule: `value` is a percentage for the ratio stats and flat points
    // for these two. "+30%" against a stat measured in points is a number that means
    // nothing, and it is the sort of wrong that reads as right.
    expect(auraAmount(aura({ stat: 'acc', value: 30 }))).toBe('30');
    expect(auraAmount(aura({ stat: 'res', value: 30 }))).toBe('30');
    expect(auraAmount(aura({ stat: 'critRate', value: 30 }))).toBe('30%');
  });

  it('names the leader’s own element or faction, because that is who it reaches', () => {
    // `scope: 'element'` means allies sharing *the leader's* element (engine: `applyAura`),
    // so the sentence is about the leader rather than about the aura alone.
    expect(auraText(aura({ scope: 'element' }), { element: 'Ember' })).toContain('Ember ally HP');
    expect(auraText(aura({ scope: 'faction' }), { faction: 'Emberclan' })).toContain(
      'Emberclan ally HP',
    );
  });

  it('falls back to plain allies when the leader is not resolved yet', () => {
    // The bundle arrives after the first paint. "Increases  ally HP" with a hole in it is
    // worse than a sentence that is merely less specific.
    expect(auraText(aura({ scope: 'faction' }))).toBe('Increases ally HP by 25% in every battle.');
  });

  it('says where it applies, because an Arena aura is worth nothing in the Depths', () => {
    expect(auraText(aura({ area: 'arena' }))).toContain('in the Arena');
    expect(auraText(aura({ area: 'depths' }))).toContain('in the Depths');
    expect(auraText(aura({ area: 'campaign' }))).toContain('in the campaign');
  });

  it('drops the verb for the places with a column rather than a sentence', () => {
    expect(auraShort(aura())).toBe('Ally HP +25%');
    expect(auraShort(aura({ scope: 'element' }), { element: 'Tide' })).toBe('Tide Ally HP +25%');
  });
});

describe('auraApplies', () => {
  it('is the engine’s own rule rather than a second reading of the enum', () => {
    // The case that makes sharing it worth the import: the engine counts the tutorial and
    // the sandbox as the campaign, which nothing about the word "campaign" says. A client
    // that read the four names literally told a player their leader's aura was dead in a
    // fight that applied it.
    expect(auraApplies(aura({ area: 'campaign' }), 'campaign')).toBe(true);
    expect(auraApplies(aura({ area: 'campaign' }), 'tutorial')).toBe(true);
    expect(auraApplies(aura({ area: 'campaign' }), 'practice')).toBe(true);
    expect(auraApplies(aura({ area: 'campaign' }), 'arena')).toBe(false);
  });

  it('counts all three Depths modes as the Depths', () => {
    for (const mode of ['dungeon', 'springs', 'proving']) {
      expect(auraApplies(aura({ area: 'depths' }), mode), mode).toBe(true);
    }
    expect(auraApplies(aura({ area: 'depths' }), 'spire')).toBe(false);
  });

  it('lets an unscoped aura reach a mode nothing else names', () => {
    // The Titan, the world boss, the Spire, a Deep Run and a trial are in no named area, so
    // `any` is the only aura that works there — which is a design fact worth being able to
    // read off the screen rather than a gap.
    expect(auraApplies(aura({ area: 'any' }), 'titan')).toBe(true);
    expect(auraApplies(aura({ area: 'arena' }), 'titan')).toBe(false);
  });
});
