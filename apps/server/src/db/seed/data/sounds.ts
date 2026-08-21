import { MUSIC, type SoundCueDef, type SynthVoice } from '@mistvale/shared';

/**
 * What Mistvale sounds like.
 *
 * Every cue is content, so an operator can retune any of it in Admin and a dropped-in
 * audio pack replaces a synth voice one field at a time (see USER_QUESTIONS Q4). What is
 * seeded here is the fallback: short shaped tones and noise bursts, which is what a pixel
 * game's interface has always been made of, and which costs nothing to ship and nothing to
 * licence.
 *
 * The vocabulary is deliberately small — twenty-odd cues rather than one per button. A
 * game with a distinct noise for every control sounds like a switchboard; what a player
 * actually learns is a handful of meanings. **Something happened**, **you spent**, **you
 * gained**, **no**, **something rare**. Each is one cue used everywhere it applies.
 *
 * Ranges worth knowing when retuning: below ~200 Hz reads as weight, 400–900 Hz as
 * interface, above ~1.5 kHz as sparkle. A downward sweep is a refusal or a landing; an
 * upward one is an opening or a reward. `decay` under 0.1 s is a tick, over 0.4 s is an
 * event.
 */

type Voice = Partial<SynthVoice>;

function cue(
  key: string,
  sortOrder: number,
  bus: SoundCueDef['bus'],
  voice: Voice,
  throttleMs = 40,
): SoundCueDef {
  return {
    key,
    sortOrder,
    bus,
    sample: '',
    loop: false,
    // Parsed through the schema at publish, so the defaults fill everything omitted here.
    voice: voice as SynthVoice,
    throttleMs,
    active: true,
  };
}

/**
 * A cue that plays a file rather than a shape.
 *
 * `throttleMs` is zero and `loop` is on because the only entries built this way are the two
 * tracks: a throttle on something that plays for four minutes could only ever refuse the one
 * restart it needs.
 */
function track(key: string, sortOrder: number, sample: string): SoundCueDef {
  return {
    key,
    sortOrder,
    bus: 'music',
    sample,
    loop: true,
    voice: {} as SynthVoice,
    throttleMs: 0,
    active: true,
  };
}

export const SOUND_CUES: SoundCueDef[] = [
  // ── The interface ─────────────────────────────────────────────────────────
  // The one a player hears a thousand times, so it is the quietest and shortest thing
  // here. A press should register rather than announce itself.
  cue('ui_press', 10, 'ui', {
    wave: 'square',
    startHz: 620,
    endHz: 560,
    decay: 0.05,
    gain: 0.22,
    filterHz: 2600,
  }),
  // Softer and lower than a press: this is the sound of putting something down.
  cue('ui_back', 20, 'ui', {
    wave: 'triangle',
    startHz: 420,
    endHz: 300,
    decay: 0.07,
    gain: 0.2,
    filterHz: 1800,
  }),
  cue('ui_open', 30, 'ui', {
    wave: 'triangle',
    startHz: 380,
    endHz: 720,
    decay: 0.14,
    gain: 0.26,
    filterHz: 3200,
  }),
  cue('ui_close', 40, 'ui', {
    wave: 'triangle',
    startHz: 720,
    endHz: 360,
    decay: 0.12,
    gain: 0.24,
    filterHz: 2400,
  }),
  cue('ui_tab', 50, 'ui', {
    wave: 'square',
    startHz: 880,
    endHz: 880,
    decay: 0.04,
    gain: 0.16,
    filterHz: 3400,
  }),
  // The refusal. Downward, dull, and short enough not to scold.
  cue('ui_denied', 60, 'ui', {
    wave: 'sawtooth',
    startHz: 300,
    endHz: 150,
    decay: 0.18,
    gain: 0.3,
    filterHz: 900,
  }),
  cue('ui_toggle', 70, 'ui', {
    wave: 'square',
    startHz: 520,
    endHz: 780,
    decay: 0.05,
    gain: 0.18,
    filterHz: 3000,
  }),

  // ── Money and things ──────────────────────────────────────────────────────
  // Bright, metallic, two voices a fifth apart — the coin sound every game has, because
  // it is the one that reads instantly as "you are better off than a second ago".
  cue('reward_silver', 100, 'sfx', {
    wave: 'square',
    startHz: 1180,
    endHz: 1560,
    decay: 0.22,
    gain: 0.3,
    filterHz: 7000,
    overtones: [7, 12],
  }),
  cue('reward_crystals', 110, 'sfx', {
    wave: 'sine',
    startHz: 1320,
    endHz: 2100,
    decay: 0.34,
    gain: 0.28,
    filterHz: 9000,
    overtones: [12, 19],
  }),
  // Spending is the same gesture downward. A player should be able to tell a purchase
  // from a payout with their eyes shut.
  cue('reward_spend', 120, 'sfx', {
    wave: 'square',
    startHz: 900,
    endHz: 560,
    decay: 0.18,
    gain: 0.26,
    filterHz: 4200,
  }),
  cue('relic_drop', 130, 'sfx', {
    wave: 'triangle',
    startHz: 700,
    endHz: 1400,
    decay: 0.4,
    gain: 0.32,
    filterHz: 8000,
    overtones: [5, 12],
  }),
  // The forge lands rather than rings: a low noise burst with the filter almost shut.
  cue('forge_success', 140, 'sfx', {
    source: 'noise',
    decay: 0.3,
    gain: 0.34,
    filterHz: 700,
    overtones: [],
  }),
  cue('forge_fail', 150, 'sfx', {
    source: 'noise',
    decay: 0.22,
    gain: 0.26,
    filterHz: 300,
  }),

  // ── Battle ────────────────────────────────────────────────────────────────
  // Throttled hard: a five-hit skill fires this five times inside a third of a second,
  // and without a floor it is a buzz rather than five hits.
  cue(
    'battle_hit',
    200,
    'sfx',
    {
      source: 'noise',
      decay: 0.1,
      gain: 0.26,
      filterHz: 1900,
    },
    55,
  ),
  cue(
    'battle_crit',
    210,
    'sfx',
    {
      source: 'noise',
      decay: 0.2,
      gain: 0.38,
      filterHz: 4200,
    },
    90,
  ),
  cue(
    'battle_heal',
    220,
    'sfx',
    {
      wave: 'sine',
      startHz: 520,
      endHz: 880,
      decay: 0.3,
      gain: 0.24,
      filterHz: 5000,
      overtones: [7],
    },
    90,
  ),
  cue(
    'battle_buff',
    230,
    'sfx',
    {
      wave: 'triangle',
      startHz: 440,
      endHz: 660,
      decay: 0.2,
      gain: 0.2,
      filterHz: 4000,
    },
    90,
  ),
  cue(
    'battle_debuff',
    240,
    'sfx',
    {
      wave: 'sawtooth',
      startHz: 440,
      endHz: 260,
      decay: 0.22,
      gain: 0.2,
      filterHz: 1400,
    },
    90,
  ),
  cue(
    'battle_death',
    250,
    'sfx',
    {
      wave: 'sawtooth',
      startHz: 340,
      endHz: 90,
      decay: 0.5,
      gain: 0.3,
      filterHz: 1100,
    },
    120,
  ),
  cue(
    'battle_wave',
    260,
    'sfx',
    {
      source: 'noise',
      decay: 0.45,
      gain: 0.3,
      filterHz: 1200,
    },
    200,
  ),

  // ── The moments ───────────────────────────────────────────────────────────
  // The only cues allowed to be long. Four voices climbing is a fanfare in eight numbers.
  cue(
    'victory',
    300,
    'sfx',
    {
      wave: 'square',
      startHz: 523,
      endHz: 784,
      attack: 0.01,
      decay: 0.9,
      gain: 0.3,
      filterHz: 6000,
      overtones: [4, 7, 12],
    },
    0,
  ),
  cue(
    'defeat',
    310,
    'sfx',
    {
      wave: 'sawtooth',
      startHz: 392,
      endHz: 196,
      attack: 0.01,
      decay: 1.1,
      gain: 0.28,
      filterHz: 1400,
      overtones: [-5],
    },
    0,
  ),
  cue(
    'level_up',
    320,
    'sfx',
    {
      wave: 'square',
      startHz: 659,
      endHz: 1046,
      attack: 0.008,
      decay: 0.7,
      gain: 0.3,
      filterHz: 7000,
      overtones: [4, 7, 12],
    },
    0,
  ),
  cue(
    'unlock',
    330,
    'sfx',
    {
      wave: 'triangle',
      startHz: 440,
      endHz: 1320,
      attack: 0.01,
      decay: 0.8,
      gain: 0.28,
      filterHz: 6000,
      overtones: [7, 12],
    },
    0,
  ),
  // The Mistgate, by rarity. The gap between these three *is* the pull's drama, so they
  // are deliberately far apart rather than three shades of the same chime.
  cue(
    'summon_common',
    340,
    'sfx',
    {
      wave: 'triangle',
      startHz: 500,
      endHz: 620,
      decay: 0.28,
      gain: 0.22,
      filterHz: 3000,
    },
    0,
  ),
  cue(
    'summon_rare',
    350,
    'sfx',
    {
      wave: 'square',
      startHz: 700,
      endHz: 1100,
      decay: 0.5,
      gain: 0.28,
      filterHz: 6000,
      overtones: [7],
    },
    0,
  ),
  // ── The music ─────────────────────────────────────────────────────────────
  // The two tracks, and the only entries in the catalogue standing on a recording rather
  // than on a synth voice. There is no synthesising a soundtrack: a cue is a shaped tone a
  // few hundred milliseconds long, and what these point at is minutes of the owner's own
  // music. A missing file is silence, exactly like a missing cue.
  //
  // `voice` is left at its defaults and never reached, because `sample` wins.
  track(MUSIC.field, 900, 'audio/music/background_music_outside_combat.mp3'),
  track(MUSIC.combat, 910, 'audio/music/combat_campaign_depths_arena.mp3'),
  cue(
    'summon_legendary',
    360,
    'sfx',
    {
      wave: 'square',
      startHz: 523,
      endHz: 1568,
      attack: 0.02,
      decay: 1.4,
      gain: 0.34,
      filterHz: 9000,
      overtones: [7, 12, 16, 19],
    },
    0,
  ),
];
