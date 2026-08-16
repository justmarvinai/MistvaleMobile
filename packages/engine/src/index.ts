/**
 * @mistvale/engine — the pure battle engine.
 *
 * Rules: no IO, no `Date.now()`, no `Math.random()`, no database access. Everything the
 * simulation needs is injected, which is what makes battles reproducible and testable
 * (docs/COMBAT_SYSTEM.md §13).
 *
 * Phase P0 ships the deterministic RNG foundation. The simulation itself — turn meter,
 * damage, statuses, waves, AI, event log — lands in Phase P2.
 */
export { createRng, createRngFromState, deriveSeed, type Rng, type RngState } from './rng';
