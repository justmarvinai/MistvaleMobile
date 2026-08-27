import type { BattleEvent, Side, UnitContribution, UnitRef, UnitSnapshot } from './types';

/**
 * What each champion actually did in a fight.
 *
 * Read off the **event log** rather than off the final board, for the same reason
 * `damageDealtTo` is (apps/server/src/modules/titan/damage.ts): the board says where
 * everyone ended up, and the log says what happened. A champion who died on wave two
 * contributed everything they contributed; a healer's work is invisible on a board where
 * the party finished at full health precisely *because* of them.
 *
 * That makes this a pure function of the log, which is the whole contract the client
 * renders from — so the numbers on the results screen are the same numbers the engine
 * emitted, and no part of them is arithmetic the browser invented.
 *
 * ## What counts, and why
 *
 *  - **Damage** is `amount + absorbed` on every blow this side landed on the other. The
 *    two halves are added for the reason the Titan's fold adds them: a hit eaten by a
 *    shield still landed, and the shield is the target's answer to it rather than a reason
 *    to pretend it missed. Blows landing back on your own side — a reflect, a retaliation,
 *    a poison you are wearing — are somebody else's work and are left out.
 *  - **Damage is not clamped to the target's remaining health.** A finishing blow for ten
 *    thousand into a thousand-HP enemy counts ten thousand, which is the engine's own
 *    `amount` and the rule the world boss states out loud: overkill stays on the striker.
 *  - **Healing** is what the log says was actually restored, which the engine has already
 *    clamped to the wound — so an overheal is not counted as work done. Self-heals count,
 *    because they are.
 *  - **Shielding** is what was *granted*, not what was later absorbed. Nine champions in
 *    Mistvale shield and never heal, and a table that left this out would report a third
 *    of the support roster as having done nothing. Whether the enemy chose to hit the
 *    shield is not the shielder's doing, which is why the granted figure is the honest one
 *    — the same reading that makes an unspent heal count and an overheal not.
 *
 * Every unit that ever appeared gets a row, including one that arrived on a later wave or
 * was summoned mid-fight, because the log's snapshots are where the roster comes from.
 * A row of zeroes is kept deliberately: a champion who did nothing is a fact about the
 * fight, and dropping them would leave a player wondering which of their four is missing.
 */

/** Adds a unit to the table the first time the log mentions it. */
function seed(rows: Map<string, UnitContribution>, snapshot: UnitSnapshot, side: Side): void {
  if (snapshot.ref.side !== side) return;
  const id = keyOf(snapshot.ref);
  if (rows.has(id)) return;
  rows.set(id, {
    ref: snapshot.ref,
    defKey: snapshot.defKey,
    name: snapshot.name,
    damage: 0,
    healing: 0,
    shielding: 0,
    fell: false,
  });
}

/** A ref as a map key. Slots are stable for the life of a battle, so this is an identity. */
function keyOf(ref: UnitRef): string {
  return `${ref.side}:${ref.slot}`;
}

export function contributions(
  events: readonly BattleEvent[],
  side: Side = 'ally',
): UnitContribution[] {
  const rows = new Map<string, UnitContribution>();
  const add = (ref: UnitRef, field: 'damage' | 'healing' | 'shielding', amount: number): void => {
    const row = rows.get(keyOf(ref));
    if (row) row[field] += amount;
  };

  for (const event of events) {
    switch (event.type) {
      // Every place the log introduces a unit. A summoned add takes the slot of whatever
      // was there, which is why the snapshot rather than the ref is what seeds a row.
      case 'battleStart':
        for (const unit of [...event.allies, ...event.enemies]) seed(rows, unit, side);
        break;
      case 'waveStart':
        for (const unit of event.enemies) seed(rows, unit, side);
        break;
      case 'bossSummon':
        for (const unit of event.summoned) seed(rows, unit, side);
        break;

      case 'damage':
        // Onto the other side only. A reflect, a retaliation or a burn landing back on us
        // is a `damage` event too, and none of it is something this side did.
        if (event.source.side === side && event.target.side !== side) {
          add(event.source, 'damage', event.amount + event.absorbed);
        }
        break;

      case 'heal':
        if (event.source && event.source.side === side) {
          add(event.source, 'healing', event.amount);
        }
        break;

      case 'shieldGained':
        if (event.source && event.source.side === side) {
          add(event.source, 'shielding', event.amount);
        }
        break;

      case 'died': {
        const row = rows.get(keyOf(event.unit));
        if (row) row.fell = true;
        break;
      }

      default:
        break;
    }
  }

  // Biggest contribution first, which is what makes it a scoreboard rather than a list.
  // The three figures are added only to *order* the rows — they are different kinds of
  // work and the table never presents a total, because "damage plus healing" is a number
  // that means nothing.
  const total = (row: UnitContribution): number => row.damage + row.healing + row.shielding;
  return [...rows.values()].sort((a, b) => total(b) - total(a) || a.ref.slot - b.ref.slot);
}
