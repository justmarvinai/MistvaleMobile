/**
 * The names the game asks for sounds by.
 *
 * A contract rather than a catalogue: content decides what each of these *is* — bus,
 * patch, whether a recording stands behind it — and may define as many more as it likes.
 * What lives here is the set the client knows how to ask for, so a seed that forgets one
 * is a failing test rather than a button that is silent forever.
 *
 * Wider since C51, and on purpose. The first vocabulary was "a handful of meanings" and
 * two thirds of it was never fired: no sound when silver landed, a relic dropped, a level
 * turned over, a forge struck or a tab changed. What a player hears is what the game
 * *acknowledges*, and a game that acknowledges a press and nothing else is a prototype.
 * The line held is still the same one — a distinct noise per *meaning*, never per control.
 */
export const CUE = {
  // ── The interface ─────────────────────────────────────────────────────────
  press: 'ui_press',
  back: 'ui_back',
  open: 'ui_open',
  close: 'ui_close',
  tab: 'ui_tab',
  denied: 'ui_denied',
  toggle: 'ui_toggle',
  /** A card or a tile chosen — a champion picked for a slot, a relic picked in the vault. */
  select: 'ui_select',
  /** A commitment: a purchase, a send, a sign-off. Heavier than a press. */
  confirm: 'ui_confirm',
  /** Something collected — a quest, a day, a mail, a chest. */
  claim: 'ui_claim',
  equip: 'ui_equip',
  unequip: 'ui_unequip',

  // ── Money and things ──────────────────────────────────────────────────────
  silver: 'reward_silver',
  crystals: 'reward_crystals',
  spend: 'reward_spend',
  relic: 'relic_drop',
  /** An Epic or a Legendary piece: the same drop, announced. */
  relicRare: 'relic_drop_rare',
  forgeSuccess: 'forge_success',
  forgeFail: 'forge_fail',
  dismantle: 'relic_dismantle',
  reforge: 'relic_reforge',
  sell: 'relic_sell',

  // ── Progress ──────────────────────────────────────────────────────────────
  levelUp: 'level_up',
  championLevel: 'champion_level',
  rankUp: 'champion_rank',
  ascend: 'champion_ascend',
  awaken: 'champion_awaken',
  mastery: 'mastery_learned',
  unlock: 'unlock',

  // ── Battle ────────────────────────────────────────────────────────────────
  battleStart: 'battle_start',
  hit: 'battle_hit',
  /** The affinity was in the striker's favour: the same blow, landing harder. */
  hitStrong: 'battle_hit_strong',
  /** Against the grain: a glancing blow. */
  hitWeak: 'battle_hit_weak',
  crit: 'battle_crit',
  /** A shield took the whole of it. */
  block: 'battle_block',
  /** A status shrugged off — the one honest defensive beat this engine has (C9). */
  resist: 'battle_resist',
  heal: 'battle_heal',
  shield: 'battle_shield',
  buff: 'battle_buff',
  debuff: 'battle_debuff',
  death: 'battle_death',
  wave: 'battle_wave',
  /** A skill leaving the caster, before anything lands. One per breath, and one for none. */
  cast: 'battle_cast',
  castEmber: 'battle_cast_ember',
  castTide: 'battle_cast_tide',
  castVerdant: 'battle_cast_verdant',
  castMist: 'battle_cast_mist',
  /** The fight is waiting on the player. */
  turn: 'battle_turn',
  bossWard: 'boss_ward',
  bossBreak: 'boss_break',
  enrage: 'boss_enrage',
  summonAdds: 'boss_summon',
  extraTurn: 'battle_extra_turn',
  counter: 'battle_counter',

  // ── The moments ───────────────────────────────────────────────────────────
  victory: 'victory',
  defeat: 'defeat',

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
  /** The cards dealt out of the gate, before the first one turns. */
  summonDeal: 'summon_deal',
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

/** Which of the four casts a skill leaving a champion of this breath makes. */
export function castCue(element: string): CueName {
  switch (element) {
    case 'ember':
      return CUE.castEmber;
    case 'tide':
      return CUE.castTide;
    case 'verdant':
      return CUE.castVerdant;
    case 'mist':
      return CUE.castMist;
    default:
      return CUE.cast;
  }
}

/**
 * Which impact a blow makes.
 *
 * A crit outranks the affinity: it is the rarer thing and the one a player is listening
 * for. A blow a shield took whole is a block rather than a hit — a boss's ward reports the
 * entire blow as absorbed, and hearing that as a clean strike would tell the player the
 * exact opposite of what happened.
 */
export function hitCue(hit: {
  quality: 'normal' | 'strong' | 'weak';
  crit: boolean;
  amount: number;
  absorbed: number;
}): CueName {
  if (hit.amount <= 0 && hit.absorbed > 0) return CUE.block;
  if (hit.crit) return CUE.crit;
  if (hit.quality === 'strong') return CUE.hitStrong;
  if (hit.quality === 'weak') return CUE.hitWeak;
  return CUE.hit;
}

/** Which announcement a relic makes when it drops. */
export function relicCue(rarity: string): CueName {
  return rarity === 'legendary' || rarity === 'epic' ? CUE.relicRare : CUE.relic;
}
