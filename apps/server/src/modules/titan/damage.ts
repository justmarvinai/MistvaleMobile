import type { BattleEvent, UnitRef } from '@mistvale/engine';

/**
 * How much of the Titan a run took down.
 *
 * Read off the event log rather than off the board, and that is the whole reason this
 * file exists. `maxHp - hp` looks like the same number and is not: a Titan that heals, or
 * that puts a shield up and has it broken, would be under-counted by the board and the
 * player would be told a worse run than they had. The log is what actually happened.
 *
 * Two subtleties it gets right, both worth a run's payout:
 *
 *  - **Absorbed damage counts.** A blow eaten by a shield still landed — the shield is the
 *    Titan's answer to it, not a reason to pretend it missed. `amount` in the engine's
 *    contract is the HP taken and `absorbed` is what a shield swallowed, so the run's
 *    figure is the two added.
 *  - **Only blows on the Titan's side count.** Reflected damage, retaliation and a
 *    self-inflicted hit are all `damage` events too, and none of them is progress.
 */
export function damageDealtTo(events: readonly BattleEvent[], side: UnitRef['side']): number {
  let total = 0;
  for (const event of events) {
    if (event.type !== 'damage') continue;
    if (event.target.side !== side) continue;
    // A blow from that side onto itself — a reflect, a retaliation, a burn it lit — is not
    // something the player did.
    if (event.source.side === side) continue;
    total += event.amount + event.absorbed;
  }
  return total;
}
