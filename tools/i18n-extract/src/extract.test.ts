import { describe, expect, it } from 'vitest';
import { extractFile, merge, readsLikeProse } from './extract';
import { extractTable } from './tables';
import { renderTemplate, templateProblems } from './template';

/**
 * The extractor, which is the half of the localisation layer with a number in it.
 *
 * Its two answers matter for opposite reasons. **Reachable** is a catalogue a translator
 * fills in, so a string wrongly left out is a sentence stuck in English forever. **Still in
 * code** is the estimate of what a second language would cost, so a string wrongly counted
 * makes the figure noise nobody acts on. The classifier is therefore tuned to under-report,
 * and that decision is what most of these pin.
 */

const at = (code: string) => extractFile('a.tsx', code);

describe('reachable strings', () => {
  it('takes the literal argument of a t() call', () => {
    expect(at(`const a = t('Roster');`).reachable.map((entry) => entry.source)).toEqual(['Roster']);
  });

  it('takes one from a name bound to useText()', () => {
    // Without this, every screen converted through the hook would read as unreachable —
    // the opposite of the truth, and exactly the measurement error that makes a report
    // useless.
    const found = at(`
      function Screen() {
        const text = useText();
        return <p>{text('Enter')}</p>;
      }
    `);
    expect(found.reachable.map((entry) => entry.source)).toEqual(['Enter']);
  });

  it('does not mistake an unrelated t for the text function', () => {
    expect(at(`const a = other.t('Roster');`).reachable).toEqual([]);
  });

  it('reports a call with nothing literal to extract rather than dropping it', () => {
    // A catalogue with a hole in it is how one sentence stays English forever, so a call
    // that cannot be extracted has to be visible somewhere.
    const found = at(`const a = t(screen.label);`);
    expect(found.reachable).toEqual([]);
    expect(found.dynamic).toHaveLength(1);
  });

  it('does not also count the string inside a t() as still-in-code', () => {
    expect(at(`const a = <p>{t('Roster')}</p>;`).unreachable).toEqual([]);
  });
});

describe('strings still in the code', () => {
  it('counts JSX text a player reads', () => {
    const found = at(`const a = <p>Nothing is running</p>;`);
    expect(found.unreachable.map((entry) => entry.text)).toEqual(['Nothing is running']);
  });

  it('counts a text attribute', () => {
    const found = at(`const a = <button title="Remove from the lineup" />;`);
    expect(found.unreachable[0]?.attribute).toBe('title');
  });

  it('ignores an attribute that is an address rather than prose', () => {
    // The whole difficulty. A class name, an icon id and a content key are all strings in
    // the same syntactic position as a sentence.
    const found = at(`const a = <span className="slotName" data-kind="damage" />;`);
    expect(found.unreachable).toEqual([]);
  });
});

describe('readsLikeProse', () => {
  it('accepts sentences and phrases', () => {
    expect(readsLikeProse('Nothing is running')).toBe(true);
    expect(readsLikeProse('Roster')).toBe(true);
    expect(readsLikeProse('open to everybody')).toBe(true);
  });

  it('refuses the shapes that are addresses', () => {
    for (const value of [
      'nav-arena',
      'rune-gilded-script',
      'glyph-trophy-cup',
      'apps/client/src',
      'https://example.test',
      '#anchor',
      '--mv-token',
      '1,200',
      '×4',
      'a',
    ]) {
      expect(readsLikeProse(value), value).toBe(false);
    }
  });
});

describe('text tables', () => {
  const table = { file: 'screens.ts', fields: ['label', 'blurb'] };

  it('pulls the named fields, which no call site can name', () => {
    const found = extractTable(
      table,
      `export const SCREENS = [
        { id: 'roster', label: 'Roster', blurb: 'Your champions.', icon: 'nav-champions' },
      ];`,
    );
    expect(found).toEqual(['Roster', 'Your champions.']);
  });

  it('leaves fields it was not asked for alone', () => {
    // A heuristic mining every string property would fill the catalogue with icon ids.
    expect(
      extractTable({ file: 'x.ts', fields: ['label'] }, `const a = { icon: 'nav-arena' };`),
    ).toEqual([]);
  });

  it('takes only literals, since a computed value cannot be handed to a translator', () => {
    expect(extractTable(table, `const a = { label: someName };`)).toEqual([]);
  });
});

describe('merge', () => {
  it('de-duplicates by the string itself and keeps the first place it was seen', () => {
    const merged = merge([
      { reachable: [{ source: 'Enter', file: 'a.tsx', line: 3 }], unreachable: [], dynamic: [] },
      { reachable: [{ source: 'Enter', file: 'b.tsx', line: 9 }], unreachable: [], dynamic: [] },
    ]);
    expect(merged.reachable).toHaveLength(1);
    expect(merged.reachable[0]?.file).toBe('a.tsx');
  });

  it('sorts, so the template is stable and its diff is readable', () => {
    const merged = merge([
      {
        reachable: [
          { source: 'Zeal', file: 'a.tsx', line: 1 },
          { source: 'Ardour', file: 'a.tsx', line: 2 },
        ],
        unreachable: [],
        dynamic: [],
      },
    ]);
    expect(merged.reachable.map((entry) => entry.source)).toEqual(['Ardour', 'Zeal']);
  });
});

describe('the template', () => {
  it('is sorted, empty-valued and newline-terminated', () => {
    const rendered = renderTemplate(['Zeal', 'Ardour', 'Ardour']);
    expect(rendered).toBe('{\n  "Ardour": "",\n  "Zeal": ""\n}\n');
  });

  it('accepts a template that is still a template', () => {
    expect(templateProblems('{"Roster": ""}')).toEqual([]);
  });

  it('refuses a translation left in it, which the next run would overwrite', () => {
    expect(templateProblems('{"Roster": "Aufstellung"}')[0]).toContain('catalogues.ts');
  });

  it('refuses a shape that is not a template at all', () => {
    expect(templateProblems('not json')[0]).toContain('valid JSON');
    expect(templateProblems('[]')[0]).toContain('JSON object');
    expect(templateProblems('{"Roster": 3}')[0]).toContain('not a string');
  });
});
