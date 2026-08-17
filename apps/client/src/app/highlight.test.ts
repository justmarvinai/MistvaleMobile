import { describe, expect, it } from 'vitest';
import { highlightable, sameBox } from './highlight';
import { goalLabel, waitingLabel } from './tutorialText';

/**
 * The overlay's pure parts.
 *
 * Everything else about the tutorial overlay is DOM and is covered by the browser suite;
 * what is worth pinning here is the measurement comparison, because getting it wrong is
 * invisible — it does not break the highlight, it just re-renders the whole overlay four
 * times a second for the length of the tutorial.
 */

describe('the highlight attribute', () => {
  it('marks a node with the key an author wrote', () => {
    expect(highlightable('dock:campaign')).toEqual({ 'data-mv-highlight': 'dock:campaign' });
  });
});

describe('comparing measurements', () => {
  const box = { top: 10, left: 20, width: 100, height: 40 };

  it('calls a repeat of the same box the same', () => {
    expect(sameBox(box, { ...box })).toBe(true);
  });

  it('ignores sub-pixel drift, which is all a scroll produces at rest', () => {
    expect(sameBox(box, { ...box, top: 10.4 })).toBe(true);
  });

  it('notices a real move', () => {
    expect(sameBox(box, { ...box, top: 11 })).toBe(false);
    expect(sameBox(box, { ...box, width: 101 })).toBe(false);
  });

  it('treats appearing and disappearing as changes', () => {
    expect(sameBox(null, box)).toBe(false);
    expect(sameBox(box, null)).toBe(false);
    expect(sameBox(null, null)).toBe(true);
  });
});

describe('what the step says it wants', () => {
  it('phrases the goal types the script actually uses', () => {
    expect(goalLabel('stageClear')).toBe('Clear the stage');
    expect(goalLabel('gearEquip')).toBe('Wear a relic');
    expect(goalLabel('questClaim')).toBe('Claim a quest');
  });

  it('says something rather than nothing for a type it has never seen', () => {
    // A goal type can be added server-side and authored into a step before this client
    // ships; an empty reminder line would look like a bug rather than a new mechanic.
    expect(goalLabel('somethingNew')).toBeTruthy();
  });

  it('sends the player onwards only when they are somewhere else', () => {
    expect(waitingLabel('campaign', 'haven')).toBe('Go and do it');
    expect(waitingLabel('campaign', 'campaign')).toBe('Not yet');
  });
});
