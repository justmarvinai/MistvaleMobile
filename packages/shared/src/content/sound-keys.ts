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
  /**
   * The Mistgate, in the order a pull hears them.
   *
   * `charge` under the wind-up, `tease` on each step the mist climbs, `burst` when it
   * breaks, then one of the four landing chimes per card that turns. The gap between the
   * landings is the pull's drama, which is why epic has its own rather than borrowing
   * rare's: the moment a player learns to want is the one where a purple turns gold, and
   * that is only legible if purple already sounded different.
   */
  summonCharge: 'summon_charge',
  summonTease: 'summon_tease',
  summonBurst: 'summon_burst',
  summonCommon: 'summon_common',
  summonRare: 'summon_rare',
  summonEpic: 'summon_epic',
  summonLegendary: 'summon_legendary',
} as const;

export type CueName = (typeof CUE)[keyof typeof CUE];

/** Every key the client will ever ask for, for a seed to be checked against. */
export const CUE_KEYS: readonly CueName[] = Object.values(CUE);

/**
 * The two pieces of music, by the same contract.
 *
 * Music is a `soundCue` like everything else — same table, same editor, same bus, same
 * volume — but it is kept out of `CUE` because nothing calls `playCue` with it. A cue is a
 * short rendered noise the game fires and forgets; a track is a file that streams, loops,
 * and is *replaced* rather than layered. `audio/tracks.ts` owns that difference, and these
 * are the keys it looks up.
 *
 * Which of the two is playing follows the screen and nothing else: the game is either in a
 * fight or it is not.
 */
export const MUSIC = {
  /** The Haven, the map, the roster — everywhere that is not a battle. */
  field: 'music_field',
  /** Campaign, the Depths, the Arena, the practice sandbox, the cold open. */
  combat: 'music_combat',
} as const;

export type MusicName = (typeof MUSIC)[keyof typeof MUSIC];

/** Both track keys, for the same seed check the cues get. */
export const MUSIC_KEYS: readonly MusicName[] = Object.values(MUSIC);

/** Which reveal chime a pulled champion earns. */
export function summonCue(rarity: string): CueName {
  if (rarity === 'legendary') return CUE.summonLegendary;
  if (rarity === 'epic') return CUE.summonEpic;
  if (rarity === 'rare') return CUE.summonRare;
  return CUE.summonCommon;
}
