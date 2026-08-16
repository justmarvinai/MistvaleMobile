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
  buffs: StatusChip[];
  debuffs: StatusChip[];
  /** Set for a beat when the unit is struck or healed, for the flash and shake. */
  impulse: 'hit' | 'crit' | 'heal' | null;
}

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
      break;
    }

    case 'damage': {
      const unit = findUnit(view, event.target);
      if (!unit) break;
      unit.hp = event.remainingHp;
      unit.impulse = event.crit ? 'crit' : 'hit';
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
      view.floaters.push({
        id: floaterId++,
        ref: event.target,
        kind: 'heal',
        text: `+${event.amount}`,
      });
      break;
    }

    case 'shieldGained': {
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

    case 'died': {
      const unit = findUnit(view, event.unit);
      if (!unit) break;
      unit.alive = false;
      unit.hp = 0;
      unit.buffs = [];
      unit.debuffs = [];
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
  view.banner = null;
}

/** Drops floaters older than the newest few, so a long fight does not accumulate them. */
export function trimFloaters(view: PlaybackView, keep = 12): void {
  if (view.floaters.length > keep) {
    view.floaters = view.floaters.slice(view.floaters.length - keep);
  }
}
