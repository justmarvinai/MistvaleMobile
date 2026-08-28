import { auraCoversMode } from '@mistvale/shared';
import type { Aura, Stat } from '@mistvale/shared';
import { statLabel } from './labels';

/**
 * The leader's aura, as the sentence a player reads before committing a team.
 *
 * Content has carried an aura on every champion since P1 — one team-wide bonus, active
 * only from the leader slot, and the engine has applied it on every fight since P3
 * (`packages/engine/src/setup.ts`, `applyAura`). **No screen has ever said what it was.**
 * So the whole reason the slot order is the player's to choose has been invisible: the
 * champion in slot one has been changing the whole team's stats silently, and the only way
 * to find out which one to put there was to read the seed.
 *
 * That is the same shape of gap as C14's set bonus and D8's boss mechanics — real data on
 * the wire that no screen drew — and it belongs here, on the screen where the leader is
 * chosen and before the energy is spent.
 *
 * Four things go into the sentence and each is a real decision:
 *
 *  - **Which stat, and how much.** `value` is a percentage for the ratio stats and flat
 *    points for ACC and RES, which is the schema's own rule — writing "+30%" against a
 *    stat measured in points would be a number that means nothing.
 *  - **Who it reaches.** `scope` is `all`, or the leader's own element or faction — so the
 *    sentence has to name *the leader's*, which is why this takes them rather than reading
 *    the aura alone.
 *  - **Where it applies.** An aura scoped to the Arena is worth nothing on a campaign map,
 *    and a player choosing a leader for a Depths run needs that said out loud.
 */

/** The stats measured in points rather than as a percentage of base (`auraSchema`). */
const FLAT_STATS: ReadonlySet<Stat> = new Set<Stat>(['acc', 'res']);

/** Where an aura applies, in the game's own words for those places. */
const AREA_PHRASE: Readonly<Record<string, string>> = Object.freeze({
  any: 'in every battle',
  campaign: 'in the campaign',
  arena: 'in the Arena',
  depths: 'in the Depths',
});

export interface AuraLeader {
  /** The leader's element, resolved to its display name — `scope: 'element'` needs it. */
  element?: string | undefined;
  /** The leader's faction, resolved to its display name — `scope: 'faction'` needs it. */
  faction?: string | undefined;
}

/**
 * Who the aura reaches, as the words that go in front of "allies".
 *
 * Empty for `all`, which is what makes "Increases ally HP" and "Increases Ember ally HP"
 * one sentence with a hole in it rather than two sentences.
 */
function whoPhrase(aura: Aura, leader: AuraLeader): string {
  if (aura.scope === 'element') return leader.element ? `${leader.element} ` : '';
  if (aura.scope === 'faction') return leader.faction ? `${leader.faction} ` : '';
  return '';
}

/** The bonus itself: a percentage, or points for the two stats measured in them. */
export function auraAmount(aura: Aura): string {
  return FLAT_STATS.has(aura.stat) ? String(aura.value) : `${aura.value}%`;
}

/** The whole line, as it reads on the team screen. */
export function auraText(aura: Aura, leader: AuraLeader = {}): string {
  const who = whoPhrase(aura, leader);
  const where = AREA_PHRASE[aura.area] ?? AREA_PHRASE.any;
  return `Increases ${who}ally ${statLabel(aura.stat)} by ${auraAmount(aura)} ${where}.`;
}

/**
 * Whether an aura does anything in the fight about to be started.
 *
 * The screen still shows an aura that does not apply — hiding it would answer "why is
 * nothing happening" with silence — but it says so, because an Arena aura on a Depths
 * floor is the exact mistake this whole line exists to prevent.
 *
 * `auraCoversMode` is shared with the engine rather than reimplemented here, and the first
 * cut of this file is the argument for that: it read the four area names literally and so
 * had a campaign aura going dead in the tutorial and the sandbox, which the engine has
 * always counted as the campaign. A screen that disagrees with the fight it is describing
 * is worse than a screen that says nothing.
 */
export function auraApplies(aura: Aura, mode: string): boolean {
  return auraCoversMode(aura.area, mode);
}

/**
 * What a champion's aura is worth as a one-line boast, for a card rather than a banner.
 *
 * Same facts, no verb — "Ally HP +25%" — for the places that have a column rather than a
 * sentence's worth of room.
 */
export function auraShort(aura: Aura, leader: AuraLeader = {}): string {
  const who = whoPhrase(aura, leader);
  return `${who}Ally ${statLabel(aura.stat)} +${auraAmount(aura)}`;
}
