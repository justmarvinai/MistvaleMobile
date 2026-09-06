import { describe, expect, it } from 'vitest';
import { ITEMS } from './config';

/**
 * What the items say they are for (C50).
 *
 * The owner's report was that hovering Mistbrew or a Warden's Ration says nothing about
 * what either is good for, and half the fault was here: every description was **flavour
 * only**. "Bottled fog with something bright still moving in it" is a lovely sentence and
 * never says you pour it on a champion; "A cupful of the deep" never says it ascends a Tide
 * champion or that it falls in the Tide spring. A new player reading either learns nothing
 * they can act on, and the game has no other place that tells them.
 *
 * So descriptions lead with the **use** and keep the flavour after it, and this pins that
 * rather than the prose: a floor on length, and a requirement that the sentence names
 * something in the game — a place it is spent, or the thing it is spent on. Neither alone
 * is enough, which is why both are here: a long flavour line clears the first, and "It is
 * for a champion" clears the second.
 *
 * It is deliberately not a test of *quality*. It is a test that the description is about
 * the game rather than about the weather, which is the state this file found them in and
 * the state they would drift back to.
 */

/**
 * The things an item can act on, and the places one is spent.
 *
 * Read against the whole description rather than the first sentence: the shorter ones put
 * the place and the verb in one clause, and insisting on a sentence boundary would be
 * asking for a house style rather than for information.
 */
const NAMES_SOMETHING = new RegExp(
  [
    'champion',
    'relic',
    'skill',
    'Mistgate',
    'Depths',
    'spring',
    'vault',
    'board',
    'trainer',
    'energy',
    'ascension',
    'ascends',
    'awaken',
    'summon',
    'mastery',
    'experience',
  ].join('|'),
  'i',
);

/** Long enough to have said something. The old flavour-only lines were 22–58 characters. */
const FLOOR = 70;

describe('every published item', () => {
  it('there are items to check', () => {
    // A guard that cannot see its subject passes hardest — `newplayer.test.ts`'s own
    // lesson, and cheap to repeat.
    expect(ITEMS.length).toBeGreaterThan(15);
  });

  it('says what it is for, not only what it looks like', () => {
    const thin = ITEMS.filter(
      (item) =>
        (item.description ?? '').length < FLOOR || !NAMES_SOMETHING.test(item.description ?? ''),
    ).map((item) => `${item.key}: ${item.description}`);

    expect(thin, 'these say nothing a player can act on').toEqual([]);
  });

  it('never leaves one blank', () => {
    expect(ITEMS.filter((item) => !item.description?.trim()).map((item) => item.key)).toEqual([]);
  });

  it('stays inside the field a description is stored in', () => {
    // `itemDefSchema` caps it at 400. A publish would refuse a longer one, which means an
    // over-long seed is a deploy that fails rather than a description that is truncated.
    expect(ITEMS.filter((item) => (item.description ?? '').length > 400).map((i) => i.key)).toEqual(
      [],
    );
  });
});
