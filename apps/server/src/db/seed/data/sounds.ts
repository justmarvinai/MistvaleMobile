import type { z } from 'zod';
import {
  MUSIC,
  soundCueDefSchema,
  type SoundCueDef,
  type synthLayerSchema,
  type synthPatchSchema,
} from '@mistvale/shared';

/**
 * What Mistvale sounds like (C51).
 *
 * Every cue is content, so an operator can retune any of it in Admin, and a recorded pack
 * replaces a synthesised cue one `sample` field at a time. What is seeded here is the
 * game's own voice: not a beep per button but a *design* per meaning, each built out of
 * two to five layers the way a sound designer builds one — a transient, a body and a tail;
 * a strike and its ring; a whoosh and the chime that lands out of it.
 *
 * The owner's word for what this replaced was "prototype", and the diagnosis is simple:
 * one oscillator, one envelope and a low-pass can make a tone, and a tone is not a sound.
 * What reads as a *game* making a noise is the stack — the click that says "contact", the
 * thump underneath that says "weight", the ring or the shimmer that says what kind of thing
 * it was, and a room around it that says it happened somewhere. So the catalogue is written
 * in a small kit of those parts (`click`, `thump`, `bell`, `whoosh`, `pad`, `shimmer`,
 * `clang`) and every cue is a handful of them combined and tuned.
 *
 * Ranges worth knowing when retuning: under ~120 Hz is weight, 300–900 Hz is body,
 * 1–3 kHz is presence and above ~4 kHz is sparkle. A filter closing over a sound is what
 * "punchy" means; a filter opening is a swell. A room of 1.2 s is a hall for an interface
 * sound and a closet for a fanfare. Every cue is **measured rather than guessed** — the
 * seed's own test renders each one and checks its length, its peak, how fast it arrives
 * and where its energy sits, per family, so a retune that turns a hit into a hum is a
 * failing test rather than something a player notices on a Tuesday.
 */

type Layer = z.input<typeof synthLayerSchema>;
type Patch = z.input<typeof synthPatchSchema>;

// ── The kit ─────────────────────────────────────────────────────────────────

/** The transient: a few milliseconds of bright noise. Contact, before anything else. */
const click = (over: Layer = {}): Layer => ({
  source: 'noise',
  amp: { attack: 0.0005, decay: 0.012 },
  filter: { type: 'highpass', startHz: 3000, endHz: 3000, q: 0.7 },
  gain: 0.5,
  ...over,
});

/** The body: a sine dropping in pitch under a closing low-pass. Weight. */
const thump = (startHz: number, endHz: number, decay: number, over: Layer = {}): Layer => ({
  source: 'sine',
  pitch: { startHz, endHz, curve: 'exp', glide: decay * 0.6 },
  amp: { attack: 0.002, decay },
  filter: { type: 'lowpass', startHz: 1800, endHz: 200, q: 0.8 },
  drive: 0.3,
  gain: 0.8,
  ...over,
});

/** An FM bell: a carrier rung by a modulator that dies with the note. Coins, chimes. */
const bell = (hz: number, decay: number, over: Layer = {}): Layer => ({
  source: 'fm',
  shape: 1.41,
  fmIndex: 3,
  pitch: { startHz: hz, endHz: hz },
  amp: { attack: 0.002, decay },
  gain: 0.6,
  ...over,
});

/** Struck metal: inharmonic partials. Clanks, clangs, anvils, shields. */
const clang = (hz: number, decay: number, over: Layer = {}): Layer => ({
  source: 'metal',
  shape: 1.3,
  pitch: { startHz: hz, endHz: hz * 0.97 },
  amp: { attack: 0.001, decay },
  filter: { type: 'highpass', startHz: 250, endHz: 250, q: 0.7 },
  drive: 0.2,
  gain: 0.55,
  ...over,
});

/** Band-passed noise sweeping: air moving. Casts, deals, openings. */
const whoosh = (fromHz: number, toHz: number, decay: number, over: Layer = {}): Layer => ({
  source: 'noise',
  amp: { attack: 0.02, decay },
  filter: { type: 'bandpass', startHz: fromHz, endHz: toHz, q: 1.6, curve: 'exp' },
  gain: 0.55,
  ...over,
});

/** A detuned saw stack under an opening low-pass: magic, warmth, a swell. */
const pad = (hz: number, decay: number, over: Layer = {}): Layer => ({
  source: 'sawtooth',
  pitch: { startHz: hz, endHz: hz },
  unison: { voices: 4, detuneCents: 14 },
  amp: { attack: 0.03, decay },
  filter: { type: 'lowpass', startHz: 500, endHz: 3200, q: 1.1, curve: 'exp' },
  gain: 0.45,
  ...over,
});

/** High FM sparkle with a little detune: the glint on a reward. */
const shimmer = (hz: number, decay: number, over: Layer = {}): Layer => ({
  source: 'fm',
  shape: 2,
  fmIndex: 1.8,
  pitch: { startHz: hz, endHz: hz * 1.02 },
  unison: { voices: 3, detuneCents: 9 },
  amp: { attack: 0.004, decay },
  filter: { type: 'highpass', startHz: 1500, endHz: 1500, q: 0.7 },
  gain: 0.3,
  ...over,
});

/** A plain interface tick: a short pulse with a little pitch movement. */
const tick = (startHz: number, endHz: number, decay: number, over: Layer = {}): Layer => ({
  source: 'pulse',
  shape: 0.3,
  pitch: { startHz, endHz, curve: 'exp' },
  amp: { attack: 0.001, decay },
  filter: { type: 'lowpass', startHz: 5000, endHz: 2200, q: 0.9 },
  gain: 0.45,
  ...over,
});

/** A small room, for anything that should sound like it happened somewhere. */
const room = (reverb: number, size = 1.2, damp = 0.4): Patch['space'] => ({
  reverb,
  size,
  damp,
});

/**
 * A smaller one for the interface: a chime wants a touch of place, and a full room behind
 * a hundred-millisecond tick is a second of tail on every press in the game.
 */
const booth = (reverb: number): Patch['space'] => ({
  reverb,
  size: 0.55,
  damp: 0.5,
  predelayMs: 6,
});

function cue(
  key: string,
  sortOrder: number,
  bus: SoundCueDef['bus'],
  patch: Patch,
  throttleMs = 40,
): SoundCueDef {
  return soundCueDefSchema.parse({
    key,
    sortOrder,
    bus,
    sample: '',
    loop: false,
    patch,
    throttleMs,
    active: true,
  });
}

/**
 * A cue that plays a file rather than a design.
 *
 * `throttleMs` is zero and `loop` is on because the only entries built this way are the two
 * tracks: a throttle on something that plays for four minutes could only ever refuse the one
 * restart it needs.
 */
function track(key: string, sortOrder: number, sample: string): SoundCueDef {
  return soundCueDefSchema.parse({
    key,
    sortOrder,
    bus: 'music',
    sample,
    loop: true,
    patch: {},
    throttleMs: 0,
    active: true,
  });
}

/** The nudge most cues carry: enough that a repeat is a repeat, never enough to retune it. */
const nudge = { pitchCents: 35, gainDb: 1.5 };

export const SOUND_CUES: SoundCueDef[] = [
  // ══ The interface ════════════════════════════════════════════════════════
  // The one a player hears a thousand times, so it is the quietest and shortest thing
  // here. A press should register rather than announce itself: contact and a tick.
  cue('ui_press', 10, 'ui', {
    layers: [click({ gain: 0.35 }), tick(1400, 900, 0.035, { gain: 0.3 })],
    variation: { pitchCents: 40, gainDb: 1 },
    master: 0.6,
  }),
  // Putting something down: lower, softer, a touch longer.
  cue('ui_back', 20, 'ui', {
    layers: [click({ gain: 0.2 }), tick(760, 440, 0.06, { gain: 0.3 })],
    variation: nudge,
    master: 0.6,
  }),
  // A panel arriving: air, then a small chime that lands out of it.
  cue('ui_open', 30, 'ui', {
    layers: [
      whoosh(400, 2600, 0.14, { gain: 0.5 }),
      bell(880, 0.22, { delayMs: 45, gain: 0.45, fmIndex: 2 }),
    ],
    space: booth(0.16),
    master: 0.9,
  }),
  cue('ui_close', 40, 'ui', {
    layers: [
      bell(660, 0.14, { gain: 0.4, fmIndex: 2 }),
      whoosh(2400, 320, 0.16, { delayMs: 20, gain: 0.45 }),
    ],
    space: booth(0.12),
    master: 0.9,
  }),
  cue('ui_tab', 50, 'ui', {
    layers: [click({ gain: 0.3 }), tick(1700, 1500, 0.04, { gain: 0.25 })],
    variation: { pitchCents: 25, gainDb: 1 },
    master: 0.55,
  }),
  // The refusal: a dull knock with a short sour tail. Down, and short enough not to scold.
  cue('ui_denied', 60, 'ui', {
    layers: [
      thump(240, 110, 0.09, { gain: 0.5, drive: 0.35 }),
      {
        source: 'sawtooth',
        pitch: { startHz: 220, endHz: 150, curve: 'exp' },
        harmonics: [-12],
        staggerMs: 0,
        amp: { attack: 0.004, decay: 0.16 },
        filter: { type: 'lowpass', startHz: 900, endHz: 300, q: 1.2 },
        drive: 0.3,
        gain: 0.4,
      },
    ],
    space: booth(0.08),
    master: 0.8,
  }),
  // Two ticks a fourth apart: something changed state.
  cue('ui_toggle', 70, 'ui', {
    layers: [
      tick(900, 900, 0.03, { gain: 0.3 }),
      tick(1200, 1200, 0.045, { delayMs: 45, gain: 0.3 }),
    ],
    master: 0.6,
  }),
  // A card chosen: a clean chime with a touch of glass.
  cue('ui_select', 80, 'ui', {
    layers: [click({ gain: 0.25 }), bell(1046, 0.13, { gain: 0.5, fmIndex: 2.2 })],
    space: booth(0.1),
    variation: { pitchCents: 20, gainDb: 1 },
    master: 0.85,
  }),
  // A commitment: weight under a warm bell.
  cue('ui_confirm', 90, 'ui', {
    layers: [
      thump(200, 90, 0.12, { gain: 0.55 }),
      bell(784, 0.34, { delayMs: 15, gain: 0.4 }),
      shimmer(2637, 0.28, { delayMs: 60, gain: 0.16 }),
    ],
    space: booth(0.2),
    master: 0.8,
  }),
  // A chest: a latch, a lid, and what was in it.
  cue('ui_claim', 95, 'ui', {
    layers: [
      click({ gain: 0.4 }),
      clang(620, 0.3, { gain: 0.4, harmonics: [7], staggerMs: 60 }),
      thump(150, 60, 0.14, { delayMs: 10, gain: 0.45 }),
      shimmer(3136, 0.36, { delayMs: 110, gain: 0.22 }),
    ],
    space: booth(0.24),
    master: 0.8,
  }),
  // A piece going into a socket: a clank with a little weight under it.
  cue('ui_equip', 96, 'ui', {
    layers: [
      click({ gain: 0.45 }),
      clang(900, 0.2, { gain: 0.45, shape: 1.4 }),
      thump(160, 70, 0.09, { gain: 0.4 }),
    ],
    space: booth(0.12),
    variation: nudge,
    master: 0.75,
  }),
  cue('ui_unequip', 97, 'ui', {
    layers: [click({ gain: 0.3 }), clang(700, 0.16, { gain: 0.45, shape: 1.4 })],
    space: booth(0.1),
    variation: nudge,
    master: 0.7,
  }),

  // ══ Money and things ═════════════════════════════════════════════════════
  // The coin: two bells a fraction apart, the second brighter, over a click. It is the
  // sound every game has, because it is the one that reads instantly as "you are better
  // off than a second ago".
  cue('reward_silver', 100, 'sfx', {
    layers: [
      click({ gain: 0.3 }),
      bell(1760, 0.32, { shape: 2.5, fmIndex: 2, gain: 0.55 }),
      bell(2093, 0.36, { shape: 2.5, fmIndex: 1.8, delayMs: 70, gain: 0.48 }),
    ],
    space: booth(0.16),
    variation: { pitchCents: 45, gainDb: 1.5 },
    master: 0.85,
  }),
  // Crystal: glassier, higher, and it rings on.
  cue('reward_crystals', 110, 'sfx', {
    layers: [
      bell(3136, 0.55, { shape: 1.41, fmIndex: 4, gain: 0.5 }),
      {
        source: 'sine',
        pitch: { startHz: 1568, endHz: 1568 },
        harmonics: [4, 7, 12],
        staggerMs: 55,
        amp: { attack: 0.003, decay: 0.45 },
        gain: 0.3,
      },
      whoosh(3000, 7000, 0.12, {
        filter: { type: 'bandpass', startHz: 3000, endHz: 7000, q: 1.2, curve: 'exp' },
        gain: 0.2,
      }),
    ],
    space: room(0.3, 1.6),
    variation: nudge,
    master: 0.85,
  }),
  // Spending is the same coin, going down and away. A player should be able to tell a
  // purchase from a payout with their eyes shut.
  cue('reward_spend', 120, 'sfx', {
    layers: [
      bell(1800, 0.24, {
        shape: 3.5,
        fmIndex: 2,
        pitch: { startHz: 1800, endHz: 1200 },
        gain: 0.4,
      }),
      thump(150, 60, 0.12, { delayMs: 30, gain: 0.45 }),
    ],
    space: room(0.1),
    master: 0.7,
  }),
  // A relic landing: metal with weight under it and a glint after.
  cue('relic_drop', 130, 'sfx', {
    layers: [
      click({ gain: 0.4 }),
      clang(520, 0.5, { gain: 0.5, shape: 1.1 }),
      thump(120, 50, 0.18, { gain: 0.5 }),
      shimmer(2093, 0.3, { delayMs: 120, gain: 0.2 }),
    ],
    space: room(0.24),
    variation: nudge,
    master: 0.8,
  }),
  // The same drop, announced: a rising four-note figure over it and a longer room.
  cue('relic_drop_rare', 135, 'sfx', {
    layers: [
      click({ gain: 0.4 }),
      clang(520, 0.5, { gain: 0.45, shape: 1.1 }),
      thump(120, 50, 0.18, { gain: 0.5 }),
      {
        source: 'sine',
        pitch: { startHz: 1046, endHz: 1046 },
        harmonics: [4, 7, 12],
        staggerMs: 70,
        amp: { attack: 0.003, decay: 0.7 },
        gain: 0.32,
        delayMs: 90,
      },
      shimmer(3136, 0.5, { delayMs: 300, gain: 0.24 }),
    ],
    space: room(0.38, 2),
    master: 0.8,
  }),
  // The anvil: a bright metallic crack over a deep thud, in a smithy.
  cue('forge_success', 140, 'sfx', {
    layers: [
      click({ gain: 0.55, filter: { type: 'highpass', startHz: 2000, endHz: 2000, q: 0.7 } }),
      clang(1400, 0.34, { gain: 0.5, shape: 1.6, drive: 0.35 }),
      thump(95, 40, 0.2, { gain: 0.7, drive: 0.5 }),
    ],
    space: room(0.28, 1.6, 0.3),
    variation: nudge,
    master: 0.85,
  }),
  // The hammer glancing off: dull, low, and a short dead ring.
  cue('forge_fail', 150, 'sfx', {
    layers: [
      {
        source: 'pink',
        amp: { attack: 0.002, decay: 0.26 },
        filter: { type: 'lowpass', startHz: 600, endHz: 250, q: 0.8 },
        gain: 0.5,
      },
      thump(110, 55, 0.2, { gain: 0.55 }),
      clang(700, 0.11, { gain: 0.22, shape: 1.6 }),
    ],
    space: room(0.14),
    master: 0.75,
  }),
  // Grinding a relic down: a crumble, a dead clank, and the bits landing.
  cue('relic_dismantle', 160, 'sfx', {
    layers: [
      {
        source: 'pink',
        amp: { attack: 0.01, decay: 0.38 },
        filter: { type: 'bandpass', startHz: 900, endHz: 280, q: 1.2 },
        gain: 0.5,
        drive: 0.2,
      },
      clang(600, 0.14, { gain: 0.3 }),
      click({
        delayMs: 90,
        gain: 0.3,
        filter: { type: 'highpass', startHz: 2500, endHz: 2500, q: 0.7 },
      }),
      click({
        delayMs: 160,
        gain: 0.22,
        filter: { type: 'highpass', startHz: 3500, endHz: 3500, q: 0.7 },
      }),
    ],
    space: room(0.16),
    master: 0.85,
  }),
  // Reforging: an arcane hum opening up, and a spark out of the top of it.
  cue('relic_reforge', 170, 'sfx', {
    layers: [
      pad(220, 0.5, {
        unison: { voices: 5, detuneCents: 18 },
        filter: { type: 'lowpass', startHz: 300, endHz: 3400, q: 1.4 },
        gain: 0.55,
      }),
      whoosh(600, 3000, 0.4, { gain: 0.45 }),
      bell(1760, 0.36, { delayMs: 250, fmIndex: 3.5, gain: 0.5 }),
    ],
    space: room(0.3, 1.6),
    master: 0.75,
  }),
  // Selling: a lower coin and a short thud, the sound of a counter.
  cue('relic_sell', 180, 'sfx', {
    layers: [
      click({ gain: 0.3 }),
      bell(1320, 0.28, { shape: 2.5, fmIndex: 2, gain: 0.5 }),
      thump(140, 60, 0.1, { delayMs: 20, gain: 0.4 }),
    ],
    space: booth(0.12),
    master: 0.8,
  }),

  // ══ Progress ═════════════════════════════════════════════════════════════
  // The account levelling: a four-note fanfare on a brassy pulse, a bell on the top of it.
  cue(
    'level_up',
    200,
    'sfx',
    {
      layers: [
        {
          source: 'pulse',
          shape: 0.3,
          pitch: { startHz: 523, endHz: 523 },
          unison: { voices: 3, detuneCents: 8 },
          harmonics: [4, 7, 12, 16],
          staggerMs: 75,
          amp: { attack: 0.01, decay: 0.85 },
          filter: { type: 'lowpass', startHz: 6000, endHz: 2400, q: 0.9 },
          gain: 0.5,
        },
        bell(1046, 0.8, { delayMs: 300, gain: 0.45 }),
        shimmer(3136, 0.6, { delayMs: 420, gain: 0.24 }),
      ],
      space: room(0.34, 2),
      master: 0.95,
    },
    0,
  ),
  // A champion levelling: shorter and lighter, a rising bell with a fifth over it.
  cue(
    'champion_level',
    210,
    'sfx',
    {
      layers: [
        bell(660, 0.34, {
          pitch: { startHz: 660, endHz: 880 },
          harmonics: [7],
          staggerMs: 70,
          gain: 0.8,
        }),
        shimmer(2637, 0.3, { delayMs: 120, gain: 0.22 }),
      ],
      space: room(0.2),
      master: 0.9,
    },
    0,
  ),
  // A rank: brass — a detuned saw stack with a fifth and an octave, a ring on top.
  cue(
    'champion_rank',
    220,
    'sfx',
    {
      layers: [
        pad(392, 0.7, {
          harmonics: [5, 12],
          staggerMs: 90,
          filter: { type: 'lowpass', startHz: 900, endHz: 2600, q: 1 },
          gain: 0.36,
        }),
        clang(1568, 0.5, { delayMs: 200, gain: 0.3, shape: 1.05 }),
        thump(110, 60, 0.18, { gain: 0.4 }),
      ],
      space: room(0.3, 1.6),
      master: 0.9,
    },
    0,
  ),
  // An ascension: a long rise, a pad opening under it, a shimmer at the top.
  cue(
    'champion_ascend',
    230,
    'sfx',
    {
      layers: [
        {
          source: 'sine',
          pitch: { startHz: 220, endHz: 880, curve: 'exp', glide: 0.6 },
          harmonics: [7],
          staggerMs: 0,
          amp: { attack: 0.05, decay: 0.95 },
          gain: 0.5,
        },
        pad(220, 1, {
          unison: { voices: 5, detuneCents: 16 },
          filter: { type: 'lowpass', startHz: 400, endHz: 4000, q: 1.2 },
          gain: 0.28,
        }),
        shimmer(3520, 0.6, { delayMs: 520, gain: 0.24 }),
      ],
      space: room(0.42, 2.4),
      master: 0.9,
    },
    0,
  ),
  // An awakening: the deepest thing in the game, then a bell over a choir.
  cue(
    'champion_awaken',
    240,
    'sfx',
    {
      layers: [
        thump(80, 28, 0.6, {
          gain: 0.7,
          drive: 0.35,
          filter: { type: 'lowpass', startHz: 900, endHz: 120, q: 0.9 },
        }),
        pad(131, 1.3, {
          unison: { voices: 6, detuneCents: 20 },
          filter: { type: 'lowpass', startHz: 300, endHz: 3000, q: 1.2 },
          gain: 0.3,
        }),
        bell(1046, 1.2, { delayMs: 320, fmIndex: 5, gain: 0.34 }),
        shimmer(4186, 0.7, { delayMs: 700, gain: 0.2 }),
      ],
      space: room(0.5, 3, 0.5),
      master: 0.85,
    },
    0,
  ),
  // A mastery learned: a rune lit — a clean FM strike with a fifth.
  cue('mastery_learned', 250, 'sfx', {
    layers: [
      click({ gain: 0.3 }),
      bell(1318, 0.38, { shape: 1.41, fmIndex: 2.5, harmonics: [7], staggerMs: 60, gain: 0.75 }),
    ],
    space: booth(0.2),
    master: 0.85,
  }),
  // A feature opening: a chime climbing a fifth and an octave, out of a rising breath.
  cue(
    'unlock',
    260,
    'sfx',
    {
      layers: [
        whoosh(500, 4000, 0.3, { gain: 0.3 }),
        bell(880, 0.7, { harmonics: [7, 12], staggerMs: 90, gain: 0.75 }),
        shimmer(3520, 0.5, { delayMs: 260, gain: 0.24 }),
      ],
      space: room(0.3, 1.8),
      master: 0.9,
    },
    0,
  ),

  // ══ Battle ═══════════════════════════════════════════════════════════════
  // The bell: a drum, a low brass swell and a rush of air, in a big room.
  cue(
    'battle_start',
    300,
    'sfx',
    {
      layers: [
        thump(70, 34, 0.5, {
          gain: 0.75,
          drive: 0.4,
          filter: { type: 'lowpass', startHz: 700, endHz: 90, q: 0.9 },
        }),
        pad(110, 0.6, {
          unison: { voices: 4, detuneCents: 12 },
          filter: { type: 'lowpass', startHz: 300, endHz: 1400, q: 1 },
          gain: 0.34,
        }),
        whoosh(200, 1800, 0.35, { delayMs: 40, gain: 0.3 }),
      ],
      space: room(0.3, 1.8),
      master: 0.85,
    },
    200,
  ),
  // The hit. Contact, weight, and a short burst of grit; throttled hard, because a five-hit
  // skill fires this five times inside a third of a second and without a floor it is a
  // buzz rather than five hits. Three may overlap; the fourth cuts the first.
  cue(
    'battle_hit',
    310,
    'sfx',
    {
      layers: [
        click({ gain: 0.5 }),
        thump(170, 50, 0.11, { gain: 0.7, drive: 0.35 }),
        {
          source: 'pink',
          amp: { attack: 0.001, decay: 0.12 },
          filter: { type: 'lowpass', startHz: 1800, endHz: 350, q: 1 },
          gain: 0.5,
        },
      ],
      variation: { pitchCents: 60, gainDb: 2 },
      polyphony: 3,
      master: 0.8,
    },
    45,
  ),
  // The same blow with the affinity behind it: heavier, and it cracks.
  cue(
    'battle_hit_strong',
    311,
    'sfx',
    {
      layers: [
        click({ gain: 0.55 }),
        thump(190, 40, 0.16, { gain: 0.8, drive: 0.5 }),
        {
          source: 'pink',
          amp: { attack: 0.001, decay: 0.16 },
          filter: { type: 'lowpass', startHz: 2600, endHz: 300, q: 1 },
          gain: 0.5,
        },
        clang(900, 0.12, { gain: 0.3, shape: 1.3 }),
      ],
      variation: { pitchCents: 50, gainDb: 2 },
      polyphony: 3,
      master: 0.74,
    },
    60,
  ),
  // Against the grain: a glancing blow, light and dry.
  cue(
    'battle_hit_weak',
    312,
    'sfx',
    {
      layers: [
        click({ gain: 0.4 }),
        {
          source: 'noise',
          amp: { attack: 0.001, decay: 0.07 },
          filter: { type: 'lowpass', startHz: 1200, endHz: 500, q: 0.8 },
          gain: 0.4,
        },
        {
          source: 'sine',
          pitch: { startHz: 300, endHz: 200 },
          amp: { attack: 0.001, decay: 0.06 },
          gain: 0.35,
        },
      ],
      variation: { pitchCents: 60, gainDb: 2 },
      polyphony: 3,
      master: 0.6,
    },
    45,
  ),
  // The crit: the strong hit and a ring that says it was more than a hit.
  cue(
    'battle_crit',
    320,
    'sfx',
    {
      layers: [
        click({ gain: 0.45, filter: { type: 'highpass', startHz: 2000, endHz: 2000, q: 0.7 } }),
        thump(200, 38, 0.18, { gain: 0.82, drive: 0.55 }),
        {
          source: 'pink',
          amp: { attack: 0.001, decay: 0.18 },
          filter: { type: 'lowpass', startHz: 3000, endHz: 300, q: 1 },
          gain: 0.45,
        },
        clang(1500, 0.3, { gain: 0.4, shape: 1.5, delayMs: 8 }),
        bell(2200, 0.2, { delayMs: 20, fmIndex: 4, gain: 0.26 }),
      ],
      space: room(0.14),
      variation: { pitchCents: 40, gainDb: 1.5 },
      polyphony: 3,
      master: 0.95,
    },
    80,
  ),
  // A shield taking the whole blow: a clang without the crack, and no weight under it.
  cue(
    'battle_block',
    330,
    'sfx',
    {
      layers: [
        click({ gain: 0.4 }),
        clang(1100, 0.28, { gain: 0.5, shape: 1.1 }),
        thump(140, 70, 0.1, { gain: 0.35 }),
      ],
      space: room(0.12),
      variation: nudge,
      master: 0.8,
    },
    70,
  ),
  // A status shrugged off: air deflected, and a short falling tick.
  cue(
    'battle_resist',
    340,
    'sfx',
    {
      layers: [whoosh(2500, 600, 0.15, { gain: 0.5 }), tick(800, 500, 0.08, { gain: 0.35 })],
      variation: nudge,
      master: 0.8,
    },
    80,
  ),
  // Healing: a rising sine with a fourth and a fifth, a shimmer, and a breath under it.
  cue(
    'battle_heal',
    350,
    'sfx',
    {
      layers: [
        {
          source: 'sine',
          pitch: { startHz: 523, endHz: 784, curve: 'exp', glide: 0.25 },
          harmonics: [4, 7],
          staggerMs: 60,
          amp: { attack: 0.01, decay: 0.45 },
          gain: 0.5,
        },
        shimmer(2093, 0.35, { delayMs: 100, gain: 0.2 }),
        {
          source: 'pink',
          amp: { attack: 0.03, decay: 0.3 },
          filter: { type: 'bandpass', startHz: 700, endHz: 2400, q: 1.4 },
          gain: 0.22,
        },
      ],
      space: room(0.28, 1.5),
      variation: { pitchCents: 20, gainDb: 1 },
      master: 0.9,
    },
    90,
  ),
  // A shield going up: a pad opening and a ring settling on top of it.
  cue(
    'battle_shield',
    360,
    'sfx',
    {
      layers: [
        pad(262, 0.4, {
          filter: { type: 'lowpass', startHz: 300, endHz: 2500, q: 1.2 },
          gain: 0.32,
        }),
        clang(1046, 0.3, { delayMs: 80, gain: 0.5, shape: 1.05 }),
      ],
      space: room(0.24),
      master: 0.9,
    },
    90,
  ),
  // A buff: rising sparkle.
  cue(
    'battle_buff',
    370,
    'sfx',
    {
      layers: [
        bell(880, 0.3, {
          pitch: { startHz: 880, endHz: 1320 },
          shape: 2,
          fmIndex: 2.5,
          gain: 0.36,
        }),
        {
          source: 'sine',
          pitch: { startHz: 1760, endHz: 1760 },
          harmonics: [12],
          staggerMs: 50,
          amp: { attack: 0.004, decay: 0.24 },
          gain: 0.2,
          delayMs: 60,
        },
      ],
      space: room(0.18),
      variation: { pitchCents: 20, gainDb: 1 },
      master: 0.9,
    },
    90,
  ),
  // A debuff: a sour falling saw with grit, and a low breath.
  cue(
    'battle_debuff',
    380,
    'sfx',
    {
      layers: [
        {
          source: 'sawtooth',
          pitch: { startHz: 440, endHz: 220, curve: 'exp' },
          amp: { attack: 0.004, decay: 0.3 },
          filter: { type: 'lowpass', startHz: 1600, endHz: 400, q: 1.6 },
          drive: 0.2,
          gain: 0.4,
        },
        {
          source: 'noise',
          amp: { attack: 0.01, decay: 0.2 },
          filter: { type: 'bandpass', startHz: 800, endHz: 200, q: 1.4 },
          gain: 0.3,
        },
      ],
      space: room(0.14),
      variation: { pitchCents: 30, gainDb: 1 },
      master: 0.85,
    },
    90,
  ),
  // A death: the deepest thump, a falling saw, and the air going out of the room.
  cue(
    'battle_death',
    390,
    'sfx',
    {
      layers: [
        thump(120, 28, 0.6, {
          gain: 0.75,
          drive: 0.5,
          filter: { type: 'lowpass', startHz: 900, endHz: 100, q: 0.9 },
        }),
        {
          source: 'sawtooth',
          pitch: { startHz: 200, endHz: 55, curve: 'exp' },
          amp: { attack: 0.005, decay: 0.5 },
          filter: { type: 'lowpass', startHz: 1200, endHz: 150, q: 1.3 },
          drive: 0.3,
          gain: 0.4,
        },
        {
          source: 'pink',
          amp: { attack: 0.01, decay: 0.4 },
          filter: { type: 'lowpass', startHz: 900, endHz: 100, q: 0.8 },
          gain: 0.4,
        },
      ],
      space: room(0.3, 1.5),
      master: 0.85,
    },
    120,
  ),
  // A wave turning over: a drum, a rush of air, and a low bell under the announcement.
  cue(
    'battle_wave',
    400,
    'sfx',
    {
      layers: [
        thump(60, 38, 0.5, {
          gain: 0.7,
          drive: 0.35,
          filter: { type: 'lowpass', startHz: 600, endHz: 90, q: 0.9 },
        }),
        whoosh(300, 2000, 0.5, { gain: 0.35 }),
        clang(400, 0.4, { gain: 0.24, shape: 1.8, delayMs: 30 }),
      ],
      space: room(0.3, 1.8),
      master: 0.85,
    },
    200,
  ),
  // A skill leaving a champion: air, and a little rising tone in it. The four breaths are
  // the same gesture with their own material in it — fire, water, growth and fog.
  cue(
    'battle_cast',
    410,
    'sfx',
    {
      layers: [
        whoosh(500, 3500, 0.28, {
          filter: { type: 'bandpass', startHz: 500, endHz: 3500, q: 2, curve: 'exp' },
          gain: 0.65,
        }),
        {
          source: 'sine',
          pitch: { startHz: 330, endHz: 660 },
          amp: { attack: 0.01, decay: 0.2 },
          gain: 0.26,
        },
      ],
      variation: nudge,
      master: 0.85,
    },
    60,
  ),
  cue(
    'battle_cast_ember',
    411,
    'sfx',
    {
      layers: [
        {
          source: 'pink',
          amp: { attack: 0.01, decay: 0.35 },
          filter: { type: 'bandpass', startHz: 900, endHz: 2200, q: 1.5 },
          drive: 0.4,
          gain: 0.5,
        },
        {
          source: 'sawtooth',
          pitch: { startHz: 180, endHz: 90, curve: 'exp' },
          amp: { attack: 0.01, decay: 0.3 },
          filter: { type: 'lowpass', startHz: 1500, endHz: 400, q: 1.2 },
          drive: 0.4,
          gain: 0.34,
        },
        click({
          delayMs: 90,
          gain: 0.3,
          filter: { type: 'highpass', startHz: 4000, endHz: 4000, q: 0.7 },
        }),
        click({
          delayMs: 170,
          gain: 0.24,
          filter: { type: 'highpass', startHz: 5000, endHz: 5000, q: 0.7 },
        }),
      ],
      space: room(0.12),
      variation: nudge,
      master: 0.8,
    },
    60,
  ),
  cue(
    'battle_cast_tide',
    412,
    'sfx',
    {
      layers: [
        {
          source: 'noise',
          amp: { attack: 0.02, decay: 0.4 },
          filter: { type: 'bandpass', startHz: 400, endHz: 1200, q: 3 },
          gain: 0.65,
        },
        {
          source: 'sine',
          pitch: { startHz: 300, endHz: 220, vibratoHz: 6, vibratoCents: 60 },
          amp: { attack: 0.02, decay: 0.35 },
          gain: 0.42,
        },
        bell(1400, 0.25, { delayMs: 60, fmIndex: 1.5, gain: 0.36 }),
      ],
      space: room(0.22, 1.4),
      variation: nudge,
      master: 0.9,
    },
    60,
  ),
  cue(
    'battle_cast_verdant',
    413,
    'sfx',
    {
      layers: [
        pad(220, 0.4, {
          pitch: { startHz: 220, endHz: 440 },
          unison: { voices: 3, detuneCents: 10 },
          filter: { type: 'lowpass', startHz: 400, endHz: 3000, q: 1.2 },
          gain: 0.3,
        }),
        {
          source: 'pink',
          amp: { attack: 0.02, decay: 0.3 },
          filter: { type: 'bandpass', startHz: 1500, endHz: 3500, q: 1.2 },
          gain: 0.5,
        },
        bell(2637, 0.25, { delayMs: 200, shape: 2, fmIndex: 2, gain: 0.36 }),
      ],
      space: room(0.2),
      variation: nudge,
      master: 0.85,
    },
    60,
  ),
  cue(
    'battle_cast_mist',
    414,
    'sfx',
    {
      layers: [
        {
          source: 'sine',
          pitch: { startHz: 440, endHz: 880, curve: 'exp', glide: 0.3 },
          unison: { voices: 5, detuneCents: 25 },
          amp: { attack: 0.03, decay: 0.45 },
          gain: 0.5,
        },
        {
          source: 'pink',
          amp: { attack: 0.03, decay: 0.4 },
          filter: { type: 'lowpass', startHz: 1500, endHz: 600, q: 0.8 },
          gain: 0.4,
        },
        shimmer(3520, 0.3, { delayMs: 150, gain: 0.2 }),
      ],
      space: room(0.35, 1.8),
      variation: nudge,
      master: 0.85,
    },
    60,
  ),
  // The fight waiting on the player: two quiet notes, a prompt rather than an alarm.
  cue(
    'battle_turn',
    420,
    'sfx',
    {
      layers: [
        bell(1046, 0.15, { shape: 2, fmIndex: 1.5, gain: 0.45 }),
        bell(1318, 0.16, { shape: 2, fmIndex: 1.5, delayMs: 90, gain: 0.45 }),
      ],
      space: booth(0.1),
      master: 0.7,
    },
    300,
  ),
  // The ward holding: a heavy shield, the sound of a door that did not open.
  cue(
    'boss_ward',
    430,
    'sfx',
    {
      layers: [
        clang(500, 0.5, { gain: 0.5, shape: 1.05, drive: 0.2 }),
        thump(90, 45, 0.2, { gain: 0.6 }),
        pad(110, 0.4, { filter: { type: 'lowpass', startHz: 300, endHz: 900, q: 1 }, gain: 0.24 }),
      ],
      space: room(0.3, 1.8),
      master: 0.85,
    },
    0,
  ),
  // The ward breaking: a shatter — bright noise, a high crack, and the pieces coming down.
  cue(
    'boss_break',
    440,
    'sfx',
    {
      layers: [
        {
          source: 'noise',
          amp: { attack: 0.001, decay: 0.35 },
          filter: { type: 'highpass', startHz: 2500, endHz: 1200, q: 0.8 },
          gain: 0.5,
        },
        clang(1800, 0.3, { gain: 0.45, shape: 1.9 }),
        thump(120, 45, 0.16, { gain: 0.7 }),
        clang(600, 0.25, { gain: 0.3, shape: 1.2 }),
        click({ delayMs: 60, gain: 0.35 }),
        click({ delayMs: 120, gain: 0.3 }),
        click({ delayMs: 200, gain: 0.25 }),
      ],
      space: room(0.3, 1.6),
      master: 0.85,
    },
    0,
  ),
  // The enrage: a roar — a wide, gritty saw stack opening up over a growl and a drum.
  cue(
    'boss_enrage',
    450,
    'sfx',
    {
      layers: [
        pad(90, 0.8, {
          pitch: { startHz: 90, endHz: 60 },
          unison: { voices: 5, detuneCents: 30 },
          filter: { type: 'lowpass', startHz: 600, endHz: 2500, q: 1.4 },
          drive: 0.6,
          gain: 0.4,
        }),
        {
          source: 'pink',
          amp: { attack: 0.02, decay: 0.7 },
          filter: { type: 'bandpass', startHz: 300, endHz: 900, q: 1.2 },
          drive: 0.3,
          gain: 0.4,
        },
        thump(60, 28, 0.6, { gain: 0.7, drive: 0.4 }),
      ],
      space: room(0.35, 2),
      master: 0.8,
    },
    0,
  ),
  // Adds arriving: a drone rising out of the floor, air, and a bell as they land.
  cue(
    'boss_summon',
    460,
    'sfx',
    {
      layers: [
        {
          source: 'sawtooth',
          pitch: { startHz: 110, endHz: 220, curve: 'exp', glide: 0.4 },
          unison: { voices: 3, detuneCents: 12 },
          amp: { attack: 0.05, decay: 0.6 },
          filter: { type: 'lowpass', startHz: 500, endHz: 3000, q: 1.2 },
          gain: 0.55,
        },
        whoosh(300, 2500, 0.5, { gain: 0.45 }),
        clang(700, 0.3, { delayMs: 300, gain: 0.4 }),
      ],
      space: room(0.3, 1.8),
      master: 0.85,
    },
    0,
  ),
  // An extra turn: a quick rising bell with a click — "again".
  cue(
    'battle_extra_turn',
    470,
    'sfx',
    {
      layers: [
        click({ gain: 0.3 }),
        bell(660, 0.2, { pitch: { startHz: 660, endHz: 1320 }, shape: 2, fmIndex: 2, gain: 0.55 }),
      ],
      space: booth(0.12),
      master: 0.85,
    },
    100,
  ),
  // A counter: a riposte — a short high whoosh and a bright clank.
  cue(
    'battle_counter',
    480,
    'sfx',
    {
      layers: [
        whoosh(1500, 3000, 0.1, { gain: 0.4 }),
        clang(1200, 0.15, { delayMs: 30, gain: 0.4 }),
        click({ delayMs: 30, gain: 0.35 }),
      ],
      space: booth(0.1),
      variation: nudge,
      master: 0.85,
    },
    80,
  ),

  // ══ The moments ══════════════════════════════════════════════════════════
  // Victory: a brassy three-note rise, a bell over it, weight under it, a shimmer, and a
  // hall. The only cues allowed to be long, and this is the one they are long for.
  cue(
    'victory',
    500,
    'sfx',
    {
      layers: [
        {
          source: 'pulse',
          shape: 0.35,
          pitch: { startHz: 392, endHz: 392 },
          unison: { voices: 3, detuneCents: 10 },
          harmonics: [4, 7, 12],
          staggerMs: 110,
          amp: { attack: 0.01, decay: 1.1 },
          filter: { type: 'lowpass', startHz: 5000, endHz: 2000, q: 0.9 },
          gain: 0.55,
        },
        bell(1568, 0.9, { delayMs: 400, harmonics: [4], staggerMs: 120, gain: 0.45 }),
        thump(80, 50, 0.4, { gain: 0.5 }),
        shimmer(3136, 0.7, { delayMs: 650, gain: 0.22 }),
      ],
      space: room(0.4, 2.2),
      master: 0.95,
    },
    0,
  ),
  // Defeat: everything falling — a wide saw stack sliding down an octave under a closing
  // filter, the lowest thump, and the room's air going out slowly.
  cue(
    'defeat',
    510,
    'sfx',
    {
      layers: [
        {
          source: 'sawtooth',
          pitch: { startHz: 196, endHz: 98, curve: 'exp', glide: 0.8 },
          unison: { voices: 4, detuneCents: 20 },
          amp: { attack: 0.02, decay: 1.4 },
          filter: { type: 'lowpass', startHz: 900, endHz: 200, q: 1.1 },
          gain: 0.36,
        },
        thump(70, 28, 0.8, {
          gain: 0.7,
          drive: 0.3,
          filter: { type: 'lowpass', startHz: 600, endHz: 80, q: 0.9 },
        }),
        {
          source: 'pink',
          amp: { attack: 0.05, decay: 0.9 },
          filter: { type: 'lowpass', startHz: 400, endHz: 120, q: 0.8 },
          gain: 0.3,
        },
      ],
      space: room(0.4, 2.5, 0.6),
      master: 0.85,
    },
    0,
  ),

  // ══ The Mistgate ═════════════════════════════════════════════════════════
  // Three sounds for the wind-up and four for the landing. The gap between the landings
  // *is* the pull's drama, so they are deliberately far apart rather than four shades of
  // one chime — and the wind-up is what makes the gap mean anything, because a player who
  // has heard the mist climb is a player who knows it could have gone further.

  // The wind-up: a wide saw stack climbing under an opening filter, wind rising with it.
  // Slow attack, so it swells rather than starts, and it outlasts the animation it plays
  // under.
  cue(
    'summon_charge',
    600,
    'sfx',
    {
      layers: [
        {
          source: 'sawtooth',
          pitch: { startHz: 90, endHz: 360, curve: 'exp', glide: 1.4 },
          unison: { voices: 5, detuneCents: 20 },
          amp: { attack: 0.3, decay: 1.5 },
          filter: { type: 'lowpass', startHz: 300, endHz: 4000, q: 1.3 },
          gain: 0.45,
        },
        {
          source: 'pink',
          amp: { attack: 0.3, decay: 1.5 },
          filter: { type: 'bandpass', startHz: 200, endHz: 2000, q: 1.2 },
          gain: 0.4,
        },
        shimmer(2637, 0.6, { delayMs: 1100, gain: 0.22 }),
      ],
      space: room(0.35, 2),
      master: 0.9,
    },
    0,
  ),
  // One step up the ladder. Short and bright — this fires two or three times in a second
  // and a half, and anything with a tail would smear into the next one.
  cue(
    'summon_tease',
    610,
    'sfx',
    {
      layers: [
        click({ gain: 0.3 }),
        bell(880, 0.2, {
          pitch: { startHz: 880, endHz: 1100 },
          shape: 2,
          fmIndex: 2.2,
          gain: 0.55,
        }),
      ],
      space: booth(0.1),
      master: 0.85,
    },
    0,
  ),
  // The break. An impact, not a note: a shatter of noise, a deep thud, a high crack, and
  // a glint after.
  cue(
    'summon_burst',
    620,
    'sfx',
    {
      layers: [
        {
          source: 'noise',
          amp: { attack: 0.002, decay: 0.7 },
          filter: { type: 'bandpass', startHz: 3000, endHz: 300, q: 0.9 },
          drive: 0.3,
          gain: 0.55,
        },
        thump(100, 32, 0.5, { gain: 0.75, drive: 0.5 }),
        clang(1600, 0.4, { gain: 0.42, shape: 1.9 }),
        shimmer(3136, 0.5, { delayMs: 100, gain: 0.22 }),
      ],
      space: room(0.4, 2),
      master: 0.9,
    },
    0,
  ),
  // The deal. A rising whoosh for ten cards thrown out of the gate at once, and four
  // small landings inside it — one sound for the whole hand rather than ten, because the
  // cards land inside a third of a second and ten cues that close together are one cue
  // with a stutter.
  cue(
    'summon_deal',
    630,
    'sfx',
    {
      layers: [
        whoosh(300, 3000, 0.5, {
          amp: { attack: 0.05, decay: 0.5 },
          filter: { type: 'bandpass', startHz: 300, endHz: 3000, q: 0.8 },
          gain: 0.95,
        }),
        click({ delayMs: 90, gain: 0.25 }),
        click({ delayMs: 160, gain: 0.25 }),
        click({ delayMs: 230, gain: 0.25 }),
        click({ delayMs: 300, gain: 0.25 }),
      ],
      space: room(0.18),
      master: 1,
    },
    0,
  ),
  // The four landings. Every one opens with the same card-flip — a short flick of air —
  // so a player hears the turn and then hears what turned.
  cue(
    'summon_common',
    640,
    'sfx',
    {
      layers: [
        whoosh(2000, 4000, 0.06, { gain: 0.3 }),
        bell(523, 0.35, { delayMs: 40, fmIndex: 2, harmonics: [4], staggerMs: 60, gain: 0.72 }),
      ],
      space: room(0.18),
      master: 0.8,
    },
    0,
  ),
  cue(
    'summon_rare',
    650,
    'sfx',
    {
      layers: [
        whoosh(2000, 4000, 0.06, { gain: 0.3 }),
        bell(659, 0.5, {
          delayMs: 40,
          shape: 2,
          fmIndex: 2.5,
          harmonics: [7],
          staggerMs: 70,
          gain: 0.8,
        }),
        shimmer(2637, 0.3, { delayMs: 180, gain: 0.3 }),
      ],
      space: room(0.24, 1.4),
      master: 0.85,
    },
    0,
  ),
  // Purple. Between rare and legendary on purpose and audibly nearer the top: an epic is
  // a good night, and the whole reason a legendary lands as hard as it does is that a
  // player has heard this one and knows the difference.
  cue(
    'summon_epic',
    660,
    'sfx',
    {
      layers: [
        whoosh(2000, 4000, 0.06, { gain: 0.3 }),
        bell(784, 0.8, {
          delayMs: 40,
          fmIndex: 3,
          harmonics: [4, 7, 12],
          staggerMs: 80,
          gain: 0.8,
        }),
        pad(196, 0.7, {
          delayMs: 60,
          filter: { type: 'lowpass', startHz: 400, endHz: 2600, q: 1.1 },
          gain: 0.34,
        }),
        thump(110, 55, 0.3, { delayMs: 40, gain: 0.4 }),
        shimmer(3136, 0.5, { delayMs: 300, gain: 0.26 }),
      ],
      space: room(0.34, 1.8),
      master: 0.95,
    },
    0,
  ),
  // Gold. A bell climbing a fifth, an octave and past it, a choir under it, weight beneath
  // that, a shimmer late, and a rain of glints echoing off — in the biggest room the
  // catalogue has. The one cue in the game that is allowed to be too much.
  cue(
    'summon_legendary',
    670,
    'sfx',
    {
      layers: [
        whoosh(2000, 4000, 0.06, { gain: 0.3 }),
        bell(1046, 1.4, {
          delayMs: 40,
          fmIndex: 4,
          harmonics: [7, 12, 16, 19],
          staggerMs: 100,
          gain: 0.85,
        }),
        pad(262, 1.4, {
          delayMs: 60,
          unison: { voices: 6, detuneCents: 20 },
          filter: { type: 'lowpass', startHz: 500, endHz: 3200, q: 1.1 },
          gain: 0.28,
        }),
        thump(90, 45, 0.5, { delayMs: 40, gain: 0.6 }),
        shimmer(4186, 0.8, { delayMs: 500, gain: 0.3 }),
        {
          source: 'noise',
          amp: { attack: 0.01, decay: 0.5 },
          filter: { type: 'highpass', startHz: 6000, endHz: 6000, q: 0.7 },
          gain: 0.2,
          delayMs: 700,
        },
      ],
      space: room(0.5, 3, 0.45),
      echo: { mix: 0.25, timeMs: 190, feedback: 0.35 },
      master: 0.9,
    },
    0,
  ),

  // ══ The music ════════════════════════════════════════════════════════════
  // The two tracks, and the only entries in the catalogue standing on a recording rather
  // than on a design. There is no synthesising a soundtrack: a cue is a couple of seconds
  // of shaped sound, and what these point at is minutes of the owner's own music. A
  // missing file is silence, exactly like a missing cue.
  track(MUSIC.field, 900, 'audio/music/background_music_outside_combat.mp3'),
  track(MUSIC.combat, 910, 'audio/music/combat_campaign_depths_arena.mp3'),
];
