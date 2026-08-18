/**
 * The names the game asks for sounds by.
 *
 * A contract rather than a catalogue: content decides what each of these *is* — bus,
 * voice, whether a recording stands behind it — and may define as many more as it likes.
 * What lives here is the set the client knows how to ask for, so a seed that forgets one
 * is a failing test rather than a button that is silent forever.
 *
 * Deliberately short. A distinct noise per control sounds like a switchboard; what a
 * player learns is a handful of meanings, each used everywhere it applies.
 */
export const CUE = {
  press: 'ui_press',
  back: 'ui_back',
  open: 'ui_open',
  close: 'ui_close',
  tab: 'ui_tab',
  denied: 'ui_denied',
  toggle: 'ui_toggle',

  silver: 'reward_silver',
  crystals: 'reward_crystals',
  spend: 'reward_spend',
  relic: 'relic_drop',
  forgeSuccess: 'forge_success',
  forgeFail: 'forge_fail',

  hit: 'battle_hit',
  crit: 'battle_crit',
  heal: 'battle_heal',
  buff: 'battle_buff',
  debuff: 'battle_debuff',
  death: 'battle_death',
  wave: 'battle_wave',

  victory: 'victory',
  defeat: 'defeat',
  levelUp: 'level_up',
  unlock: 'unlock',
  summonCommon: 'summon_common',
  summonRare: 'summon_rare',
  summonLegendary: 'summon_legendary',
} as const;

export type CueName = (typeof CUE)[keyof typeof CUE];

/** Every key the client will ever ask for, for a seed to be checked against. */
export const CUE_KEYS: readonly CueName[] = Object.values(CUE);

/** Which reveal chime a pulled champion earns. */
export function summonCue(rarity: string): CueName {
  if (rarity === 'legendary') return CUE.summonLegendary;
  if (rarity === 'epic' || rarity === 'rare') return CUE.summonRare;
  return CUE.summonCommon;
}
