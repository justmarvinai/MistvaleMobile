import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DOCK_SCREENS,
  PLACES,
  SCREENS,
  hubFor,
  isHub,
  screensInHub,
  type HubId,
  type ScreenId,
} from './screens';
import { highlightCandidates } from './highlight';

/**
 * The two rules C12 is made of, guarded.
 *
 * Both are the kind of thing that is obvious in a screenshot and invisible to every test
 * that drives roles and text — which is the class of defect this project keeps finding —
 * so they are checked as *facts about the source* rather than by rendering anything.
 */

const HUBS: HubId[] = ['battleHub', 'championsHub', 'errandsHub'];

describe('the dock', () => {
  it('is short enough to read', () => {
    // The whole point of C12. Nineteen entries is a wall of 20px glyphs; the number-key
    // shortcuts only reach nine; and the owner's word for it was "overwhelming".
    expect(DOCK_SCREENS.length).toBeLessThanOrEqual(8);
  });

  it('reaches every screen exactly one way', () => {
    // A destination in the dock *and* on a hub is one a player has to be told about twice,
    // and one in neither is `settings`, which sat unreachable in the registry for nine
    // phases. Takeovers are the deliberate exception: they are entered from inside a flow.
    const takeovers: ScreenId[] = ['battle', 'mail'];
    for (const screen of SCREENS) {
      if (takeovers.includes(screen.id)) continue;
      const inDock = screen.inDock;
      const inHub = screen.group !== undefined;
      expect(inDock || inHub, `${screen.id} is reachable from nowhere`).toBe(true);
      expect(inDock && inHub, `${screen.id} is reachable two ways`).toBe(false);
    }
  });

  it('gives every hub something to hold', () => {
    for (const hub of HUBS) {
      expect(screensInHub(hub).length, hub).toBeGreaterThan(0);
    }
  });

  it('does not nest a hub inside a hub', () => {
    for (const hub of HUBS) {
      for (const member of screensInHub(hub)) {
        expect(isHub(member.id), `${member.id} is a hub inside ${hub}`).toBe(false);
      }
    }
  });
});

describe('the Haven', () => {
  it('is not the dock in bigger boxes', () => {
    // The camp's rail filtered `DOCK_SCREENS`, which was the whole game while the dock held
    // nineteen destinations — and became the dock's own six the moment C12 made them hubs,
    // so pressing Haven showed a player the navigation they had just pressed. Nothing said
    // so, because the filter stayed correct and only its input moved underneath it.
    const docked = new Set(DOCK_SCREENS.map((screen) => screen.id));
    const beyond = PLACES.filter((place) => !docked.has(place.id));
    expect(beyond.length, 'the camp offers nothing the dock does not').toBeGreaterThan(8);
  });

  it('holds places rather than rooms that hold places', () => {
    for (const place of PLACES) {
      expect(isHub(place.id), `${place.id} is a hub`).toBe(false);
      expect(place.id, 'the camp is not a place in itself').not.toBe('haven');
    }
  });

  it('is one press from every destination', () => {
    // The rule the two views divide on: the dock is the index and the Haven is the place.
    const takeovers: ScreenId[] = ['battle', 'mail'];
    for (const screen of SCREENS) {
      if (isHub(screen.id) || screen.id === 'haven' || takeovers.includes(screen.id)) continue;
      expect(
        PLACES.some((place) => place.id === screen.id),
        `${screen.id} is nowhere in the camp`,
      ).toBe(true);
    }
  });
});

describe('a tutorial step pointing at a dock slot', () => {
  it('follows a screen into the hub that now holds it', () => {
    // Step 15 of the shipped script says `dock:depths`, and the Depths lost its dock slot
    // in C12. The lookup falls back rather than the script being re-cut, so the same key
    // keeps meaning "the way to the Depths" however the navigation is arranged later.
    expect(hubFor('depths')).toBe('battleHub');
    expect(highlightCandidates('dock:depths')).toEqual([
      'dock:depths',
      'dock:battleHub',
      'place:depths',
    ]);
  });

  it('leaves a dock entry and a non-dock key alone', () => {
    expect(highlightCandidates('dock:haven')).toEqual(['dock:haven']);
    expect(highlightCandidates('button:relic-upgrade')).toEqual(['button:relic-upgrade']);
  });
});

/**
 * The layout rule, read straight out of the stylesheets.
 *
 * `repeat(auto-fill, minmax(X, 1fr))` is the bug the owner pointed at, and it is subtle
 * enough to have shipped on ten screens: `auto-fill` keeps the empty tracks a row could
 * hold, so the `1fr` written right beside it — the instruction to *stretch* — is shared out
 * among tracks that do not exist. Three cards in a wide window stay at their minimum with
 * the leftover space parked in phantom columns beside them, which is exactly what the
 * Expeditions screen was doing.
 *
 * `auto-fit` collapses the empty tracks, so the real cards get the row.
 *
 * Fixed-width tracks — `repeat(auto-fill, 150px)` — are *correct* with auto-fill and are
 * not flagged: a library card has its own width and D9's guard is about keeping it, so
 * stretching those tracks would reintroduce the bug that phase spent four attempts on.
 */
describe('card grids', () => {
  const root = join(import.meta.dirname, '..');

  function stylesheets(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return stylesheets(path);
      return path.endsWith('.module.scss') ? [path] : [];
    });
  }

  /**
   * A dialog's width is a preference, not a floor.
   *
   * Six dialog bodies carried `min-width: 30rem` — wider than a phone, so on a handset the
   * modal overflowed and the overflow landed as controls stacked *under* each other. The
   * starter dialog's confirm button sat beneath a champion card at 430px, which is a game
   * a new player on a phone cannot start. B2 chased exactly this on the team chooser and
   * called it "the bugged window"; the pattern survived in six other files.
   *
   * `min(30rem, 100%)` keeps the desktop number and lets a narrow window have what it has.
   */
  it('do not floor a dialog wider than a phone', () => {
    const offenders: string[] = [];
    for (const path of stylesheets(root)) {
      if (path.includes(`${'fui'}/`)) continue;
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const match = /min-width:\s*([0-9.]+)rem\s*;/.exec(line);
        // 24rem is 384px — comfortably inside the narrowest handset the PWA targets. Below
        // that a floor is a chip or a button rather than a panel, and is not the bug.
        if (match && Number(match[1]) >= 24) {
          offenders.push(`${path.slice(root.length + 1)}: ${line.trim()}`);
        }
      }
    }
    expect(
      offenders,
      'a width wider than a phone must be a preference — use min(Nrem, 100%)',
    ).toEqual([]);
  });

  it('stretch rather than leaving phantom columns', () => {
    const offenders: string[] = [];
    for (const path of stylesheets(root)) {
      // The vendored library's own stylesheets are overwritten by the next vendor run, so
      // they are not ours to hold to this.
      if (path.includes(`${'fui'}/`)) continue;
      const source = readFileSync(path, 'utf8');
      for (const line of source.split('\n')) {
        if (line.includes('auto-fill') && line.includes('1fr')) {
          offenders.push(`${path.slice(root.length + 1)}: ${line.trim()}`);
        }
      }
    }
    expect(
      offenders,
      'auto-fill keeps empty tracks, so the 1fr beside it never reaches the real cards — use auto-fit',
    ).toEqual([]);
  });
});
