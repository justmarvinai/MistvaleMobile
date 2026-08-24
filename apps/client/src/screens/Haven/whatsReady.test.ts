import { describe, expect, it } from 'vitest';
import { NO_READINESS, type Readiness } from '@mistvale/shared';
import { readyRows } from './WhatsReady';

/**
 * What the Haven says is waiting.
 *
 * The rule worth testing is the one that decides whether the card is worth reading at all:
 * **a row only appears when it is actionable**. A card that says "0 quests, 0 keys, 0 runs"
 * every morning is one a player learns to ignore within a week, and then the two mornings
 * it has something on it are the two mornings nobody looks.
 */

const NO_BADGES = { quests: 0, missions: 0, events: 0, calendar: 0, mail: 0 };
/** The allowance is counted from the day an account registers, unlocked or not. */
const NO_FARMING = { unlocked: false, runsLeftToday: 30 };
const farming = (runsLeftToday: number) => ({ unlocked: true, runsLeftToday });
const SPRINGS = new Map([['spring_mist', 'Mist Spring']]);

const ready = (over: Partial<Readiness> = {}): Readiness => ({ ...NO_READINESS, ...over });

describe('readyRows', () => {
  it('says nothing when there is nothing', () => {
    expect(readyRows(ready(), NO_BADGES, NO_FARMING, SPRINGS)).toEqual([]);
  });

  it('leaves out a meter that is empty rather than reporting a zero', () => {
    // Spent tokens and spent keys are not news. The card is about what is *left*.
    const rows = readyRows(
      ready({ arenaTokens: { value: 0, cap: 10 }, titanKeys: { value: 0, cap: 2 } }),
      NO_BADGES,
      NO_FARMING,
      SPRINGS,
    );
    expect(rows).toEqual([]);
  });

  it('marks a full token bar urgent, because it has stopped regenerating', () => {
    // The one thing on this card that gets *worse* while it is ignored.
    const full = readyRows(
      ready({ arenaTokens: { value: 10, cap: 10 } }),
      NO_BADGES,
      NO_FARMING,
      SPRINGS,
    );
    expect(full[0]?.urgent).toBe(true);
    expect(full[0]?.label).toMatch(/full/i);

    const partial = readyRows(
      ready({ arenaTokens: { value: 4, cap: 10 } }),
      NO_BADGES,
      NO_FARMING,
      SPRINGS,
    );
    expect(partial[0]?.urgent).toBeUndefined();
    expect(partial[0]?.value).toBe('4 / 10');
  });

  it('puts what can be collected before what can be spent', () => {
    // Collecting is free and instant; spending is a decision. A card that leads with
    // "2 farm runs left" over "your daily gift is waiting" has the order backwards.
    const rows = readyRows(
      ready({ arenaTokens: { value: 10, cap: 10 }, titanKeys: { value: 2, cap: 2 } }),
      { ...NO_BADGES, quests: 3, calendar: 1 },
      farming(5),
      SPRINGS,
    );
    expect(rows.map((row) => row.key)).toEqual(['calendar', 'quests', 'arena', 'titan', 'multi']);
  });

  it('names today’s springs rather than their keys', () => {
    const rows = readyRows(ready({ openSprings: ['spring_mist'] }), NO_BADGES, NO_FARMING, SPRINGS);
    expect(rows[0]?.value).toBe('Mist Spring');
  });

  it('falls back to the key for a spring the bundle has not named', () => {
    // Content is edited live; a card that renders "undefined" is worse than one that
    // renders a key nobody recognises.
    const rows = readyRows(
      ready({ openSprings: ['spring_new'] }),
      NO_BADGES,
      NO_FARMING,
      new Map(),
    );
    expect(rows[0]?.value).toBe('spring_new');
  });

  it('joins a few open springs into one line', () => {
    const names = new Map([
      ['spring_pure', 'Pure Spring'],
      ['spring_mist', 'Mist Spring'],
      ['spring_ember', 'Ember Spring'],
    ]);
    const rows = readyRows(
      ready({ openSprings: ['spring_pure', 'spring_mist'] }),
      NO_BADGES,
      NO_FARMING,
      names,
    );
    expect(rows[0]?.value).toBe('Pure Spring · Mist Spring');
  });

  it('says the grace is running rather than naming all five springs', () => {
    // A new account's first week waives the rotation, so the honest line is five names —
    // which is a sentence rather than an answer. The card exists to be read at a glance,
    // and the grace has a clock on it, which is the part worth saying. **The server** is
    // what knows a grace is running, so the card can never promise a deadline for springs
    // an operator simply authored open every day.
    const names = new Map([
      ['spring_pure', 'Pure Spring'],
      ['spring_mist', 'Mist Spring'],
      ['spring_ember', 'Ember Spring'],
    ]);
    const rows = readyRows(
      ready({
        openSprings: ['spring_pure', 'spring_mist', 'spring_ember'],
        springsInGrace: true,
      }),
      NO_BADGES,
      NO_FARMING,
      names,
    );
    expect(rows[0]?.label).toMatch(/every spring/i);
    expect(rows[0]?.value).toMatch(/grace/i);
    expect(rows[0]?.urgent).toBe(true);
  });

  it('names the springs when they are all open and no grace is running', () => {
    // Same list, no clock: an operator who opens every spring permanently gets the names,
    // not a deadline that will never arrive.
    const names = new Map([
      ['spring_pure', 'Pure Spring'],
      ['spring_mist', 'Mist Spring'],
    ]);
    const rows = readyRows(
      ready({ openSprings: ['spring_pure', 'spring_mist'] }),
      NO_BADGES,
      NO_FARMING,
      names,
    );
    expect(rows[0]?.value).toBe('Pure Spring · Mist Spring');
    expect(rows[0]?.urgent).toBeUndefined();
  });

  it('sends each row to the screen it is about', () => {
    const rows = readyRows(
      ready({ titanKeys: { value: 1, cap: 2 }, openSprings: ['spring_mist'] }),
      { ...NO_BADGES, missions: 1, events: 2 },
      farming(3),
      SPRINGS,
    );
    expect(Object.fromEntries(rows.map((row) => [row.key, row.screen]))).toEqual({
      missions: 'missions',
      events: 'events',
      titan: 'titan',
      springs: 'depths',
      multi: 'campaign',
    });
  });

  it('says nothing about farming until farming has opened', () => {
    // The daily allowance is counted for every account from the day it registers, so the
    // *number* is 30 for a level-1 warden who is five levels away from being allowed to
    // spend any of it. Reading it without the unlock offered a brand-new player a row
    // about a feature they have never seen — on the one card whose whole rule is that it
    // does not do that. A browser found it; no amount of arithmetic here would have.
    expect(readyRows(ready(), NO_BADGES, { unlocked: false, runsLeftToday: 30 }, SPRINGS)).toEqual(
      [],
    );
    const open = readyRows(ready(), NO_BADGES, farming(30), SPRINGS);
    expect(open.map((row) => row.key)).toEqual(['multi']);
    expect(open[0]?.value).toBe('30');
  });

  it('says nothing about mail, which lives in the top bar', () => {
    // Its pip is on the envelope beside the wallet and always visible; repeating it here
    // would be the card competing with the chrome rather than adding to it.
    expect(readyRows(ready(), { ...NO_BADGES, mail: 4 }, NO_FARMING, SPRINGS)).toEqual([]);
  });
});
