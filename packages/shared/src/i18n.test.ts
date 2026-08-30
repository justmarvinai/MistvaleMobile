import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  catalogueProblems,
  interpolate,
  isLocale,
  pickLocale,
  placeholders,
  translate,
} from './i18n';

/**
 * The localisation layer, which today has one locale and no translations.
 *
 * That is exactly why these are worth writing now rather than when a second language
 * arrives: every rule here is about what happens when a catalogue is *incomplete*, and an
 * incomplete catalogue is the only state this will ever be in on the day somebody starts
 * translating. The behaviour under a missing entry is the whole design.
 */

describe('translate', () => {
  it('falls back to the English it was given', () => {
    // The load-bearing property. Missing, untranslated and newly added are one case, and it
    // renders correctly — which is what makes converting one screen at a time safe.
    expect(translate({}, 'Roster')).toBe('Roster');
    expect(translate({ Relics: 'Reliquien' }, 'Roster')).toBe('Roster');
  });

  it('uses a translation when there is one', () => {
    expect(translate({ Roster: 'Aufstellung' }, 'Roster')).toBe('Aufstellung');
  });

  it('interpolates into the translation rather than the source', () => {
    expect(
      translate({ 'You hold {count} relics.': '{count} Reliquien.' }, 'You hold {count} relics.', {
        count: 12,
      }),
    ).toBe('12 Reliquien.');
  });
});

describe('interpolate', () => {
  it('fills every placeholder it has a value for', () => {
    expect(interpolate('{who} reached tier {tier}.', { who: 'Marvin', tier: 7 })).toBe(
      'Marvin reached tier 7.',
    );
  });

  it('leaves a placeholder it has no value for visible', () => {
    // Deliberate. A sentence with `{count}` in it is a bug somebody reports; one that reads
    // "You have  relics" is a bug nobody can describe.
    expect(interpolate('You have {count} relics.', {})).toBe('You have {count} relics.');
  });

  it('leaves a string with no placeholders alone', () => {
    expect(interpolate('Roster', { count: 3 })).toBe('Roster');
  });
});

describe('placeholders', () => {
  it('lists them in the order they first appear, once each', () => {
    expect(placeholders('{a} and {b} and {a}')).toEqual(['a', 'b']);
    expect(placeholders('nothing here')).toEqual([]);
  });
});

describe('pickLocale', () => {
  it('matches on the language rather than the region', () => {
    // A player whose browser says `en-GB` must not be handed a default because the tag is
    // not exactly `en`.
    expect(pickLocale(['en-GB'])).toBe('en');
    expect(pickLocale(['EN-us'])).toBe('en');
  });

  it('takes the first preference the game actually has', () => {
    expect(pickLocale(['de-DE', 'en-GB'])).toBe('en');
  });

  it('falls back rather than answering with something unsupported', () => {
    expect(pickLocale(['de', 'fr'])).toBe(DEFAULT_LOCALE);
    expect(pickLocale([])).toBe(DEFAULT_LOCALE);
  });
});

describe('isLocale', () => {
  it('knows what the game has and what it does not', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});

describe('catalogueProblems', () => {
  it('says nothing about a catalogue that matches what is used', () => {
    expect(catalogueProblems({ Roster: 'Aufstellung' }, ['Roster', 'Relics'])).toEqual([]);
  });

  it('says nothing about a missing entry, because that is the fallback working', () => {
    expect(catalogueProblems({}, ['Roster'])).toEqual([]);
  });

  it('names an entry nothing says any more', () => {
    const problems = catalogueProblems({ 'Old wording': 'Alte Formulierung' }, ['Roster']);
    expect(problems[0]?.message).toContain('Nothing says this');
  });

  it('names an empty translation, which is worse than a missing one', () => {
    // A missing entry falls back to English; an empty one renders as nothing and reads as a
    // screen that failed to load.
    const problems = catalogueProblems({ Roster: '   ' }, ['Roster']);
    expect(problems[0]?.message).toContain('renders as nothing');
  });

  it('names a translation that drops a placeholder', () => {
    const problems = catalogueProblems({ 'You have {count} relics.': 'Du hast Reliquien.' }, [
      'You have {count} relics.',
    ]);
    expect(problems[0]?.message).toContain('drops {count}');
  });

  it('names a translation that invents one, which renders literally', () => {
    const problems = catalogueProblems({ 'You have relics.': 'Du hast {count} Reliquien.' }, [
      'You have relics.',
    ]);
    expect(problems[0]?.message).toContain('invents {count}');
  });

  it('reports every problem rather than stopping at the first', () => {
    const problems = catalogueProblems(
      {
        'Gone from the code': 'x',
        'Kept {a}': 'Behalten',
        Empty: '',
      },
      ['Kept {a}', 'Empty'],
    );
    expect(problems).toHaveLength(3);
  });
});
