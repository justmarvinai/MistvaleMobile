import { describe, expect, it } from 'vitest';
import type { GearInstance, GearSetDef, ItemDef, RosterChampion } from '@mistvale/shared';
import { championTip, emptySocketTip, relicTip, rewardTip, statTip } from './tips';

/**
 * The sentences the game explains itself with.
 *
 * Tested for the same reason `combatTips` is: this is the game teaching its own rules, and
 * a sentence written inside a component is a sentence nobody ever reads again. What is
 * checked here is *what a player is told* — that a relic says which set it belongs to and
 * how far off complete it is, that a locked one says so, that an unowned reward explains
 * what it is for — rather than how the card is laid out.
 */

const relic = (over: Partial<GearInstance> = {}): GearInstance => ({
  id: 'g1',
  dismantleValue: 40,
  reforges: 0,
  setKey: 'ember',
  slot: 'weapon',
  rank: 5,
  rarity: 'epic',
  level: 12,
  main: { stat: 'atk', percent: true, value: 33 },
  substats: [
    { stat: 'spd', percent: false, value: 12, rolls: 3 },
    { stat: 'critRate', percent: true, value: 6 },
  ],
  equippedChampionId: null,
  locked: false,
  source: 'stage',
  acquiredAt: '2026-01-01T00:00:00.000Z',
  sellValue: 400,
  upgradeCost: 900,
  upgradeChance: 0.7,
  ...over,
});

const emberSet = (over: Partial<GearSetDef> = {}): GearSetDef =>
  ({
    key: 'ember',
    name: 'Emberheart',
    sortOrder: 0,
    pieces: 4,
    description: 'The forge remembers what it burned.',
    bonus: { stat: 'atk', pct: 15 },
    active: true,
    ...over,
  }) as GearSetDef;

describe('a relic', () => {
  it('is titled by its set and tinted by its rarity, not by its slot', () => {
    const tip = relicTip(relic(), { set: emberSet() });
    expect(tip.title).toBe('Emberheart');
    expect(tip.rarity).toBe('epic');
    expect(tip.subtitle).toBe('Weapon');
    expect(tip.slotLabel).toBe('+12');
  });

  it('lists the main stat first and every substat after it, rolls included', () => {
    const stats = relicTip(relic()).stats ?? [];
    expect(stats[0]).toMatchObject({ label: 'ATK', value: '+33%' });
    expect(stats.map((line) => line.value)).toContain('+12 (3)');
    expect(stats.map((line) => line.value)).toContain('+6%');
  });

  /**
   * The line that made this worth building. "How close am I to the set bonus" was
   * answerable only from a panel two tabs away, and it is the question a player has while
   * looking at the socket.
   */
  it('counts the set toward completion when a champion is known', () => {
    const stats = relicTip(relic(), { set: emberSet(), wearing: 2 }).stats ?? [];
    expect(stats).toContainEqual({ label: 'Emberheart set', value: '2 of 4', tone: 'plain' });
  });

  it('says so when the set is complete', () => {
    const stats = relicTip(relic(), { set: emberSet(), wearing: 4 }).stats ?? [];
    expect(stats).toContainEqual({ label: 'Emberheart set', value: 'Complete', tone: 'good' });
  });

  it('states the set size instead of a count where the relic belongs to nobody', () => {
    const stats = relicTip(relic(), { set: emberSet() }).stats ?? [];
    expect(stats).toContainEqual({ label: 'Emberheart set', value: '4 pieces', tone: 'plain' });
  });

  it('warns before a player tries to sell one they protected', () => {
    expect(relicTip(relic({ locked: true })).requires).toContain('Locked — it cannot be sold');
    expect(relicTip(relic()).requires).toBeUndefined();
  });

  it('says a fully forged relic is finished rather than showing +16 of +16', () => {
    const stats = relicTip(relic({ level: 16 })).stats ?? [];
    expect(stats).toContainEqual({ label: 'Upgrade', value: 'Fully forged', tone: 'good' });
  });

  it('falls back to the set key when the set is not in the bundle', () => {
    expect(relicTip(relic({ setKey: 'unpublished' })).title).toBe('unpublished');
  });
});

describe('an empty socket', () => {
  it('says where relics come from when it can be filled', () => {
    const tip = emptySocketTip('boots');
    expect(tip.title).toBe('Boots — empty');
    expect(tip.hint).toBe('Click to fit one');
    expect(tip.requires).toBeUndefined();
  });

  it('names the ascension that opens it when it cannot', () => {
    expect(emptySocketTip('banner', 4).requires).toEqual(['Opens at ascension 4']);
  });
});

describe('a reward', () => {
  it('explains what a currency is spent on, which the number cannot', () => {
    const tip = rewardTip('crystals', 200, { name: 'Crystals', signed: true });
    expect(tip.title).toBe('Crystals');
    expect(tip.stats?.[0]).toMatchObject({ label: 'Gained', value: '+200' });
    expect(tip.flavor).toMatch(/Mistgate/);
  });

  it('uses the item’s own published description and rarity where there is one', () => {
    const item = {
      key: 'sigil_gleaming',
      name: 'Gleaming Sigil',
      category: 'sigil',
      rarity: 'rare',
      description: 'Calls something worth keeping.',
      icon: '',
      payload: {},
      sortOrder: 0,
      active: true,
    } as unknown as ItemDef;

    const tip = rewardTip('sigil_gleaming', 3, { name: 'Gleaming Sigil', item });
    expect(tip.rarity).toBe('rare');
    expect(tip.flavor).toBe('Calls something worth keeping.');
    expect(tip.stats?.[0]).toMatchObject({ label: 'Amount', value: '3' });
  });

  it('still says something for a key nothing knows about', () => {
    const tip = rewardTip('mystery_thing', 1, { name: 'mystery_thing' });
    expect(tip.title).toBe('mystery_thing');
    expect(tip.stats?.[0]?.value).toBe('1');
  });
});

describe('a champion', () => {
  const owned: RosterChampion = {
    id: 'c1',
    championKey: 'anuria',
    level: 30,
    levelCap: 40,
    rank: 4,
    ascension: 2,
    power: 12_400,
    locked: true,
    favourite: false,
    equippedGearIds: ['a', 'b', 'c'],
  } as unknown as RosterChampion;

  it('carries the two facts the card has no room for', () => {
    const stats = championTip(owned, undefined).stats ?? [];
    expect(stats).toContainEqual({ label: 'Relics', value: '3 of 6', tone: 'plain' });
    expect(stats).toContainEqual({ label: 'Ascension', value: 2, tone: 'magic' });
  });

  it('marks a full kit as good news rather than as another number', () => {
    const full = { ...owned, equippedGearIds: ['a', 'b', 'c', 'd', 'e', 'f'] };
    const stats = championTip(full, undefined).stats ?? [];
    expect(stats).toContainEqual({ label: 'Relics', value: '6 of 6', tone: 'good' });
  });

  it('warns that a locked champion cannot be fed away', () => {
    expect(championTip(owned, undefined).requires).toContain('Locked — it cannot be fed away');
  });
});

describe('a stat', () => {
  const values = { base: 100, gear: 40, masteries: 0, total: 140 };

  it('explains the four that a player cannot guess', () => {
    expect(statTip('spd', values).flavor).toMatch(/turn order/i);
    expect(statTip('acc', values).flavor).toMatch(/resistance/i);
    expect(statTip('res', values).flavor).toMatch(/accuracy/i);
    expect(statTip('critDmg', values).flavor).toMatch(/rate/i);
  });

  it('breaks the total into where it came from', () => {
    const stats = statTip('atk', values).stats ?? [];
    expect(stats).toContainEqual({ label: 'From relics', value: '+40', tone: 'good' });
    expect(stats).toContainEqual({ label: 'From masteries', value: '—', tone: 'plain' });
    expect(stats).toContainEqual({ label: 'Total', value: '140', tone: 'magic' });
  });
});
