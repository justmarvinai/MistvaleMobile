/**
 * The two clocks a battle runs on, and which one each question belongs to.
 *
 * A fight has a **server** clock and a **playback** clock, and they are deliberately far
 * apart. One `act({ auto: true })` call resolves a thirty-turn battle in a single
 * response; the screen then spends the next half-minute animating it. Between those two
 * moments the store holds a fight that is over and a player who has seen none of it.
 *
 * Reading the wrong clock is not a cosmetic slip. The results modal was keyed on
 * `battle.status === 'finished'` until this was fixed, so it opened about three seconds
 * into every auto-battle — victory banner, star count and reward list — on top of a HUD
 * still reading "Wave 1 · Turn 0". Every fight in the game was spoiled before it was
 * watched, which also made the cold open's tuned near-death beat invisible.
 *
 * So: **commands read the server clock, outcomes read the playback clock.** These two
 * functions are how that is said once instead of at each call site.
 */

/**
 * The subset of the battle store these questions need.
 *
 * Structural rather than an import of `BattleStoreState`, so this module stays free of
 * the store's `@/`-aliased dependency chain and can be tested as the plain arithmetic it
 * is. `BattleStoreState` satisfies it, which is all a Zustand selector requires.
 */
export interface BattleClocks {
  battle: { status: string } | null;
  view: { finished: boolean };
  pending: readonly unknown[];
}

/**
 * The server has decided the fight — there is nothing left to send it.
 *
 * What the *commands* read. Auto and Retreat both post to a session the server has
 * already closed, so leaving them live through playback would trade a spoiler for an
 * error message.
 */
export function settledOnServer(state: BattleClocks): boolean {
  return state.battle?.status === 'finished';
}

/**
 * The player has watched the fight end.
 *
 * What the *outcome* reads: the results modal, the "fight is over" line, the wallet
 * refresh. `view.finished` is set by the `battleEnd` event, and the engine emits that on
 * every way out of a battle — victory, defeat, turn limit and retreat all funnel through
 * one `finish()` — so ordinary playback always reaches it.
 *
 * The second clause is for a log that somehow ends without one. It costs a comparison and
 * it is the difference between a bug and a player stranded on a finished fight with no
 * modal and no way back to the map.
 */
export function watchedToTheEnd(state: BattleClocks): boolean {
  return state.view.finished || (settledOnServer(state) && state.pending.length === 0);
}

/**
 * How far ahead of the animation auto-battle is allowed to get, in queued events.
 *
 * This number is the whole compromise, and both extremes are bugs the owner has already
 * reported. Pace auto to the playback and it is exactly as slow as watching — forty turns
 * in ninety seconds, when the button exists to avoid that. Let it run unbounded and it
 * resolves the entire fight in a second, which is what "Auto could be switched on and never
 * off" *was*: by the time the button was pressed again there was nothing left to cancel.
 *
 * Forty events is a few turns: enough that the playback never starves and Skip is there for
 * anyone who does not want to watch, few enough that switching Auto off gives the fight back
 * within a couple of seconds.
 */
const AUTO_LOOKAHEAD = 40;

/**
 * Whether auto-battle should ask the server for more turns.
 *
 * Its own question, deliberately separate from `awaitingInput`. That one answers "may the
 * *player* act now" and is gated on the playback having caught up, because a hotbar that
 * lights up over a fight three seconds behind is a hotbar that lies. Auto is not a player:
 * it reads the server's clock, bounded by how far ahead it already is.
 */
export function autoShouldAsk(state: BattleClocks): boolean {
  if (state.battle === null || state.battle.status !== 'active') return false;
  if (state.view.finished) return false;
  return state.pending.length < AUTO_LOOKAHEAD;
}
