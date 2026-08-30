/**
 * Headless stage simulation, shared.
 *
 * `tools/balance-sim` fills a `LoadedContent` from the committed seeds and runs the tuning
 * gates over it; the Admin API fills one from the live content cache — or from the drafts
 * an operator is still editing — and runs a single stage on demand. Both then call the same
 * `simulateStage`, which is the whole reason this package exists: a sandbox that answered a
 * balance question differently from the gate that guards the same number would be worse
 * than no sandbox at all.
 *
 * Pure and IO-free. It depends on the engine and the content contracts and on nothing else,
 * so it can be imported by the server without the server importing itself.
 */
export { contentFromBundle, type LoadedContent } from './content';
export {
  BENCH_LABELS,
  BENCH_TIERS,
  FULL_RELICS,
  benchTeam,
  wardedTeam,
  withCollection,
  withRelics,
  type BenchTier,
  type TeamSpec,
} from './team';
export { simulateStage, type StageResult } from './stage';
export {
  benchPartners,
  benchmarkChampion,
  benchmarkRoster,
  benchmarkedChampions,
  roleIndex,
  type BenchSetup,
  type ChampionBenchmark,
  type RoleBand,
} from './benchmark';
