import {
  campaignStages,
  loadContent,
  simulateStage,
  starterKeys,
  type LoadedContent,
  type StageResult,
  type TeamSpec,
} from './sim';

/**
 * `pnpm sim` — the tuning report, and the gates CI enforces.
 *
 * Prints a table per scenario and exits non-zero when a gate fails, so a balance change
 * that makes chapter 1 unwinnable for a fresh account cannot reach `main`
 * (COMBAT_SYSTEM §14).
 */

/**
 * Runs per scenario.
 *
 * The simulation is deterministic given a seed, and every scenario starts from seed 1,
 * so this measurement is *reproducible*: the same content produces the same win rate on
 * every machine and every CI run. There is no flake to tolerate — but the sample still
 * has to be large enough that the estimate sits well clear of the gate rather than
 * straddling it. At well under a millisecond per run, a large default is nearly free.
 *
 * `SIM_RUNS` lowers it for a quick local look. Doing so changes which seeds are sampled,
 * so a small run is an indication, not a verdict.
 */
const RUNS = Number(process.env.SIM_RUNS ?? 2_000);

interface Gate {
  name: string;
  detail: string;
  passed: boolean;
  measured: string;
}

function tutorialTeam(content: LoadedContent, starter: string): TeamSpec[] {
  // A brand-new account: the chosen starter, alone, at level 1 and one star.
  void content;
  return [{ championKey: starter, level: 1, rank: 1, ascension: 0 }];
}

function parTeam(content: LoadedContent): TeamSpec[] {
  // "At par recommended power": four Rares at the level chapter 1 expects.
  const rares = [...content.champions.values()]
    .filter((champion) => champion.rarity === 'rare' && !champion.isFood && champion.summonable)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, 4);
  return rares.map((champion) => ({
    championKey: champion.key,
    level: 20,
    rank: 3,
    ascension: 0,
  }));
}

function table(title: string, rows: StageResult[]): void {
  console.log(`\n${title}`);
  console.log('  stage            runs   win%   avg turns   ms/run');
  for (const row of rows) {
    const turns = Number.isNaN(row.averageTurns) ? '—' : row.averageTurns.toFixed(1);
    console.log(
      `  ${row.stageKey.padEnd(16)} ${String(row.runs).padStart(4)}  ` +
        `${(row.winRate * 100).toFixed(1).padStart(5)}  ${turns.padStart(9)}  ` +
        `${row.msPerRun.toFixed(2).padStart(6)}`,
    );
  }
}

function main(): void {
  const content = loadContent();
  const gates: Gate[] = [];

  // ── Gate 1: a fresh account clears the opening stages on auto ───────────
  const starters = starterKeys(content);
  if (starters.length === 0) throw new Error('No champion is flagged as a starter.');

  const opening = campaignStages(content, 1, 'normal').slice(0, 3);
  if (opening.length < 3) throw new Error('Chapter 1 Normal has fewer than three stages.');

  for (const starter of starters) {
    const rows = opening.map((stage) =>
      simulateStage(content, stage.key, tutorialTeam(content, starter), RUNS),
    );
    table(`Starter "${starter}" — chapter 1 Normal, level 1`, rows);

    const worst = Math.min(...rows.map((row) => row.winRate));
    gates.push({
      name: `starter:${starter}`,
      detail: 'clears 1-1…1-3 Normal on auto at least 95% of the time',
      passed: worst >= 0.95,
      measured: `worst stage ${(worst * 100).toFixed(1)}%`,
    });
  }

  // ── Gate 2: a par team beats the chapter boss ───────────────────────────
  const all = campaignStages(content, 1, 'normal');
  const boss = all[all.length - 1];
  if (boss) {
    const [result] = [simulateStage(content, boss.key, parTeam(content), RUNS)];
    table('Par team — chapter 1 boss, Normal', [result!]);
    gates.push({
      name: 'chapter-1-boss',
      detail: 'falls to a par team on auto at least 70% of the time',
      passed: result!.winRate >= 0.7,
      measured: `${(result!.winRate * 100).toFixed(1)}%`,
    });
  }

  // ── Gate 3: the headless performance budget ─────────────────────────────
  const perf = simulateStage(content, opening[0]!.key, parTeam(content), Math.max(RUNS, 100));
  gates.push({
    name: 'performance',
    detail: 'a campaign stage resolves headless in under 20 ms',
    passed: perf.msPerRun < 20,
    measured: `${perf.msPerRun.toFixed(2)} ms/run`,
  });

  // ── Report ──────────────────────────────────────────────────────────────
  console.log(`\nGates (${RUNS} runs per scenario, seeds 1…${RUNS})`);
  let failed = 0;
  for (const gate of gates) {
    const mark = gate.passed ? 'PASS' : 'FAIL';
    if (!gate.passed) failed += 1;
    console.log(`  [${mark}] ${gate.name} — ${gate.detail} (${gate.measured})`);
  }

  if (failed > 0) {
    console.error(`\n${failed} gate(s) failed. Chapter 1 is not tuned for a fresh account.`);
    process.exit(1);
  }
  console.log('\nAll gates pass.');
}

main();
