import type { BattleEvent, HitQuality, UnitRef, UnitSnapshot } from '@mistvale/engine';

/**
 * The player piano.
 *
 * The server sends an event log; this turns it into something to look at. It applies
 * events to a *view model* — nothing here decides anything, it only reflects what the
 * events already say. Every number rendered comes off an event field, never a
 * recomputation (CLAUDE.md: the client computes no game math).
 *
 * Playback is separated from the React tree on purpose: a fight is a timeline, and a
 * timeline is much easier to reason about as a reducer plus a clock than as a pile of
 * effects.
 */

export interface StatusChip {
  key: string;
  turns: number;
  stacks: number;
  kind: 'buff' | 'debuff';
}

export interface VisualUnit {
  ref: UnitRef;
  defKey: string;
  name: string;
  element: string;
  level: number;
  maxHp: number;
  hp: number;
  alive: boolean;
  /**
   * Whether this is the creature the fight is about.
   *
   * On the *visual* unit rather than only on the server's state, because the boss frame
   * (C26b) is drawn from what the player can see. Auto resolves several turns in one
   * response, so the server's board is routinely two waves ahead of the animation — read
   * from there, a boss bar appeared over wave one already reading zero, which is the P10a
   * defect in a new place.
   */
  isBoss: boolean;
  buffs: StatusChip[];
  debuffs: StatusChip[];
  /**
   * Set for a beat when something happens *to* the unit, for the flash and the shake.
   *
   * More kinds than a hit and a heal since D10: a glancing blow, a shrugged-off debuff and
   * a death all read differently, and a fight where every beat looks the same is the
   * static one the owner reported.
   */
  impulse: Impulse | null;
}

export type Impulse = 'hit' | 'crit' | 'weak' | 'heal' | 'shield' | 'resist' | 'death';

/**
 * A transient thing drawn *on* the field rather than a change of unit state.
 *
 * Floaters are the numbers; these are the motion — a lunge, a burst where a blow landed,
 * the glow of a skill being cast. Spawned by an event, drawn once by whichever renderer is
 * running, and expired by id the same way floaters are, so neither renderer has to keep a
 * clock of its own.
 */
export interface Effect {
  id: number;
  kind: EffectKind;
  /** Who it happens to — the struck unit, the healed one, the caster. */
  ref: UnitRef;
  /** Where a lunge is aimed. Only a `strike` has one. */
  toward?: UnitRef;
  /** The caster's or victim's element, so a burst is coloured by who threw it. */
  element?: string;
  quality?: HitQuality;
  crit?: boolean;
}

/**
 * How far above a unit's feet each burst is drawn, in virtual pixels.
 *
 * Bodies are anchored at the feet in both renderers, so an effect placed at a unit's
 * position lands on the floor — which is where the first cut put every impact, reading as a
 * puddle rather than a blow. Shared rather than duplicated so the painted battlefield and
 * the browser-drawn one cannot drift apart on it.
 */
export const BURST_LIFT: Readonly<Record<EffectKind, number>> = Object.freeze({
  strike: 0,
  // Chest height on a ~176px body: where a blow lands and where the eye already is.
  impact: 74,
  // Wider than an impact and centred on the caster: a cast gathers *around* somebody
  // rather than landing on them, and at knee height it read as a puddle.
  cast: 74,
  heal: 74,
  shield: 74,
  resist: 74,
  // A death collapses downward, so its ring stays nearer the ground.
  death: 40,
});

export type EffectKind =
  /** The attacker leans into the blow. */
  | 'strike'
  /** A skill winds up on the caster. */
  | 'cast'
  /** The blow lands on the target. */
  | 'impact'
  | 'heal'
  | 'shield'
  /** A debuff that failed to stick — the nearest thing the engine has to a dodge. */
  | 'resist'
  | 'death';

export interface Floater {
  id: number;
  ref: UnitRef;
  kind: 'damage' | 'heal' | 'resist' | 'shield' | 'status';
  text: string;
  quality?: HitQuality;
  crit?: boolean;
}

export interface Banner {
  id: number;
  text: string;
  tone: 'wave' | 'victory' | 'defeat';
}

export interface PlaybackView {
  wave: number;
  turn: number;
  allies: VisualUnit[];
  enemies: VisualUnit[];
  /** Whose turn it is right now, for the highlight ring. */
  acting: UnitRef | null;
  /** The skill just used, for the name flash. */
  lastSkill: string | null;
  floaters: Floater[];
  /** Motion spawned by the last few events; renderers draw each id once. */
  effects: Effect[];
  banner: Banner | null;
  finished: boolean;
  outcome: string | null;
}

export function emptyView(): PlaybackView {
  return {
    wave: 0,
    turn: 0,
    allies: [],
    enemies: [],
    acting: null,
    lastSkill: null,
    floaters: [],
    effects: [],
    banner: null,
    finished: false,
    outcome: null,
  };
}

function toVisual(snapshot: UnitSnapshot): VisualUnit {
  return {
    ref: snapshot.ref,
    defKey: snapshot.defKey,
    name: snapshot.name,
    element: snapshot.element,
    level: snapshot.level,
    maxHp: snapshot.maxHp,
    hp: snapshot.hp,
    alive: snapshot.hp > 0,
    isBoss: snapshot.isBoss,
    buffs: [],
    debuffs: [],
    impulse: null,
  };
}

const sameRef = (a: UnitRef, b: UnitRef): boolean => a.side === b.side && a.slot === b.slot;

function findUnit(view: PlaybackView, ref: UnitRef): VisualUnit | undefined {
  const pool = ref.side === 'ally' ? view.allies : view.enemies;
  return pool.find((unit) => sameRef(unit.ref, ref));
}

/**
 * How long an event holds the screen, in milliseconds at ×1.
 *
 * Tuned so a fight reads: the beats that carry information (a hit landing, a skill
 * firing) get room, while bookkeeping (a duration ticking down) passes almost instantly.
 */
export function eventDuration(event: BattleEvent): number {
  switch (event.type) {
    case 'battleStart':
      return 420;
    case 'waveStart':
      return 520;
    case 'waveCleared':
      return 620;
    case 'turnStart':
      return 130;
    case 'turnSkipped':
      return 420;
    case 'skillUsed':
      return 300;
    case 'damage':
      // Later hits of a multi-hit skill land faster, so a five-hit skill still feels
      // like one action rather than five separate ones.
      return event.hitIndex === 0 ? 260 : 130;
    case 'heal':
    case 'shieldGained':
      return 240;
    case 'statusApplied':
    case 'statusResisted':
      return 180;
    case 'statusRemoved':
      return 140;
    case 'statusExpired':
    case 'cooldownChanged':
      return 0;
    case 'turnMeter':
      return 160;
    case 'extraTurn':
    case 'counterattack':
    case 'reflected':
    case 'unkillable':
      return 280;
    // A boss beat is a moment, not bookkeeping: the shield falling and the adds arriving
    // are the two things a player has to notice to understand the fight.
    case 'bossShield':
      return event.up ? 120 : 460;
    case 'bossPunish':
    case 'bossExposed':
      return 460;
    case 'bossRetaliate':
      return 300;
    case 'bossSummon':
      return 520;
    case 'bossEnraged':
      return 620;
    case 'died':
      return 420;
    case 'battleEnd':
      return 700;
    default:
      return 100;
  }
}

let floaterId = 0;
let bannerId = 0;
let effectId = 0;

/** Applies one event to the view. Mutates a draft the caller owns. */
export function applyEvent(
  view: PlaybackView,
  event: BattleEvent,
  statusKind: (key: string) => 'buff' | 'debuff',
): void {
  // Impulses last exactly one event, so a hit flashes and then settles.
  for (const unit of [...view.allies, ...view.enemies]) unit.impulse = null;

  switch (event.type) {
    case 'battleStart': {
      view.wave = event.wave;
      view.allies = event.allies.map(toVisual);
      view.enemies = event.enemies.map(toVisual);
      break;
    }

    case 'waveStart': {
      view.wave = event.wave;
      view.enemies = event.enemies.map(toVisual);
      view.banner = { id: bannerId++, text: `Wave ${event.wave + 1}`, tone: 'wave' };
      break;
    }

    case 'waveCleared': {
      // Both bars clear at a wave boundary, and survivors get their heal.
      for (const unit of view.allies) {
        unit.buffs = [];
        unit.debuffs = [];
      }
      for (const heal of event.healed) {
        const unit = findUnit(view, heal.unit);
        if (!unit) continue;
        unit.hp = Math.min(unit.maxHp, unit.hp + heal.amount);
        view.floaters.push({
          id: floaterId++,
          ref: heal.unit,
          kind: 'heal',
          text: `+${heal.amount}`,
        });
      }
      break;
    }

    case 'turnStart': {
      view.acting = event.unit;
      view.turn = event.turn;
      view.lastSkill = null;
      break;
    }

    case 'turnSkipped': {
      view.floaters.push({
        id: floaterId++,
        ref: event.unit,
        kind: 'status',
        text: event.reason.toUpperCase(),
      });
      break;
    }

    case 'skillUsed': {
      view.lastSkill = event.skill;
      // The wind-up. Coloured by the caster's element rather than the skill's, because a
      // skill has no element of its own in the contract and a champion always does — and
      // "who threw this" is what the colour is for.
      const caster = findUnit(view, event.unit);
      spawn(view, {
        kind: 'cast',
        ref: event.unit,
        ...(caster?.element ? { element: caster.element } : {}),
      });
      break;
    }

    case 'damage': {
      const unit = findUnit(view, event.target);
      if (!unit) break;
      unit.hp = event.remainingHp;
      // A glancing blow reads differently from a solid one, and a crit differently again.
      // Three kinds rather than two, because affinity is a thing the game asks a player to
      // build around and the fight never once said which way a hit had gone.
      unit.impulse = event.crit ? 'crit' : event.quality === 'weak' ? 'weak' : 'hit';

      // The attacker leans in, and something bursts where the blow landed. Only on the
      // *first* hit of a multi-hit skill: five lunges for one swing reads as five swings,
      // and the engine already paces later hits faster for the same reason.
      const striker = findUnit(view, event.source);
      if (event.hitIndex === 0 && striker && striker.ref.side !== event.target.side) {
        spawn(view, {
          kind: 'strike',
          ref: event.source,
          toward: event.target,
          ...(striker.element ? { element: striker.element } : {}),
        });
      }
      spawn(view, {
        kind: 'impact',
        ref: event.target,
        quality: event.quality,
        crit: event.crit,
        ...(striker?.element ? { element: striker.element } : {}),
      });

      if (event.amount > 0 || event.absorbed > 0) {
        view.floaters.push({
          id: floaterId++,
          ref: event.target,
          kind: event.absorbed > 0 && event.amount === 0 ? 'shield' : 'damage',
          text: String(event.amount > 0 ? event.amount : event.absorbed),
          quality: event.quality,
          crit: event.crit,
        });
      }
      break;
    }

    case 'heal': {
      const unit = findUnit(view, event.target);
      if (!unit) break;
      unit.hp = event.remainingHp;
      unit.impulse = 'heal';
      spawn(view, { kind: 'heal', ref: event.target });
      view.floaters.push({
        id: floaterId++,
        ref: event.target,
        kind: 'heal',
        text: `+${event.amount}`,
      });
      break;
    }

    case 'shieldGained': {
      const shielded = findUnit(view, event.target);
      if (shielded) shielded.impulse = 'shield';
      spawn(view, { kind: 'shield', ref: event.target });
      view.floaters.push({
        id: floaterId++,
        ref: event.target,
        kind: 'shield',
        text: `+${event.amount}`,
      });
      break;
    }

    case 'statusApplied': {
      const unit = findUnit(view, event.target);
      if (!unit) break;
      const kind = statusKind(event.status);
      const bar = kind === 'buff' ? unit.buffs : unit.debuffs;
      const existing = bar.find((chip) => chip.key === event.status);
      if (existing) {
        existing.turns = event.turns;
        existing.stacks = event.stacks;
      } else {
        bar.push({ key: event.status, turns: event.turns, stacks: event.stacks, kind });
      }
      break;
    }

    case 'statusResisted': {
      // The nearest thing this engine has to a dodge: an attack never misses, but a debuff
      // can fail to stick. It gets its own beat — a sidestep and a flash — because
      // shrugging something off is the one defensive moment the fight can actually show.
      const shrugged = findUnit(view, event.target);
      if (shrugged) shrugged.impulse = 'resist';
      spawn(view, { kind: 'resist', ref: event.target, toward: event.source });
      view.floaters.push({
        id: floaterId++,
        ref: event.target,
        kind: 'resist',
        text: event.reason === 'immune' ? 'IMMUNE' : 'RESIST',
      });
      break;
    }

    case 'statusExpired':
    case 'statusRemoved': {
      const unit = findUnit(view, event.target);
      if (!unit) break;
      unit.buffs = unit.buffs.filter((chip) => chip.key !== event.status);
      unit.debuffs = unit.debuffs.filter((chip) => chip.key !== event.status);
      break;
    }

    case 'bossShield': {
      view.floaters.push({
        id: floaterId++,
        ref: event.unit,
        kind: event.up ? 'shield' : 'status',
        text: event.up ? `WARD ${event.hits}` : 'WARD BROKEN',
      });
      break;
    }

    case 'bossPunish': {
      view.banner = { id: bannerId++, text: 'The ward holds', tone: 'wave' };
      break;
    }

    case 'bossExposed': {
      view.floaters.push({ id: floaterId++, ref: event.unit, kind: 'status', text: 'EXPOSED' });
      break;
    }

    case 'bossRetaliate': {
      view.floaters.push({ id: floaterId++, ref: event.unit, kind: 'status', text: 'RETALIATE' });
      break;
    }

    case 'bossSummon': {
      // Adds take their refs outright: an arriving unit replaces whatever stood in that
      // slot, which is how a dead spawn's place can be filled without confusing the view.
      for (const arrival of event.summoned) {
        const existing = view.enemies.findIndex((unit) => sameRef(unit.ref, arrival.ref));
        const visual = toVisual(arrival);
        if (existing >= 0) view.enemies[existing] = visual;
        else view.enemies.push(visual);
      }
      view.banner = { id: bannerId++, text: 'The brood answers', tone: 'wave' };
      break;
    }

    case 'bossEnraged': {
      view.banner = { id: bannerId++, text: 'Enraged', tone: 'defeat' };
      break;
    }

    case 'died': {
      const unit = findUnit(view, event.unit);
      if (!unit) break;
      unit.alive = false;
      unit.hp = 0;
      unit.buffs = [];
      unit.debuffs = [];
      unit.impulse = 'death';
      spawn(view, {
        kind: 'death',
        ref: event.unit,
        ...(unit.element ? { element: unit.element } : {}),
      });
      break;
    }

    case 'battleEnd': {
      view.finished = true;
      view.outcome = event.outcome;
      view.acting = null;
      if (event.outcome === 'victory' || event.outcome === 'defeat') {
        view.banner = {
          id: bannerId++,
          text: event.outcome === 'victory' ? 'Victory' : 'Defeat',
          tone: event.outcome,
        };
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Fast-forwards through a run of events without animating them.
 *
 * Used when a player skips a resolved auto-battle, and when resuming a session that was
 * already part-played: the view has to end up exactly where the log leaves it.
 */
export function applyAll(
  view: PlaybackView,
  events: readonly BattleEvent[],
  statusKind: (key: string) => 'buff' | 'debuff',
): void {
  for (const event of events) applyEvent(view, event, statusKind);
  view.floaters = [];
  // Effects go with them, and for the same reason: this is what Skip runs, and a skip that
  // arrived with forty queued bursts would play the whole fight's motion at once on the
  // frame the player asked to stop watching.
  view.effects = [];
  view.banner = null;
}

/** Drops floaters older than the newest few, so a long fight does not accumulate them. */
export function trimFloaters(view: PlaybackView, keep = 12): void {
  if (view.floaters.length > keep) {
    view.floaters = view.floaters.slice(view.floaters.length - keep);
  }
  // Effects are trimmed harder and on the same pass. They are shorter-lived than a floater
  // — a burst is a few frames — and a renderer that has already drawn one by id will not
  // draw it again, so anything still in the list is either playing or already spent.
  if (view.effects.length > keep) {
    view.effects = view.effects.slice(view.effects.length - keep);
  }
}

/**
 * Queues one effect.
 *
 * Ids are handed out here and nowhere else, which is what lets a renderer draw each beat
 * exactly once: it keeps the ids it has seen and skips them, the same contract floaters
 * have had since P3.
 */
function spawn(view: PlaybackView, effect: Omit<Effect, 'id'>): void {
  view.effects.push({ id: effectId++, ...effect });
}
