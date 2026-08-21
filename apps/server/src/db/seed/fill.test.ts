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

describe('planFill backfilling a field a release added', () => {
  // The bug this was written for. The tutorial gained `portrait` and `sound`; the two new
  // music cues arrived because they were new *entities*; the fifteen steps that already
  // existed kept a stored shape with neither key in it. Every one parsed cleanly, because
  // the schema defaults a missing key to '' — so nothing complained anywhere, and on the one
  // install that mattered the Wardenmaster had no face and no voice.
  const steps: SeedGroup[] = [
    {
      contentType: 'tutorialStep' as ContentType,
      entities: [
        {
          key: 'tut_welcome',
          data: {
            key: 'tut_welcome',
            title: 'Welcome',
            portrait: 'portraits/wm.jpg',
            sound: 'a.mp3',
          },
        },
      ],
    },
  ];

  it('adds the keys the stored row has never had', () => {
    const live = [
      {
        contentType: 'tutorialStep',
        key: 'tut_welcome',
        data: { key: 'tut_welcome', title: 'Welcome' },
      },
    ];
    const fill = planFill(steps, live);

    expect(fill.added, 'the entity itself is already there').toEqual([]);
    expect(fill.patched).toHaveLength(1);
    expect(fill.patched[0]?.fields).toEqual(['portrait', 'sound']);
    expect(fill.patched[0]?.data).toEqual({
      key: 'tut_welcome',
      title: 'Welcome',
      portrait: 'portraits/wm.jpg',
      sound: 'a.mp3',
    });
  });

  it('never touches a key that is already stored, whatever the seed says', () => {
    // The whole safety property. An operator retitled the step and pointed it at their own
    // recording; a seed run must deliver the field they have never had and leave both alone.
    const live = [
      {
        contentType: 'tutorialStep',
        key: 'tut_welcome',
        data: { key: 'tut_welcome', title: 'Their words', sound: 'theirs.mp3' },
      },
    ];
    const fill = planFill(steps, live);

    expect(fill.patched[0]?.fields).toEqual(['portrait']);
    expect(fill.patched[0]?.data).toEqual({
      key: 'tut_welcome',
      title: 'Their words',
      sound: 'theirs.mp3',
      portrait: 'portraits/wm.jpg',
    });
  });

  it('plans nothing when the stored row already has every key', () => {
    // Empty strings count as present: an operator who cleared a portrait meant to clear it,
    // and a seed that kept handing it back would be an edit nobody can make stick.
    const live = [
      {
        contentType: 'tutorialStep',
        key: 'tut_welcome',
        data: { key: 'tut_welcome', title: 'W', portrait: '', sound: '' },
      },
    ];
    expect(planFill(steps, live).patched).toEqual([]);
  });

  it('leaves a nested map alone, because it is one authored value', () => {
    // `rewards: {}` is not "missing silver" — it is an operator who emptied the rewards.
    // Merging the seed's keys back into it is exactly the overwrite this file prevents.
    const withRewards: SeedGroup[] = [
      {
        contentType: 'tutorialStep' as ContentType,
        entities: [{ key: 'a', data: { key: 'a', rewards: { silver: 500 } } }],
      },
    ];
    const live = [{ contentType: 'tutorialStep', key: 'a', data: { key: 'a', rewards: {} } }];
    expect(planFill(withRewards, live).patched).toEqual([]);
  });

  it('plans nothing at all for a live set recorded without its data', () => {
    // `planFill` is also called with keys only in a couple of tests and in the dry-run path.
    // No data means no evidence a key is missing, and guessing would be the one thing this
    // must never do.
    expect(planFill(steps, [{ contentType: 'tutorialStep', key: 'tut_welcome' }]).patched).toEqual(
      [],
    );
  });

  it('prefers the normalised value, so a backfill matches what Admin would publish', () => {
    const normalised = new Map<ContentType, Map<string, unknown>>([
      [
        'tutorialStep' as ContentType,
        new Map([['tut_welcome', { key: 'tut_welcome', title: 'Welcome', portrait: 'norm.jpg' }]]),
      ],
    ]);
    const live = [
      {
        contentType: 'tutorialStep',
        key: 'tut_welcome',
        data: { key: 'tut_welcome', title: 'Welcome' },
      },
    ];
    expect(planFill(steps, live, normalised).patched[0]?.data).toMatchObject({
      portrait: 'norm.jpg',
    });
  });
});
