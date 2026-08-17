import { describe, expect, it } from 'vitest';
import type { ContentType } from '@mistvale/shared';
import { planFill, type SeedGroup } from './fill';

/**
 * What a seed run adds to an install that already has content.
 *
 * This is the rule every future release depends on and nobody will remember to re-check:
 * a plain seed must deliver the rows a release added — a new content family, and above all
 * the `game_config` keys every new feature brings — without touching a single thing the
 * operator has tuned. Getting it wrong is silent in both directions. Too timid and a
 * feature ships live running on code fallbacks nobody chose; too eager and a week of
 * balance work is quietly overwritten by a deploy.
 */

const seeds: SeedGroup[] = [
  {
    contentType: 'gameConfig' as ContentType,
    entities: [
      { key: 'energy.regenSeconds', data: { key: 'energy.regenSeconds', value: 180 } },
      { key: 'quests.periodChests', data: { key: 'quests.periodChests', value: {} } },
    ],
  },
  {
    contentType: 'quest' as ContentType,
    entities: [
      { key: 'daily_one', data: { key: 'daily_one' } },
      { key: 'daily_two', data: { key: 'daily_two' } },
    ],
  },
];

describe('planFill', () => {
  it('adds a content type the install has never had', () => {
    const live = [{ contentType: 'gameConfig', key: 'energy.regenSeconds' }];
    const fill = planFill(seeds, live);

    expect(fill.added.map((entry) => entry.key)).toEqual([
      'quests.periodChests',
      'daily_one',
      'daily_two',
    ]);
    expect(fill.perType.get('quest' as ContentType)).toBe(2);
  });

  it('adds a config key a release introduced into a type that already exists', () => {
    // The common case by a mile, and the one the old "any content at all → skip
    // everything" guard got wrong: a new feature's tunables never arrived, so the feature
    // ran on whatever the code falls back to.
    const live = [
      { contentType: 'gameConfig', key: 'energy.regenSeconds' },
      { contentType: 'quest', key: 'daily_one' },
      { contentType: 'quest', key: 'daily_two' },
    ];
    const fill = planFill(seeds, live);
    expect(fill.added.map((entry) => entry.key)).toEqual(['quests.periodChests']);
  });

  it('leaves every entity the install already holds completely alone', () => {
    const live = seeds.flatMap((seed) =>
      seed.entities.map((entity) => ({ contentType: seed.contentType, key: entity.key })),
    );
    const fill = planFill(seeds, live);
    expect(fill.added).toHaveLength(0);
    expect(fill.perType.size).toBe(0);
  });

  it('never plans to rewrite an operator’s edit', () => {
    // The row on the install holds different data from the seed's. It must not appear in
    // the plan at all — "add what is absent" and nothing else, so tuning survives a deploy.
    const live = [{ contentType: 'gameConfig', key: 'energy.regenSeconds' }];
    const fill = planFill(seeds, live);
    expect(fill.added.some((entry) => entry.key === 'energy.regenSeconds')).toBe(false);
  });

  it('prefers the normalised form, so a filled row matches a published one byte for byte', () => {
    const normalised = new Map<ContentType, Map<string, unknown>>([
      ['quest' as ContentType, new Map([['daily_one', { key: 'daily_one', sortOrder: 10 }]])],
    ]);
    const fill = planFill(seeds, [], normalised);
    const filled = fill.added.find((entry) => entry.key === 'daily_one');
    expect(filled?.data).toEqual({ key: 'daily_one', sortOrder: 10 });
  });

  it('falls back to the raw entity when nothing normalised it', () => {
    const fill = planFill(seeds, [], new Map());
    expect(fill.added.find((entry) => entry.key === 'daily_two')?.data).toEqual({
      key: 'daily_two',
    });
  });
});
